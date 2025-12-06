/**
 * ポーリング専用クライアント
 * 定期的なAPI呼び出しでファイル更新を監視
 */

class PollingClient {
    constructor() {
        this.isActive = false;
        this.currentFile = null;
        this.lastTimestamp = null;
        this.processedMessages = new Set(); // 処理済みメッセージのハッシュ管理
        this.intervalId = null;
        this.pollingInterval = 5000; // 5秒間隔
        this.maxRetries = 3;
        this.retryCount = 0;

        this.initializeElements();
        this.bindEvents();
    }

    initializeElements() {
        this.elements = {
            // ポーリング制御
            pollingToggle: document.getElementById('pollingToggle'),
            pollingStatus: document.getElementById('pollingStatus'),
            pollingInterval: document.getElementById('pollingInterval'),

            // ファイル選択
            fileSelector: document.getElementById('fileSelector'),
            fileDropdown: document.getElementById('fileDropdown'),
            refreshFilesBtn: document.getElementById('refreshFilesBtn'),

            // メッセージ表示
            messageArea: document.getElementById('messageArea'),

            // ステータス表示
            connectionStatus: document.getElementById('connectionStatus'),
            statusIndicator: document.getElementById('statusIndicator'),
            statusText: document.getElementById('statusText')
        };
    }

    bindEvents() {
        // ポーリング開始/停止
        this.elements.pollingToggle?.addEventListener('change', (e) => {
            if (e.target.checked) {
                this.startPolling();
            } else {
                this.stopPolling();
            }
        });

        // ポーリング間隔変更
        this.elements.pollingInterval?.addEventListener('change', (e) => {
            const newInterval = parseInt(e.target.value) * 1000;
            if (newInterval >= 1000 && newInterval <= 60000) {
                this.pollingInterval = newInterval;
                if (this.isActive) {
                    this.restartPolling();
                }
            }
        });

        // ファイル選択
        this.elements.fileDropdown?.addEventListener('change', (e) => {
            this.selectFile(e.target.value);
        });

        // ファイル一覧更新
        this.elements.refreshFilesBtn?.addEventListener('click', () => {
            this.refreshFileList();
        });
    }

    async startPolling() {
        if (this.isActive) return;

        this.isActive = true;
        this.retryCount = 0;
        this.updateStatus('ポーリング開始中...', 'loading');

        try {
            // ポーリング機能の可用性を確認
            const statusResponse = await fetch('/api/polling/status');
            const statusData = await statusResponse.json();

            if (!statusData.success || !statusData.polling_available) {
                throw new Error(statusData.error || 'ポーリング機能が利用できません');
            }

            // ファイル一覧を取得
            await this.refreshFileList();

            // 最新ファイルを自動選択（ファイルが選択されていない場合）
            if (!this.currentFile) {
                await this.selectLatestFile();
            }

            // ポーリング開始
            this.scheduleNextPoll();
            this.updateStatus('ポーリング中', 'success');


        } catch (error) {
            console.error('ポーリング開始エラー:', error);
            this.isActive = false;
            this.elements.pollingToggle.checked = false;
            this.updateStatus('ポーリング開始失敗', 'error');
            this.showNotification(`ポーリング開始に失敗しました: ${error.message}`, 'error');
        }
    }

    stopPolling() {
        if (!this.isActive) return;

        this.isActive = false;

        if (this.intervalId) {
            clearTimeout(this.intervalId);
            this.intervalId = null;
        }

        this.updateStatus('停止中', 'warning');
    }

    restartPolling() {
        if (!this.isActive) return;

        if (this.intervalId) {
            clearTimeout(this.intervalId);
        }
        this.scheduleNextPoll();
    }

    scheduleNextPoll() {
        if (!this.isActive) return;

        this.intervalId = setTimeout(() => {
            this.pollForUpdates();
        }, this.pollingInterval);
    }

    async pollForUpdates() {
        if (!this.isActive) return;

        try {
            let url;

            if (this.currentFile) {
                // 特定ファイルをポーリング
                url = `/api/polling/file/${encodeURIComponent(this.currentFile.name)}?limit=20`;
                if (this.lastTimestamp) {
                    url += `&since=${encodeURIComponent(this.lastTimestamp)}`;
                }
            } else {
                // 最新ファイルをポーリング
                url = '/api/polling/latest?limit=20';
                if (this.lastTimestamp) {
                    url += `&since=${encodeURIComponent(this.lastTimestamp)}`;
                }
            }

            const response = await fetch(url);
            const data = await response.json();

            if (!data.success) {
                throw new Error(data.error || 'データ取得に失敗');
            }

            // 更新があった場合の処理
            if (data.has_updates && data.messages && data.messages.length > 0) {
                this.handleNewMessages(data.messages, data.file_info);
                this.retryCount = 0; // 成功時はリトライカウントをリセット
            }

            // ファイル情報の更新
            if (data.file_info && (!this.currentFile || this.currentFile.name !== data.file_info.name)) {
                this.currentFile = data.file_info;
                this.updateFileSelection(data.file_info.name);
            }

            // 最新タイムスタンプを更新
            if (data.has_updates && data.messages && data.messages.length > 0) {
                // 新しいメッセージがある場合は最新メッセージのタイムスタンプを使用
                const latestMessage = data.messages[data.messages.length - 1];
                this.lastTimestamp = latestMessage.timestamp; // そのままの時刻を保持
            }
            // 新しいメッセージがない場合はlastTimestampはそのまま維持

            this.updateStatus(`ポーリング中 (${data.messages?.length || 0}件)`, 'success');

        } catch (error) {
            console.error('ポーリングエラー:', error);
            this.handlePollingError(error);
        }

        // 次のポーリングをスケジュール
        this.scheduleNextPoll();
    }

    handlePollingError(error) {
        this.retryCount++;

        if (this.retryCount >= this.maxRetries) {
            console.error('ポーリング最大リトライ回数に達しました');
            this.stopPolling();
            this.elements.pollingToggle.checked = false;
            this.updateStatus('ポーリングエラー', 'error');
            this.showNotification(`ポーリングが停止しました: ${error.message}`, 'error');
        } else {
            this.updateStatus(`ポーリングエラー (${this.retryCount}/${this.maxRetries})`, 'warning');
            console.warn(`ポーリングリトライ ${this.retryCount}/${this.maxRetries}: ${error.message}`);
        }
    }

    handleNewMessages(messages, fileInfo) {
        // 重複チェックして真に新しいメッセージのみ処理
        const newMessages = messages.filter(msg => {
            const msgHash = this.getMessageHash(msg);
            if (this.processedMessages.has(msgHash)) {
                return false;
            }
            this.processedMessages.add(msgHash);
            return true;
        });

        if (newMessages.length === 0) {
            return;
        }

        // 新しいメッセージのみを追加表示
        this.appendMessages(newMessages);

        // 読み込み時刻を更新
        this.updateLoadTime();

        // 通知表示
        this.showNotification(`新しいメッセージ: ${newMessages.length}件`, 'info');

        // ファイル情報の表示更新
        if (fileInfo) {
            this.updateStatus(`更新: ${fileInfo.name} (${newMessages.length}件)`, 'success');
        }
    }

    getMessageHash(message) {
        // メッセージの一意性を判定するハッシュを生成
        const content = message.content.substring(0, 100); // 最初の100文字
        const timestamp = message.timestamp;
        const role = message.role;
        return `${timestamp}_${role}_${this.hashString(content)}`;
    }

    hashString(str) {
        // 簡単なハッシュ関数
        let hash = 0;
        if (str.length === 0) return hash;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = ((hash << 5) - hash) + char;
            hash = hash & hash; // 32bit整数に変換
        }
        return hash;
    }

    async refreshFileList() {
        try {
            const response = await fetch('/api/realtime/files');
            const data = await response.json();

            if (data.success) {
                this.populateFileDropdown(data.files);
            } else {
                throw new Error(data.error || 'ファイル一覧の取得に失敗');
            }

        } catch (error) {
            console.error('ファイル一覧取得エラー:', error);
            this.showNotification('ファイル一覧の取得に失敗しました', 'error');
        }
    }

    populateFileDropdown(files) {
        if (!this.elements.fileDropdown) return;

        // ドロップダウンをクリア
        this.elements.fileDropdown.innerHTML = '<option value="">自動選択 (最新ファイル)</option>';

        // ファイルオプションを追加
        files.forEach(file => {
            const option = document.createElement('option');
            option.value = file.name;
            option.textContent = `${file.name} (${this.formatFileSize(file.size)})`;
            option.title = file.display_path || file.path;
            this.elements.fileDropdown.appendChild(option);
        });
    }

    async selectLatestFile() {
        try {
            const response = await fetch('/api/polling/latest?limit=20');
            const data = await response.json();

            if (data.success && data.file_info) {
                this.currentFile = data.file_info;
                this.updateFileSelection(data.file_info.name);

                // 初期メッセージを表示
                if (data.messages && data.messages.length > 0) {
                    this.displayMessages(data.messages);

                    // 処理済みメッセージとして記録
                    data.messages.forEach(msg => {
                        const msgHash = this.getMessageHash(msg);
                        this.processedMessages.add(msgHash);
                    });

                    const latestMessage = data.messages[data.messages.length - 1];
                    this.lastTimestamp = latestMessage.timestamp; // そのままの時刻を保持

                    // 読み込み時刻を更新
                    this.updateLoadTime();
                }

            }

        } catch (error) {
            console.error('最新ファイル選択エラー:', error);
        }
    }

    async selectFile(fileName) {
        if (!fileName) {
            // 空の場合は最新ファイルを自動選択
            this.currentFile = null;
            this.lastTimestamp = null;
            this.processedMessages.clear(); // 処理済みメッセージをクリア
            await this.selectLatestFile();
            return;
        }

        // ファイル変更時は処理済みメッセージをクリア
        this.processedMessages.clear();

        try {
            const response = await fetch(`/api/polling/file/${encodeURIComponent(fileName)}?limit=30`);
            const data = await response.json();

            if (data.success) {
                this.currentFile = data.file_info;
                this.displayMessages(data.messages);

                // 処理済みメッセージとして記録
                if (data.messages && data.messages.length > 0) {
                    data.messages.forEach(msg => {
                        const msgHash = this.getMessageHash(msg);
                        this.processedMessages.add(msgHash);
                    });

                    const latestMessage = data.messages[data.messages.length - 1];
                    this.lastTimestamp = latestMessage.timestamp; // そのままの時刻を保持

                    // 読み込み時刻を更新
                    this.updateLoadTime();
                } else {
                    this.lastTimestamp = null;
                }

                this.updateStatus(`選択: ${fileName}`, 'success');
            } else {
                throw new Error(data.error || 'ファイルの読み込みに失敗');
            }

        } catch (error) {
            console.error('ファイル選択エラー:', error);
            this.showNotification(`ファイル選択に失敗: ${error.message}`, 'error');
        }
    }

    updateFileSelection(fileName) {
        if (this.elements.fileDropdown) {
            this.elements.fileDropdown.value = fileName;
        }
    }

    displayMessages(messages) {
        if (!this.elements.messageArea) return;

        // メッセージエリアをクリア
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

        // メッセージコンテナを作成（chat-containerに統一）
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

        this.scrollToBottom();
    }

    appendMessages(messages) {
        if (!this.elements.messageArea || !messages || messages.length === 0) return;

        const container = this.elements.messageArea.querySelector('.chat-container');
        if (!container) {
            // コンテナが存在しない場合は新規作成
            this.displayMessages(messages);
            return;
        }

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

        this.scrollToBottom();
    }

    createMessageElement(message, messageNumber) {
        if (window.MessageRenderer) {
            return window.MessageRenderer.createMessageElement(message, messageNumber, {
                useDetailedFormat: false,
                showHashPrefix: false,
                enableMarkdown: true
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

    clearMessages() {
        if (this.elements.messageArea) {
            this.elements.messageArea.innerHTML = '';
        }
    }

    scrollToBottom() {
        if (window.ScrollUtils) {
            window.ScrollUtils.scrollToBottom(this.elements.messageArea);
        } else {
            // フォールバック処理
            if (this.elements.messageArea) {
                this.elements.messageArea.scrollTop = this.elements.messageArea.scrollHeight;
            }
        }
    }

    updateStatus(text, type = 'default') {
        if (!this.elements.statusText || !this.elements.statusIndicator) return;

        this.elements.statusText.textContent = text;
        this.elements.statusIndicator.className = `status-indicator status-${type}`;
    }

    showNotification(message, type = 'info') {
        // UIManagerの通知機能を使用
        if (window.uiManager && typeof window.uiManager.showNotification === 'function') {
            window.uiManager.showNotification(message, type);
        }
    }

    updateLoadTime() {
        const loadTimeElement = document.getElementById('loadTime');
        if (loadTimeElement) {
            const now = new Date();
            const timeStr = now.toLocaleString('ja-JP');
            loadTimeElement.textContent = `読み込み時間: ${timeStr}`;
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
    getCurrentFile() {
        return this.currentFile;
    }

    isPollingActive() {
        return this.isActive;
    }

    setPollingInterval(seconds) {
        if (seconds >= 1 && seconds <= 60) {
            this.pollingInterval = seconds * 1000;
            if (this.isActive) {
                this.restartPolling();
            }
            return true;
        }
        return false;
    }
}

// グローバルインスタンス
window.pollingClient = new PollingClient();