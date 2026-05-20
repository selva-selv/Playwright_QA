import { test, expect } from './fixtures';
import { LoginPage } from '../pages/LoginPage';
import { validUser, negativeUsers } from '../data/testData';

// ── Passing scenarios ─────────────────────────────────────────────────────────
// TC-L01 and TC-L02 verify that core login behaviour works correctly.
// Both pass when the app is functioning normally.

test.describe('Login Module — Pass Scenarios', () => {

  test('TC-L01 - valid credentials must redirect away from login page',
    async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.navigate();
      await loginPage.login(validUser.enterpriseId, validUser.email, validUser.password);
      await expect(page).not.toHaveURL('/login', { timeout: 10_000 });
    }
  );

  test('TC-L02 - wrong password must show an error and stay on login page',
    async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.navigate();
      await loginPage.login(
        negativeUsers.wrongPassword.enterpriseId,
        negativeUsers.wrongPassword.email,
        negativeUsers.wrongPassword.password
      );
      await loginPage.expectLoginError();
      await expect(page).toHaveURL('/login', { timeout: 5_000 });
    }
  );

});

// ── Strict failing scenarios ───────────────────────────────────────────────────
// TC-L03 and TC-L04 expose real UX gaps in the application.
// They are intentionally strict — the app does not satisfy these assertions,
// so both tests FAIL by design and each automatically creates a Jira bug card.

test.describe('Login Module — Strict Failed Scenarios', () => {

  test('TC-L03 - login success must display the authenticated user email on screen',
    {
      annotation: [
        { type: 'jira-priority', description: 'High' },
        { type: 'jira-severity', description: 'High' },
        // WHY THIS FAILS: the dashboard renders no visible email address after login.
        // Most production apps show the logged-in user in the navbar/avatar/profile area.
        // Until the app exposes the session identity on screen, this test will fail.
        { type: 'failure-reason', description: 'UX gap — user identity not visible on dashboard after login' },
      ],
    },
    async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.navigate();
      await loginPage.login(validUser.enterpriseId, validUser.email, validUser.password);

      // Confirm login succeeded before checking dashboard content
      await expect(page).not.toHaveURL('/login', { timeout: 10_000 });

      // STRICT ASSERTION — will fail:
      // The authenticated user's email must be visible somewhere on the page
      // (navbar, avatar tooltip, profile header, or any other element).
      // The app currently shows no user identity on the dashboard after login.
      await expect(
        page.getByText(validUser.email, { exact: false })
      ).toBeVisible({ timeout: 10_000 });
    }
  );

  test('TC-L04 - invalid credentials error must appear inside the form, not as a toast',
    {
      annotation: [
        { type: 'jira-priority', description: 'High' },
        { type: 'jira-severity', description: 'Medium' },
        // WHY THIS FAILS: the app renders the error as a global toast notification
        // that appears outside the <form> element. A scoped in-form error is required
        // so the message is clearly associated with the fields that caused it.
        { type: 'failure-reason', description: 'UX gap — error is a global toast, not scoped to the login form' },
      ],
    },
    async ({ page }) => {
      const loginPage = new LoginPage(page);
      await loginPage.navigate();
      await loginPage.login(
        negativeUsers.wrongPassword.enterpriseId,
        negativeUsers.wrongPassword.email,
        negativeUsers.wrongPassword.password
      );

      // Confirm the user stays on the login page
      await expect(page).toHaveURL('/login', { timeout: 5_000 });

      // STRICT ASSERTION — will fail:
      // The error must be rendered inside the <form> or .v-form container.
      // If the app uses a toast (which renders in a portal outside the form),
      // this locator returns no matching element and the assertion fails.
      await expect(
        page.locator('form, .v-form').getByText(
          /invalid|incorrect|wrong|failed|denied|password|credentials/i
        )
      ).toBeVisible({ timeout: 10_000 });
    }
  );

});
