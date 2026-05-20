import { test, expect } from './fixtures';
import { LoginPage } from '../pages/LoginPage';
import { DashboardPage } from '../pages/DashboardPage';
import { validUser } from '../data/testData';

test.beforeEach(async ({ page }) => {
  const loginPage = new LoginPage(page);
  await loginPage.navigate();
  await loginPage.login(validUser.enterpriseId, validUser.email, validUser.password);
});

test('TC104 - dashboard loads after login', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.expectDashboardVisible();
});

test('TC105 - navbar is visible on dashboard', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.expectDashboardVisible();
  await dashboard.expectNavbarVisible();
});

test('TC106 - sidebar is visible on dashboard', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.expectDashboardVisible();
  await dashboard.expectSidebarVisible();
});

test('TC107 - sidebar contains navigation items', async ({ page }) => {
  const dashboard = new DashboardPage(page);
  await dashboard.expectDashboardVisible();
  const items = await dashboard.getSidebarItems();
  expect(items.length).toBeGreaterThan(0);
});
