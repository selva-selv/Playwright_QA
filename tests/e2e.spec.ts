import { test, expect } from './fixtures';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { validUser } from '../data/testData';

test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(validUser.enterpriseId, validUser.email, validUser.password);
  await expect(page).not.toHaveURL('/login');
});

// ── End-to-End Tests ──────────────────────────────────────────────────────────

test('TC120 - full login flow loads dashboard with sidebar and navbar', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.expectDashboardVisible();
  await dashboard.expectNavbarVisible();
  await dashboard.expectSidebarVisible();
});

test('TC121 - login then navigate to Enterprise section via sidebar', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.navigateToSection('Enterprise');
  await dashboard.expectSectionLoaded('Enterprise');
});

test('TC122 - login then navigate to User section via sidebar', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.navigateToSection('User');
  await dashboard.expectSectionLoaded('User');
});

test('TC123 - login then navigate to Project section via sidebar', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.navigateToSection('Project');
  await dashboard.expectSectionLoaded('Project');
});

test('TC124 - login then navigate to Customer section via sidebar', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.navigateToSection('Customer');
  await dashboard.expectSectionLoaded('Customer');
});
