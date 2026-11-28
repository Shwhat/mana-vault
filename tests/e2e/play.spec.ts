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

async function reportPoisonLoss(page: Page): Promise<void> {
  const poison = page.locator(".play-totals > span").filter({ hasText: "Poison" });
  for (let count = 1; count <= 10; count += 1) {
    await poison.getByRole("button", { name: "+", exact: true }).click();
    await expect(poison.locator("b")).toHaveText(String(count));
  }
  await page.getByRole("button", { name: "Report loss" }).click();
}

test("manual table shares server-generated dice and coin results", async ({ browser, page }) => {
  const guestContext = await browser.newContext();
  const spectatorContext = await browser.newContext();
  const guest = await guestContext.newPage();
  const spectator = await spectatorContext.newPage();
  try {
    await signUp(page, "dicehost");
    await signUp(guest, "diceguest");
    await signUp(spectator, "dicewatcher");
    const hostDeck = await createCommanderDeck(page, "Dice host", "sol-ring");
    const guestDeck = await createCommanderDeck(guest, "Dice guest", "llanowar");
    const headers = { "x-mana-vault": "1" };
    const created = await page.request.post("/api/play/manual/tables", { headers, data: { deckId: hostDeck, playerLimit: 2 } });
    expect(created.status()).toBe(201);
    const { table, inviteCode } = await created.json();
    expect((await guest.request.post("/api/play/manual/tables/join", { headers, data: { inviteCode, deckId: guestDeck } })).status()).toBe(200);
    expect((await page.request.post(`/api/play/manual/tables/${table.id}/start`, { headers, data: {} })).status()).toBe(200);
    expect((await spectator.request.post("/api/play/manual/tables/watch", { headers, data: { inviteCode } })).status()).toBe(200);

    for (const viewer of [page, guest, spectator]) {
      await viewer.reload();
      await viewer.locator("#modetabs .mtab", { hasText: "Play" }).click();
      await viewer.getByRole("tab", { name: "Multiplayer table" }).click();
    }
    await expect(spectator.getByRole("button", { name: "Roll d6" })).toHaveCount(0);
    await page.getByRole("button", { name: "Roll d6" }).click();
    const hostResult = page.locator(".play-panel [role=status]");
    await expect(hostResult).toHaveText(/^Result 1: Seat 1 \(dicehost[^)]*\) rolled d6: [1-6]$/);
    const d6 = await hostResult.textContent();
    await expect(spectator.locator(".play-panel [role=status]")).toHaveText(d6 ?? "");
    await expect(guest.locator(".play-panel [role=status]")).toHaveText(d6 ?? "");
    await guest.getByRole("button", { name: "Flip coin" }).click();
    await expect(spectator.locator(".play-panel [role=status]")).toHaveText(/^Result 2: Seat 2 \(diceguest[^)]*\) flipped a coin: (heads|tails)$/);
    const coin = await spectator.locator(".play-panel [role=status]").textContent();
    await spectator.reload();
    await spectator.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await spectator.getByRole("tab", { name: "Multiplayer table" }).click();
    await expect(spectator.locator(".play-panel [role=status]")).toHaveText(coin ?? "");
    await expect(page.locator(".play-panel [role=status]")).toHaveText(coin ?? "");
    await page.getByRole("button", { name: "Roll d20" }).click();
    await expect(spectator.locator(".play-panel [role=status]")).toHaveText(/^Result 3: Seat 1 \(dicehost[^)]*\) rolled d20: ([1-9]|1[0-9]|20)$/);
  } finally {
    await guestContext.close();
    await spectatorContext.close();
  }
});

test("manual Commander tables support private opening-hand mulligans", async ({ browser, page }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await signUp(page, "mulliganhost");
    await signUp(guest, "mulliganguest");
    const hostDeck = await createCommanderDeck(page, "Mulligan host", "sol-ring");
    const guestDeck = await createCommanderDeck(guest, "Mulligan guest", "llanowar");
    const headers = { "x-mana-vault": "1" };
    const created = await page.request.post("/api/play/manual/tables", { headers, data: { deckId: hostDeck, playerLimit: 2 } });
    expect(created.status()).toBe(201);
    const { table, inviteCode } = await created.json();
    expect((await guest.request.post("/api/play/manual/tables/join", { headers, data: { inviteCode, deckId: guestDeck } })).status()).toBe(200);
    expect((await page.request.post(`/api/play/manual/tables/${table.id}/start`, { headers, data: {} })).status()).toBe(200);
    for (const viewer of [page, guest]) {
      await viewer.reload();
      await viewer.locator("#modetabs .mtab", { hasText: "Play" }).click();
      await viewer.getByRole("tab", { name: "Multiplayer table" }).click();
    }
    await page.getByRole("button", { name: "Mulligan", exact: true }).click();
    await expect(page.getByText("Opening hand: 1 mulligan; first is free.", { exact: false })).toBeVisible();
    await page.getByRole("button", { name: "Mulligan", exact: true }).click();
    await expect(page.getByText("Choose 1 card from your hand to put on the bottom.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Draw" })).toBeDisabled();
    await expect(page.getByRole("button", { name: "Keep hand" })).toBeDisabled();
    await page.reload();
    await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await page.getByRole("tab", { name: "Multiplayer table" }).click();
    await expect(page.getByText("Choose 1 card from your hand to put on the bottom.")).toBeVisible();
    await page.getByRole("button", { name: "Put on bottom" }).first().click();
    await expect(page.getByRole("button", { name: "Mulligan", exact: true })).toHaveCount(0);
    await expect(page.locator('.play-zone[data-zone="hand"] .play-card')).toHaveCount(6);
    await expect(guest.locator(".play-player-row .play-player").first()).toContainText("Hand 6");
    await expect(guest.locator("#view-play")).not.toContainText("Sol Ring");
    await guest.getByRole("button", { name: "Keep hand" }).click();
    await expect(guest.getByRole("button", { name: "Mulligan", exact: true })).toHaveCount(0);
  } finally {
    await guestContext.close();
  }
});

test("manual game history shows player-reported results and the saved deck snapshot", async ({ browser, page }) => {
  const guestContext = await browser.newContext();
  const guest = await guestContext.newPage();
  try {
    await signUp(page, "historyhost");
    await signUp(guest, "historyguest");
    const hostDeck = await createCommanderDeck(page, "History host deck", "sol-ring");
    const guestDeck = await createCommanderDeck(guest, "History guest deck", "llanowar");
    const headers = { "x-mana-vault": "1" };
    const created = await page.request.post("/api/play/manual/tables", { headers, data: { deckId: hostDeck, playerLimit: 2 } });
    expect(created.status()).toBe(201);
    const { table, inviteCode } = await created.json();
    expect((await guest.request.post("/api/play/manual/tables/join", { headers, data: { inviteCode, deckId: guestDeck } })).status()).toBe(200);
    const started = await page.request.post(`/api/play/manual/tables/${table.id}/start`, { headers, data: {} });
    expect(started.status()).toBe(200);
    expect((await guest.request.post(`/api/play/manual/tables/${table.id}/actions`, {
      headers, data: { revision: (await started.json()).table.revision, action: { type: "loss" } },
    })).status()).toBe(200);
    await page.reload();
    await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
    await page.getByRole("tab", { name: "Multiplayer table" }).click();
    await page.getByRole("button", { name: "Show manual game history" }).click();
    await expect(page.getByText("History host deck · Game completed")).toBeVisible();
    await expect(page.getByText("Selected deck: 1 completed; remaining: 1, reported losses: 0, concessions: 0. Closed early: 0. Results are player-reported.")).toBeVisible();
    await expect(page.getByText(/Game started: \d{4}-\d\d-\d\d.*Closed: \d{4}-\d\d-\d\d/)).toBeVisible();
    await expect(page.getByText(/^Duration: \d+h \d+m \d+s$/)).toBeVisible();
    await expect(page.getByText(/Seat 2: historyguest.* · reported loss/)).toBeVisible();
    await page.getByRole("button", { name: "Show deck snapshot" }).click();
    await expect(page.getByText("History host deck (commander)")).toBeVisible();
    await expect(page.getByText(/9 x Sol Ring \(main,/)).toBeVisible();
    await expect(page.locator("#view-play")).not.toContainText("Llanowar Elves");
  } finally {
    await guestContext.close();
  }
});

test("private manual Commander table plays shared cards without exposing opponents' hands", async ({ browser, page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
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

    await hostHand.getByLabel("Move Sol Ring from hand").first().selectOption("exile");
    const hostExile = page.locator('.play-zone[data-zone="exile"]');
    await expect(hostExile).toContainText("Sol Ring");
    await expect(spectatorPage.locator(".play-player-row")).toContainText("Exile: Sol Ring");
    await hostExile.locator(".play-drag-handle").first().dragTo(hostHand.locator("h3"));
    await expect(hostHand.locator(".playcardname")).toHaveCount(8);
    await expect(hostExile.locator(".play-card")).toHaveCount(0);
    await expect(spectatorPage.locator(".play-player-row")).not.toContainText("Sol Ring");

    await hostHand.getByRole("button", { name: "Play face down" }).first().click();
    const hostBattlefield = page.locator(".play-zone").filter({ has: page.locator("h3", { hasText: "Battlefield" }) });
    await expect(hostBattlefield).toContainText("Your card: Sol Ring");
    await expect(otherPage.locator(".play-player-row")).toContainText("Face down");
    await expect(spectatorPage.locator(".play-player-row")).toContainText("Face down");
    await expect(otherPage.locator("#view-play")).not.toContainText("Sol Ring");
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Sol Ring");
    const faceDownCard = hostBattlefield.locator(".play-card").first();
    const removeCounter = faceDownCard.getByRole("button", { name: "Remove counter from Sol Ring" });
    await expect(removeCounter).toBeDisabled();
    await faceDownCard.getByLabel("Counter type for Sol Ring").selectOption("charge");
    await faceDownCard.getByRole("button", { name: "Add counter to Sol Ring" }).click();
    await expect(spectatorPage.locator(".play-player-row")).toContainText("Face down · charge: 1");
    await expect(otherPage.locator("#view-play")).not.toContainText("Sol Ring");
    await expect(spectatorPage.locator("#view-play")).not.toContainText("Sol Ring");
    await expect(removeCounter).toBeEnabled();
    await removeCounter.click();
    await expect(spectatorPage.locator(".play-player-row")).not.toContainText("charge: 1");
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
    await wolf.getByRole("button", { name: "Copy" }).click();
    await expect(hostBattlefield.locator(".play-card").filter({ hasText: "Wolf" })).toHaveCount(2);
    await expect(spectatorPage.locator(".play-player-row .engine-card").filter({ hasText: "Wolf" })).toHaveCount(2);
    expect(otherPageErrors).toEqual([]);

    const guestBoard = page.locator(".play-player-row .play-player").nth(1);
    const undoDamage = guestBoard.getByRole("button", { name: /^Remove commander damage from / });
    await expect(undoDamage).toBeDisabled();
    await guestBoard.getByRole("button", { name: "+ Commander damage" }).click();
    await expect(spectatorPage.locator(".play-player-row .play-player").nth(1)).toContainText("Commander damage from seat 1: 1");
    await expect(undoDamage).toBeEnabled();
    await undoDamage.click();
    await expect(spectatorPage.locator(".play-player-row .play-player").nth(1)).not.toContainText("Commander damage from seat 1");

    await page.getByRole("button", { name: "End turn" }).click();
    await expect(otherPage.locator(".play-player-row .play-player").nth(1)).toContainText("Active");
    await otherPage.getByRole("button", { name: "Draw" }).click();
    await expect(page.locator(".play-player-row .play-player").nth(1)).toContainText("Hand 8");
    await otherPage.getByRole("button", { name: "End turn" }).click();
    await expect(page.locator(".play-player-row .play-player").first()).toContainText("Active");
    await page.getByRole("button", { name: "Draw" }).click();
    await expect(page.locator(".play-player-row .play-player").first()).toContainText("Hand 8");
    await reportPoisonLoss(page);
    await expect(page.locator("#view-play")).toContainText("Game ended");
    await expect(otherPage.locator("#view-play")).toContainText("Game ended");
    await expect(spectatorPage.locator("#view-play")).toContainText("Game ended");
    for (const target of [page, otherPage, spectatorPage]) {
      await expect(target.locator(".play-player-row .play-player").first()).toContainText("Reported loss");
      await expect(target.locator(".play-player-row .play-player").nth(1)).toContainText("Remaining player");
    }

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
      await reportPoisonLoss(currentPage);
      if (seat < 2) {
        for (const target of playerPages) {
          await expect(target.locator(".play-player-row .play-player").nth(seat)).toContainText("Reported loss");
        }
        await expect(currentPage.getByRole("button", { name: "Draw" })).toHaveCount(0);
      } else {
        for (const target of playerPages) {
          await expect(target.locator("#view-play")).toContainText("Game ended");
        }
      }
    }
    for (const currentPage of playerPages) {
      await expect(currentPage.locator("#view-play")).toContainText("Game ended");
      await expect(currentPage.locator(".play-player-row .play-player").nth(3)).toContainText("Remaining player");
    }
  } finally {
    for (const context of guests) await context.close();
  }
});

test("plays an original custom card offline and in a completed manual game", async ({ browser, page }) => {
  await page.setViewportSize({ width: 1440, height: 1400 });
  const suffix = Date.now().toString(36).slice(-5);
  const setCode = `p${suffix}`;
  const customName = `Practice Bear ${suffix}`;
  let customCardId: string | null = null;
  let deckId: string | null = null;
  let multiplayerDeckId: string | null = null;
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
    await battlefield.getByRole("button", { name: "Copy" }).click();
    await expect(battlefield.getByRole("img", { name: customName })).toHaveCount(2);
    await battlefield.getByLabel(`Move ${customName} from battlefield`).last().selectOption("exile");
    const exile = page.locator('.play-zone[data-zone="exile"]');
    await expect(exile.getByRole("img", { name: customName })).toBeVisible();
    await exile.locator(".play-drag-handle").first().dragTo(battlefield.locator("h3"));
    await expect(battlefield.getByRole("img", { name: customName })).toHaveCount(2);
    await expect(exile.locator(".play-card")).toHaveCount(0);
    await page.getByRole("button", { name: "Show library" }).click();
    await page.getByLabel("Search library").fill("no matching card");
    await expect(page.getByRole("button", { name: `Put ${customName} into hand` })).toHaveCount(0);
    await page.getByLabel("Search library").fill(customName);
    await page.getByRole("button", { name: `Put ${customName} into hand` }).click();
    await expect(hand.locator(".play-card")).toHaveCount(7);
    await expect(page.locator(".play-toolbar")).toContainText("0 in library");
    await page.getByLabel("Token", { exact: true }).fill("Wolf");
    await page.getByRole("button", { name: "Add", exact: true }).click();
    const soloWolf = battlefield.locator(".play-card").filter({ has: page.getByLabel("Counter type for Wolf") });
    await soloWolf.getByLabel("Counter type for Wolf").selectOption("loyalty");
    await soloWolf.getByRole("button", { name: "Add counter to Wolf" }).click();
    await expect(soloWolf).toContainText("loyalty: 1");
    await soloWolf.getByRole("button", { name: "Remove counter from Wolf" }).click();
    await expect(soloWolf).not.toContainText("loyalty: 1");
    await battlefield.getByLabel("Move Wolf from battlefield").selectOption("library-top");
    await page.getByRole("button", { name: "Draw" }).click();
    await expect(hand.getByText("Wolf", { exact: false })).toBeVisible();
    await hand.getByLabel("Move Wolf from hand").selectOption("battlefield");
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

    await page.context().setOffline(false);
    multiplayerDeckId = await createCommanderDeck(page, `Custom Commander ${suffix}`, customCard.id);
    const guestContext = await browser.newContext();
    try {
      const guest = await guestContext.newPage();
      await signUp(guest, "customguest");
      const guestDeck = await createCommanderDeck(guest, `Guest Commander ${suffix}`, "llanowar");
      await page.reload();
      await page.locator("#modetabs .mtab", { hasText: "Play" }).click();
      await page.getByLabel("Saved deck").selectOption(multiplayerDeckId);
      await page.getByRole("tab", { name: "Multiplayer table" }).click();
      await page.getByRole("button", { name: "Create two-player table" }).click();
      const inviteText = await page.getByText(/Invite code:/).textContent();
      const inviteCode = inviteText?.replace("Invite code:", "").trim();
      if (!inviteCode) throw new Error("The new table did not display an invitation code.");
      await guest.reload();
      await guest.locator("#modetabs .mtab", { hasText: "Play" }).click();
      await guest.getByLabel("Saved deck").selectOption(guestDeck);
      await guest.getByRole("tab", { name: "Multiplayer table" }).click();
      await guest.getByLabel("Invitation code").fill(inviteCode);
      await guest.getByRole("button", { name: "Join table" }).click();
      await expect(page.getByRole("button", { name: "Start game" })).toBeEnabled();
      await page.getByRole("button", { name: "Start game" }).click();
      await expect(guest.getByRole("button", { name: "Draw" })).toBeVisible();
      await expect(guest.locator("#view-play")).not.toContainText(customName);
      await page.locator('.play-zone[data-zone="hand"]').getByRole("button", { name: "Play", exact: true }).first().click();
      await expect(guest.locator(".play-player-row")).toContainText(customName);
      await reportPoisonLoss(guest);
      await expect(page.locator("#view-play")).toContainText("Game ended");
      await expect(guest.locator("#view-play")).toContainText("Game ended");
      await expect(page.locator(".play-player-row .play-player").first()).toContainText("Remaining player");
    } finally {
      await guestContext.close();
    }
  } finally {
    await page.context().setOffline(false);
    if (multiplayerDeckId) {
      const deletedDeck = await page.request.delete(`/api/decks/${multiplayerDeckId}`, { headers: { "x-mana-vault": "1" } });
      expect(deletedDeck.status()).toBe(200);
    }
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
