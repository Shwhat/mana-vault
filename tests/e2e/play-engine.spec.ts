import { expect, signUp, test } from "./fixtures";

test("offers engine-approved actions, combat choices and named targets", async ({ page }) => {
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
    const abilityId = "33333333-3333-4333-8333-333333333333";
    const defender = "44444444-4444-4444-8444-444444444444";
    const libraryCardId = "55555555-5555-4555-8555-555555555555";
    const submittedActions: { expectedMessageId?: number; type?: string; data?: string | boolean }[] = [];
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
                  [chosenCardId]: { id: chosenCardId, name: "Available Sol Ring" },
                  [unavailableCardId]: { id: unavailableCardId, name: "Unavailable Creature" },
                },
              }, { playerId: defender, name: "Opponent", battlefield: {} }],
              myHand: {},
              canPlayObjects: {
                objects: {
                  [chosenCardId]: { basicPlayAbilities: [{ id: "play", value: "Play" }] },
                },
              },
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
      {
        id: 3,
        event: {
          method: "GAME_PLAY_MANA",
          objectId: gameId,
          messageId: 3,
          data: {
            message: "Pay mana",
            gameView: {
              canPlayObjects: {
                objects: {
                  [chosenCardId]: { basicManaAbilities: [{ id: "tap", value: "Tap for mana" }] },
                },
              },
            },
          },
        },
      },
      {
        id: 4,
        event: {
          method: "GAME_CHOOSE_ABILITY",
          objectId: gameId,
          messageId: 4,
          data: { message: "Choose an ability", choices: { [abilityId]: "1. Add two mana" } },
        },
      },
      {
        id: 5,
        event: {
          method: "GAME_ASK",
          objectId: gameId,
          messageId: 5,
          data: { message: "Keep this hand?", options: { "UI.left.btn.text": "Mulligan", "UI.right.btn.text": "Keep", webPrompt: "mulligan" } },
        },
      },
      {
        id: 6,
        event: {
          method: "GAME_SELECT", objectId: gameId, messageId: 6,
          data: { message: "Select attackers", options: { possibleAttackers: [chosenCardId] } },
        },
      },
      {
        id: 7,
        event: {
          method: "GAME_TARGET", objectId: gameId, messageId: 7,
          data: { message: "Choose defender", targets: [defender] },
        },
      },
      {
        id: 8,
        event: {
          method: "GAME_SELECT", objectId: gameId, messageId: 8,
          data: { message: "Select blockers", options: { possibleBlockers: [chosenCardId] } },
        },
      },
      {
        id: 9,
        event: {
          method: "GAME_SELECT", objectId: gameId, messageId: 9,
          data: { message: "Confirm blockers", options: { possibleBlockers: [] } },
        },
      },
      {
        id: 10,
        event: {
          method: "GAME_TARGET", objectId: gameId, messageId: 10,
          data: { message: "Choose a target", targets: [], options: { possibleTargets: [chosenCardId] } },
        },
      },
      {
        id: 11,
        event: {
          method: "GAME_TARGET", objectId: gameId, messageId: 11,
          data: {
            message: "Choose a card",
            cardsView1: { [libraryCardId]: { id: libraryCardId, name: "Library Card" } },
          },
        },
      },
      {
        id: 12,
        event: { method: "GAME_SELECT", objectId: gameId, messageId: 12, data: { message: "Priority" } },
      },
      {
        id: 13,
        event: {
          method: "GAME_SELECT", objectId: gameId, messageId: 13,
          data: { message: "Confirm attackers", options: { possibleAttackers: [] } },
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
        const after = Number(url.searchParams.get("after"));
        const nextEvents = after === 0
          ? events.slice(0, 2)
          : after >= 2 && after < events.length && submittedActions.length >= after - 1 ? [events[after]] : [];
        await route.fulfill({ json: { events: nextEvents } });
      } else if (url.pathname.endsWith("/actions") && request.method() === "POST") {
        submittedActions.push(JSON.parse(request.postData() ?? "{}") as typeof submittedActions[number]);
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
    const chooseCard = page.getByRole("button", { name: "Choose Available Sol Ring" });
    await expect(chooseCard).toBeVisible();
    await expect(page.getByRole("button", { name: "Choose Unavailable Creature" })).toHaveCount(0);
    await chooseCard.click();
    await expect.poll(() => submittedActions).toHaveLength(1);
    await expect(submittedActions[0]).toMatchObject({
      expectedMessageId: 2,
      type: "sendPlayerUUID",
      data: chosenCardId,
    });
    const tapForMana = page.getByRole("button", { name: "Tap Available Sol Ring for mana" });
    await expect(tapForMana).toBeVisible();
    await tapForMana.click();
    await expect.poll(() => submittedActions).toHaveLength(2);
    await expect(submittedActions[1]).toMatchObject({
      expectedMessageId: 3,
      type: "sendPlayerUUID",
      data: chosenCardId,
    });
    await page.getByRole("button", { name: "1. Add two mana" }).click();
    await expect.poll(() => submittedActions).toHaveLength(3);
    await expect(submittedActions[2]).toMatchObject({
      expectedMessageId: 4,
      type: "sendPlayerUUID",
      data: abilityId,
    });
    await expect(page.getByRole("button", { name: "Mulligan" })).toBeVisible();
    await expect(page.locator(".play-prompt")).toHaveAttribute("data-web-prompt", "mulligan");
    await page.getByRole("button", { name: "Keep" }).click();
    await expect.poll(() => submittedActions).toHaveLength(4);
    await expect(submittedActions[3]).toMatchObject({
      expectedMessageId: 5,
      type: "sendPlayerBoolean",
      data: false,
    });
    await page.getByRole("button", { name: "Select Available Sol Ring as attacker" }).click();
    await expect.poll(() => submittedActions).toHaveLength(5);
    await expect(submittedActions[4]).toMatchObject({ expectedMessageId: 6, type: "sendPlayerUUID", data: chosenCardId });
    await page.getByRole("button", { name: "Opponent", exact: true }).click();
    await expect.poll(() => submittedActions).toHaveLength(6);
    await expect(submittedActions[5]).toMatchObject({ expectedMessageId: 7, type: "sendPlayerUUID", data: defender });
    await page.getByRole("button", { name: "Select Available Sol Ring as blocker" }).click();
    await expect.poll(() => submittedActions).toHaveLength(7);
    await expect(submittedActions[6]).toMatchObject({ expectedMessageId: 8, type: "sendPlayerUUID", data: chosenCardId });
    await expect(page.getByRole("button", { name: "Pass priority", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Finish blockers" }).click();
    await expect.poll(() => submittedActions).toHaveLength(8);
    await expect(submittedActions[7]).toMatchObject({ expectedMessageId: 9, type: "sendPlayerBoolean", data: true });
    await page.getByRole("button", { name: "Available Sol Ring", exact: true }).click();
    await expect.poll(() => submittedActions).toHaveLength(9);
    await expect(submittedActions[8]).toMatchObject({ expectedMessageId: 10, type: "sendPlayerUUID", data: chosenCardId });
    await page.getByRole("button", { name: "Library Card", exact: true }).click();
    await expect.poll(() => submittedActions).toHaveLength(10);
    await expect(submittedActions[9]).toMatchObject({ expectedMessageId: 11, type: "sendPlayerUUID", data: libraryCardId });
    await page.getByRole("button", { name: "Pass priority", exact: true }).click();
    await expect.poll(() => submittedActions).toHaveLength(11);
    await expect(submittedActions[10]).toMatchObject({ expectedMessageId: 12, type: "sendPlayerBoolean", data: false });
    await page.getByRole("button", { name: "Finish attackers" }).click();
    await expect.poll(() => submittedActions).toHaveLength(12);
    await expect(submittedActions[11]).toMatchObject({ expectedMessageId: 13, type: "sendPlayerBoolean", data: true });
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
    for (let attempt = 0; attempt < 4; attempt += 1) {
      const messageId = await prompt.getAttribute("data-message-id");
      const keepHand = prompt.getByRole("button", { name: "Keep", exact: true });
      if (await keepHand.isVisible()) {
        await keepHand.click();
      } else if (await prompt.getAttribute("data-web-prompt") === "startingPlayer") {
        await prompt.getByRole("button").filter({ hasNotText: "Concede" }).first().click();
      } else {
        break;
      }
      await expect(prompt).not.toHaveAttribute("data-message-id", messageId ?? "", { timeout: 60_000 });
    }

    const playMountain = page.getByRole("button", { name: "Play Mountain" }).first();
    for (let attempt = 0; attempt < 12 && !(await playMountain.isVisible()); attempt += 1) {
      const pass = prompt.getByRole("button", { name: "Pass priority until next main phase" });
      if (!(await pass.isVisible())) break;
      const messageId = await prompt.getAttribute("data-message-id");
      if (!messageId) throw new Error("The priority prompt did not have a message ID.");
      await pass.click();
      await expect(prompt).not.toHaveAttribute("data-message-id", messageId, { timeout: 30_000 });
      await expect(prompt).toBeVisible({ timeout: 30_000 });
    }
    try {
      await expect(playMountain).toBeVisible({ timeout: 60_000 });
    } catch (reason) {
      const hasPrompt = await prompt.count() > 0;
      console.error("Engine UI state:", JSON.stringify({
        prompt: hasPrompt ? await prompt.textContent() : null,
        marker: hasPrompt ? await prompt.getAttribute("data-web-prompt") : null,
        handCount: await page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Your hand" }) }).locator(".engine-card").count(),
        error: await page.locator("#view-play [role=alert]").allTextContents(),
      }));
      throw reason;
    }
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
