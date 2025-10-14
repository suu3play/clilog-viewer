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
        this.totalAvailableMessages = 0;
        this.isLoadingMore = false;

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
            messageArea: document.getElementById('messageArea'),

            // もっと読み込み
            loadMoreContainer: document.getElementById('loadMoreContainer'),
            loadMoreBtn: document.getElementById('loadMoreBtn'),
            loadMoreText: document.getElementById('loadMoreText'),
            loadMoreLoading: document.getElementById('loadMoreLoading'),
            currentMessageCount: document.getElementById('currentMessageCount')
        };
    }

    bindEvents() {
        // モード切り替え
        this.elements.dbModeBtn?.addEventListener('click', () => this.switchMode('database'));
        this.elements.realtimeModeBtn?.addEventListener('click', () => this.switchMode('realtime'));

        // もっと読み込み
        this.elements.loadMoreBtn?.addEventListener('click', () => this.loadMoreMessages());
    }

    switchMode(mode) {
        console.log(`モード切り替え: ${this.currentMode} → ${mode}`);
        
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

        // UI要素の表示/非表示
        if (this.currentMode === 'realtime') {
            this.elements.connectionStatus?.classList.remove('hidden');
            this.elements.dateSearchContainer?.classList.add('hidden');

            // ポーリング制御も表示
            const pollingControls = document.getElementById('pollingControls');
            pollingControls?.classList.remove('hidden');
        } else {
            this.elements.connectionStatus?.classList.add('hidden');
            this.elements.dateSearchContainer?.classList.remove('hidden');
            this.elements.loadMoreContainer?.classList.add('hidden');

            // ポーリング制御を非表示
            const pollingControls = document.getElementById('pollingControls');
            pollingControls?.classList.add('hidden');

            // ポーリングが動作中なら停止
            if (window.pollingClient && window.pollingClient.isPollingActive()) {
                window.pollingClient.stopPolling();
                const pollingToggle = document.getElementById('pollingToggle');
                if (pollingToggle) pollingToggle.checked = false;
            }
        }

        // メッセージエリアをクリア
        this.clearMessages();
    }

    async initializeRealtimeMode() {
        console.log('リアルタイムモード初期化開始');

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
        console.log('データベースモード初期化');

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
                    console.log('WebSocket接続成功');
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
                    console.log('WebSocket切断');
                    this.isConnected = false;
                    this.updateStatus('切断', 'warning');
                });

                // ファイル更新通知
                this.socket.on('file_update', (data) => {
                    this.handleFileUpdate(data);
                });

                // サーバーからの通知
                this.socket.on('connected', (data) => {
                    console.log('サーバー通知:', data);
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
            const response = await fetch('/api/realtime/latest?limit=100');
            const data = await response.json();

            if (data.success && data.file_info) {
                this.selectedFile = data.file_info;
                this.displayMessages(data.messages);

                console.log(`最新ファイル読み込み完了: ${data.file_info.name} (${data.messages.length}件)`);
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
            this.elements.loadMoreContainer?.classList.add('hidden');
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

        // もっと読み込みボタンの表示制御
        this.updateLoadMoreButton();

        // 自動スクロール（リアルタイムモード初期表示時は強制的に最下部へ）
        this.scrollToBottom();
    }

    createMessageElement(message, messageNumber) {
        const div = document.createElement('div');
        div.className = `chat-message ${message.role}`;

        const timestamp = new Date(message.timestamp).toLocaleString('ja-JP');
        const avatarIcon = message.role === 'user' ? '👤' : '🤖';
        const roleText = message.role === 'user' ? 'ユーザー' : 'アシスタント';

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
                <div class="message-content">
                    ${this.formatMessageContent(message.content)}
                </div>
            </div>
        `;

        return div;
    }

    formatMessageContent(content) {
        // Markdownライクな基本的なフォーマッティング
        content = content
            .replace(/```json\n([\s\S]*?)\n```/g, '<pre class="code-block json"><code>$1</code></pre>')
            .replace(/```([\s\S]*?)```/g, '<pre class="code-block"><code>$1</code></pre>')
            .replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\n/g, '<br>');

        return content;
    }

    handleFileUpdate(data) {
        console.log('ファイル更新通知:', data);

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
            console.log(`通知 [${type}]: ${message}`);
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
        console.log(`自動スクロール: ${this.autoScroll ? 'ON' : 'OFF'}`);
        return this.autoScroll;
    }

    updateLoadMoreButton() {
        if (!this.elements.loadMoreContainer || this.currentMode !== 'realtime') {
            return;
        }

        // 現在のメッセージ数を表示
        if (this.elements.currentMessageCount) {
            this.elements.currentMessageCount.textContent = this.currentMessages.length;
        }

        // 100件以上の場合にボタンを表示
        if (this.currentMessages.length >= 100) {
            this.elements.loadMoreContainer.classList.remove('hidden');
        } else {
            this.elements.loadMoreContainer.classList.add('hidden');
        }
    }

    async loadMoreMessages() {
        if (!this.selectedFile || this.isLoadingMore) {
            return;
        }

        this.isLoadingMore = true;
        this.setLoadMoreLoading(true);

        try {
            // より多くのメッセージを取得（200件）
            const currentLimit = this.currentMessages.length + 100;
            const response = await fetch(`/api/realtime/messages/${encodeURIComponent(this.selectedFile.name)}?limit=${currentLimit}`);
            const data = await response.json();

            if (data.success && data.messages.length > this.currentMessages.length) {
                // 新しく追加されたメッセージのみを追加
                const newMessages = data.messages.slice(this.currentMessages.length);
                this.prependMessages(newMessages);
                this.currentMessages = data.messages;

                console.log(`追加読み込み完了: +${newMessages.length}件 (合計: ${this.currentMessages.length}件)`);
                this.updateLoadMoreButton();
                this.showNotification(`${newMessages.length}件のメッセージを追加読み込みしました`, 'info');
            } else {
                // これ以上読み込むメッセージがない
                this.elements.loadMoreContainer?.classList.add('hidden');
                this.showNotification('これ以上読み込むメッセージがありません', 'info');
            }

        } catch (error) {
            console.error('追加読み込みエラー:', error);
            this.showNotification('メッセージの追加読み込みに失敗しました', 'error');
        } finally {
            this.isLoadingMore = false;
            this.setLoadMoreLoading(false);
        }
    }

    prependMessages(messages) {
        const container = this.elements.messageArea.querySelector('.chat-container');
        if (!container || !messages.length) return;

        // 現在の最初のメッセージを記録（スクロール位置復元用）
        const firstMessage = container.querySelector('.chat-message');
        const scrollContainer = this.elements.messageArea;
        const oldScrollHeight = scrollContainer.scrollHeight;

        // 新しいメッセージを先頭に追加
        messages.forEach((msg, index) => {
            const messageElement = this.createMessageElement(msg, index + 1);
            container.insertBefore(messageElement, container.firstChild);
        });

        // 既存のメッセージ番号を更新
        const allMessages = container.querySelectorAll('.chat-message');
        allMessages.forEach((msgElement, index) => {
            const numberElement = msgElement.querySelector('.message-number');
            if (numberElement) {
                numberElement.textContent = index + 1;
            }
        });

        // スクロール位置を調整（ユーザーの読んでいた位置を維持）
        const newScrollHeight = scrollContainer.scrollHeight;
        scrollContainer.scrollTop += (newScrollHeight - oldScrollHeight);
    }

    setLoadMoreLoading(isLoading) {
        if (!this.elements.loadMoreBtn) return;

        this.elements.loadMoreBtn.disabled = isLoading;
        if (this.elements.loadMoreText) {
            this.elements.loadMoreText.textContent = isLoading ? '読み込み中...' : 'もっと読み込む';
        }
        if (this.elements.loadMoreLoading) {
            this.elements.loadMoreLoading.classList.toggle('hidden', !isLoading);
        }
    }

    async setDefaultDateRange() {
        // 日付入力フィールドの取得
        const startDateInput = document.getElementById('startDate');
        const endDateInput = document.getElementById('endDate');

        if (!startDateInput || !endDateInput) {
            console.warn('日付入力フィールドが見つかりません');
            return;
        }

        try {
            // データベースから最大日付を取得
            const response = await fetch('/api/date-range');
            const data = await response.json();

            if (data.success && data.max_date) {
                // endDate.maxから直近1週間を計算
                const endDate = new Date(data.max_date);
                const startDate = new Date(endDate);
                startDate.setDate(startDate.getDate() - 6); // 直近1週間（7日間）

                // YYYY-MM-DD形式で日付をフォーマット
                const endDateStr = this.formatDateForInput(endDate);
                const startDateStr = this.formatDateForInput(startDate);

                // 日付フィールドに値を設定
                startDateInput.value = startDateStr;
                endDateInput.value = endDateStr;

                console.log(`データベースモード: 日付範囲を自動設定 (${startDateStr} 〜 ${endDateStr})`);

                // 自動で日付検索を実行
                this.executeAutoDateSearch(startDateStr, endDateStr);

            } else {
                // フォールバック: 今日から7日前
                const today = new Date();
                const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

                const endDateStr = this.formatDateForInput(today);
                const startDateStr = this.formatDateForInput(weekAgo);

                startDateInput.value = startDateStr;
                endDateInput.value = endDateStr;

                console.log(`データベースモード: フォールバック日付範囲を設定 (${startDateStr} 〜 ${endDateStr})`);
                this.executeAutoDateSearch(startDateStr, endDateStr);
            }

        } catch (error) {
            console.warn('日付範囲取得エラー、フォールバック処理実行:', error);

            // エラー時のフォールバック: 今日から7日前
            const today = new Date();
            const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

            const endDateStr = this.formatDateForInput(today);
            const startDateStr = this.formatDateForInput(weekAgo);

            startDateInput.value = startDateStr;
            endDateInput.value = endDateStr;

            console.log(`データベースモード: エラー時フォールバック (${startDateStr} 〜 ${endDateStr})`);
            this.executeAutoDateSearch(startDateStr, endDateStr);
        }
    }

    executeAutoDateSearch(startDate, endDate) {
        // UIManagerの日付検索機能を利用
        if (window.uiManager && typeof window.uiManager.loadMessagesByDateRange === 'function') {
            // 少し遅延させてDOM更新を確実にする
            setTimeout(() => {
                console.log(`自動日付検索実行: ${startDate} 〜 ${endDate}`);
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