import { test as setup, expect } from "@playwright/test";
import path from "path";
import { E2E_RESTRICTED_USERNAME, E2E_RESTRICTED_PASSWORD, E2E_RESTRICTED_NAME } from "./test-constants";

const authFile = path.join(__dirname, ".auth/admin.json");

setup("authenticate as admin", async ({ page }) => {
  await page.goto("/login");
  await expect(page.locator("#email")).toBeVisible({ timeout: 10000 });

  await page.fill("#email", "admin@accountant.com");
  await page.fill("#password", "admin123");
  await page.getByRole("button", { name: "Sign In" }).click();

  await page.waitForURL(/dashboard/, { timeout: 15000 });
  await page.context().storageState({ path: authFile });
  console.log("✅ Admin session saved");

  // Create (or recreate) the fixed restricted user for permissions tests
  const listRes = await page.request.get("/api/users");
  if (listRes.ok()) {
    const users: Array<{ id: string; username: string }> = await listRes.json();
    const existing = users.find((u) => u.username === E2E_RESTRICTED_USERNAME);
    if (existing) {
      await page.request.delete(`/api/users/${existing.id}`);
      console.log("✅ Deleted leftover restricted test user");
    }
  }

  const createRes = await page.request.post("/api/users", {
    data: {
      name: E2E_RESTRICTED_NAME,
      username: E2E_RESTRICTED_USERNAME,
      password: E2E_RESTRICTED_PASSWORD,
      permissions: {
        dashboard:    { view: true,  edit: false },
        clients:      { view: true,  edit: false },
        products:     { view: false, edit: false },
        employees:    { view: false, edit: false },
        invoices:     { view: false, edit: false },
        expenses:     { view: false, edit: false },
        reports:      { view: false, edit: false },
        ai:           { view: false, edit: false },
        activity_log: { view: false, edit: false },
        tax:          { view: false, edit: false },
        settings:     { view: false, edit: false },
      },
    },
  });

  if (createRes.ok()) {
    console.log("✅ Restricted test user created");
  } else {
    const err = await createRes.json();
    console.error("❌ Failed to create restricted user:", err);
  }
});
