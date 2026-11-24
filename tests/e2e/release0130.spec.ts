// Browser tests for 0.13.0: one click picks where cards go and a double click opens, search sorting, no trade buttons
// outside Trade, zone buttons that show one zone, Add deck to collection and Ctrl+N left alone.
import type { Page } from "@playwright/test";
import { choose, menu, search, signUp, status, test, expect } from "./fixtures";

async function newDeck(page: Page, name: string) {
  await menu(page, "File", "New deck...");
  await expect(page.locator("#f-name")).toBeFocused();
  await page.keyboard.type(name);
  await choose(page, page.locator("#f-format"), "modern");
  await page.keyboard.press("Enter");
  await expect(page.locator("dialog[open]")).toHaveCount(0);
}

const names = (page: Page) => page.locator("#view-cards .row .rowtitle b");

test("one click picks where cards go without leaving card search; a double click opens", async ({ page }) => {
  await signUp(page, "v13pick");
  await newDeck(page, "Burn");
  await search(page, "Lightning Bolt");
  await page.locator('.tab[data-panel="decks"]').click();
  const decks = page.locator(".pbody", { has: page.getByRole("textbox", { name: "Find a deck" }) });
  // the search stays while the add target changes
  await page.locator('.tab[data-panel="collections"]').click();
  await page.locator(".navitem", { hasText: "Main collection" }).click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: MAIN COLLECTION");
  await page.locator('.tab[data-panel="decks"]').click();
  await decks.locator(".navitem", { hasText: "Burn" }).click();
  await expect(page.locator("#st-target")).toHaveText("ADDING TO: DECK BURN");
  await expect(page.locator("#view-cards")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Search cards" })).toHaveValue("Lightning Bolt");
  await expect(names(page).first()).toHaveText("Lightning Bolt");
  // a double click opens the deck
  await decks.locator(".navitem", { hasText: "Burn" }).dblclick();
  await expect(page.locator("#view-deck .switcher")).toContainText("Burn");

  // 0.18.0: in the switcher one click opens the collection
  await page.keyboard.press("2");
  await page.locator("#view-collection .switcher").click();
  const row = page.locator(".swrow", { hasText: "Main collection" });
  await row.click();
  await expect(page.locator(".swpop")).toHaveCount(0);
  await expect(page.locator("#view-collection .switcher")).toContainText("Main collection");

  // Ctrl+N no longer opens New deck
  await page.keyboard.press("1");
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("Control+n").catch(() => undefined);
  await expect(page.locator("dialog[open]")).toHaveCount(0);
});

test("card search sorts by best match by default, keeps a sort per search, and has no trade buttons", async ({ page }) => {
  await signUp(page, "v13sort");
  await search(page, "angel");
  await expect(names(page)).toHaveText(["Serra Angel", "Atraxa, Praetors' Voice"]);
  await choose(page, page.locator("#view-cards").getByRole("button", { name: "Sort results" }), "name");
  await expect(names(page)).toHaveText(["Atraxa, Praetors' Voice", "Serra Angel"]);
  await search(page, "add");
  await choose(page, page.locator("#view-cards").getByRole("button", { name: "Sort results" }), "rarity");
  await expect(names(page).first()).toHaveText("Sol Ring");

  // the right-click menu and the Card panel have no trade buttons; T and G add nothing
  await names(page).first().click({ button: "right" });
  await expect(page.locator("#ctxmenu")).not.toContainText("Add to trade");
  await page.keyboard.press("Escape");
  await expect(page.locator(".pbody .btnrow").getByRole("button", { name: "You get" })).toHaveCount(0);
  await page.locator("#view-cards .row").first().click();
  await page.keyboard.press("g");
  await page.keyboard.press("t");
  await page.keyboard.press("4");
  await expect(page.locator("#view-trade")).not.toContainText("Sol Ring");
  // each trade search has its own Sort
  await expect(page.locator("#view-trade").getByRole("button", { name: "Sort results" })).toHaveCount(2);
});

test("zone buttons show one zone and set where Add puts cards; Add deck to collection fills and links the deck", async ({ page }) => {
  await signUp(page, "v13zones");
  await newDeck(page, "Burn");
  await page.keyboard.press("3");
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await page.locator("#view-deck").getByRole("button", { name: "Edit as text..." }).click();
  await page.locator("dialog[open] textarea").fill("Deck\n2 Lightning Bolt (M10) 146\n\nSideboard\n1 Counterspell (LEA) 54\n");
  await page.locator("dialog[open]").getByRole("button", { name: "Check" }).click();
  await page.locator("dialog[open]").getByRole("button", { name: "Apply" }).click();
  await expect(status(page)).toContainText("Burn updated");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();
  const zones = page.locator("#view-deck").getByRole("group", { name: "Zone" });
  await zones.getByRole("button", { name: "Sideboard" }).click();
  await expect(status(page)).toHaveText("Showing Sideboard. New deck cards go to the sideboard");
  await expect(page.locator("#view-deck .board")).toHaveCount(1);
  await expect(page.locator("#view-deck .board")).toHaveAttribute("aria-label", "Sideboard");
  await zones.getByRole("button", { name: "All" }).click();
  await expect(page.locator("#view-deck .board")).toHaveCount(2);
  await expect(page.locator("#view-deck .row .badge.miss").first()).toHaveText("Missing");

  // Add deck to collection: missing cards only, linked to the deck, one undo step
  await page.getByRole("tab", { name: "Add", exact: true }).click();
  await page.locator("#view-deck").getByRole("button", { name: "Add deck to collection..." }).click();
  await expect(page.locator("dialog[open] .dlghead")).toHaveText("Add Burn to a collection");
  await page.locator("dialog[open]").getByRole("button", { name: "Add cards" }).click();
  await expect(status(page)).toHaveText("3 cards added to Main collection, 3 linked to the deck");
  await page.getByRole("tab", { name: "Cards", exact: true }).click();
  await expect(page.locator("#view-deck .row .badge.miss")).toHaveCount(0);
  await page.keyboard.press("Control+z");
  await expect(page.locator("#view-deck .row .badge.miss").first()).toHaveText("Missing");
});

for (const wishlistOnly of [false, true]) {
  test(`a deck can create its first collection${wishlistOnly ? " when only a wishlist exists" : ""}`, async ({ page }) => {
    await signUp(page, wishlistOnly ? "deckwishlist" : "decknocollection");
    const headers = { "x-mana-vault": "1" };
    const existing = (await (await page.request.get("/api/collections")).json()) as Array<{ id: string }>;
    if (wishlistOnly) {
      const wishlist = await page.request.post("/api/collections", { headers, data: { name: "Wishlist", kind: "wishlist", completion: "none", finish: "any", sets: [] } });
      expect(wishlist.status()).toBe(201);
    }

    for (const collection of existing) expect((await page.request.delete(`/api/collections/${collection.id}`, { headers })).ok()).toBe(true);
    const deck = await (await page.request.post("/api/decks", { headers, data: { name: "Burn", format: "modern" } })).json() as { id: string };
    expect((await page.request.post(`/api/decks/${deck.id}/cards`, { headers, data: { cardId: "bolt-lea", quantity: 2, zone: "main" } })).status()).toBe(201);
    await page.reload();
    await page.waitForSelector("#titlebar");
    await page.locator('.tab[data-panel="decks"]').click();
    const deckRow = page.locator(".pbody", { has: page.getByRole("textbox", { name: "Find a deck" }) }).locator(".navitem", { hasText: "Burn" });
    await deckRow.click({ button: "right" });
    await page.locator("#ctxmenu .dd", { hasText: "Add deck to collection..." }).click();
    const dialog = page.locator("dialog#dlg[open]");
    await expect(dialog.locator(".dlghead")).toHaveText("Add Burn to a collection");
    await expect(dialog.getByRole("button", { name: "Collection: New collection..." })).toBeVisible();
    const name = dialog.getByRole("textbox", { name: "Name of the new collection" });
    await expect(name).toHaveValue("Burn");
    await name.fill("");
    await dialog.getByRole("button", { name: "Add cards" }).click();
    await expect(status(page)).toHaveText("Enter a name for the new collection");
    await expect(dialog).toBeVisible();
    await name.fill("Burn cards");
    await dialog.getByRole("button", { name: "Add cards" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(status(page)).toHaveText("2 cards added to Burn cards, 2 linked to the deck");
    const collections = (await (await page.request.get("/api/collections")).json()) as Array<{ id: string; name: string; kind: string }>;
    const created = collections.find((item) => item.name === "Burn cards");
    expect(created?.kind).toBe("collection");
    const copies = await (await page.request.get(`/api/collections/${created!.id}/cards`)).json() as Array<{ id: string; quantity: number }>;
    expect(copies).toEqual(expect.arrayContaining([expect.objectContaining({ id: "bolt-lea", quantity: 2 })]));
    const restoredDeck = await (await page.request.get(`/api/decks/${deck.id}`)).json() as { cards: Array<{ card_id: string; missing: number }> };
    expect(restoredDeck.cards).toEqual(expect.arrayContaining([expect.objectContaining({ card_id: "bolt-lea", missing: 0 })]));
  });
}

test("deck lists show colors and possible themes and update after a deck changes", async ({ page }) => {
  await signUp(page, "deckprofile");
  const headers = { "x-mana-vault": "1" };
  const deck = await (await page.request.post("/api/decks", { headers, data: { name: "Signals", format: "commander" } })).json() as { id: string };
  expect((await page.request.post("/api/custom/sets", { headers, data: { code: "prf", name: "Profile cards" } })).status()).toBe(201);
  const picture = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
  const cards: string[] = [];
  for (const number of [1, 2]) {
    const result = await page.request.post("/api/custom/cards", { headers, data: {
      card: { setCode: "prf", collectorNumber: String(number), finishes: ["nonfoil"], colorIdentity: ["G"],
        front: { name: `Landfall ${number}`, typeLine: "Creature", oracleText: "Landfall \u2014 Create a Food token." } },
      picture,
    } });
    expect(result.status()).toBe(201);
    cards.push((await result.json()).id as string);
  }
  for (const id of cards) expect((await page.request.post(`/api/decks/${deck.id}/cards`, { headers, data: { cardId: id } })).status()).toBe(201);
  expect((await page.request.post(`/api/decks/${deck.id}/cards`, { headers, data: { cardId: "bolt-lea", zone: "commander" } })).status()).toBe(201);
  await page.reload();
  await page.waitForSelector("#titlebar");
  await page.locator('.tab[data-panel="decks"]').click();
  const panel = page.locator(".pbody", { has: page.getByRole("textbox", { name: "Find a deck" }) });
  const deckRow = panel.locator(".navitem", { hasText: "Signals" });
  await expect(deckRow.getByRole("img", { name: "Color identity: Red" })).toBeVisible();
  await expect(deckRow.locator(".decktheme")).toHaveText(["Landfall", "Tokens", "Food"]);
  await panel.getByRole("textbox", { name: "Find a deck" }).fill("food");
  await expect(deckRow).toBeVisible();
  await deckRow.dblclick();
  await page.locator("#view-deck .switcher").click();
  const switcher = page.locator(".swpop .swrow", { hasText: "Signals" });
  await expect(switcher.getByRole("img", { name: "Color identity: Red" })).toBeVisible();
  await expect(switcher.locator(".decktheme")).toHaveText(["Landfall", "Tokens", "Food"]);
  await page.keyboard.press("Escape");
  await page.locator('.tab[data-panel="decklist"]').click();
  await expect(page.locator(".dlhead .decktheme")).toHaveText(["Landfall", "Tokens", "Food"]);
  const detail = await (await page.request.get(`/api/decks/${deck.id}`)).json() as { cards: Array<{ card_id: string; oracle_id: string; entry_id: number }> };
  const removed = detail.cards.find((card) => card.card_id === cards[0])!;
  expect((await page.request.delete(`/api/decks/${deck.id}/cards/${removed.oracle_id}?zone=main&entryId=${removed.entry_id}`, { headers })).ok()).toBe(true);
  await page.reload();
  await page.waitForSelector("#titlebar");
  await page.locator('.tab[data-panel="decks"]').click();
  await expect(panel.locator(".navitem", { hasText: "Signals" }).locator(".decktheme")).toHaveCount(0);
  for (const id of cards) expect((await page.request.delete(`/api/custom/cards/${id}`, { headers })).ok()).toBe(true);
  expect((await page.request.delete("/api/custom/sets/prf", { headers })).ok()).toBe(true);
});
