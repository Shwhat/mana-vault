import { test as base, expect, type Page } from "@playwright/test";

let counter = 0;

/** Creates a new account through the sign-in page and waits for the app. */
export async function signUp(page: Page, prefix = "user"): Promise<string> {
  counter += 1;
  const name = `${prefix}${Date.now().toString(36)}${counter}`;
  await page.goto("/login");
  await page.getByRole("button", { name: "Create account" }).first().click();
  await page.fill("#name", name);
  await page.fill("#pw", "correct horse");
  await page.fill("#pw2", "correct horse");
  await page.locator("#go").click();
  await page.waitForSelector("#titlebar, #ptabs");
  return name;
}

/** Any page error or console error fails the test. */
export const test = base.extend<{ errors: string[] }>({
  errors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      // card images come from the internet, which the test machine may not reach
      if (message.type() === "error" && !/Failed to load resource/.test(message.text())) errors.push(message.text());
    });
    await use(errors);
    expect(errors, "page errors").toEqual([]);
  }, { auto: true }],
});

export { expect };

export const status = (page: Page) => page.locator("#st-msg");
export const row = (page: Page, name: string) => page.locator(".view .row", { hasText: name }).first();

export async function search(page: Page, text: string) {
  await page.keyboard.press("Escape");
  await page.keyboard.press("/");
  await expect(page.getByRole("textbox", { name: "Search cards" })).toBeFocused();
  const done = page.waitForResponse((response) => {
    const url = new URL(response.url());
    return url.pathname === "/api/cards" && url.searchParams.get("q") === text;
  });
  await page.keyboard.press("Control+A");
  await page.keyboard.press("Backspace");
  if (text) await page.keyboard.type(text);
  await done;
  await expect(page.locator("#view-cards .phpos")).not.toHaveText("Searching");
}

/** Runs a ribbon command by its label: the tab is named first, then the button, or the list button that holds it. */
export async function menu(page: Page, tabName: string, item: string) {
  await page.locator(".rtab", { hasText: tabName }).first().click();
  const button = page.locator(`.rpanel [data-label="${item}"]`);
  if (await button.count()) {
    await button.first().click();
    return;
  }
  const list = page.locator(".rpanel [data-labels]").filter({ has: page.locator(":scope") });
  for (let index = 0; index < await list.count(); index++) {
    const labels = (await list.nth(index).getAttribute("data-labels")) ?? "";
    if (!labels.split("\n").includes(item)) continue;
    await list.nth(index).dispatchEvent("mousedown");
    await page.locator("#dropdown .dd", { hasText: item }).first().click();
    return;
  }
  throw new Error(`No ribbon command "${item}" on the ${tabName} tab`);
}
