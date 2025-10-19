/**
 * メッセージ表示を統一的に提供するレンダリングクラス
 */
class MessageRenderer {
    /**
     * メッセージ要素を作成
     * @param {Object} message - メッセージオブジェクト
     * @param {number} messageNumber - メッセージ番号
     * @param {Object} options - レンダリングオプション
     * @param {boolean} options.useDetailedFormat - 詳細な日付フォーマットを使用（デフォルト: false）
     * @param {boolean} options.showHashPrefix - メッセージ番号に#プレフィックスを表示（デフォルト: false）
     * @param {boolean} options.enableMarkdown - Markdown形式のフォーマットを有効化（デフォルト: false）
     * @returns {HTMLElement} メッセージ要素
     */
    static createMessageElement(message, messageNumber, options = {}) {
        const {
            useDetailedFormat = false,
            showHashPrefix = false,
            enableMarkdown = false,
        } = options;

        const div = document.createElement('div');
        div.className = `chat-message ${message.role}`;

        // 日付フォーマット
        const timestamp = useDetailedFormat
            ? window.DateFormatter
                ? window.DateFormatter.format(message.timestamp, {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                  })
                : new Date(message.timestamp).toLocaleString('ja-JP', {
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit',
                  })
            : window.DateFormatter
            ? window.DateFormatter.formatSimple(message.timestamp)
            : new Date(message.timestamp).toLocaleString('ja-JP');

        // アイコンとロール名
        const avatarIcon = message.role === 'user' ? '👤' : '🤖';
        const roleText = message.role === 'user' ? 'ユーザー' : 'アシスタント';
        const numberPrefix = showHashPrefix ? '#' : '';

        // メッセージ内容のフォーマット
        const formattedContent = enableMarkdown
            ? MessageRenderer.formatContentWithMarkdown(message.content)
            : MessageRenderer.formatContent(message.content);

        div.innerHTML = `
            <div class="message-avatar">
                <span class="avatar-icon">${avatarIcon}</span>
            </div>
            <div class="message-bubble">
                <div class="message-header">
                    <div class="message-info">
                        <span class="message-number">${numberPrefix}${messageNumber}</span>
                        <span class="message-role">${roleText}</span>
                    </div>
                    <span class="message-timestamp">${timestamp}</span>
                    <button class="copy-button"
                            data-message-index="${messageNumber}"
                            title="クリップボードにコピー"
                            aria-label="このメッセージをクリップボードにコピーします"
                            tabindex="0">コピー</button>
                </div>
                <div class="message-content">
                    ${formattedContent}
                </div>
            </div>
        `;

        return div;
    }

    /**
     * メッセージ内容のフォーマット（基本版）
     * @param {string} content - メッセージ内容
     * @returns {string} フォーマット済みHTML
     */
    static formatContent(content) {
        if (!content) return '';

        let formatted = content;

        // 改行を<br>に変換
        formatted = formatted.replace(/\n/g, '<br>');

        // URLリンク化
        formatted = formatted.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank">$1</a>'
        );

        return formatted;
    }

    /**
     * メッセージ内容のフォーマット（Markdown対応版）
     * @param {string} content - メッセージ内容
     * @returns {string} フォーマット済みHTML
     */
    static formatContentWithMarkdown(content) {
        if (!content) return '';

        let formatted = content;

        // Markdownフォーマット
        formatted = formatted
            // コードブロック（JSON）
            .replace(
                /```json\n([\s\S]*?)\n```/g,
                '<pre class="code-block json"><code>$1</code></pre>'
            )
            // コードブロック（一般）
            .replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>')
            // インラインコード
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
            // 太字
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            // 改行
            .replace(/\n/g, '<br>');

        return formatted;
    }
}

// グローバルスコープに公開
window.MessageRenderer = MessageRenderer;
