import { Page, expect } from '@playwright/test';
import { BasePage } from './BasePage';

export class LoginPage extends BasePage {
  constructor(page: Page) {
    super(page);
  }

  async navigate() {
    await this.goto('/login');
    await this.waitForPageLoad();
  }

  async login(enterpriseId: string, email: string, password: string) {
    await this.page.getByPlaceholder('123456789').pressSequentially(enterpriseId);
    await this.page.getByPlaceholder('johndoe@email.com').fill(email);
    await this.page.getByLabel('Password').fill(password);
    await this.page.getByRole('button', { name: 'Login' }).click();
  }

  async expectLoginError() {
    await expect(this.page.getByText(/invalid|incorrect|error|required|valid email|wrong|failed|denied/i)).toBeVisible({ timeout: 15000 });
  }

  async submitForm() {
    await this.page.getByRole('button', { name: 'Login' }).click();
  }

  async expectLoginSuccess() {
    await expect(this.page).not.toHaveURL('/login');
  }
}
