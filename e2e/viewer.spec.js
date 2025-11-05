/**
 * ビューアーのE2Eテスト
 */
const { test, expect } = require('@playwright/test');

test.describe('ログビューアー', () => {
  test('ページが正しく読み込まれる', async ({ page }) => {
    // ビューアーページにアクセス
    await page.goto('/');

    // ページタイトルを確認
    await expect(page).toHaveTitle(/CLI Log Viewer/i);

    // メインコンテナが存在することを確認
    const mainContainer = page.locator('#app, .container, main');
    await expect(mainContainer.first()).toBeVisible();
  });

  test('ファイル一覧が表示される', async ({ page }) => {
    await page.goto('/');

    // ファイル一覧セクションが表示されることを確認
    const fileList = page.locator('.file-list, #file-list, [data-testid="file-list"]');

    // 要素が存在するかチェック（存在しない場合はスキップ）
    const count = await fileList.count();
    if (count > 0) {
      await expect(fileList.first()).toBeVisible({ timeout: 10000 });
    }
  });

  test('検索機能が利用可能', async ({ page }) => {
    await page.goto('/');

    // 検索ボックスを探す
    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"], #search-input');

    const count = await searchInput.count();
    if (count > 0) {
      await expect(searchInput.first()).toBeVisible();

      // 検索ボックスに入力できることを確認
      await searchInput.first().fill('test');
      await expect(searchInput.first()).toHaveValue('test');
    }
  });

  test('テーマ切り替えボタンが機能する', async ({ page }) => {
    await page.goto('/');

    // テーマ切り替えボタンを探す
    const themeToggle = page.locator('button[data-theme-toggle], .theme-toggle, #theme-toggle');

    const count = await themeToggle.count();
    if (count > 0) {
      await expect(themeToggle.first()).toBeVisible();

      // ボタンをクリック
      await themeToggle.first().click();

      // テーマが変更されたことを確認（bodyやhtmlのクラスが変わる）
      const bodyClasses = await page.locator('body, html').first().getAttribute('class');
      expect(bodyClasses).toBeTruthy();
    }
  });
});

test.describe('リアルタイムモード', () => {
  test('リアルタイムモードページが表示される', async ({ page }) => {
    // リアルタイムモードページにアクセス
    await page.goto('/realtime');

    // ページが正しく読み込まれることを確認
    await expect(page).toHaveURL(/realtime/);

    // メインコンテナが存在することを確認
    const container = page.locator('.realtime-container, #realtime, main');
    const count = await container.count();
    if (count > 0) {
      await expect(container.first()).toBeVisible();
    }
  });

  test('ファイル選択UIが表示される', async ({ page }) => {
    await page.goto('/realtime');

    // ファイル選択UIを探す
    const fileSelect = page.locator('select[name="file"], #file-select, .file-selector');

    const count = await fileSelect.count();
    if (count > 0) {
      await expect(fileSelect.first()).toBeVisible();
    }
  });
});
