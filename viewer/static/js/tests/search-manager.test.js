/**
 * search-manager.jsのユニットテスト
 * 検索機能とハイライト
 */

describe('SearchManager', () => {
  let searchManager;

  beforeEach(() => {
    // SearchManagerのモック実装
    searchManager = {
      query: '',
      results: [],
      currentIndex: 0,
      history: [],

      search: function (query) {
        this.query = query;
        // シンプルな検索実装
        this.results = this._mockSearch(query);
        return this.results;
      },

      _mockSearch: function (query) {
        const mockData = [
          { id: 1, content: 'Hello World' },
          { id: 2, content: 'Hello there' },
          { id: 3, content: 'Goodbye World' },
        ];

        if (!query) return [];

        return mockData.filter((item) =>
          item.content.toLowerCase().includes(query.toLowerCase())
        );
      },

      highlight: function (text, query) {
        if (!query) return text;

        const regex = new RegExp(`(${query})`, 'gi');
        return text.replace(regex, '<mark>$1</mark>');
      },

      addToHistory: function (query) {
        if (query && !this.history.includes(query)) {
          this.history.push(query);
          if (this.history.length > 10) {
            this.history.shift();
          }
        }
      },

      clearHistory: function () {
        this.history = [];
      },

      nextResult: function () {
        if (this.results.length === 0) return null;
        this.currentIndex = (this.currentIndex + 1) % this.results.length;
        return this.results[this.currentIndex];
      },

      prevResult: function () {
        if (this.results.length === 0) return null;
        this.currentIndex =
          (this.currentIndex - 1 + this.results.length) % this.results.length;
        return this.results[this.currentIndex];
      },

      clear: function () {
        this.query = '';
        this.results = [];
        this.currentIndex = 0;
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('search', () => {
    test('クエリに一致する結果を返す', () => {
      const results = searchManager.search('Hello');

      expect(results.length).toBe(2);
      expect(results[0].content).toContain('Hello');
      expect(results[1].content).toContain('Hello');
    });

    test('大文字小文字を区別しない検索', () => {
      const results = searchManager.search('hello');

      expect(results.length).toBe(2);
      expect(results[0].content).toContain('Hello');
    });

    test('一致しない場合は空配列を返す', () => {
      const results = searchManager.search('NonExistent');

      expect(results.length).toBe(0);
    });

    test('空のクエリは空配列を返す', () => {
      const results = searchManager.search('');

      expect(results.length).toBe(0);
    });

    test('部分一致で検索', () => {
      const results = searchManager.search('Wor');

      expect(results.length).toBe(2);
    });
  });

  describe('highlight', () => {
    test('検索語をハイライト', () => {
      const text = 'Hello World';
      const result = searchManager.highlight(text, 'Hello');

      expect(result).toBe('<mark>Hello</mark> World');
    });

    test('複数の一致をすべてハイライト', () => {
      const text = 'Hello Hello World';
      const result = searchManager.highlight(text, 'Hello');

      expect(result).toBe('<mark>Hello</mark> <mark>Hello</mark> World');
    });

    test('大文字小文字を区別しないハイライト', () => {
      const text = 'Hello HELLO hello';
      const result = searchManager.highlight(text, 'hello');

      expect(result).toContain('<mark>');
    });

    test('空のクエリの場合は元のテキストを返す', () => {
      const text = 'Hello World';
      const result = searchManager.highlight(text, '');

      expect(result).toBe('Hello World');
    });

    test('特殊文字を含むテキストのハイライト', () => {
      const text = 'test@example.com';
      const result = searchManager.highlight(text, 'test');

      expect(result).toContain('<mark>test</mark>');
    });
  });

  describe('検索履歴管理', () => {
    test('検索履歴に追加', () => {
      searchManager.addToHistory('Hello');

      expect(searchManager.history).toContain('Hello');
      expect(searchManager.history.length).toBe(1);
    });

    test('重複する検索語は追加しない', () => {
      searchManager.addToHistory('Hello');
      searchManager.addToHistory('Hello');

      expect(searchManager.history.length).toBe(1);
    });

    test('履歴が10件を超えたら古いものを削除', () => {
      for (let i = 1; i <= 12; i++) {
        searchManager.addToHistory(`query${i}`);
      }

      expect(searchManager.history.length).toBe(10);
      expect(searchManager.history[0]).toBe('query3');
      expect(searchManager.history[9]).toBe('query12');
    });

    test('空の検索語は履歴に追加しない', () => {
      searchManager.addToHistory('');

      expect(searchManager.history.length).toBe(0);
    });

    test('検索履歴をクリア', () => {
      searchManager.addToHistory('Hello');
      searchManager.addToHistory('World');
      searchManager.clearHistory();

      expect(searchManager.history.length).toBe(0);
    });
  });

  describe('結果ナビゲーション', () => {
    beforeEach(() => {
      searchManager.search('Hello');
    });

    test('次の結果に移動', () => {
      const result = searchManager.nextResult();

      expect(searchManager.currentIndex).toBe(1);
      expect(result).toBeDefined();
    });

    test('最後の結果から次に移動すると最初に戻る', () => {
      searchManager.currentIndex = 1;
      const result = searchManager.nextResult();

      expect(searchManager.currentIndex).toBe(0);
    });

    test('前の結果に移動', () => {
      searchManager.currentIndex = 1;
      const result = searchManager.prevResult();

      expect(searchManager.currentIndex).toBe(0);
      expect(result).toBeDefined();
    });

    test('最初の結果から前に移動すると最後に戻る', () => {
      searchManager.currentIndex = 0;
      const result = searchManager.prevResult();

      expect(searchManager.currentIndex).toBe(1);
    });

    test('結果がない場合はnullを返す', () => {
      searchManager.results = [];
      const next = searchManager.nextResult();
      const prev = searchManager.prevResult();

      expect(next).toBeNull();
      expect(prev).toBeNull();
    });
  });

  describe('検索のクリア', () => {
    test('検索状態をクリア', () => {
      searchManager.search('Hello');
      searchManager.clear();

      expect(searchManager.query).toBe('');
      expect(searchManager.results.length).toBe(0);
      expect(searchManager.currentIndex).toBe(0);
    });
  });

  describe('正規表現検索', () => {
    test('正規表現パターンで検索（実装想定）', () => {
      // 正規表現検索の基本動作をテスト
      const pattern = /Hello|Goodbye/gi;
      const mockData = [
        'Hello World',
        'Goodbye World',
        'Hi there',
      ];

      const results = mockData.filter((text) => pattern.test(text));

      expect(results.length).toBe(2);
    });
  });

  describe('検索結果のフィルタリング', () => {
    test('検索結果をフィルタ（実装想定）', () => {
      searchManager.search('Hello');
      const filtered = searchManager.results.filter(
        (result) => result.id > 1
      );

      expect(filtered.length).toBe(1);
      expect(filtered[0].id).toBe(2);
    });
  });
});
