import { test } from './fixtures';
import { LoginPage } from '../pages/LoginPage';
import { validUser, invalidUser, negativeUsers } from '../data/testData';

// ── Positive Tests ───────────────────────────────────────────────────────────

test('TC101 - valid credentials redirect away from login', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(validUser.enterpriseId, validUser.email, validUser.password);
  await loginPage.expectLoginSuccess();
});

test('TC102 - invalid credentials show error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(invalidUser.enterpriseId, invalidUser.email, invalidUser.password);
  await loginPage.expectLoginError();
});

test('TC103 - empty form shows validation', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.submitForm();
  await loginPage.expectLoginError();
});

// ── Negative Tests ───────────────────────────────────────────────────────────

test('TC108 - wrong password with valid enterprise ID and email shows error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(
    negativeUsers.wrongPassword.enterpriseId,
    negativeUsers.wrongPassword.email,
    negativeUsers.wrongPassword.password
  );
  await loginPage.expectLoginError();
});

test('TC109 - invalid email format shows error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(
    negativeUsers.invalidEmailFormat.enterpriseId,
    negativeUsers.invalidEmailFormat.email,
    negativeUsers.invalidEmailFormat.password
  );
  await loginPage.expectLoginError();
});

test('TC110 - wrong enterprise ID shows error', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(
    negativeUsers.wrongEnterpriseId.enterpriseId,
    negativeUsers.wrongEnterpriseId.email,
    negativeUsers.wrongEnterpriseId.password
  );
  await loginPage.expectLoginError();
});

test('TC111 - empty email field shows validation', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(
    negativeUsers.emptyEmail.enterpriseId,
    negativeUsers.emptyEmail.email,
    negativeUsers.emptyEmail.password
  );
  await loginPage.expectLoginError();
});

test('TC112 - empty password field shows validation', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(
    negativeUsers.emptyPassword.enterpriseId,
    negativeUsers.emptyPassword.email,
    negativeUsers.emptyPassword.password
  );
  await loginPage.expectLoginError();
});

test('TC113 - SQL injection in credentials is rejected', async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(
    negativeUsers.sqlInjection.enterpriseId,
    negativeUsers.sqlInjection.email,
    negativeUsers.sqlInjection.password
  );
  await loginPage.expectLoginError();
});
