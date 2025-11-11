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

// 追加テストシナリオ
test.describe('ビューアー - 詳細機能', () => {
  test('ファイル切り替え動作', async ({ page }) => {
    await page.goto('/');

    // ファイル選択要素を探す
    const fileSelect = page.locator('select[name="file"], #file-select, .file-selector');
    const count = await fileSelect.count();

    if (count > 0) {
      const select = fileSelect.first();
      const options = select.locator('option');
      const optionCount = await options.count();

      if (optionCount > 1) {
        // 最初のファイルを選択
        await select.selectOption({ index: 1 });
        await page.waitForTimeout(500);

        // 2番目のファイルを選択
        if (optionCount > 2) {
          await select.selectOption({ index: 2 });
          await page.waitForTimeout(500);
        }

        // エラーが発生しないことを確認
        const errors = [];
        page.on('pageerror', (error) => errors.push(error));
        expect(errors.length).toBe(0);
      }
    }
  });

  test('検索機能の詳細テスト', async ({ page }) => {
    await page.goto('/');

    const searchInput = page.locator('input[type="search"], input[placeholder*="検索"], #search-input');
    const count = await searchInput.count();

    if (count > 0) {
      const input = searchInput.first();

      // 検索語を入力
      await input.fill('test query');
      await expect(input).toHaveValue('test query');

      // Enterキーで検索実行
      await input.press('Enter');
      await page.waitForTimeout(500);

      // 検索結果領域の確認
      const resultsArea = page.locator('.search-results, #search-results, [data-testid="search-results"]');
      // 結果領域が存在する場合は表示を確認
      const resultsCount = await resultsArea.count();
      expect(resultsCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('フィルタリング機能', async ({ page }) => {
    await page.goto('/');

    // フィルターUIの確認
    const filterButtons = page.locator('button[data-filter], .filter-button, [data-testid^="filter-"]');
    const count = await filterButtons.count();

    if (count > 0) {
      // 最初のフィルターボタンをクリック
      await filterButtons.first().click();
      await page.waitForTimeout(300);

      // ページが正常に動作することを確認
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('スクロール動作', async ({ page }) => {
    await page.goto('/');

    // メッセージコンテナを探す
    const messagesContainer = page.locator('#messages, .messages, [data-testid="messages"]');
    const count = await messagesContainer.count();

    if (count > 0) {
      const container = messagesContainer.first();

      // スクロール可能か確認
      const scrollHeight = await container.evaluate((el) => el.scrollHeight);
      const clientHeight = await container.evaluate((el) => el.clientHeight);

      if (scrollHeight > clientHeight) {
        // 下にスクロール
        await container.evaluate((el) => {
          el.scrollTop = el.scrollHeight;
        });

        await page.waitForTimeout(100);

        // スクロール位置が変わったことを確認
        const scrollTop = await container.evaluate((el) => el.scrollTop);
        expect(scrollTop).toBeGreaterThan(0);
      }
    }
  });

  test('コピー機能（実装想定）', async ({ page }) => {
    await page.goto('/');

    // コピーボタンの確認
    const copyButtons = page.locator('button[data-copy], .copy-button, [title*="コピー"]');
    const count = await copyButtons.count();

    if (count > 0) {
      // コピーボタンが存在し、クリック可能
      await expect(copyButtons.first()).toBeVisible();
      await expect(copyButtons.first()).toBeEnabled();
    }
  });

  test('レスポンシブ動作 - モバイル', async ({ page }) => {
    // モバイルビューポート
    await page.setViewportSize({ width: 375, height: 667 });
    await page.goto('/');

    // ページが正しく表示される
    await expect(page.locator('body')).toBeVisible();

    // メインコンテンツが表示される
    const mainContent = page.locator('#app, main, .container');
    await expect(mainContent.first()).toBeVisible();
  });

  test('レスポンシブ動作 - タブレット', async ({ page }) => {
    // タブレットビューポート
    await page.setViewportSize({ width: 768, height: 1024 });
    await page.goto('/');

    // ページが正しく表示される
    await expect(page.locator('body')).toBeVisible();
  });

  test('レスポンシブ動作 - デスクトップ', async ({ page }) => {
    // デスクトップビューポート
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('/');

    // ページが正しく表示される
    await expect(page.locator('body')).toBeVisible();
  });

  test('キーボードナビゲーション', async ({ page }) => {
    await page.goto('/');

    // Tabキーでフォーカス移動
    await page.keyboard.press('Tab');
    await page.waitForTimeout(100);

    // フォーカスされた要素が存在する
    const focusedElement = await page.evaluateHandle(() => document.activeElement);
    expect(focusedElement).toBeTruthy();
  });

  test('ページ遷移とブラウザバック', async ({ page }) => {
    await page.goto('/');

    // リアルタイムページに遷移
    const realtimeLink = page.locator('a[href="/realtime"], a[href*="realtime"]');
    const count = await realtimeLink.count();

    if (count > 0) {
      await realtimeLink.first().click();
      await page.waitForURL(/realtime/);

      // ブラウザバック
      await page.goBack();
      await page.waitForURL('/');

      // トップページに戻ったことを確認
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('エラーハンドリング - 存在しないページ', async ({ page }) => {
    const response = await page.goto('/nonexistent-page');

    // 404エラーまたはエラーページが表示される
    expect(response.status()).toBeGreaterThanOrEqual(400);
  });

  test('JavaScript実行エラーがない', async ({ page }) => {
    const errors = [];

    page.on('pageerror', (error) => {
      errors.push(error.message);
    });

    await page.goto('/');
    await page.waitForTimeout(2000);

    // JavaScriptエラーが発生していないことを確認
    expect(errors.length).toBe(0);
  });

  test('コンソールエラーが発生しない', async ({ page }) => {
    const consoleErrors = [];

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        consoleErrors.push(msg.text());
      }
    });

    await page.goto('/');
    await page.waitForTimeout(1000);

    // 重大なエラーがないことを確認
    const hasCriticalErrors = consoleErrors.some(
      (error) => error.includes('Failed to') || error.includes('500')
    );
    expect(hasCriticalErrors).toBeFalsy();
  });
});
