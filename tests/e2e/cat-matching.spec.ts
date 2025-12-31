import { test, expect } from '@playwright/test';
import { testImages } from './fixtures/images';
import { CatMatchingPage } from './pages/CatMatchingPage';
import { installWorkerMocks } from './mocks/workerMocks';

test.describe('初期表示', () => {
  test('主要UIが表示される', async ({ page }) => {
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    await expect(catPage.heading).toBeVisible();
    await expect(catPage.dropZone).toBeVisible();
    await expect(catPage.emptyResults).toBeVisible();
  });

  test('キーボードで画像入力にフォーカスできる', async ({ page }) => {
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    // GitHubリンク → 画像入力の順でフォーカスが移動する
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(catPage.imageInput).toBeFocused();
  });
});

test.describe('モデルロード', () => {
  test('画像を選択するとモデル確認のオーバーレイが表示される', async ({ page }) => {
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    await catPage.uploadImage(testImages.minimal);

    await expect(catPage.modelPrompt).toBeVisible();
    await expect(catPage.modelConsentButton).toBeVisible();
  });

  test('同意後にモデルがロードされプログレスが表示される', async ({ page }) => {
    await installWorkerMocks(page);
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    await catPage.uploadImage(testImages.minimal);
    await catPage.acceptModelLoad();

    await expect(catPage.progressBar).toBeVisible();
  });

  test('モデル読み込み失敗時にエラーメッセージが表示される', async ({ page }) => {
    await installWorkerMocks(page, { failLoad: true });
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    await catPage.uploadImage(testImages.minimal);
    await catPage.acceptModelLoad();

    await expect(page.getByText('モデルの読み込みに失敗しました。')).toBeVisible();
  });
});

test.describe('マッチング結果', () => {
  test('モデル読み込みから結果表示まで進む', async ({ page }) => {
    await installWorkerMocks(page);
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    await catPage.uploadImage(testImages.minimal);
    await expect(catPage.modelPrompt).toBeVisible();
    await catPage.acceptModelLoad();

    await expect(catPage.resultsHeading(3)).toBeVisible();
    await expect(catPage.resultByName('東京都')).toBeVisible();
    await expect(page.locator('[data-testid="match-results-empty"]')).toHaveCount(0);

    await catPage.detailToggle.click();
    await expect(catPage.detailsPanel).toBeVisible();
  });

  test('結果表示までの時間が3秒以内', async ({ page }) => {
    await installWorkerMocks(page);
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    await catPage.uploadImage(testImages.minimal);
    const start = Date.now();
    await catPage.acceptModelLoad();
    await expect(catPage.resultsHeading(3)).toBeVisible();
    const elapsed = Date.now() - start;

    expect(elapsed).toBeLessThan(3000);
  });
});
