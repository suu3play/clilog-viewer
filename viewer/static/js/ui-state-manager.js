/**
 * UI状態管理クラス（リファクタリング版）
 * UI状態管理、イベントバインディング、各モジュールの統合を担当
 */

class UIStateManager {
    constructor() {
        this.elements = {};
        this.state = {
            currentMessages: [],
            theme: 'light',
            sidebarOpen: true,
            searchMode: false,
            currentWeekStart: new Date(),
            selectedDate: null
        };

        // 依存モジュールのインスタンス
        this.messageDisplay = null;
        this.searchManager = null;
        this.dateFilter = null;

        this.init();
    }

    init() {
        this.cacheElements();
        this.initializeModules();
        this.bindEvents();
        this.loadTheme();
        this.updateStats();

        // 日付範囲制限の設定（この中で直近のログ表示が実行される）
        if (this.dateFilter) {
            this.dateFilter.setDateRangeRestrictions();
        }

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
            notifications: document.getElementById('notifications')
        };
    }

    initializeModules() {
        // MessageDisplayモジュールの初期化
        this.messageDisplay = new window.MessageDisplay(
            this.elements.messageArea,
            this.elements.virtualScroller
        );

        // SearchManagerモジュールの初期化
        this.searchManager = new window.SearchManager(
            this.elements,
            this.messageDisplay,
            this
        );

        // DateFilterモジュールの初期化
        this.dateFilter = new window.DateFilter(
            this.elements,
            this.messageDisplay,
            this
        );
    }

    bindEvents() {
        // 検索関連
        if (this.elements.searchInput) {
            this.elements.searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.searchManager.handleSearch();
                }
            });
        }

        if (this.elements.searchBtn) {
            this.elements.searchBtn.addEventListener('click', () => {
                this.searchManager.handleSearch();
            });
        }

        // 日付検索（ヘッダー）
        if (this.elements.dateSearchBtn) {
            this.elements.dateSearchBtn.addEventListener('click', () => {
                this.dateFilter.handleDateSearch();
            });
        }

        // 検索条件クリア
        if (this.elements.clearSearchBtn) {
            this.elements.clearSearchBtn.addEventListener('click', () => {
                this.searchManager.clearSearchConditions(this.dateFilter);
            });
        }

        // ログ変換ボタン
        if (this.elements.logConverterBtn) {
            this.elements.logConverterBtn.addEventListener('click', () => {
                this.handleLogConversion();
            });
        }

        // 検索結果を閉じる
        if (this.elements.closeSearch) {
            this.elements.closeSearch.addEventListener('click', () => {
                this.searchManager.hideSearchResults();
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
                if (this.dateFilter) {
                    this.dateFilter.loadAllMessages();
                }

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

    // 後方互換性のため、旧UIManagerインターフェースを公開
    formatDate(dateStr) {
        try {
            const date = new Date(dateStr);
            return date.toLocaleDateString('ja-JP', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                weekday: 'long'
            });
        } catch (e) {
            return dateStr;
        }
    }

    // DateFilterメソッドへの後方互換性プロキシ
    async loadAllMessages() {
        if (this.dateFilter && typeof this.dateFilter.loadAllMessages === 'function') {
            return await this.dateFilter.loadAllMessages();
        }
        console.warn('DateFilterが初期化されていません');
    }

    async loadMessagesByDateRange(startDate, endDate) {
        if (this.dateFilter && typeof this.dateFilter.loadMessagesByDateRange === 'function') {
            return await this.dateFilter.loadMessagesByDateRange(startDate, endDate);
        }
        console.warn('DateFilterが初期化されていません');
    }

    async handleDateSearch() {
        if (this.dateFilter && typeof this.dateFilter.handleDateSearch === 'function') {
            return await this.dateFilter.handleDateSearch();
        }
        console.warn('DateFilterが初期化されていません');
    }

    // MessageDisplayメソッドへの後方互換性プロキシ
    displayMessages(messages) {
        if (this.messageDisplay && typeof this.messageDisplay.displayMessages === 'function') {
            return this.messageDisplay.displayMessages(messages);
        }
        console.warn('MessageDisplayが初期化されていません');
    }

    scrollToBottom() {
        if (this.messageDisplay && typeof this.messageDisplay.scrollToBottom === 'function') {
            return this.messageDisplay.scrollToBottom();
        }
        console.warn('MessageDisplayが初期化されていません');
    }

    showWelcomeMessage() {
        if (this.messageDisplay && typeof this.messageDisplay.showWelcomeMessage === 'function') {
            return this.messageDisplay.showWelcomeMessage();
        }
        console.warn('MessageDisplayが初期化されていません');
    }

    // SearchManagerメソッドへの後方互換性プロキシ
    async handleSearch() {
        if (this.searchManager && typeof this.searchManager.handleSearch === 'function') {
            return await this.searchManager.handleSearch();
        }
        console.warn('SearchManagerが初期化されていません');
    }
}

// グローバルに公開（後方互換性を維持）
window.UIStateManager = UIStateManager;
window.UIManager = UIStateManager; // 旧クラス名のエイリアス
window.uiManager = new UIStateManager();
