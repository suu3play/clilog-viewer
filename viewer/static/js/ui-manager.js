/**
 * UI管理クラス（日付フィルター対応版）
 * ユーザーインターフェース操作を管理
 */

class UIManager {
    constructor() {
        this.elements = {};
        this.state = {
            currentMessages: [],
            theme: 'light',
            sidebarOpen: true,
            searchMode: false,
            currentWeekStart: new Date(),
            selectedDate: null,
        };

        this.init();
    }

    init() {
        console.log('UIManager.init() 開始');
        this.cacheElements();
        this.bindEvents();
        this.loadTheme();
        this.updateStats();
        this.setDateRangeRestrictions(); // この中で直近1週間の表示が実行される
        console.log('UIManager.init() 完了');
    }

    cacheElements() {
        // DOM要素をキャッシュ
        this.elements = {
            // ヘッダー要素
            searchInput: document.getElementById('searchInput'),
            searchBtn: document.getElementById('searchBtn'),
            searchLoading: document.getElementById('searchLoading'),
            startDate: document.getElementById('startDate'),
            endDate: document.getElementById('endDate'),
            dateSearchBtn: document.getElementById('dateSearchBtn'),
            clearSearchBtn: document.getElementById('clearSearchBtn'),
            fileStatus: document.getElementById('fileStatus'),

            // ログ変換ボタン
            logConverterBtn: document.getElementById('logConverterBtn'),
            converterStatus: document.getElementById('converterStatus'),

            // サイドバー要素（削除済み）

            // メインエリア
            loading: document.getElementById('loading'),
            messageArea: document.getElementById('messageArea'),
            virtualScroller: document.getElementById('virtualScroller'),
            pagination: document.getElementById('pagination'),

            // 検索結果
            searchResults: document.getElementById('searchResults'),
            searchTitle: document.getElementById('searchTitle'),
            searchList: document.getElementById('searchList'),
            closeSearch: document.getElementById('closeSearch'),

            // フッター
            messageCount: document.getElementById('messageCount'),
            cacheStatus: document.getElementById('cacheStatus'),
            loadTime: document.getElementById('loadTime'),
            themeToggle: document.getElementById('themeToggle'),

            // モーダル
            modal: document.getElementById('modal'),
            modalTitle: document.getElementById('modalTitle'),
            modalBody: document.getElementById('modalBody'),
            modalClose: document.getElementById('modalClose'),

            // 通知
            notifications: document.getElementById('notifications'),
        };
    }

    bindEvents() {
        // 検索関連
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.handleSearch();
                }
            });
        }

        if (this.elements.searchBtn) {
            this.elements.searchBtn.addEventListener('click', () => {
                this.handleSearch();
            });
        }

        // 日付検索（ヘッダー）
        if (this.elements.dateSearchBtn) {
            this.elements.dateSearchBtn.addEventListener('click', () => {
                this.handleDateSearch();
            });
        }

        // 検索条件クリア
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.addEventListener('click', () => {
                this.clearSearchConditions();
            });
        }

        // ログ変換ボタン
        if (this.elements.logConverterBtn) {
            this.elements.logConverterBtn.addEventListener('click', () => {
                this.handleLogConversion();
            });
        }

        // サイドバー関連処理は削除済み

        // 検索結果を閉じる
        if (this.elements.closeSearch) {
            this.elements.closeSearch.addEventListener('click', () => {
                this.hideSearchResults();
            });
        }

        // テーマ切り替え
        if (this.elements.themeToggle) {
            this.elements.themeToggle.addEventListener('click', () => {
                this.toggleTheme();
            });
        }

        // モーダル
        if (this.elements.modalClose) {
            this.elements.modalClose.addEventListener('click', () => {
                this.hideModal();
            });
        }

        if (this.elements.modal) {
            this.elements.modal.addEventListener('click', (e) => {
                if (e.target === this.elements.modal) {
                    this.hideModal();
                }
            });
        }
    }

    // サイドバー関連メソッドは削除済み

    // ヘッダーの日付検索
    handleDateSearch() {
        const startDate = this.elements.startDate?.value;
        const endDate = this.elements.endDate?.value;

        if (!startDate || !endDate) {
            this.showNotification(
                '開始日と終了日の両方を選択してください',
                'warning'
            );
            return;
        }

        // サイドバーの日付フィルターにも設定
        if (this.elements.filterStartDate)
            this.elements.filterStartDate.value = startDate;
        if (this.elements.filterEndDate)
            this.elements.filterEndDate.value = endDate;

        this.loadMessagesByDateRange(startDate, endDate);
    }

    // 日付範囲でメッセージを読み込み（会話ログの日時で検索）
    async loadMessagesByDateRange(startDate, endDate) {
        try {
            this.showLoading('メッセージを読み込み中...');

            const response = await fetch(
                `/api/search/date-range?start_date=${startDate}&end_date=${endDate}&limit=5000`
            );
            console.log(
                '🚀 ~ UIManager ~ loadMessagesByDateRange ~ endDate:',
                endDate
            );
            console.log(
                '🚀 ~ UIManager ~ loadMessagesByDateRange ~ startDate:',
                startDate
            );
            const data = await response.json();

            if (data.success) {
                this.displayMessages(data.results);
                this.updateStats({
                    messageCount: data.total,
                    dateRange: `${startDate} 〜 ${endDate}`,
                });
                this.showNotification(
                    `${data.total}件のメッセージを表示しました`,
                    'success'
                );
            } else {
                throw new Error(data.error || '日付範囲検索に失敗しました');
            }
        } catch (error) {
            console.error('Date range search error:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.hideLoading();
        }
    }

    // ログ変換処理
    async handleLogConversion() {
        if (!window.apiClient) {
            this.showNotification('APIクライアントが利用できません', 'error');
            return;
        }

        try {
            // ボタンを無効化
            this.elements.logConverterBtn.disabled = true;
            this.elements.logConverterBtn.textContent = '変換中...';

            // 変換ステータス表示
            this.showConverterStatus(true);

            // ログ変換API呼び出し
            const result = await window.apiClient.buildCache();

            if (result.success) {
                this.showNotification(
                    `ログ変換が完了しました: ${result.message}`,
                    'success'
                );

                // 統計情報を更新
                this.updateStats();

                // メッセージ表示を更新（データベースモード時）
                this.loadAllMessages();

            } else {
                throw new Error(result.error || 'ログ変換に失敗しました');
            }

        } catch (error) {
            console.error('Log conversion error:', error);
            this.showNotification(
                `ログ変換エラー: ${error.message}`,
                'error'
            );
        } finally {
            // ボタンを元に戻す
            this.elements.logConverterBtn.disabled = false;
            this.elements.logConverterBtn.textContent = '🔄 ログ変換';

            // 変換ステータス非表示
            this.showConverterStatus(false);
        }
    }

    // 変換ステータス表示制御
    showConverterStatus(show) {
        if (this.elements.converterStatus) {
            if (show) {
                this.elements.converterStatus.classList.remove('hidden');
            } else {
                this.elements.converterStatus.classList.add('hidden');
            }
        }
    }

    displayMessages(messages) {
        if (!this.elements.messageArea || !messages || messages.length === 0) {
            if (this.elements.messageArea) {
                this.elements.messageArea.innerHTML =
                    '<div class="empty-state">指定した日付範囲にメッセージが見つかりません</div>';
            }
            return;
        }

        this.elements.messageArea.innerHTML = '';
        this.elements.messageArea.style.display = 'block';
        if (this.elements.virtualScroller) {
            this.elements.virtualScroller.classList.add('hidden');
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
                      enableMarkdown: false,
                  })
                : this.createFallbackMessageElement(message, messageNumber);

            chatContainer.appendChild(messageElement);
        });

        this.elements.messageArea.appendChild(chatContainer);

        // コピーボタンのイベントリスナーを追加
        if (window.CopyUtils) {
            window.CopyUtils.attachCopyListeners(chatContainer);
        }

        // 最後のメッセージまでスクロール（確実にDOM更新後に実行）
        this.scrollToBottom();

        this.state.currentMessages = messages;
    }

    scrollToBottom() {
        if (window.ScrollUtils) {
            window.ScrollUtils.scrollMessageAreaToBottom();
        } else {
            // フォールバック処理
            if (!this.elements.messageArea) return;
            setTimeout(() => {
                this.elements.messageArea.scrollTop = this.elements.messageArea.scrollHeight;
            }, 100);
        }
    }

    // その他のヘルパーメソッド
    showWelcomeMessage() {
        if (this.elements.messageArea) {
            this.elements.messageArea.innerHTML = `
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
            this.elements.messageArea.style.display = 'block';
        }
        if (this.elements.virtualScroller) {
            this.elements.virtualScroller.classList.add('hidden');
        }
    }

    formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long',
            });
        } catch (e) {
            return dateStr;
        }
    }

    /**
     * MessageRendererが利用できない場合のフォールバック
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
            second: '2-digit',
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

    // UI状態管理
    showLoading(message = '読み込み中...') {
        if (this.elements.loading) {
            this.elements.loading.querySelector('p').textContent = message;
            this.elements.loading.classList.remove('hidden');
        }
    }

    hideLoading() {
        if (this.elements.loading) {
            this.elements.loading.classList.add('hidden');
        }
    }

    showSearchLoading(message = '検索中...') {
        if (this.elements.searchLoading) {
            const textElement = this.elements.searchLoading.querySelector(
                '.search-loading-text'
            );
            if (textElement) {
                textElement.textContent = message;
            }
            this.elements.searchLoading.classList.add('active');
        }
    }

    hideSearchLoading() {
        if (this.elements.searchLoading) {
            this.elements.searchLoading.classList.remove('active');
        }
    }

    showNotification(message, type = 'info') {
        if (!this.elements.notifications) return;

        const notification = document.createElement('div');
        notification.className = `notification ${type}`;
        notification.textContent = message;

        this.elements.notifications.appendChild(notification);

        setTimeout(() => {
            notification.classList.add('show');
        }, 100);

        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }, 3000);
    }

    updateStats(stats = {}) {
        if (this.elements.messageCount) {
            this.elements.messageCount.textContent = `メッセージ: ${
                stats.messageCount || 0
            }`;
        }

        if (this.elements.cacheStatus && stats.dateRange) {
            this.elements.cacheStatus.textContent = `範囲: ${stats.dateRange}`;
        }

        if (this.elements.loadTime) {
            this.elements.loadTime.textContent = `読み込み時間: ${new Date().toLocaleTimeString()}`;
        }
    }

    // toggleSidebar method removed

    toggleTheme() {
        this.state.theme = this.state.theme === 'light' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', this.state.theme);
        localStorage.setItem('theme', this.state.theme);

        if (this.elements.themeToggle) {
            this.elements.themeToggle.textContent =
                this.state.theme === 'light' ? '🌙' : '☀️';
        }
    }

    loadTheme() {
        const savedTheme = localStorage.getItem('theme') || 'light';
        this.state.theme = savedTheme;
        document.documentElement.setAttribute('data-theme', savedTheme);

        if (this.elements.themeToggle) {
            this.elements.themeToggle.textContent =
                savedTheme === 'light' ? '🌙' : '☀️';
        }
    }

    hideModal() {
        if (this.elements.modal) {
            this.elements.modal.classList.add('hidden');
        }
    }

    hideSearchResults() {
        if (this.elements.searchResults) {
            this.elements.searchResults.classList.add('hidden');
        }
        this.state.searchMode = false;
    }

    // 全メッセージ表示
    async loadAllMessages() {
        try {
            console.log('loadAllMessages() が呼び出されました');
            this.showLoading('すべてのメッセージを読み込み中...');

            // まず利用可能な日付範囲を取得
            const dateRangeResponse = await fetch('/api/date-range');
            const dateRangeData = await dateRangeResponse.json();

            if (
                !dateRangeData.success ||
                !dateRangeData.min_date ||
                !dateRangeData.max_date
            ) {
                throw new Error('日付範囲の取得に失敗しました');
            }

            // 全データを取得（実際のデータベースの全日付範囲）
            const response = await fetch(
                `/api/search/date-range?start_date=${dateRangeData.min_date}&end_date=${dateRangeData.max_date}&limit=5000`
            );
            console.log('API response received:', response.status);
            const data = await response.json();
            console.log('API data parsed:', data.success, 'total:', data.total);

            if (data.success) {
                this.displayMessages(data.results);
                this.updateStats({
                    messageCount: data.total,
                    dateRange: 'すべて',
                });
                this.showNotification(
                    `${data.total}件のメッセージを表示しました`,
                    'success'
                );
            } else {
                throw new Error(
                    data.error || 'メッセージの読み込みに失敗しました'
                );
            }
        } catch (error) {
            console.error('Load all messages error:', error);
            this.showNotification(error.message, 'error');
            if (this.elements.messageArea) {
                this.elements.messageArea.innerHTML =
                    '<div class="empty-state">データの読み込みに失敗しました</div>';
            }
        } finally {
            this.hideLoading();
        }
    }

    async handleSearch() {
        const query = this.elements.searchInput?.value?.trim();
        if (!query) {
            this.showNotification(
                '検索キーワードを入力してください',
                'warning'
            );
            return;
        }

        try {
            this.showSearchLoading('検索中...');

            const response = await fetch(
                `/api/search?q=${encodeURIComponent(query)}&limit=1000`
            );
            const data = await response.json();

            if (data.success) {
                this.displaySearchResults(data.results, query);
                this.updateStats({
                    messageCount: data.total,
                    dateRange: `検索: "${query}"`,
                });
                this.showNotification(
                    `"${query}"の検索結果: ${data.total}件`,
                    'success'
                );
            } else {
                throw new Error(data.error || 'メッセージ検索に失敗しました');
            }
        } catch (error) {
            console.error('Search error:', error);
            this.showNotification(error.message, 'error');
        } finally {
            this.hideSearchLoading();
        }
    }

    displaySearchResults(messages, query) {
        if (!this.elements.messageArea || !messages || messages.length === 0) {
            if (this.elements.messageArea) {
                this.elements.messageArea.innerHTML = `<div class="empty-state">"${query}"に一致するメッセージが見つかりません</div>`;
            }
            return;
        }

        this.displayMessages(messages);
    }

    // 日付範囲制限を設定
    async setDateRangeRestrictions() {
        try {
            const response = await fetch('/api/date-range');
            const data = await response.json();

            if (data.success && data.min_date && data.max_date) {
                if (this.elements.startDate) {
                    this.elements.startDate.min = data.min_date;
                    this.elements.startDate.max = data.max_date;
                }
                if (this.elements.endDate) {
                    this.elements.endDate.min = data.min_date;
                    this.elements.endDate.max = data.max_date;
                }

                // 初期表示: 全ログを読み込む
                this.loadAllMessages();

                console.log(
                    `日付範囲制限設定: ${data.min_date} 〜 ${data.max_date}`
                );
            }
        } catch (error) {
            console.warn('日付範囲制限の設定に失敗:', error);
        }
    }

    // 直近1週間の日付範囲を設定
    setDefaultDateRange(maxDate) {
        try {
            const endDate = new Date(maxDate);
            const startDate = new Date(endDate);
            startDate.setDate(startDate.getDate() - 6); // 直近1週間（7日間）

            const startDateStr = startDate.toISOString().split('T')[0];
            const endDateStr = endDate.toISOString().split('T')[0];

            if (this.elements.startDate) {
                this.elements.startDate.value = startDateStr;
            }
            if (this.elements.endDate) {
                this.elements.endDate.value = endDateStr;
            }

            console.log(`初期日付範囲設定: ${startDateStr} 〜 ${endDateStr}`);

            // 初期表示で直近1週間のメッセージを表示
            this.loadMessagesByDateRange(startDateStr, endDateStr);

        } catch (error) {
            console.warn('初期日付範囲の設定に失敗:', error);
        }
    }

    clearSearchConditions() {
        // 検索条件をクリア
        if (this.elements.searchInput) this.elements.searchInput.value = '';
        if (this.elements.startDate) this.elements.startDate.value = '';
        if (this.elements.endDate) this.elements.endDate.value = '';

        // 全メッセージを表示
        this.loadAllMessages();
        this.showNotification('検索条件をクリアしました', 'info');
    }
}

// グローバルに公開
window.UIManager = UIManager;
window.uiManager = new UIManager();
