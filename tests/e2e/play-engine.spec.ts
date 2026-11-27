import { expect, signUp, test } from "./fixtures";

test("offers engine-approved battlefield cards as native choices", async ({ page }) => {
  await signUp(page, "playboardselect");
  const created = await page.request.post("/api/decks", {
    headers: { "x-mana-vault": "1" },
    data: { name: "Engine selection test deck", format: "commander" },
  });
  expect(created.status()).toBe(201);
  const deckId = String((await created.json()).id);
  try {
    const added = await page.request.post(`/api/decks/${deckId}/cards`, {
      headers: { "x-mana-vault": "1" },
      data: { cardId: "sol-ring", zone: "main", quantity: 1 },
    });
    expect(added.status()).toBe(201);

    const gameId = "test-engine-game";
    const chosenCardId = "11111111-1111-4111-8111-111111111111";
    const unavailableCardId = "22222222-2222-4222-8222-222222222222";
    let submittedAction: { expectedMessageId?: number; type?: string; data?: string } | null = null;
    const events = [
      {
        id: 1,
        event: {
          method: "GAME_UPDATE",
          objectId: gameId,
          messageId: 1,
          data: {
            gameView: {
              players: [{
                playerId: "player",
                name: "You",
                life: 20,
                handCount: 0,
                libraryCount: 60,
                battlefield: {
                  [chosenCardId]: { id: chosenCardId, name: "Available Creature" },
                  [unavailableCardId]: { id: unavailableCardId, name: "Unavailable Creature" },
                },
              }],
              myHand: {},
              canPlayObjects: { [chosenCardId]: {} },
            },
          },
        },
      },
      {
        id: 2,
        event: {
          method: "GAME_SELECT",
          objectId: gameId,
          messageId: 2,
          data: { message: "Choose an object" },
        },
      },
    ];

    await page.route("**/api/play/**", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === "/api/play/status" && request.method() === "GET") {
        await route.fulfill({ json: { enabled: true } });
      } else if (url.pathname === "/api/play/options" && request.method() === "GET") {
        await route.fulfill({ json: {
          gameTypes: [{ name: "Two Player Duel" }],
          deckTypes: [{ name: "Constructed - Modern" }],
        } });
      } else if (url.pathname === "/api/play/games" && request.method() === "POST") {
        await route.fulfill({ json: { tableId: "test-engine-table", gameId } });
      } else if (url.pathname === "/api/play/events" && request.method() === "GET") {
        await route.fulfill({ json: { events: Number(url.searchParams.get("after")) === 0 ? events : [] } });
      } else if (url.pathname.endsWith("/actions") && request.method() === "POST") {
        submittedAction = JSON.parse(request.postData() ?? "{}") as typeof submittedAction;
        await route.fulfill({ json: {} });
      } else {
        await route.continue();
      }
    });

    await page.reload();
    await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await page.getByLabel("Saved deck").selectOption(deckId);
    await page.getByLabel("Game type").selectOption("Two Player Duel");
    await page.getByLabel("Deck format").selectOption("Constructed - Modern");
    await page.getByRole("button", { name: "Start against AI" }).click();
    const chooseCard = page.getByRole("button", { name: "Choose Available Creature" });
    await expect(chooseCard).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose Unavailable Creature" })).toHaveCount(0);
    await chooseCard.click();
    await expect.poll(() => submittedAction).toMatchObject({
      expectedMessageId: 2,
      type: "sendPlayerUUID",
      data: chosenCardId,
    });
  } finally {
    const deleted = await page.request.delete(`/api/decks/${deckId}`, { headers: { "x-mana-vault": "1" } });
    expect(deleted.status()).toBe(200);
  }
});

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
    const previousPromptId = await prompt.getAttribute("data-message-id");
    if (!previousPromptId) throw new Error("The card-play prompt did not have a message ID.");
    const passPriority = page.getByRole("button", { name: "Pass priority until next main phase" });
    const passResponse = page.waitForResponse((response) =>
      /\/api\/play\/games\/[^/]+\/actions$/.test(new URL(response.url()).pathname)
      && response.request().method() === "POST",
    );
    await passPriority.click();
    expect((await passResponse).status()).toBe(200);
    await expect(prompt).not.toHaveAttribute("data-message-id", previousPromptId, { timeout: 60_000 });
    await expect(page.getByRole("button", { name: "Concede" })).toBeVisible({ timeout: 60_000 });
    await page.getByRole("button", { name: "Concede" }).click();
    await expect(page.locator("#view-play .play-toolbar").first()).toContainText("Game ended", { timeout: 60_000 });
  } finally {
    const deleted = await page.request.delete(`/api/decks/${deckId}`, { headers: { "x-mana-vault": "1" } });
    expect(deleted.status()).toBe(200);
  }
});
