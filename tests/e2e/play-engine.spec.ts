import { expect, signUp, test } from "./fixtures";

test("plays a saved-deck engine game through the native Play UI", async ({ page }) => {
  test.skip(!process.env.MANAVAULT_PLAYMAT_URL, "requires the private Playmat integration service");
  test.setTimeout(180_000);
  await signUp(page, "playengineui");
  const created = await page.request.post("/api/decks", {
    headers: { "x-mana-vault": "1" },
    data: { name: "Engine UI acceptance deck", format: "modern" },
  });
  expect(created.status()).toBe(201);
  const deckId = String((await created.json()).id);

  try {
    const added = await page.request.post(`/api/decks/${deckId}/cards`, {
      headers: { "x-mana-vault": "1" },
      data: { cardId: "mountain-m21", zone: "main", quantity: 60 },
    });
    expect(added.status()).toBe(201);

    await page.reload();
    await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await page.getByLabel("Saved deck").selectOption(deckId);
    const gameType = page.getByLabel("Game type");
    const deckType = page.getByLabel("Deck format");
    await expect(gameType.locator("option")).toContainText(["Two Player Duel"]);
    await expect(deckType.locator("option")).toContainText(["Constructed - Modern"]);
    await gameType.selectOption("Two Player Duel");
    await deckType.selectOption("Constructed - Modern");
    await page.getByRole("button", { name: "Start against AI" }).click();

    const prompt = page.locator(".play-prompt");
    await expect(prompt).toBeVisible({ timeout: 60_000 });
    const firstMessage = await prompt.getAttribute("data-message-id");
    const keepHand = page.getByRole("button", { name: "Yes" });
    if (await keepHand.isVisible()) {
      await keepHand.click();
      await expect(prompt).not.toHaveAttribute("data-message-id", firstMessage ?? "");
    }

    const playMountain = page.getByRole("button", { name: "Play Mountain" }).first();
    await expect(playMountain).toBeVisible({ timeout: 60_000 });
    await playMountain.click();
    await expect(page.locator(".play-player-row .engine-card").filter({ hasText: "Mountain" }).first())
      .toBeVisible({ timeout: 30_000 });
    await expect(page.getByRole("button", { name: "Concede" })).toBeVisible();
    await page.getByRole("button", { name: "Concede" }).click();
    await expect(page.locator("#view-play .play-toolbar").first()).toContainText("Game ended", { timeout: 60_000 });
  } finally {
    const deleted = await page.request.delete(`/api/decks/${deckId}`, { headers: { "x-mana-vault": "1" } });
    expect(deleted.status()).toBe(200);
  }
});
