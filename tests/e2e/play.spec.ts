import { test, expect, signUp } from "./fixtures";
import type { Page } from "@playwright/test";

async function createCommanderDeck(page: Page, name: string, mainCard: string): Promise<string> {
  const created = await page.request.post("/api/decks", {
    headers: { "x-mana-vault": "1" },
    data: { name, format: "commander" },
  });
  expect(created.status()).toBe(201);
  const deckId = String((await created.json()).id);
  for (const [cardId, zone, quantity] of [
    ["atraxa", "commander", 1],
    [mainCard, "main", 8],
  ]) {
    const added = await page.request.post(`/api/decks/${deckId}/cards`, {
      headers: { "x-mana-vault": "1" },
      data: { cardId, zone, quantity },
    });
    expect(added.status()).toBe(201);
  }
  return deckId;
}

test("private manual Commander table plays shared cards without exposing opponents' hands", async ({ browser, page }) => {
  const otherContext = await browser.newContext();
  const otherPage = await otherContext.newPage();
  const spectatorContext = await browser.newContext();
  const spectatorPage = await spectatorContext.newPage();
  const otherPageErrors: string[] = [];
  otherPage.on("pageerror", (error) => otherPageErrors.push(error.message));
  try {
    await signUp(page, "playhost");
    await signUp(otherPage, "playguest");
    await signUp(spectatorPage, "playspectator");
    const hostDeck = await createCommanderDeck(page, "Host Commander deck", "sol-ring");
    const guestDeck = await createCommanderDeck(otherPage, "Guest Commander deck", "llanowar");
    await page.reload();
    await otherPage.reload();

    await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await page.getByLabel("Saved deck").selectOption(hostDeck);
    await page.getByRole("tab", { name: "Multiplayer table" }).click();
    await page.getByRole("button", { name: "Create two-player table" }).click();
    await expect(page.getByText(/Invite code:/)).toBeVisible();
    const codeText = await page.getByText(/Invite code:/).textContent();
    const inviteCode = codeText?.replace("Invite code:", "").trim();
    if (!inviteCode) throw new Error("The new table did not display an invitation code.");

    await otherPage.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await otherPage.getByLabel("Saved deck").selectOption(guestDeck);
    await otherPage.getByRole("tab", { name: "Multiplayer table" }).click();
    await otherPage.getByLabel("Invitation code").fill(inviteCode);
    await otherPage.getByRole("button", { name: "Join table" }).click();
    await expect(page.getByRole("button", { name: "Start game" })).toBeEnabled();
    await page.getByRole("button", { name: "Start game" }).click();

    await page.reload();
    await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await page.getByLabel("Saved deck").selectOption(hostDeck);
    await page.getByRole("tab", { name: "Multiplayer table" }).click();
    const hostHand = page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Hand" }) });
    const guestHand = otherPage.locator(".play-zone").filter({ has: otherPage.locator("h3", { hasText: "Hand" }) });
    await expect(hostHand.locator(".playcardname")).toHaveCount(7);
    await expect(guestHand.locator(".playcardname")).toHaveCount(7);
    await expect(page.locator("#view-play")).toContainText("Sol Ring");
    await expect(page.locator("#view-play")).not.toContainText("Llanowar Elves");
    await expect(otherPage.locator("#view-play")).toContainText("Llanowar Elves");
    await expect(otherPage.locator("#view-play")).not.toContainText("Sol Ring");

    await spectatorPage.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await spectatorPage.getByRole("tab", { name: "Multiplayer table" }).click();
    await spectatorPage.getByLabel("Watch with code").fill(inviteCode);
    await spectatorPage.getByRole("button", { name: "Watch table" }).click();
    await expect(spectatorPage.getByText("You are watching this table. Spectators cannot change the game.")).toBeVisible();
    await expect(spectatorPage.locator(".play-zone").filter({ has: spectatorPage.locator("h3", { hasText: "Hand" }) })).toHaveCount(0);
    await expect(spectatorPage.getByRole("button", { name: "Draw" })).toHaveCount(0);
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Sol Ring");
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Llanowar Elves");

    await hostHand.getByRole("button", { name: "Play" }).first().click();
    await expect(page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Battlefield" }) })).toContainText("Sol Ring");
    await expect(otherPage.locator(".play-player-row")).toContainText("Sol Ring");
    await expect(spectatorPage.locator(".play-player-row")).toContainText("Sol Ring");
    expect(otherPageErrors).toEqual([]);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Play" }).click();
    const playTabs = await page.locator(".play-tabs").boundingBox();
    expect(playTabs?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(80);
  } finally {
    await otherContext.close();
    await spectatorContext.close();
  }
});
