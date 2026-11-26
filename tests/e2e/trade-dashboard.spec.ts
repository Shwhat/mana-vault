import { choose, modeTab, signUp, test, expect } from "./fixtures";

const headers = { "x-mana-vault": "1" };
const copy = { foil: 0, condition: "NM", language: "en", quantity: 1, price: null };

test("trade recipients choose source and destination and browse another account's binder", async ({ page, browser, baseURL }) => {
  const annName = await signUp(page, "tradeann");
  const other = await browser.newContext({ baseURL });
  const bob = await other.newPage();
  const bobName = await signUp(bob, "tradebob");
  const annCollection = (await (await page.request.get("/api/collections")).json())[0].id as string;
  const bobCollection = (await (await bob.request.get("/api/collections")).json())[0].id as string;
  const bobId = (await (await page.request.get("/api/users")).json() as Array<{ id: number; name: string }>).find((user) => user.name === bobName)!.id;
  await page.request.post(`/api/collections/${annCollection}/cards`, { headers, data: { cardId: "sol-ring", quantity: 1, foil: false } });
  await bob.request.post(`/api/collections/${bobCollection}/cards`, { headers, data: { cardId: "counterspell", quantity: 1, foil: false } });
  await bob.request.put(`/api/collections/${bobCollection}/cards`, { headers, data: { items: [{ cardId: "counterspell", ...copy, trade: 1 }] } });
  const trade = await (await page.request.post("/api/trades", { headers, data: { name: "Proposal" } })).json() as { id: string };
  await page.request.patch(`/api/trades/${trade.id}`, { headers, data: { lines: [
    { side: "give", cardId: "sol-ring", ...copy, collectionId: annCollection },
    { side: "get", cardId: "counterspell", ...copy },
  ] } });
  await page.request.post(`/api/trades/${trade.id}/send`, { headers, data: { userId: bobId, collectionId: annCollection } });
  await page.reload();
  await modeTab(page, "Trade");
  await page.getByRole("button", { name: /Browse trade binders/ }).click();
  await choose(page, page.getByRole("button", { name: /^Account trade binder/ }), String(bobId));
  await expect(page.locator(".tmatches .row", { hasText: "Counterspell" })).toContainText("1 available");
  await bob.reload();
  await modeTab(bob, "Trade");
  await expect(bob.locator("#view-trade")).toContainText(`From ${annName}`);
  await expect(bob.locator("#view-trade")).toContainText("Choose where the cards you get go before changing the offer");
  await choose(bob, bob.getByRole("button", { name: /^Cards you get go to/ }), bobCollection);
  await choose(bob, bob.getByRole("button", { name: /^Source collection for Counterspell/ }), bobCollection);
  await expect(bob.getByRole("button", { name: /^Source collection for Counterspell/ })).toHaveAttribute("data-value", bobCollection);
  await bob.getByRole("textbox", { name: "Price each of Counterspell" }).fill("2");
  await bob.getByRole("textbox", { name: "Price each of Counterspell" }).blur();
  await expect(bob.locator("#view-trade")).toContainText("Waiting for an answer");
  await page.reload();
  await modeTab(page, "Trade");
  await expect(page.locator("#view-trade")).toContainText("Your turn");
  await page.getByRole("button", { name: "Accept trade..." }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Accept trade", exact: true }).click();
  await expect(page.locator("#view-trade .badge.status-done")).toBeVisible();
  expect((await (await page.request.get(`/api/collections/${annCollection}/cards`)).json()).map((row: { id: string }) => row.id)).toEqual(["counterspell"]);
  expect((await (await bob.request.get(`/api/collections/${bobCollection}/cards`)).json()).map((row: { id: string }) => row.id)).toEqual(["sol-ring"]);
  await other.close();
});

test("light menus have readable text and home shows collections and decks", async ({ page }) => {
  await signUp(page, "dashboard");
  await page.request.post("/api/decks", { headers, data: { name: "Dashboard deck", format: "modern" } });
  await page.reload();
  await modeTab(page, "Home");
  await expect(page.locator("#view-home")).toContainText("Recent collections");
  await expect(page.locator("#view-home")).toContainText("Dashboard deck");
  await expect(page.locator("#view-home")).toContainText("Cards for trade");
  await page.locator('#menubar .mbtn[data-menu="View"]').dispatchEvent("mousedown");
  const colors = await page.locator("#dropdown").evaluate((element) => ({ color: getComputedStyle(element).color, background: getComputedStyle(element).backgroundColor }));
  expect(colors).toEqual({ color: "rgb(29, 35, 44)", background: "rgb(255, 255, 255)" });
});

test("multiple picture statuses stay compact and reveal actionable marks on hover", async ({ page }) => {
  await signUp(page, "marks");
  const collection = (await (await page.request.get("/api/collections")).json())[0].id as string;
  await page.request.post(`/api/collections/${collection}/cards`, { headers, data: { cardId: "bolt-m10", quantity: 1, foil: false } });
  const first = await (await page.request.post("/api/decks", { headers, data: { name: "First deck", format: "modern" } })).json() as { id: string };
  const second = await (await page.request.post("/api/decks", { headers, data: { name: "Second deck", format: "modern" } })).json() as { id: string };
  for (const id of [first.id, second.id]) {
    await page.request.post(`/api/decks/${id}/replace`, { headers, data: { text: "1 Lightning Bolt (M10) 146\n" } });
  }
  const prefs = await (await page.request.get("/api/prefs")).json();
  await page.request.put("/api/prefs", { headers, data: { ...prefs, lastDeckId: second.id, deckView: "grid" } });
  await page.reload();
  await modeTab(page, "Decks");
  const group = page.locator("#view-deck .markgroup").first();
  await expect(group.getByRole("button", { name: "2 card statuses" })).toBeVisible();
  await expect(group.locator(".markpopup")).toBeHidden();
  await group.hover();
  await expect(group.locator(".markpopup")).toBeVisible();
  await expect(group.locator(".markpopup")).toContainText("MISSING");
  await expect(group.locator(".markpopup")).toContainText("IN FIRST DECK");
  await group.locator(".markpopup .indeck").click();
  await expect(page.locator("dialog[open]")).toContainText("First deck");
});
