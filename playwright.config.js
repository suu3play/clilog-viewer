/**
 * Playwright設定ファイル
 * E2Eテスト用
 */
const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  // テストディレクトリ
  testDir: './e2e',

  // タイムアウト設定
  timeout: 30 * 1000,
  expect: {
    timeout: 5000
  },

  // 失敗時の動作
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,

  // レポーター
  reporter: 'html',

  // 共通設定
  use: {
    // ベースURL（アプリケーションのURL）
    baseURL: 'http://localhost:5000',

    // トレース設定
    trace: 'on-first-retry',

    // スクリーンショット設定
    screenshot: 'only-on-failure',

    // ビデオ設定
    video: 'retain-on-failure',
  },

  // テストするブラウザ設定
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },

    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] },
    },

    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
    },

    // モバイルテスト（必要に応じて）
    // {
    //   name: 'Mobile Chrome',
    //   use: { ...devices['Pixel 5'] },
    // },
    // {
    //   name: 'Mobile Safari',
    //   use: { ...devices['iPhone 12'] },
    // },
  ],

  // 開発サーバー設定（テスト実行時に自動起動）
  webServer: {
    command: 'cd viewer && python app.py',
    url: 'http://localhost:5000',
    reuseExistingServer: !process.env.CI,
    timeout: 120 * 1000,
  },
});
