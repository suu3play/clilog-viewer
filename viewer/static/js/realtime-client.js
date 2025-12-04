/**
 * リアルタイムビューワー クライアント
 * WebSocket通信とリアルタイムUI制御
 */

class RealtimeClient {
    constructor() {
        this.socket = null;
        this.isConnected = false;
        this.currentMode = 'database';  // 'database' or 'realtime'
        this.selectedFile = null;
        this.autoScroll = true;
        this.files = [];
        this.currentMessages = [];

        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        // UI要素の取得
        this.elements = {
            // モード切り替え
            dbModeBtn: document.getElementById('dbModeBtn'),
            realtimeModeBtn: document.getElementById('realtimeModeBtn'),

            // 接続ステータス
            connectionStatus: document.getElementById('connectionStatus'),
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.getElementById('statusText'),

            // 検索・フィルタ
            dateSearchContainer: document.getElementById('dateSearchContainer'),

            // メッセージ表示
            messageArea: document.getElementById('messageArea')
        };
    }

    bindEvents() {
        // モード切り替え
        this.elements.dbModeBtn?.addEventListener('click', () => this.switchMode('database'));
        this.elements.realtimeModeBtn?.addEventListener('click', () => this.switchMode('realtime'));
    }

    switchMode(mode) {
        
        this.currentMode = mode;
        
        // UI状態の更新
        this.updateModeUI();
        
        if (mode === 'realtime') {
            this.initializeRealtimeMode();
        } else {
            this.initializeDatabaseMode();
        }
    }

    updateModeUI() {
        // ボタンのアクティブ状態
        this.elements.dbModeBtn?.classList.toggle('active', this.currentMode === 'database');
        this.elements.realtimeModeBtn?.classList.toggle('active', this.currentMode === 'realtime');

        // ログ変換ボタンの表示制御
        const logConverterContainer = document.getElementById('logConverterContainer');

        // UI要素の表示/非表示
        if (this.currentMode === 'realtime') {
            this.elements.connectionStatus?.classList.remove('hidden');
            this.elements.dateSearchContainer?.classList.add('hidden');

            // ポーリング制御も表示
            const pollingControls = document.getElementById('pollingControls');
            pollingControls?.classList.remove('hidden');

            // ログ変換ボタンを非表示
            logConverterContainer?.classList.add('hidden');
        } else {
            this.elements.connectionStatus?.classList.add('hidden');
            this.elements.dateSearchContainer?.classList.remove('hidden');

            // ポーリング制御を非表示
            const pollingControls = document.getElementById('pollingControls');
            pollingControls?.classList.add('hidden');

            // ポーリングが動作中なら停止
            if (window.pollingClient && window.pollingClient.isPollingActive()) {
                window.pollingClient.stopPolling();
                const pollingToggle = document.getElementById('pollingToggle');
                if (pollingToggle) pollingToggle.checked = false;
            }

            // ログ変換ボタンを表示
            logConverterContainer?.classList.remove('hidden');
        }

        // メッセージエリアをクリア
        this.clearMessages();
    }

    async initializeRealtimeMode() {

        try {
            // WebSocket接続
            await this.connectWebSocket();

            // 最新ファイルを自動選択
            await this.loadLatestFile();

        } catch (error) {
            console.error('リアルタイムモード初期化エラー:', error);
            this.updateStatus('エラー', 'error');
            this.showNotification('リアルタイムモード初期化に失敗しました', 'error');
        }
    }

    async initializeDatabaseMode() {

        // WebSocket切断
        this.disconnectWebSocket();

        // 既存のデータベース機能を再有効化
        this.updateStatus('データベースモード', 'success');

        // 直近1週間の日付を自動設定
        this.setDefaultDateRange();

        // loadInitialDataのみを呼び出す（init()を呼び出さない）
        if (window.app && typeof window.app.loadInitialData === 'function') {
            await window.app.loadInitialData();
        }
    }

    async connectWebSocket() {
        if (this.socket && this.isConnected) {
            return Promise.resolve();
        }

        return new Promise((resolve, reject) => {
            try {
                // Socket.IOクライアント接続
                this.socket = io({
                    transports: ['websocket', 'polling']
                });

                // 接続成功
                this.socket.on('connect', () => {
                    this.isConnected = true;
                    this.updateStatus('接続済み', 'success');
                    resolve();
                });

                // 接続エラー
                this.socket.on('connect_error', (error) => {
                    console.error('WebSocket接続エラー:', error);
                    this.isConnected = false;
                    this.updateStatus('接続エラー', 'error');
                    reject(error);
                });

                // 切断
                this.socket.on('disconnect', () => {
                    this.isConnected = false;
                    this.updateStatus('切断', 'warning');
                });

                // ファイル更新通知
                this.socket.on('file_update', (data) => {
                    this.handleFileUpdate(data);
                });

                // サーバーからの通知
                this.socket.on('connected', (data) => {
                });

                // エラー通知
                this.socket.on('error', (data) => {
                    console.error('サーバーエラー:', data);
                    this.showNotification(data.message || 'サーバーエラーが発生しました', 'error');
                });

                // 接続タイムアウト設定
                setTimeout(() => {
                    if (!this.isConnected) {
                        reject(new Error('接続タイムアウト'));
                    }
                }, 5000);

            } catch (error) {
                console.error('WebSocket初期化エラー:', error);
                reject(error);
            }
        });
    }

    disconnectWebSocket() {
        if (this.socket) {
            this.socket.disconnect();
            this.socket = null;
            this.isConnected = false;
            this.updateStatus('未接続', 'default');
        }
    }

    async loadLatestFile() {
        try {
            // 全件読み込み（limitパラメータを削除）
            const response = await fetch('/api/realtime/latest');
            const data = await response.json();

            if (data.success && data.file_info) {
                this.selectedFile = data.file_info;
                this.displayMessages(data.messages);

                this.updateStatus(`最新: ${data.file_info.name}`, 'success');
            } else {
                throw new Error(data.error || '最新ファイルの読み込みに失敗');
            }

        } catch (error) {
            console.error('最新ファイル読み込みエラー:', error);
            this.showNotification('最新ファイルの読み込みに失敗しました', 'error');
        }
    }

    displayMessages(messages) {
        if (!this.elements.messageArea) return;

        // メッセージをクリア
        this.clearMessages();

        if (!messages || messages.length === 0) {
            this.elements.messageArea.innerHTML = `
                <div class="welcome-message">
                    <h2>メッセージがありません</h2>
                    <p>選択されたファイルにはメッセージが含まれていません。</p>
                </div>
            `;
            return;
        }

        // 現在のメッセージリストを更新
        this.currentMessages = [...messages];

        // チャットコンテナを作成（データベースモードと同じ構造）
        const container = document.createElement('div');
        container.className = 'chat-container';

        messages.forEach((msg, index) => {
            const messageElement = this.createMessageElement(msg, index + 1);
            container.appendChild(messageElement);
        });

        this.elements.messageArea.appendChild(container);

        // コピーボタンのイベントリスナーを追加
        if (window.CopyUtils) {
            window.CopyUtils.attachCopyListeners(container);
        }

        // 自動スクロール（リアルタイムモード初期表示時は強制的に最下部へ）
        this.scrollToBottom();
    }

    createMessageElement(message, messageNumber) {
        if (window.MessageRenderer) {
            return window.MessageRenderer.createMessageElement(message, messageNumber, {
                useDetailedFormat: false,
                showHashPrefix: false,
                enableMarkdown: true,
            });
        }

        // フォールバック: MessageRendererが利用できない場合
        const div = document.createElement('div');
        div.className = `chat-message ${message.role}`;

        const timestamp = new Date(message.timestamp).toLocaleString('ja-JP');
        const avatarIcon = message.role === 'user' ? '👤' : '🤖';
        const roleText = message.role === 'user' ? 'ユーザー' : 'アシスタント';

        let content = message.content || '';
        content = content
            .replace(/```json\n([\s\S]*?)\n```/g, '<pre class="code-block json"><code>$1</code></pre>')
            .replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        div.innerHTML = `
            <div class="message-avatar">
                <span class="avatar-icon">${avatarIcon}</span>
            </div>
            <div class="message-bubble">
                <div class="message-header">
                    <div class="message-info">
                        <span class="message-number">${messageNumber}</span>
                        <span class="message-role">${roleText}</span>
                    </div>
                    <span class="message-timestamp">${timestamp}</span>
                    <button class="copy-button"
                            data-message-index="${messageNumber}"
                            title="クリップボードにコピー"
                            aria-label="このメッセージをクリップボードにコピーします"
                            tabindex="0">コピー</button>
                </div>
                <div class="message-content">${content}</div>
            </div>
        `;

        return div;
    }

    handleFileUpdate(data) {

        if (!this.selectedFile || data.file_path !== this.selectedFile.path) {
            return; // 現在選択中のファイルではない
        }

        // 新しいメッセージを追加
        if (data.messages && data.messages.length > 0) {
            this.appendMessages(data.messages);
            this.showNotification(`新しいメッセージ: ${data.messages.length}件`, 'info');
        }
    }

    appendMessages(messages) {
        const container = this.elements.messageArea.querySelector('.chat-container');
        if (!container) return;

        // 現在のメッセージ数を取得して連番を継続
        const existingMessages = container.querySelectorAll('.chat-message');
        let messageNumber = existingMessages.length + 1;

        messages.forEach(msg => {
            const messageElement = this.createMessageElement(msg, messageNumber);
            container.appendChild(messageElement);

            // 新しいメッセージにコピーボタンのイベントリスナーを追加
            if (window.CopyUtils) {
                window.CopyUtils.attachCopyListeners(messageElement);
            }

            messageNumber++;
        });

        // 自動スクロール
        if (this.autoScroll) {
            this.scrollToBottom();
        }
    }

    clearMessages() {
        if (this.elements.messageArea) {
            this.elements.messageArea.innerHTML = '';
        }
    }

    scrollToBottom() {
        // DOM更新後に確実にスクロールするため、少し待機
        setTimeout(() => {
            if (window.ScrollUtils) {
                window.ScrollUtils.scrollToBottom(this.elements.messageArea);
            } else {
                // フォールバック処理
                if (this.elements.messageArea) {
                    this.elements.messageArea.scrollTop = this.elements.messageArea.scrollHeight;
                }
            }
        }, 50);
    }

    updateStatus(text, type = 'default') {
        if (!this.elements.statusText || !this.elements.statusIndicator) return;

        this.elements.statusText.textContent = text;
        
        // ステータスインジケーターの色を更新
        this.elements.statusIndicator.className = `status-indicator status-${type}`;
    }

    showNotification(message, type = 'info') {
        // UIManagerの通知機能を使用
        if (window.uiManager && typeof window.uiManager.showNotification === 'function') {
            window.uiManager.showNotification(message, type);
        } else {
        }
    }

    formatFileSize(bytes) {
        if (bytes === 0) return '0 B';
        const k = 1024;
        const sizes = ['B', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    // 公開メソッド
    getCurrentMode() {
        return this.currentMode;
    }

    isRealtimeMode() {
        return this.currentMode === 'realtime';
    }

    getSelectedFile() {
        return this.selectedFile;
    }

    toggleAutoScroll() {
        this.autoScroll = !this.autoScroll;
        return this.autoScroll;
    }


    async setDefaultDateRange() {
        // UIManagerの全ログ読み込み機能を利用
        if (window.uiManager && typeof window.uiManager.loadAllMessages === 'function') {
            await window.uiManager.loadAllMessages();
        } else {
            console.warn('UIManagerの全ログ読み込み機能が利用できません');
        }
    }

    executeAutoDateSearch(startDate, endDate) {
        // UIManagerの日付検索機能を利用
        if (window.uiManager && typeof window.uiManager.loadMessagesByDateRange === 'function') {
            // 少し遅延させてDOM更新を確実にする
            setTimeout(() => {
                window.uiManager.loadMessagesByDateRange(startDate, endDate);
                this.showNotification(`直近1週間の会話を読み込みました (${startDate} 〜 ${endDate})`, 'success');
            }, 100);
        } else {
            console.warn('UIManagerの日付検索機能が利用できません');
            this.showNotification('直近1週間の日付を設定しました', 'info');
        }
    }

    formatDateForInput(date) {
        // 日付をYYYY-MM-DD形式にフォーマット
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    }
}

// グローバルインスタンス
window.realtimeClient = new RealtimeClient();