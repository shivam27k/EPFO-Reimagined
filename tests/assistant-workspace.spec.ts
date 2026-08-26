import { expect, test } from "@playwright/test";

test("keeps the assistant workspace, conversation, and attachment review across portal navigation", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("article").filter({ hasText: "Rohan Mehta" }).getByRole("button", { name: "Fill these credentials" }).click();
  await expect(page.getByRole("textbox", { name: "Username" })).toHaveValue("new.member@demo.epfsahayak.in");
  await expect(page.getByRole("textbox", { name: "Password" })).toHaveValue("DemoNew#2026");
  const loginResponse = page.waitForResponse((response) => response.url().endsWith("/api/auth/login"));
  await page.getByRole("button", { name: "Start demo" }).click();
  expect((await loginResponse).ok()).toBe(true);
  await expect(page).toHaveURL(/\/overview$/);

  await page.route("**/api/assistant", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ text: "Your profile keeps identity and KYC details together.", usedFallback: true }),
    });
  });

  await page.getByRole("button", { name: "Ask EPF Sahayak" }).click();
  const workspace = page.getByRole("complementary", { name: "EPF Sahayak workspace" });
  await expect(workspace).toBeVisible();
  const desktopWorkspaceBox = await workspace.boundingBox();
  const desktopContentBox = await page.locator("#portal-content").boundingBox();
  expect(desktopWorkspaceBox).not.toBeNull();
  expect(desktopContentBox).not.toBeNull();
  expect((desktopContentBox?.x ?? 0) + (desktopContentBox?.width ?? 0)).toBeLessThanOrEqual((desktopWorkspaceBox?.x ?? 0) + 1);
  await expect(workspace.getByRole("button", { name: "Open EPF Sahayak full screen" })).toHaveCSS("width", "44px");
  await expect(workspace.getByRole("button", { name: "Open EPF Sahayak full screen" })).toHaveCSS("height", "44px");
  await expect(workspace.getByRole("button", { name: "Attach synthetic document" })).toHaveCSS("min-height", "44px");
  await expect(workspace.getByRole("button", { name: "Talk to EPF Sahayak" })).toHaveCSS("min-height", "44px");

  await workspace.getByRole("textbox", { name: "Ask EPF Sahayak" }).fill("Keep this question after navigation");
  await workspace.getByRole("button", { name: "Send" }).click();
  await expect(workspace.getByText("Keep this question after navigation")).toBeVisible();

  await workspace.getByRole("button", { name: "Attach synthetic document" }).click();
  await workspace.getByRole("combobox", { name: "Document type" }).selectOption("PAN_CARD");
  await workspace.getByRole("checkbox", { name: /This file is entirely synthetic/ }).check();

  await page.getByRole("link", { name: "Profile", exact: true }).click();
  await expect(page).toHaveURL(/\/profile$/);
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText("Keep this question after navigation")).toBeVisible();
  await expect(workspace.getByText("Profile and KYC", { exact: true })).toBeVisible();
  await expect(workspace.getByRole("combobox", { name: "Document type" })).toHaveValue("PAN_CARD");
  await expect(workspace.getByRole("checkbox", { name: /This file is entirely synthetic/ })).toBeChecked();

  await workspace.getByRole("button", { name: "Open EPF Sahayak full screen" }).click();
  const dialog = page.getByRole("dialog", { name: "EPF Sahayak workspace" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await page.keyboard.press("Escape");
  await expect(page.getByRole("complementary", { name: "EPF Sahayak workspace" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Open EPF Sahayak full screen" })).toBeFocused();

  await page.setViewportSize({ width: 390, height: 844 });
  const mobileWorkspace = page.getByRole("complementary", { name: "EPF Sahayak workspace" });
  const box = await mobileWorkspace.boundingBox();
  expect(box).not.toBeNull();
  expect(box?.x).toBe(0);
  expect(box?.y).toBe(0);
  expect(box?.width).toBe(390);
  expect(box?.height).toBe(844);
  await expect(mobileWorkspace.getByRole("textbox", { name: "Ask EPF Sahayak" })).toBeInViewport();
  await expect(mobileWorkspace.getByRole("button", { name: "Talk to EPF Sahayak" })).toBeInViewport();
  const scrolling = mobileWorkspace.getByRole("region", { name: "EPF Sahayak workspace content" });
  const scrollState = await scrolling.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
    return { clientHeight: element.clientHeight, scrollHeight: element.scrollHeight, scrollTop: element.scrollTop };
  });
  expect(scrollState.scrollHeight).toBeGreaterThan(scrollState.clientHeight);
  expect(scrollState.scrollTop).toBeGreaterThan(0);
  expect(await page.evaluate(() => document.elementFromPoint(window.innerWidth / 2, window.innerHeight - 1)?.closest(".assistant-workspace") !== null)).toBe(true);

  await page.emulateMedia({ reducedMotion: "reduce" });
  await expect(mobileWorkspace).toHaveCSS("transition-duration", "0s");
  await expect(mobileWorkspace.getByRole("button", { name: "Send" })).toHaveCSS("transition-duration", "0s");
});
