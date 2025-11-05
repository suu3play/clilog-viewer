/**
 * api-client.jsのユニットテスト
 */

// api-client.jsの読み込み（Node.js環境用）
const fs = require('fs');
const path = require('path');
const apiClientCode = fs.readFileSync(
  path.join(__dirname, '../api-client.js'),
  'utf8'
);
eval(apiClientCode);

describe('ApiClient', () => {
  let apiClient;

  beforeEach(() => {
    apiClient = new ApiClient('http://localhost:5000');
    global.fetch = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    test('ベースURLを正しく設定する', () => {
      expect(apiClient.baseUrl).toBe('http://localhost:5000');
    });

    test('キャッシュを初期化する', () => {
      expect(apiClient.cache).toBeInstanceOf(Map);
      expect(apiClient.cache.size).toBe(0);
    });

    test('abortControllerがnullで初期化される', () => {
      expect(apiClient.abortController).toBeNull();
    });
  });

  describe('request', () => {
    test('成功時にJSONレスポンスを返す', async () => {
      const mockData = { messages: [] };
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => mockData
      });

      const result = await apiClient.request('/messages');

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:5000/api/messages',
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
      expect(result).toEqual(mockData);
    });

    test('HTTPエラー時にエラーをスローする', async () => {
      global.fetch.mockResolvedValue({
        ok: false,
        status: 404,
        json: async () => ({ error: 'Not Found' })
      });

      await expect(apiClient.request('/invalid')).rejects.toThrow('Not Found');
    });

    test('ネットワークエラー時にエラーをスローする', async () => {
      global.fetch.mockRejectedValue(new Error('Network error'));

      await expect(apiClient.request('/messages')).rejects.toThrow('Network error');
    });

    test('AbortErrorをキャッチして適切なメッセージを返す', async () => {
      const abortError = new Error('The user aborted a request');
      abortError.name = 'AbortError';
      global.fetch.mockRejectedValue(abortError);

      await expect(apiClient.request('/messages')).rejects.toThrow('リクエストがキャンセルされました');
    });

    test('カスタムヘッダーを送信できる', async () => {
      global.fetch.mockResolvedValue({
        ok: true,
        json: async () => ({})
      });

      await apiClient.request('/messages', {
        headers: {
          'X-Custom-Header': 'test-value'
        }
      });

      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'X-Custom-Header': 'test-value'
          })
        })
      );
    });
  });
});
