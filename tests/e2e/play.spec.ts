import { choose, test, expect, signUp } from "./fixtures";
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
    [mainCard, "main", 9],
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
    await otherPage.reload();
    await otherPage.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await otherPage.getByLabel("Saved deck").selectOption(guestDeck);
    await otherPage.getByRole("tab", { name: "Multiplayer table" }).click();
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
    await expect(spectatorPage.getByRole("button", { name: "Search library" })).toHaveCount(0);
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Sol Ring");
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Llanowar Elves");

    await page.getByRole("button", { name: "Search library" }).click();
    await page.getByLabel("Filter library").fill("no matching card");
    await expect(page.getByRole("button", { name: "Put Sol Ring into hand" })).toHaveCount(0);
    await page.getByLabel("Filter library").fill("Sol Ring");
    await expect(page.getByRole("button", { name: "Put Sol Ring into hand" })).toHaveCount(2);
    await page.getByRole("button", { name: "Put Sol Ring into hand" }).first().click();
    await expect(hostHand.locator(".playcardname")).toHaveCount(8);
    await expect(page.getByRole("button", { name: "Put Sol Ring into hand" })).toHaveCount(1);
    await expect(otherPage.locator("#view-play")).not.toContainText("Sol Ring");
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Sol Ring");
    await page.getByRole("button", { name: "Hide library search" }).click();

    await hostHand.getByRole("button", { name: "Play face down" }).first().click();
    const hostBattlefield = page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Battlefield" }) });
    await expect(hostBattlefield).toContainText("Your card: Sol Ring");
    await expect(otherPage.locator(".play-player-row")).toContainText("Face down");
    await expect(spectatorPage.locator(".play-player-row")).toContainText("Face down");
    await expect(otherPage.locator("#view-play")).not.toContainText("Sol Ring");
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Sol Ring");
    await hostBattlefield.getByRole("button", { name: "Reveal" }).click();
    await expect(page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Battlefield" }) })).toContainText("Sol Ring");
    await expect(otherPage.locator(".play-player-row")).toContainText("Sol Ring");
    await expect(spectatorPage.locator(".play-player-row")).toContainText("Sol Ring");
    await page.getByLabel("Token", { exact: true }).fill("Wolf");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const wolf = hostBattlefield.locator(".play-card").filter({ hasText: "Wolf" });
    const attachment = wolf.getByLabel("Attach Wolf");
    const targetId = await attachment.locator("option").nth(1).getAttribute("value");
    if (!targetId) throw new Error("Missing attachment target");
    await attachment.selectOption(targetId);
    await expect(spectatorPage.locator(".play-player-row")).toContainText("Wolf · Attached to Sol Ring");
    await hostBattlefield.locator(".play-card").first().getByRole("button", { name: "Graveyard" }).click();
    await expect(attachment).toHaveValue("");
    await expect(spectatorPage.locator(".play-player-row")).not.toContainText("Attached to Sol Ring");
    expect(otherPageErrors).toEqual([]);

    await page.getByRole("button", { name: "End turn" }).click();
    await expect(otherPage.locator(".play-player-row .play-player").nth(1)).toContainText("Active");
    await otherPage.getByRole("button", { name: "Draw" }).click();
    await expect(page.locator(".play-player-row .play-player").nth(1)).toContainText("Hand 8");
    await otherPage.getByRole("button", { name: "End turn" }).click();
    await expect(page.locator(".play-player-row .play-player").first()).toContainText("Active");
    await page.getByRole("button", { name: "Draw" }).click();
    await expect(page.locator(".play-player-row .play-player").first()).toContainText("Hand 8");
    await page.getByRole("button", { name: "Concede" }).click();
    await expect(page.locator("#view-play")).toContainText("Game ended");
    await expect(otherPage.locator("#view-play")).toContainText("Game ended");
    await expect(spectatorPage.locator("#view-play")).toContainText("Game ended");

    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("navigation", { name: "Main" }).getByRole("button", { name: "Play" }).click();
    const playTabs = await page.locator(".play-tabs").boundingBox();
    expect(playTabs?.height ?? Number.POSITIVE_INFINITY).toBeLessThan(80);
  } finally {
    await otherContext.close();
    await spectatorContext.close();
  }
});

test("four-player manual Commander tables keep every hand private and advance turns", async ({ browser, page }) => {
  const guests = await Promise.all([browser.newContext(), browser.newContext(), browser.newContext()]);
  const guestPages = await Promise.all(guests.map((context) => context.newPage()));
  try {
    await signUp(page, "fourhost");
    for (const [index, guestPage] of guestPages.entries()) await signUp(guestPage, `fourguest${index}`);

    const deckIds = [
      await createCommanderDeck(page, "Host four-player deck", "sol-ring"),
      await createCommanderDeck(guestPages[0]!, "First four-player deck", "llanowar"),
      await createCommanderDeck(guestPages[1]!, "Second four-player deck", "bolt-lea"),
      await createCommanderDeck(guestPages[2]!, "Third four-player deck", "shivan"),
    ];
    await page.reload();
    for (const guestPage of guestPages) await guestPage.reload();

    const openTable = async (target: Page, deckId: string) => {
      await target.locator("#modetabs .mtab", { hasText: "Play" }).click();
      await target.getByLabel("Saved deck").selectOption(deckId);
      await target.getByRole("tab", { name: "Multiplayer table" }).click();
    };
    await openTable(page, deckIds[0]!);
    await page.getByRole("button", { name: "Create four-player table" }).click();
    const inviteCode = (await page.getByText(/Invite code:/).textContent())?.replace("Invite code:", "").trim();
    if (!inviteCode) throw new Error("The new four-player table did not display an invitation code.");

    for (let index = 0; index < guestPages.length; index += 1) {
      const guestPage = guestPages[index]!;
      await openTable(guestPage, deckIds[index + 1]!);
      await guestPage.getByLabel("Invitation code").fill(inviteCode);
      await guestPage.getByRole("button", { name: "Join table" }).click();
    }

    await page.getByRole("button", { name: "Start game" }).click();
    for (const target of [page, ...guestPages]) {
      await expect(target.getByRole("button", { name: "Draw" })).toBeVisible();
      await expect(target.locator(".play-player-row")).toContainText("Hand 7");
    }
    const playerPages = [page, ...guestPages];
    const mainCards = ["Sol Ring", "Llanowar Elves", "Lightning Bolt", "Shivan Dragon"];
    for (let seat = 0; seat < playerPages.length; seat += 1) {
      const currentView = playerPages[seat]!.locator("#view-play");
      await expect(currentView).toContainText(mainCards[seat]!);
      for (let otherSeat = 0; otherSeat < mainCards.length; otherSeat += 1) {
        if (otherSeat !== seat) await expect(currentView).not.toContainText(mainCards[otherSeat]!);
      }
    }

    await page.getByRole("button", { name: "End turn" }).click();
    for (let seat = 1; seat < playerPages.length; seat += 1) {
      const currentPage = playerPages[seat]!;
      await expect(currentPage.locator(".play-player-row .play-player").nth(seat)).toContainText("Active");
      await currentPage.getByRole("button", { name: "Draw" }).click();
      await expect(page.locator(".play-player-row .play-player").nth(seat)).toContainText("Hand 8");
      await currentPage.getByRole("button", { name: "End turn" }).click();
    }
    await expect(page.locator(".play-player-row .play-player").first()).toContainText("Active");
    await page.getByRole("button", { name: "Draw" }).click();
    await expect(page.locator(".play-player-row .play-player").first()).toContainText("Hand 8");
    for (const seat of [0, 1, 2]) {
      const currentPage = playerPages[seat]!;
      await currentPage.getByRole("button", { name: "Concede" }).click();
      if (seat < 2) {
        for (const target of playerPages) {
          await expect(target.locator(".play-player-row .play-player").nth(seat)).toContainText("Conceded");
        }
      } else {
        for (const target of playerPages) {
          await expect(target.locator("#view-play")).toContainText("Game ended");
        }
      }
    }
    for (const currentPage of playerPages) {
      await expect(currentPage.locator("#view-play")).toContainText("Game ended");
    }
  } finally {
    for (const context of guests) await context.close();
  }
});

test("manual solo plays an original custom card from a saved deck", async ({ page }) => {
  const suffix = Date.now().toString(36).slice(-5);
  const setCode = `p${suffix}`;
  const customName = `Practice Bear ${suffix}`;
  let customCardId: string | null = null;
  let deckId: string | null = null;
  let customSetCreated = false;

  try {
    await signUp(page, "playcustom");
    await page.keyboard.press("5");
    await page.getByRole("tab", { name: "Card maker" }).click();
    await page.getByRole("tab", { name: "Custom sets" }).click();
    await page.locator(".setmaker .makerlist").getByRole("button", { name: "New set" }).click();
    await page.locator("#sm-code").fill(setCode);
    await page.locator("#sm-name").fill(`Playtest ${suffix}`);
    await page.getByRole("button", { name: "Create set" }).click();
    await expect(page.getByText(`Custom set ${setCode.toUpperCase()} created`)).toBeVisible();
    customSetCreated = true;
    await page.getByRole("tab", { name: "Card maker" }).click();
    await choose(page, page.locator("#cm-set"), setCode);
    await page.locator("#cm-name").fill(customName);
    await page.locator("#cm-typeLine").fill("Creature - Bear");
    await page.locator("#cm-power").fill("2");
    await page.locator("#cm-toughness").fill("2");
    await page.getByRole("button", { name: "Save to card database" }).click();
    await expect(page.getByText(`${customName} saved to the card database`)).toBeVisible();

    const cardResponse = await page.request.get(`/api/cards?q=${encodeURIComponent(customName)}`);
    expect(cardResponse.status()).toBe(200);
    const cardMatches = await cardResponse.json() as Array<{ id: string; name: string }>;
    const customCard = cardMatches.find((card) => card.name === customName);
    if (!customCard) throw new Error("The newly saved custom card was not returned by card search.");
    customCardId = customCard.id;

    const createdDeck = await page.request.post("/api/decks", {
      headers: { "x-mana-vault": "1" },
      data: { name: `Custom playtest ${suffix}`, format: "casual" },
    });
    expect(createdDeck.status()).toBe(201);
    deckId = String((await createdDeck.json()).id);
    const addedCard = await page.request.post(`/api/decks/${deckId}/cards`, {
      headers: { "x-mana-vault": "1" },
      data: { cardId: customCard.id, zone: "main", quantity: 8 },
    });
    expect(addedCard.status()).toBe(201);

    await page.reload();
    await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await page.getByLabel("Saved deck").selectOption(deckId);
    await page.getByRole("tab", { name: "Manual solo" }).click();
    await page.context().setOffline(true);
    await expect.poll(() => page.evaluate(() => navigator.onLine)).toBe(false);
    await page.getByRole("button", { name: "New manual game" }).click();

    const hand = page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Hand" }) });
    await expect(hand.locator(".play-card")).toHaveCount(7);
    await expect(hand.getByRole("img", { name: customName }).first()).toBeVisible();
    await hand.getByRole("button", { name: "Play" }).first().click();
    const battlefield = page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Battlefield" }) });
    await expect(battlefield.getByRole("img", { name: customName })).toBeVisible();
    await battlefield.getByRole("button", { name: "Face down" }).click();
    await expect(battlefield.getByText("Face down", { exact: true })).toBeVisible();
    await expect(battlefield.getByRole("img", { name: customName })).toHaveCount(0);
    await battlefield.getByRole("button", { name: "Reveal" }).click();
    await expect(battlefield.getByRole("img", { name: customName })).toBeVisible();
    await page.getByRole("button", { name: "Show library" }).click();
    await page.getByLabel("Search library").fill("no matching card");
    await expect(page.getByRole("button", { name: `Put ${customName} into hand` })).toHaveCount(0);
    await page.getByLabel("Search library").fill(customName);
    await page.getByRole("button", { name: `Put ${customName} into hand` }).click();
    await expect(hand.locator(".play-card")).toHaveCount(7);
    await expect(page.locator(".play-toolbar")).toContainText("0 in library");
    await page.getByLabel("Token", { exact: true }).fill("Wolf");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const wolfAttachment = battlefield.getByLabel("Attach Wolf");
    const customTarget = await wolfAttachment.locator("option").nth(1).getAttribute("value");
    if (!customTarget) throw new Error("Missing custom card attachment target");
    await wolfAttachment.selectOption(customTarget);
    await expect(wolfAttachment).toHaveValue(customTarget);
    await battlefield.getByRole("button", { name: "Graveyard" }).first().click();
    await expect(wolfAttachment).toHaveValue("");
    const graveyard = page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Graveyard" }) });
    await expect(graveyard.getByRole("img", { name: customName })).toBeVisible();
    await page.getByRole("button", { name: "Next turn and untap" }).click();
    await expect(page.locator(".play-toolbar")).toContainText("Turn 2");
  } finally {
    await page.context().setOffline(false);
    if (deckId) {
      const deletedDeck = await page.request.delete(`/api/decks/${deckId}`, { headers: { "x-mana-vault": "1" } });
      expect(deletedDeck.status()).toBe(200);
    }
    if (customSetCreated) {
      if (!customCardId) {
        const customCardsResponse = await page.request.get("/api/custom/cards");
        expect(customCardsResponse.status()).toBe(200);
        const customCards = await customCardsResponse.json() as Array<{ id: string; name: string }>;
        customCardId = customCards.find((card) => card.name === customName)?.id ?? null;
      }
      if (customCardId) {
        const deletedCard = await page.request.delete(`/api/custom/cards/${customCardId}`, { headers: { "x-mana-vault": "1" } });
        expect(deletedCard.status()).toBe(200);
      }
      const deletedSet = await page.request.delete(`/api/custom/sets/${setCode}`, { headers: { "x-mana-vault": "1" } });
      expect(deletedSet.status()).toBe(200);
    }
  }
});
