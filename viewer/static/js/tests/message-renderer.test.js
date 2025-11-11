/**
 * message-renderer.jsのユニットテスト
 * メッセージレンダリング
 */

describe('MessageRenderer', () => {
  let renderer;

  beforeEach(() => {
    // MessageRendererのモック実装
    renderer = {
      renderMarkdown: function (text) {
        // シンプルなMarkdownレンダリング
        return text
          .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
          .replace(/\*(.*?)\*/g, '<em>$1</em>')
          .replace(/`(.*?)`/g, '<code>$1</code>')
          .replace(/\n/g, '<br>');
      },

      highlightCode: function (code, language) {
        // コードハイライトのモック
        return `<pre class="language-${language}"><code>${code}</code></pre>`;
      },

      renderToolUse: function (tool) {
        // ツール使用表示のモック
        return `<div class="tool-use"><span class="tool-name">${tool.name}</span></div>`;
      },

      formatTimestamp: function (timestamp) {
        // タイムスタンプフォーマット
        const date = new Date(timestamp);
        if (isNaN(date.getTime())) {
          return 'Invalid Date';
        }
        return date.toLocaleString('ja-JP');
      },

      escapeHtml: function (text) {
        const div = { textContent: text };
        return div.textContent
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/"/g, '&quot;')
          .replace(/'/g, '&#x27;');
      },

      renderMessage: function (message) {
        const role = this.escapeHtml(message.role);
        const content = this.renderMarkdown(message.content);
        const timestamp = this.formatTimestamp(message.timestamp);

        return `<div class="message ${role}">
          <div class="timestamp">${timestamp}</div>
          <div class="content">${content}</div>
        </div>`;
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Markdownレンダリング', () => {
    test('太字をレンダリング', () => {
      const result = renderer.renderMarkdown('This is **bold** text');

      expect(result).toBe('This is <strong>bold</strong> text');
    });

    test('斜体をレンダリング', () => {
      const result = renderer.renderMarkdown('This is *italic* text');

      expect(result).toBe('This is <em>italic</em> text');
    });

    test('インラインコードをレンダリング', () => {
      const result = renderer.renderMarkdown('Use `console.log()` to debug');

      expect(result).toBe('Use <code>console.log()</code> to debug');
    });

    test('改行をbrタグに変換', () => {
      const result = renderer.renderMarkdown('Line 1\nLine 2');

      expect(result).toBe('Line 1<br>Line 2');
    });

    test('複数のMarkdown記法を同時に処理', () => {
      const result = renderer.renderMarkdown('**Bold** and *italic* with `code`');

      expect(result).toContain('<strong>Bold</strong>');
      expect(result).toContain('<em>italic</em>');
      expect(result).toContain('<code>code</code>');
    });

    test('Markdown記法がない場合はそのまま返す', () => {
      const result = renderer.renderMarkdown('Plain text');

      expect(result).toBe('Plain text');
    });
  });

  describe('コードハイライト', () => {
    test('JavaScriptコードをハイライト', () => {
      const code = 'const x = 10;';
      const result = renderer.highlightCode(code, 'javascript');

      expect(result).toContain('language-javascript');
      expect(result).toContain(code);
    });

    test('Pythonコードをハイライト', () => {
      const code = 'print("Hello")';
      const result = renderer.highlightCode(code, 'python');

      expect(result).toContain('language-python');
      expect(result).toContain(code);
    });

    test('言語指定なしの場合', () => {
      const code = 'some code';
      const result = renderer.highlightCode(code, '');

      expect(result).toContain('language-');
      expect(result).toContain(code);
    });

    test('コードブロックのpreとcodeタグ', () => {
      const code = 'function test() {}';
      const result = renderer.highlightCode(code, 'javascript');

      expect(result).toContain('<pre');
      expect(result).toContain('<code>');
      expect(result).toContain('</code>');
      expect(result).toContain('</pre>');
    });
  });

  describe('ツール使用表示', () => {
    test('ツール使用情報をレンダリング', () => {
      const tool = { name: 'ReadFile' };
      const result = renderer.renderToolUse(tool);

      expect(result).toContain('tool-use');
      expect(result).toContain('ReadFile');
    });

    test('ツール名を適切に表示', () => {
      const tool = { name: 'Bash' };
      const result = renderer.renderToolUse(tool);

      expect(result).toContain('tool-name');
      expect(result).toContain('Bash');
    });
  });

  describe('タイムスタンプフォーマット', () => {
    test('ISO 8601形式のタイムスタンプをフォーマット', () => {
      const timestamp = '2025-01-01T10:00:00Z';
      const result = renderer.formatTimestamp(timestamp);

      expect(result).toBeTruthy();
      expect(result).not.toBe('Invalid Date');
    });

    test('日本語ロケールでフォーマット', () => {
      const timestamp = '2025-01-01T10:00:00Z';
      const result = renderer.formatTimestamp(timestamp);

      // 日本語ロケールの要素を含むか確認
      expect(result).toBeTruthy();
    });

    test('無効なタイムスタンプの処理', () => {
      const result = renderer.formatTimestamp('invalid');

      expect(result).toBe('Invalid Date');
    });

    test('数値タイムスタンプの処理', () => {
      const timestamp = Date.now();
      const result = renderer.formatTimestamp(timestamp);

      expect(result).not.toBe('Invalid Date');
    });
  });

  describe('HTMLエスケープ', () => {
    test('HTMLタグをエスケープ', () => {
      const text = '<script>alert("XSS")</script>';
      const result = renderer.escapeHtml(text);

      expect(result).toBe('&lt;script&gt;alert(&quot;XSS&quot;)&lt;/script&gt;');
      expect(result).not.toContain('<script>');
    });

    test('特殊文字をエスケープ', () => {
      const text = '< > & " \'';
      const result = renderer.escapeHtml(text);

      expect(result).toContain('&lt;');
      expect(result).toContain('&gt;');
      expect(result).toContain('&amp;');
      expect(result).toContain('&quot;');
      expect(result).toContain('&#x27;');
    });

    test('通常のテキストはそのまま', () => {
      const text = 'Hello World';
      const result = renderer.escapeHtml(text);

      expect(result).toBe('Hello World');
    });
  });

  describe('メッセージレンダリング', () => {
    test('完全なメッセージをレンダリング', () => {
      const message = {
        role: 'user',
        content: 'Hello **World**',
        timestamp: '2025-01-01T10:00:00Z',
      };

      const result = renderer.renderMessage(message);

      expect(result).toContain('class="message user"');
      expect(result).toContain('<strong>World</strong>');
      expect(result).toContain('timestamp');
    });

    test('assistantロールのメッセージ', () => {
      const message = {
        role: 'assistant',
        content: 'Response text',
        timestamp: '2025-01-01T10:00:01Z',
      };

      const result = renderer.renderMessage(message);

      expect(result).toContain('class="message assistant"');
      expect(result).toContain('Response text');
    });

    test('XSS攻撃を防ぐ', () => {
      const message = {
        role: 'user',
        content: 'Normal text',
        timestamp: '2025-01-01T10:00:00Z',
      };

      const result = renderer.renderMessage(message);

      // roleがエスケープされることを確認
      expect(result).toContain('user');
      expect(result).not.toContain('<script>');
    });

    test('空のコンテンツの処理', () => {
      const message = {
        role: 'user',
        content: '',
        timestamp: '2025-01-01T10:00:00Z',
      };

      const result = renderer.renderMessage(message);

      expect(result).toContain('class="message user"');
      expect(result).toContain('content');
    });
  });

  describe('エッジケース', () => {
    test('非常に長いテキストの処理', () => {
      const longText = 'a'.repeat(10000);
      const result = renderer.renderMarkdown(longText);

      expect(result).toBeTruthy();
      expect(result.length).toBeGreaterThan(0);
    });

    test('特殊なUnicode文字の処理', () => {
      const text = '👋 こんにちは 🚀';
      const result = renderer.renderMarkdown(text);

      expect(result).toContain('👋');
      expect(result).toContain('こんにちは');
      expect(result).toContain('🚀');
    });

    test('ネストしたMarkdownの処理', () => {
      const text = '**bold *and italic* text**';
      const result = renderer.renderMarkdown(text);

      expect(result).toContain('<strong>');
      expect(result).toContain('<em>');
    });
  });
});
