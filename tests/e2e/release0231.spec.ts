// Browser tests for 0.23.1: deck type groups in Moxfield's order, and the deck's zone buttons on a phone.
import { modeTab, signUp, test, expect } from "./fixtures";

const guard = { "x-mana-vault": "1" };

test("deck type groups come in Moxfield's order", async ({ page }) => {
  await signUp(page, "v231order");
  const deck = await (await page.request.post("/api/decks", { headers: guard, data: { name: "Order" } })).json();
  for (const id of ["sol-ring", "bolt-lea", "shivan", "llanowar"]) await page.request.post(`/api/decks/${deck.id}/cards`, { headers: guard, data: { cardId: id, quantity: 1, zone: "main" } });
  await page.reload();
  await modeTab(page, "Decks");
  await page.locator("#view-deck .switcher").first().click();
  await page.locator(".swrow", { hasText: "Order" }).first().dblclick();
  await expect(page.locator("#view-deck .grouphead")).toContainText(["Creatures 2", "Instants 1", "Artifacts 1"]);
});

test.describe("phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  test("the deck's zone buttons stay one short row and the cards show under them", async ({ page }) => {
    await signUp(page, "v231phone");
    const deck = await (await page.request.post("/api/decks", { headers: guard, data: { name: "Phone deck" } })).json();
    await page.request.post(`/api/decks/${deck.id}/cards`, { headers: guard, data: { cardId: "shivan", quantity: 1, zone: "main" } });
    await page.reload();
    await page.getByRole("button", { name: "Decks" }).first().click();
    await page.locator(".switcher").first().click();
    await page.locator(".swrow", { hasText: "Phone deck" }).first().click();
    const zones = page.getByRole("group", { name: "Zone" });
    await expect(zones).toBeVisible();
    expect((await zones.boundingBox())!.height).toBeLessThan(60);
    await expect(page.locator("#view-deck .board").first()).toBeInViewport();
  });
});
