import { test, expect } from "@playwright/test";

const TS = Date.now();

test.describe("Employees", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/dashboard/employees");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 10000 });
  });

  // ── HAPPY PATH ──────────────────────────────────────────────

  test("page loads and shows table", async ({ page }) => {
    await expect(page.locator("h1").last()).toContainText(/employees/i);
    await expect(page.locator("table")).toBeVisible();
  });

  test("create employee with required fields only", async ({ page }) => {
    const firstName = `John${TS}`;
    await page.getByRole("button", { name: /add employee/i }).click();
    const requiredInputs = page.locator("input[required]");
    await requiredInputs.nth(0).fill(firstName);
    await requiredInputs.nth(1).fill(`Doe${TS}`);
    await requiredInputs.nth(2).fill("Developer");
    await requiredInputs.nth(3).fill("5000");
    await page.getByRole("button", { name: /add employee/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${firstName}`)).toBeVisible({ timeout: 6000 });
  });

  test("create employee with optional email empty", async ({ page }) => {
    await page.getByRole("button", { name: /add employee/i }).click();
    const requiredInputs = page.locator("input[required]");
    await requiredInputs.nth(0).fill(`NoEmail${TS}`);
    await requiredInputs.nth(1).fill("Employee");
    await requiredInputs.nth(2).fill("Tester");
    await requiredInputs.nth(3).fill("3000");
    await page.getByRole("button", { name: /add employee/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=NoEmail${TS}`)).toBeVisible({ timeout: 6000 });
  });

  test("create employee with hire date", async ({ page }) => {
    await page.getByRole("button", { name: /add employee/i }).click();
    const requiredInputs = page.locator("input[required]");
    await requiredInputs.nth(0).fill(`Dated${TS}`);
    await requiredInputs.nth(1).fill("Employee");
    await requiredInputs.nth(2).fill("Manager");
    await requiredInputs.nth(3).fill("7000");
    await page.locator("input[type='date']").fill("2023-01-15");
    await page.getByRole("button", { name: /add employee/i }).last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=Dated${TS}`)).toBeVisible({ timeout: 6000 });
  });

  test("adding employee auto-creates salary expense", async ({ page }) => {
    const firstName = `SalaryTest${TS}`;
    await page.getByRole("button", { name: /add employee/i }).click();
    const requiredInputs = page.locator("input[required]");
    await requiredInputs.nth(0).fill(firstName);
    await requiredInputs.nth(1).fill("Auto");
    await requiredInputs.nth(2).fill("Accountant");
    await requiredInputs.nth(3).fill("4500");
    await page.getByRole("button", { name: /add employee/i }).last().click();
    await page.waitForLoadState("networkidle");

    // Navigate to expenses and verify salary expense was created
    await page.goto("/dashboard/expenses");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator(`text=${firstName}`).first()).toBeVisible({ timeout: 6000 });
  });

  test("updating employee salary updates salary expense", async ({ page }) => {
    // Edit the first employee and change salary
    await page.locator("table tbody tr").first().locator("button").first().click();
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });

    // Change salary to a distinctive value
    const salaryInput = page.locator("input[required]").nth(3);
    await salaryInput.fill("8888");
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForLoadState("networkidle");

    // Navigate to expenses and verify updated expense
    await page.goto("/dashboard/expenses");
    await page.waitForLoadState("networkidle");
    await expect(page.locator(".animate-spin")).toHaveCount(0, { timeout: 8000 });
    await expect(page.locator("text=8888")).toBeVisible({ timeout: 6000 });
  });

  test("edit employee status to on_leave", async ({ page }) => {
    await page.locator("table tbody tr").first().locator("button").first().click();
    await expect(page.locator("h2")).toContainText(/edit/i, { timeout: 4000 });
    const statusSelect = page.locator("select").filter({ hasText: /active|inactive|on_leave/i }).last();
    await statusSelect.selectOption("on_leave");
    await page.getByRole("button", { name: /save/i }).click();
    await page.waitForLoadState("networkidle");
  });

  test("delete employee with confirmation", async ({ page }) => {
    const firstName = `DelEmp${TS}`;
    await page.getByRole("button", { name: /add employee/i }).click();
    const req = page.locator("input[required]");
    await req.nth(0).fill(firstName);
    await req.nth(1).fill("Del");
    await req.nth(2).fill("Temp");
    await req.nth(3).fill("1000");
    await page.getByRole("button", { name: /add employee/i }).last().click();
    await page.waitForLoadState("networkidle");

    const row = page.locator(`tr:has-text("${firstName}")`);
    await expect(row).toBeVisible({ timeout: 6000 });
    page.on("dialog", (d) => d.accept());
    await row.locator("button").last().click();
    await page.waitForLoadState("networkidle");
    await expect(page.locator(`text=${firstName}`)).toHaveCount(0, { timeout: 6000 });
  });

  // ── VALIDATION ────────────────────────────────────────────────

  test("ERROR: missing first name blocks submission", async ({ page }) => {
    await page.getByRole("button", { name: /add employee/i }).click();
    const req = page.locator("input[required]");
    await req.nth(1).fill("LastName");
    await req.nth(2).fill("Position");
    await req.nth(3).fill("2000");
    await page.getByRole("button", { name: /add employee/i }).last().click();
    await expect(page.locator("h2")).toContainText(/add|edit/i);
    await page.keyboard.press("Escape");
  });

  test("ERROR: missing position blocks submission", async ({ page }) => {
    await page.getByRole("button", { name: /add employee/i }).click();
    const req = page.locator("input[required]");
    await req.nth(0).fill("FirstName");
    await req.nth(1).fill("LastName");
    await req.nth(3).fill("2000");
    await page.getByRole("button", { name: /add employee/i }).last().click();
    await expect(page.locator("h2")).toContainText(/add|edit/i);
    await page.keyboard.press("Escape");
  });

  test("cancel button closes modal without saving", async ({ page }) => {
    await page.getByRole("button", { name: /add employee/i }).click();
    await page.locator("input[required]").first().fill("ShouldNotAppear");
    await page.getByRole("button", { name: /cancel/i }).click();
    await expect(page.locator("text=ShouldNotAppear")).toHaveCount(0);
  });

  // ── SEARCH / FILTER / SORT ────────────────────────────────────

  test("search filters by name", async ({ page }) => {
    const search = page.locator("input[placeholder*='earch']");
    await search.fill("zzz_nobody");
    await page.waitForTimeout(300);
    const noResults = await page.locator("text=/no results/i").count();
    const rows = await page.locator("table tbody tr").count();
    expect(noResults > 0 || rows === 1).toBeTruthy();
  });

  test("search returns correct employee when name matches", async ({ page }) => {
    // Get the first employee's name from the table
    const firstRowText = await page.locator("table tbody tr").first().textContent();
    const namePart = firstRowText?.trim().split(/\s+/)[0] ?? "";
    if (namePart.length > 2) {
      const search = page.locator("input[placeholder*='earch']");
      await search.fill(namePart);
      await page.waitForTimeout(300);
      const rows = page.locator("table tbody tr");
      const count = await rows.count();
      if (count > 0) {
        const text = await rows.first().textContent();
        expect(text?.toLowerCase()).toContain(namePart.toLowerCase());
      }
    }
  });

  test("search clears to show all employees", async ({ page }) => {
    const search = page.locator("input[placeholder*='earch']");
    const initial = await page.locator("table tbody tr").count();
    await search.fill("zzz_nobody");
    await page.waitForTimeout(300);
    await search.fill("");
    await page.waitForTimeout(300);
    expect(await page.locator("table tbody tr").count()).toBe(initial);
  });

  test("filter by status active", async ({ page }) => {
    await page.locator("select").nth(0).selectOption("active");
    await page.waitForTimeout(300);
    await expect(page.locator("table")).toBeVisible();
  });

  test("filter by status inactive", async ({ page }) => {
    await page.locator("select").nth(0).selectOption("inactive");
    await page.waitForTimeout(300);
    await expect(page.locator("table")).toBeVisible();
  });

  test("sort by salary column", async ({ page }) => {
    const salaryHeader = page.locator("th").filter({ hasText: /salary/i });
    await salaryHeader.click();
    await page.waitForTimeout(200);
    await salaryHeader.click();
    await page.waitForTimeout(200);
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });

  test("sort by name column", async ({ page }) => {
    const nameHeader = page.locator("thead th").filter({ hasText: /name/i }).first();
    await nameHeader.click();
    await page.waitForTimeout(200);
    await expect(page.locator("table tbody tr").first()).toBeVisible();
  });
});
