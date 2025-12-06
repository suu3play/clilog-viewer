/**
 * メッセージ表示を管理するクラス
 * メッセージ一覧の表示、スクロール制御、ウェルカムメッセージの表示を担当
 */
class MessageDisplay {
    /**
     * コンストラクタ
     * @param {HTMLElement} messageArea - メッセージ表示エリアのDOM要素
     * @param {HTMLElement} virtualScroller - 仮想スクローラーのDOM要素
     */
    constructor(messageArea, virtualScroller) {
        this.messageArea = messageArea;
        this.virtualScroller = virtualScroller;
        this.currentMessages = [];
    }

    /**
     * メッセージ一覧を表示
     * @param {Array} messages - 表示するメッセージ配列
     */
    displayMessages(messages) {
        if (!this.messageArea || !messages || messages.length === 0) {
            if (this.messageArea) {
                this.messageArea.innerHTML =
                    '<div class="empty-state">指定した日付範囲にメッセージが見つかりません</div>';
            }
            return;
        }

        this.messageArea.innerHTML = '';
        this.messageArea.style.display = 'block';
        if (this.virtualScroller) {
            this.virtualScroller.classList.add('hidden');
        }

        // チャット用のメッセージリストコンテナを作成
        const chatContainer = document.createElement('div');
        chatContainer.className = 'chat-container';

        // メッセージを時系列順に表示（古い順）
        messages.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

        messages.forEach((message, index) => {
            const messageNumber = index + 1;
            const messageElement = window.MessageRenderer
                ? window.MessageRenderer.createMessageElement(message, messageNumber, {
                    useDetailedFormat: true,
                    showHashPrefix: true,
                    enableMarkdown: false
                })
                : this.createFallbackMessageElement(message, messageNumber);

            chatContainer.appendChild(messageElement);
        });

        this.messageArea.appendChild(chatContainer);

        // コピーボタンのイベントリスナーを追加
        if (window.CopyUtils) {
            window.CopyUtils.attachCopyListeners(chatContainer);
        }

        // 最後のメッセージまでスクロール（確実にDOM更新後に実行）
        this.scrollToBottom();

        this.currentMessages = messages;
    }

    /**
     * メッセージエリアを最下部までスクロール
     */
    scrollToBottom() {
        if (window.ScrollUtils) {
            window.ScrollUtils.scrollMessageAreaToBottom();
        } else {
            // フォールバック処理
            if (!this.messageArea) return;
            setTimeout(() => {
                this.messageArea.scrollTop = this.messageArea.scrollHeight;
            }, 100);
        }
    }

    /**
     * ウェルカムメッセージを表示
     */
    showWelcomeMessage() {
        if (this.messageArea) {
            this.messageArea.innerHTML = `
                <div class="welcome-message">
                    <h2>CliLog Viewer へようこそ</h2>
                    <p>すべての会話ログが表示されます。左側の日付ボタンでも確認できます。</p>
                    <div class="features">
                        <div class="feature">
                            <h3>⚡ 高速読み込み</h3>
                            <p>SQLiteキャッシュによる超高速表示</p>
                        </div>
                        <div class="feature">
                            <h3>🔍 高速検索</h3>
                            <p>全文検索で瞬時に目的の会話を発見</p>
                        </div>
                        <div class="feature">
                            <h3>📱 レスポンシブ</h3>
                            <p>デスクトップ・モバイルどちらでも快適</p>
                        </div>
                    </div>
                </div>
            `;
            this.messageArea.style.display = 'block';
        }
        if (this.virtualScroller) {
            this.virtualScroller.classList.add('hidden');
        }
    }

    /**
     * MessageRendererが利用できない場合のフォールバック
     * @param {Object} message - メッセージオブジェクト
     * @param {number} messageNumber - メッセージ番号
     * @returns {HTMLElement} メッセージ要素
     * @deprecated MessageRendererを使用してください
     */
    createFallbackMessageElement(message, messageNumber) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `chat-message ${message.role}`;

        const timestamp = new Date(message.timestamp).toLocaleString('ja-JP', {
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit'
        });

        const icon = message.role === 'user' ? '👤' : '🤖';
        const roleName = message.role === 'user' ? 'ユーザー' : 'アシスタント';

        let content = message.content || '';
        content = content.replace(/\n/g, '<br>');
        content = content.replace(
            /(https?:\/\/[^\s]+)/g,
            '<a href="$1" target="_blank">$1</a>'
        );

        messageDiv.innerHTML = `
            <div class="message-avatar">
                <span class="avatar-icon">${icon}</span>
            </div>
            <div class="message-bubble">
                <div class="message-header">
                    <span class="message-info">
                        <span class="message-number">#${messageNumber}</span>
                        <span class="message-role">${roleName}</span>
                    </span>
                    <span class="message-timestamp">${timestamp}</span>
                    <button class="copy-button"
                            data-message-index="${messageNumber - 1}"
                            title="クリップボードにコピー"
                            aria-label="このメッセージをクリップボードにコピーします"
                            tabindex="0">コピー</button>
                </div>
                <div class="message-content">${content}</div>
            </div>
        `;

        return messageDiv;
    }

    /**
     * 現在表示中のメッセージを取得
     * @returns {Array} 現在のメッセージ配列
     */
    getCurrentMessages() {
        return this.currentMessages;
    }
}

// グローバルスコープに公開
window.MessageDisplay = MessageDisplay;
