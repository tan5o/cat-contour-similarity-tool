import { test, expect } from '@playwright/test';
import { realCatPhotos } from './fixtures/cat-photos';
import { CatMatchingPage } from './pages/CatMatchingPage';

/**
 * 実推論テスト @real-inference
 * 実際のONNXモデルを使用した統合テスト。
 * モックを使わず本番同様の推論を行うため、時間がかかる。
 */
test.describe('実推論 @real-inference', () => {
  test.slow();
  // CIのwebkitエミュレーションでONNX推論が120秒以上かかりタイムアウトするため、モバイル（webkit）ではスキップ。
  // chromium/firefoxで実推論テストは実行されるため、機能検証としては十分。
  test.skip(
    ({ browserName }) => browserName === 'webkit',
    'webkitエミュレーションでのONNX推論は不安定なためスキップ'
  );

  test('実画像で輪郭と結果が表示される', async ({ page }) => {
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    const target = realCatPhotos[0];
    await catPage.uploadImagePath(target.path);
    await expect(catPage.modelPrompt).toBeVisible();
    await catPage.acceptModelLoad();

    await expect(catPage.results).toBeVisible({ timeout: 120_000 });
    const count = await page.locator('.result-item').count();
    expect(count).toBeGreaterThan(0);

    const catShapePath = page.locator('.result-cat-image path');
    await expect(catShapePath).toHaveAttribute('d', /L/);
  });

  test('複数画像で結果が空にならない', async ({ page }) => {
    const catPage = new CatMatchingPage(page);
    await catPage.goto();

    let previousPath: string | null = null;
    for (const [index, photo] of realCatPhotos.entries()) {
      await catPage.uploadImagePath(photo.path);
      if (index === 0) {
        await expect(catPage.modelPrompt).toBeVisible();
        await catPage.acceptModelLoad();
      }
      await expect(catPage.results).toBeVisible({ timeout: 120_000 });
      const count = await page.locator('.result-item').count();
      expect(count).toBeGreaterThan(0);
      const currentPath = await page.locator('.result-cat-image path').getAttribute('d');
      expect(currentPath).not.toBeNull();
      if (previousPath && currentPath) {
        expect(currentPath).not.toEqual(previousPath);
      }
      previousPath = currentPath;
    }
  });
});
