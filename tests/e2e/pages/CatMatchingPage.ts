import type { Locator, Page } from '@playwright/test';

export class CatMatchingPage {
  constructor(private readonly page: Page) {}

  async goto() {
    await this.page.goto('/');
  }

  get heading() {
    return this.page.getByRole('heading', { name: '猫に似ている都道府県を探すツール' });
  }

  get dropZone() {
    return this.page.getByTestId('image-drop-zone');
  }

  get imageInput() {
    return this.page.getByTestId('image-input');
  }

  get modelPrompt() {
    return this.page.getByTestId('model-prompt');
  }

  get modelConsentButton() {
    return this.page.getByTestId('model-consent-button');
  }

  get progressBar() {
    return this.page.getByTestId('progress-bar');
  }

  get emptyResults() {
    return this.page.getByTestId('match-results-empty');
  }

  get results() {
    return this.page.getByTestId('match-results');
  }

  resultsHeading(count?: number) {
    return this.page.getByRole('heading', {
      name: count ? `類似する都道府県 Top ${count}` : /類似する都道府県 Top/
    });
  }

  resultByName(name: string): Locator {
    return this.page.getByRole('img', { name });
  }

  get detailToggle() {
    return this.page.getByRole('button', { name: '距離の内訳を見る' });
  }

  get detailsPanel() {
    return this.page.getByText('距離の内訳', { exact: true });
  }

  async uploadImage(file: { name: string; mimeType: string; buffer: Buffer }) {
    await this.imageInput.setInputFiles(file);
  }

  async uploadImagePath(path: string) {
    await this.imageInput.setInputFiles(path);
  }

  async acceptModelLoad() {
    await this.modelConsentButton.click();
  }
}
