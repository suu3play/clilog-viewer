/**
 * Jest setup file
 * テスト実行前に読み込まれる
 */

// グローバルなモック設定
global.console = {
  ...console,
  // テスト中のログを抑制（必要に応じて）
  // log: jest.fn(),
  // error: jest.fn(),
  // warn: jest.fn(),
};

// DOMのモック（必要に応じて）
Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: jest.fn().mockImplementation(query => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: jest.fn(),
    removeListener: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    dispatchEvent: jest.fn(),
  })),
});

// LocalStorage のモック
const localStorageMock = {
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
  clear: jest.fn(),
};
global.localStorage = localStorageMock;
