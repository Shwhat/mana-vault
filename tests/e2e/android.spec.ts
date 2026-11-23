import type { Page } from "@playwright/test";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { expect, test, choose, takePrinting } from "./fixtures";

const dist = join(__dirname, "../../apps/web/dist");

// The Android app runs the same interface inside Capacitor. These tests stand in for its native plugin
// (window.__manaVaultApp) and use the test server as the server the phone signs in to.

async function fakePhone(page: Page) {
  // the app carries its own copy of the interface, like Capacitor serving the bundled files
  await page.route((url) => !url.pathname.startsWith("/api/"), async (route) => {
    const path = new URL(route.request().url()).pathname;
    const file = join(dist, path);
    await route.fulfill({ path: path !== "/" && existsSync(file) ? file : join(dist, "index.html") });
  });
  await page.addInitScript(() => {
    const key = "test.native";
    const read = () => JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, unknown>;
    const listeners: Record<string, Array<(data: unknown) => void>> = {};
    const calls: unknown[][] = [];
    const scope = window as unknown as Record<string, unknown>;
    scope.__nativeCalls = calls;
    scope.__nativeFire = (event: string, data?: unknown) => (listeners[event] ?? []).forEach((listener) => listener(data));
    // the daily update check stays quiet in tests
    localStorage.setItem("mana-vault.updateCheck", String(Date.now()));
    window.__manaVaultApp = {
      getSettings: async () => read(),
      setSettings: async (change) => { localStorage.setItem(key, JSON.stringify({ ...read(), ...change })); },
      clearSettings: async () => { localStorage.removeItem(key); },
      recognize: async () => ({ lines: [], width: 0, height: 0 }),
      setNotifications: async (options) => { calls.push(["notifications", options]); return { granted: true }; },
      takeLaunchOffer: async () => ({ offer: null }),
      saveFile: async (options) => { calls.push(["saveFile", options.name]); },
      minimize: async () => { calls.push(["minimize"]); },
      appInfo: async () => ({ version: "test", android: "15", device: "Test Phone" }),
      addListener: (async (event: string, listener: (data: unknown) => void) => {
        (listeners[event] ??= []).push(listener);
        return { remove: async () => { listeners[event] = (listeners[event] ?? []).filter((item) => item !== listener); } };
      }) as never,
    };
  });
}

const calls = (page: Page) => page.evaluate(() => (window as unknown as { __nativeCalls: unknown[][] }).__nativeCalls);
const fire = (page: Page, event: string) => page.evaluate((name) => (window as unknown as { __nativeFire: (event: string) => void }).__nativeFire(name), event);
const chip = (page: Page) => page.locator(".syncchip");

/** Waits until the card list is on the phone and nothing is waiting to sync. */
async function synced(page: Page) {
  await expect.poll(() => page.evaluate(() => new Promise<boolean>((resolve) => {
    const open = indexedDB.open("mana-vault-app", 1);
    open.onsuccess = () => {
      const get = open.result.transaction("meta").objectStore("meta").get("catalogVersion");
      get.onsuccess = () => resolve(!!get.result);
      get.onerror = () => resolve(false);
    };
    open.onerror = () => resolve(false);
  })), { timeout: 15_000 }).toBe(true);
  await expect(chip(page)).toHaveText(/^Synced/);
}

async function signUpOnPhone(page: Page, baseURL: string, prefix: string): Promise<string> {
  const name = `${prefix}${Date.now().toString(36)}`;
  await page.goto("/");
  // 0.17.0: https only, apart from the phone's own address used for testing
  await page.fill("#server", "http://vault.example.com");
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".appcard")).toContainText("https only");
  await page.fill("#server", baseURL);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator(".appcard")).toContainText("(version test)");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.fill("#name", name);
  await page.fill("#pw", "correct horse");
  await page.fill("#pw2", "correct horse");
  await page.locator(".appcard .go").click();
  await expect(page.locator("#ptabs")).toBeVisible();
  await synced(page);
  // these tests work with collection rows; new accounts start with the grid
  await page.locator(".ptab", { hasText: "Collection" }).click();
  await page.getByRole("button", { name: /Options/ }).click();
  await page.locator(".optpop").getByRole("button", { name: "List" }).click();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await page.locator(".ptab", { hasText: "Search" }).click();
  await page.locator("#view-cards").getByRole("button", { name: /Options/ }).click();
  await page.locator(".optpop").getByRole("button", { name: "List" }).click();
  await page.locator(".optpop").getByRole("button", { name: "Done" }).click();
  await page.locator(".ptab", { hasText: "Home" }).click();
  return name;
}

async function addFromSearch(page: Page, query: string, name: string) {
  await page.locator(".ptab", { hasText: "Search" }).click();
  await page.getByRole("textbox", { name: "Search cards" }).fill(query);
  await page.locator("#view-cards .row", { hasText: name }).first().locator(".rowtitle b").click();
  await expect(page.locator(".cardpage h2")).toHaveText(name);
  await page.getByRole("button", { name: "Card actions" }).click();
  await page.locator(".fabmenu .pmrow", { hasText: /^Add to Main collection\.\.\.$/ }).click();
  await takePrinting(page);
  await expect(page.locator(".ptoast")).toHaveText(`${name} added to Main collection`);
  await page.getByRole("button", { name: "Back" }).click();
}

const openMenu = (page: Page) => page.getByRole("button", { name: "Menu", exact: true }).click();

async function serverCards(page: Page, baseURL: string, collection = "Main collection"): Promise<string[]> {
  const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("test.native") ?? "{}") as { token: string }).token);
  const headers = { authorization: `Bearer ${token}` };
  const collections = await (await page.request.get(`${baseURL}/api/collections`, { headers })).json() as Array<{ id: string; name: string }>;
  const id = collections.find((item) => item.name === collection)?.id;
  if (!id) return [];
  const cards = await (await page.request.get(`${baseURL}/api/collections/${id}/cards`, { headers })).json() as Array<{ name: string; quantity: number }>;
  return cards.map((card) => `${card.quantity} ${card.name}`);
}

test.describe("Android app", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test("signs in with a server address, works offline and sends the changes when back online", async ({ page, context, baseURL }) => {
    await fakePhone(page);
    await signUpOnPhone(page, baseURL!, "droid");
    await expect(page.locator("#titlebar")).toHaveCount(0);
    await addFromSearch(page, "Counterspell", "Counterspell");

    await context.setOffline(true);
    // the search and the card details come from the card list on the phone
    await addFromSearch(page, "shivan", "Shivan Dragon");
    await expect(chip(page)).toContainText("Offline");
    await expect(chip(page).locator(".cbadge")).toHaveText("1");
    await page.locator(".ptab", { hasText: "Collection" }).click();
    await expect(page.locator("#view-collection .row", { hasText: "Shivan Dragon" }).first()).toBeVisible();
    await expect(page.locator("#view-collection .row", { hasText: "Counterspell" }).first()).toBeVisible();
    // things that need the server say so
    await openMenu(page);
    await page.locator(".pmrow", { hasText: "Devices..." }).click();
    await expect(page.locator("#dlg")).toContainText("cannot be reached");
    await page.locator("#dlg .dlgbtns .btn").last().click();

    // the app syncs by itself when the connection returns
    await context.setOffline(false);
    await expect(chip(page)).toHaveText(/^Synced/);
    expect((await serverCards(page, baseURL!)).sort()).toEqual(["1 Counterspell", "1 Shivan Dragon"]);
  });

  test("notes pages are read, changed and made offline, and sent when back online (0.22.0)", async ({ page, context, baseURL }) => {
    await fakePhone(page);
    await signUpOnPhone(page, baseURL!, "notes");
    await page.getByRole("button", { name: "Wiki" }).click();
    await page.locator("#view-wiki .wikihead").getByRole("button", { name: "New page..." }).click();
    await page.locator("dialog#dlg[open]").getByRole("textbox", { name: "Title" }).fill("Phone page");
    await page.locator("dialog#dlg[open]").getByRole("button", { name: "Make page" }).click();
    // pages open to read on the phone; Edit starts editing
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator(".notebody").click();
    await page.keyboard.type("Online text");
    await expect(page.locator(".nstatus")).toHaveText("Saved", { timeout: 6000 });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(chip(page)).toHaveText(/^Synced/);

    await context.setOffline(true);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator(".notebody").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" and offline text");
    await expect(page.locator(".nstatus")).toHaveText("Saved", { timeout: 6000 });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await expect(chip(page)).toContainText("Offline");
    // a new page offline, and search on the phone
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await page.locator("#view-wiki .wikihead").getByRole("button", { name: "New page..." }).click();
    await page.locator("dialog#dlg[open]").getByRole("textbox", { name: "Title" }).fill("Made offline");
    await page.locator("dialog#dlg[open]").getByRole("button", { name: "Make page" }).click();
    await expect(page.locator("input.ntitle")).toHaveValue("Made offline");
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await page.getByRole("textbox", { name: "Search notes" }).fill("offline text");
    await expect(page.getByRole("listbox", { name: "Pages found" }).getByRole("option")).toHaveCount(1);

    await context.setOffline(false);
    await expect(chip(page)).toHaveText(/^Synced/);
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("test.native") ?? "{}") as { token: string }).token);
    const headers = { authorization: `Bearer ${token}`, "x-mana-vault": "1" };
    const tree = await (await page.request.get(`${baseURL}/api/notes`, { headers })).json() as { pages: Array<{ id: string; title: string }> };
    expect(tree.pages.map((item) => item.title).sort()).toEqual(["Made offline", "Phone page"]);
    const phonePage = tree.pages.find((item) => item.title === "Phone page")!;
    const saved = await (await page.request.get(`${baseURL}/api/notes/pages/${phonePage.id}`, { headers })).json() as { body: string; version: number };
    expect(saved.body).toBe("Online text and offline text\n");

    // an offline change that meets a newer save on the server asks which text to keep
    await page.getByRole("textbox", { name: "Search notes" }).fill("");
    await page.locator(".ntree [role=treeitem]", { hasText: "Phone page" }).click();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator(".notebody").click();
    await page.keyboard.press("Control+End");
    await page.keyboard.type(" again");
    await expect(page.locator(".nstatus")).toHaveText("Saved", { timeout: 6000 });
    await page.request.put(`${baseURL}/api/notes/pages/${phonePage.id}`, { headers, data: { body: "Changed on the computer\n", baseVersion: saved.version } });
    await context.setOffline(false);
    await expect(page.locator("dialog#dlg[open]")).toContainText("Choose which text to keep", { timeout: 15_000 });
    await page.locator("dialog#dlg[open]").getByRole("button", { name: "Keep mine" }).click();
    await expect.poll(async () => (await (await page.request.get(`${baseURL}/api/notes/pages/${phonePage.id}`, { headers })).json() as { body: string }).body)
      .toBe("Online text and offline text again\n");
  });

  test("pictures pasted offline stay as links and are copied when the page is opened online (0.23.0)", async ({ page, context, baseURL }) => {
    await fakePhone(page);
    await signUpOnPhone(page, baseURL!, "paste");
    await page.getByRole("button", { name: "Wiki" }).click();
    for (const title of ["Web notes", "Other"]) {
      await page.locator("#view-wiki .wikihead").getByRole("button", { name: "New page..." }).click();
      await page.locator("dialog#dlg[open]").getByRole("textbox", { name: "Title" }).fill(title);
      await page.locator("dialog#dlg[open]").getByRole("button", { name: "Make page" }).click();
      await expect(page.locator("input.ntitle")).toHaveValue(title);
      await page.getByRole("button", { name: "Pages", exact: true }).click();
    }
    await page.locator(".ntree [role=treeitem]", { hasText: "Web notes" }).click();
    await context.setOffline(true);
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.locator(".notebody").click();
    await page.evaluate(() => {
      const data = new DataTransfer();
      data.setData("text/html", `<p>An elf</p><p><img src="https://example.test/pics/elf.png" alt="Elf"></p>`);
      document.querySelector(".notebody")!.dispatchEvent(new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true }));
    });
    await expect(page.locator(".notebody img.notepic")).toHaveAttribute("src", "https://example.test/pics/elf.png");
    await expect(page.locator(".nstatus")).toHaveText("Saved", { timeout: 6000 });
    await page.getByRole("button", { name: "Done", exact: true }).click();
    await context.setOffline(false);
    await expect(chip(page)).toHaveText(/^Synced/, { timeout: 15_000 });
    // opening the page again online copies the picture
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await page.locator(".ntree [role=treeitem]", { hasText: "Other" }).click();
    await page.getByRole("button", { name: "Pages", exact: true }).click();
    await page.locator(".ntree [role=treeitem]", { hasText: "Web notes" }).click();
    await expect(page.locator(".notebody img.notepic")).toHaveAttribute("src", /\/api\/notes\/files\/[0-9a-f-]{36}$/, { timeout: 10_000 });
  });

  test("Back button, devices, notifications and sign out", async ({ page, baseURL }) => {
    await fakePhone(page);
    await signUpOnPhone(page, baseURL!, "back");

    await openMenu(page);
    await expect(page.locator(".sheet")).toBeVisible();
    await fire(page, "backButton");
    await expect(page.locator(".sheet")).toHaveCount(0);
    await page.locator(".ptab", { hasText: "Decks" }).click();
    await fire(page, "backButton");
    await expect(page.locator(".ptab.on")).toHaveText("Home");
    await fire(page, "backButton");
    expect(await calls(page)).toContainEqual(["minimize"]);

    await openMenu(page);
    await page.locator(".pmrow", { hasText: "Devices..." }).click();
    await expect(page.locator(".devlist")).toContainText("Test Phone");
    await expect(page.locator(".devlist")).toContainText("This phone");
    await fire(page, "backButton");
    await expect(page.locator("#dlg[open]")).toHaveCount(0);

    await openMenu(page);
    await page.locator(".pmrow", { hasText: "Notifications..." }).click();
    await page.getByLabel("Notify me about new offers in the Inbox").check();
    await page.locator("#dlg .dlgbtns .primary").click();
    await expect(page.locator(".ptoast")).toHaveText("Notifications on");
    expect(await calls(page)).toContainEqual(["notifications", { enabled: true, wifiOnly: false }]);

    await openMenu(page);
    await page.locator(".pmrow", { hasText: "Sign out" }).click();
    await page.locator("#dlg .dlgbtns .primary").click();
    await expect(page.locator("#server")).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("test.native"))).toBeNull();
  });

  test("changes the server refuses are listed after sync", async ({ page, context, baseURL }) => {
    await fakePhone(page);
    await signUpOnPhone(page, baseURL!, "refuse");
    await page.locator(".ptab", { hasText: "Collection" }).click();
    await context.setOffline(true);
    await addFromSearch(page, "serra", "Serra Angel");
    await expect(chip(page).locator(".cbadge")).toHaveText("1");
    // meanwhile the collection is deleted on the server
    const token = await page.evaluate(() => (JSON.parse(localStorage.getItem("test.native") ?? "{}") as { token: string }).token);
    const headers = { authorization: `Bearer ${token}`, "x-mana-vault": "1" };
    const collections = await (await page.request.get(`${baseURL}/api/collections`, { headers })).json() as Array<{ id: string }>;
    expect((await page.request.delete(`${baseURL}/api/collections/${collections[0]!.id}`, { headers })).ok()).toBe(true);
    await context.setOffline(false);
    await expect(page.locator("#dlg")).toContainText("Changes not applied");
    await expect(page.locator("#dlg")).toContainText("Add 1 Serra Angel to Main collection");
    await expect(chip(page)).toHaveText(/^Synced/);
  });

  test("the scanner matches cards on the phone while offline", async ({ page, context, baseURL }) => {
    await fakePhone(page);
    await page.addInitScript(() => {
      const queue: Array<{ lines: string[]; info: string } | null> = [];
      (window as unknown as { __scanQueue: typeof queue }).__scanQueue = queue;
      window.__manaVaultScanText = () => queue.shift() ?? null;
    });
    await signUpOnPhone(page, baseURL!, "scanoff");
    await context.setOffline(true);
    await page.locator(".ptab", { hasText: "Scan" }).click();
    await page.evaluate(() => {
      const queue = (window as unknown as { __scanQueue: unknown[] }).__scanQueue;
      queue.push({ lines: ["Lightning Bolt"], info: "0146 C\nM10 EN" }, { lines: ["Lightning Bolt"], info: "0146 C\nM10 EN" }, null, null);
    });
    await expect(page.locator(".scanlastname")).toContainText("Lightning Bolt");
    await page.getByRole("button", { name: "Scanned list", exact: true }).click();
    await expect(page.locator(".scansheet")).toContainText("M10 #146");
    // a new collection can be made offline from Add to
    await page.getByRole("button", { name: "Add to..." }).click();
    await choose(page, page.locator("#add-target"), "collection:new-collection");
    await page.locator("#add-name").fill("Offline box");
    await page.locator("dialog[open]").getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator(".ptoast")).toHaveText("1 card added to Offline box");
    await expect(chip(page).locator(".cbadge")).toHaveText("2");
    // Sync now: tapping the chip
    await context.setOffline(false);
    await chip(page).click();
    await expect(chip(page)).toHaveText(/^Synced/);
    expect(await serverCards(page, baseURL!, "Offline box")).toEqual(["1 Lightning Bolt"]);
  });
});
