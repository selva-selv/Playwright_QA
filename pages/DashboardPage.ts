import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class DashboardPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async expectDashboardVisible() {
    await expect(this.page).not.toHaveURL('/login');
    await this.waitForPageLoad();
  }

  // Navbar — top bar with Search ⌘K and user avatar
  async expectNavbarVisible() {
    await expect(this.page.locator('.v-avatar').first()).toBeVisible();
  }

  // Sidebar — verified items from live screenshot: Enterprise, User, Project, Customer, Plan
  async expectSidebarVisible() {
    await expect(this.page.getByText('Enterprise').first()).toBeVisible();
  }

  async clickSidebarItem(itemName: string) {
    await this.page.getByText(itemName, { exact: true }).first().click();
    await this.waitForPageLoad();
  }

  async getSidebarItems() {
    const knownItems = ['Enterprise', 'User', 'Project', 'Customer', 'Plan', 'App Settings', 'Access Control', 'Account Settings'];
    const found: string[] = [];
    for (const item of knownItems) {
      const count = await this.page.getByText(item, { exact: true }).count();
      if (count > 0) found.push(item);
    }
    return found;
  }

  async navigateToSection(sectionName: string) {
    await this.page.getByText(sectionName, { exact: true }).first().click();
    await this.waitForPageLoad();
  }

  async expectSectionLoaded(sectionName: string) {
    await expect(this.page.getByText(sectionName).first()).toBeVisible({ timeout: 15000 });
    await expect(this.page).not.toHaveURL('/login');
  }
}
