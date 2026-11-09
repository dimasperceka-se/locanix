import { expect, test } from "./fixtures";
import { findUser, knownResetToken, logInThroughForm, newAccount, openVerificationLink, signedInAccount } from "./helpers";

test("register with the terms, verify the email, then log in", async ({ page }) => {
  const account = newAccount("register");
  await page.goto("/register");
  await page.getByPlaceholder("Enter your name").fill(account.name);
  await page.getByPlaceholder("Enter your email address").fill(account.email);
  await page.getByPlaceholder("Enter your password").fill(account.password);
  await page.getByPlaceholder("Re-write your password").fill(account.password);
  await page.getByRole("button", { name: "Create account" }).click();

  const terms = page.getByRole("dialog", { name: "Terms and Conditions" });
  await expect(terms.getByRole("heading", { name: "About Locanix" })).toBeVisible();
  await expect(terms).not.toContainText("Lorem ipsum");
  await terms.getByLabel("I agree to the terms & conditions").check();
  await terms.getByRole("button", { name: "Continue" }).click();
  await expect(page).toHaveURL(/\/verify-sent/);
  await expect(page.getByText(account.email)).toBeVisible();

  await logInThroughForm(page, account.email, account.password);
  await expect(page.getByText("Please verify your email first")).toBeVisible();

  const token = (await findUser(account.email))?.verifyToken;
  await page.goto(`/api/auth/verify?token=${token}`);
  await expect(page.getByText("Email verified — you can sign in now.")).toBeVisible();

  await logInThroughForm(page, account.email, account.password);
  await expect(page.getByText(`Hi, ${account.name}`)).toBeVisible();
});

test("a wrong password is rejected", async ({ page }) => {
  const account = newAccount("wrongpw");
  const register = await page.request.post("/api/auth/register", { data: { ...account, confirm: account.password } });
  expect(register.ok()).toBeTruthy();
  await openVerificationLink(page.request, account.email);
  await logInThroughForm(page, account.email, "not-the-password");
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
});

test("forgot password emails a reset link and the new password works", async ({ page, context }) => {
  const account = await signedInAccount(page, "reset");
  await context.clearCookies();

  await page.goto("/login");
  await page.getByRole("link", { name: "Forgot password" }).click();
  await expect(page).toHaveURL(/\/forgot-password/);
  await page.getByLabel("Email").fill(account.email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
  const stored = await findUser(account.email);
  expect(stored?.resetTokenHash, "reset token issued").toBeTruthy();
  expect(stored?.resetExpires ?? 0).toBeGreaterThan(Date.now());

  const token = await knownResetToken(account.email);
  const newPassword = "new-" + account.password;
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill(newPassword);
  await page.getByLabel("Confirm new password").fill(newPassword + "x");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("Passwords do not match.")).toBeVisible();

  await page.getByLabel("Confirm new password").fill(newPassword);
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page).toHaveURL(/\/login\?reset=1/);
  await expect(page.getByText("Password updated")).toBeVisible();

  await logInThroughForm(page, account.email, account.password);
  await expect(page.getByText("Invalid email or password.")).toBeVisible();
  await logInThroughForm(page, account.email, newPassword);
  await expect(page.getByText(`Hi, ${account.name}`)).toBeVisible();

  // The link is single-use.
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("another-password");
  await page.getByLabel("Confirm new password").fill("another-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("This reset link is invalid or has expired")).toBeVisible();
});

test("forgot password does not reveal whether an email is registered", async ({ page }) => {
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(newAccount("nobody").email);
  await page.getByRole("button", { name: "Send reset link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();
});

test("an expired reset link is rejected", async ({ page, context }) => {
  const account = await signedInAccount(page, "expired");
  await context.clearCookies();
  const token = await knownResetToken(account.email, { expired: true });
  await page.goto(`/reset-password?token=${token}`);
  await page.getByLabel("New password", { exact: true }).fill("another-password");
  await page.getByLabel("Confirm new password").fill("another-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByText("This reset link is invalid or has expired")).toBeVisible();
});
