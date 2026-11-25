import type { Page } from "@playwright/test";
import { modeTab, signUp, test, expect } from "./fixtures";

const PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
let createdCode: string | null = null;
let createdUser: string | null = null;

test.afterEach(async ({ page }) => {
  const headers = { "x-mana-vault": "1" };
  if (createdCode) {
    const cards = await (await page.request.get("/api/custom/cards")).json() as Array<{ id: string; setCode: string }>;
    for (const card of cards.filter((item) => item.setCode === createdCode)) {
      expect((await page.request.delete(`/api/custom/cards/${card.id}`, { headers })).ok()).toBe(true);
    }
    expect((await page.request.delete(`/api/custom/sets/${createdCode}`, { headers })).ok()).toBe(true);
    createdCode = null;
  }
  if (createdUser) {
    const art = await (await page.request.get("/api/art")).json() as Array<{ id: string; addedBy: string | null }>;
    for (const item of art.filter((entry) => entry.addedBy === createdUser)) {
      expect((await page.request.delete(`/api/art/${item.id}`, { headers })).ok()).toBe(true);
    }
    createdUser = null;
  }
});

async function setupMaker(page: Page) {
  const user = await signUp(page, "makerloading");
  createdUser = user;
  const code = `l${user.slice(-5)}`;
  const headers = { "x-mana-vault": "1" };
  expect((await page.request.post("/api/custom/sets", { headers, data: { code, name: "Loading set" } })).status()).toBe(201);
  createdCode = code;
  const ids: string[] = [];
  for (const [index, name] of ["Alpha", "Bravo", "Charlie"].entries()) {
    const front = { name, typeLine: "Artifact" };
    const response = await page.request.post("/api/custom/cards", { headers, data: {
      card: { setCode: code, collectorNumber: String(index + 1), front }, design: { front }, picture: PNG,
      ...(name === "Bravo" ? { art: PNG } : {}),
    } });
    expect(response.status()).toBe(201);
    ids.push((await response.json()).id as string);
  }
  await modeTab(page, "Proxies");
  await page.getByRole("tab", { name: "Card maker" }).click();
  await expect(page.locator("#cm-name")).toHaveValue("Alpha");
  return { ids, row: (name: string) => page.locator(".makerlist .navitem", { hasText: name }).filter({ hasText: code.toUpperCase() }) };
}

test("card fields are editable while art loads without saving or duplicating incomplete artwork", async ({ page }) => {
  const { ids: [, bravo], row } = await setupMaker(page);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let requested!: () => void;
  const artRequested = new Promise<void>((resolve) => { requested = resolve; });
  await page.route(`**/api/custom/cards/${bravo}/art**`, async (route) => {
    requested();
    await delayed;
    await route.continue();
  });
  await row("Bravo").click();
  await artRequested;
  await expect(page.locator("#cm-name")).toHaveValue("Bravo");
  await expect(page.getByText("Loading card art...")).toBeVisible();
  const savedPreview = page.getByRole("img", { name: "Saved preview of Bravo" });
  await expect(savedPreview).toBeVisible();
  await expect.poll(() => savedPreview.evaluate((image: HTMLImageElement) => image.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Duplicate" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Export PNG" })).toBeDisabled();
  await page.locator("#cm-typeLine").fill("Artifact - Equipment");
  await expect(page.getByRole("img", { name: "Preview of Bravo" })).toBeVisible();
  release();
  await expect(page.getByText("Loading card art...")).toHaveCount(0);
  await expect(page.locator("#cm-typeLine")).toHaveValue("Artifact - Equipment");
  await expect(page.getByRole("button", { name: "Remove art" })).toBeEnabled();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Not saved yet")).toHaveCount(0);
  const art = await page.request.get(`/api/custom/cards/${bravo}/art`);
  expect(await art.body()).toEqual(Buffer.from(PNG.split(",")[1]!, "base64"));
  await page.getByRole("button", { name: "Duplicate" }).click();
  await page.getByRole("button", { name: "Save to card database" }).click();
  await expect(page.getByText("Not saved yet")).toHaveCount(0);
  const cards = await (await page.request.get("/api/custom/cards")).json() as Array<{ id: string; name: string }>;
  const copy = cards.find((card) => card.name === "Bravo (copy)")!;
  const copiedArt = await page.request.get(`/api/custom/cards/${copy.id}/art`);
  expect(await copiedArt.body()).toEqual(Buffer.from(PNG.split(",")[1]!, "base64"));
});

test("art finishing for an older card cannot overwrite a newer selection", async ({ page }) => {
  const { ids: [, bravo], row } = await setupMaker(page);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let requested!: () => void;
  const artRequested = new Promise<void>((resolve) => { requested = resolve; });
  await page.route(`**/api/custom/cards/${bravo}/art**`, async (route) => {
    requested();
    await delayed;
    await route.continue();
  });
  await row("Bravo").click();
  await artRequested;
  await expect(page.locator("#cm-name")).toHaveValue("Bravo");
  await row("Charlie").click();
  await expect(page.locator("#cm-name")).toHaveValue("Charlie");
  const oldResponse = page.waitForResponse((response) => response.url().includes(`/api/custom/cards/${bravo}/art`));
  release();
  await oldResponse;
  await expect(page.getByRole("button", { name: "Remove art" })).toBeDisabled();
  await expect(page.locator("#cm-name")).toHaveValue("Charlie");
});

test("late card responses cannot replace a newer selection and failed art can be retried", async ({ page }) => {
  const { ids: [, bravo], row } = await setupMaker(page);
  let release!: () => void;
  const delayed = new Promise<void>((resolve) => { release = resolve; });
  let requested!: () => void;
  const detailRequested = new Promise<void>((resolve) => { requested = resolve; });
  await page.route(`**/api/custom/cards/${bravo}`, async (route) => {
    requested();
    await delayed;
    await route.continue();
  });
  await row("Bravo").click();
  await detailRequested;
  await row("Charlie").click();
  await expect(page.locator("#cm-name")).toHaveValue("Charlie");
  const oldResponse = page.waitForResponse((response) => response.url().endsWith(`/api/custom/cards/${bravo}`));
  release();
  await oldResponse;
  await page.unroute(`**/api/custom/cards/${bravo}`);
  await expect(page.locator("#cm-name")).toHaveValue("Charlie");

  let attempts = 0;
  await page.route(`**/api/custom/cards/${bravo}/art**`, async (route) => {
    attempts += 1;
    if (attempts === 1) await route.fulfill({ status: 503, body: "Unavailable" });
    else await route.continue();
  });
  await row("Bravo").click();
  await expect(page.locator("#cm-name")).toHaveValue("Bravo");
  await expect(page.getByRole("button", { name: "Retry loading art" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  await page.getByRole("button", { name: "Retry loading art" }).click();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Remove art" })).toBeEnabled();
  expect(attempts).toBe(2);
});
