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
  await page.waitForSelector("#menubar, #ptabs");
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

export async function menu(page: Page, menuName: string, item: string) {
  await page.locator("#menubar .menu", { hasText: menuName }).first().click();
  await page.locator("#dropdown .dd", { hasText: item }).first().click();
}
