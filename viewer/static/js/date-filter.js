/**
 * 日付フィルタ機能を管理するクラス
 * 日付範囲によるメッセージ検索、全メッセージ取得、日付範囲制限の設定を担当
 */
class DateFilter {
    /**
     * コンストラクタ
     * @param {Object} elements - DOM要素のキャッシュオブジェクト
     * @param {Object} messageDisplay - メッセージ表示管理オブジェクト
     * @param {Object} uiStateManager - UI状態管理オブジェクト
     */
    constructor(elements, messageDisplay, uiStateManager) {
        this.elements = elements;
        this.messageDisplay = messageDisplay;
        this.uiStateManager = uiStateManager;
    }

    /**
     * 日付検索を実行
     * ヘッダーの日付入力から日付範囲を取得してメッセージを検索
     */
    async handleDateSearch() {
        const startDate = this.elements.startDate?.value;
        const endDate = this.elements.endDate?.value;

        if (!startDate || !endDate) {
            this.uiStateManager.showNotification(
                '開始日と終了日の両方を選択してください',
                'warning'
            );
            return;
        }

        await this.loadMessagesByDateRange(startDate, endDate);
    }

    /**
     * 日付範囲でメッセージを読み込み（会話ログの日時で検索）
     * @param {string} startDate - 開始日（YYYY-MM-DD形式）
     * @param {string} endDate - 終了日（YYYY-MM-DD形式）
     */
    async loadMessagesByDateRange(startDate, endDate) {
        try {
            this.uiStateManager.showLoading('メッセージを読み込み中...');

            const response = await fetch(
                `/api/search/date-range?start_date=${startDate}&end_date=${endDate}&limit=5000`
            );
            const data = await response.json();

            if (data.success) {
                this.messageDisplay.displayMessages(data.results);
                this.uiStateManager.updateStats({
                    messageCount: data.total,
                    dateRange: `${startDate} 〜 ${endDate}`
                });
                this.uiStateManager.showNotification(
                    `${data.total}件のメッセージを表示しました`,
                    'success'
                );
            } else {
                throw new Error(data.error || '日付範囲検索に失敗しました');
            }
        } catch (error) {
            console.error('Date range search error:', error);
            this.uiStateManager.showNotification(error.message, 'error');
        } finally {
            this.uiStateManager.hideLoading();
        }
    }

    /**
     * 全メッセージを表示
     * データベースの全日付範囲のメッセージを取得して表示
     */
    async loadAllMessages() {
        try {
            this.uiStateManager.showLoading('すべてのメッセージを読み込み中...');

            // まず利用可能な日付範囲を取得（キャッシュを使用しない）
            const dateRangeResponse = await fetch('/api/date-range', {
                cache: 'no-store'
            });
            const dateRangeData = await dateRangeResponse.json();

            if (
                !dateRangeData.success ||
                !dateRangeData.min_date ||
                !dateRangeData.max_date
            ) {
                throw new Error('日付範囲の取得に失敗しました');
            }

            // 全データを取得（実際のデータベースの全日付範囲、キャッシュを使用しない）
            const response = await fetch(
                `/api/search/date-range?start_date=${dateRangeData.min_date}&end_date=${dateRangeData.max_date}&limit=5000`,
                { cache: 'no-store' }
            );
            const data = await response.json();

            if (data.success) {
                this.messageDisplay.displayMessages(data.results);
                this.uiStateManager.updateStats({
                    messageCount: data.total,
                    dateRange: 'すべて'
                });
                this.uiStateManager.showNotification(
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
            this.uiStateManager.showNotification(error.message, 'error');
            if (this.elements.messageArea) {
                this.elements.messageArea.innerHTML =
                    '<div class="empty-state">データの読み込みに失敗しました</div>';
            }
        } finally {
            this.uiStateManager.hideLoading();
        }
    }

    /**
     * 日付範囲制限を設定
     * APIから利用可能な日付範囲を取得し、日付入力フィールドに制限を設定
     * 初期表示として全ログを読み込む
     */
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
                await this.loadAllMessages();
            }
        } catch (error) {
            console.warn('日付範囲制限の設定に失敗:', error);
        }
    }

    /**
     * 直近1週間の日付範囲を設定
     * @param {string} maxDate - 最大日付（YYYY-MM-DD形式）
     */
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


            // 初期表示で直近1週間のメッセージを表示
            this.loadMessagesByDateRange(startDateStr, endDateStr);

        } catch (error) {
            console.warn('初期日付範囲の設定に失敗:', error);
        }
    }

    /**
     * 検索条件をクリア
     * 日付入力フィールドをクリアし、全メッセージを表示
     */
    clearSearchConditions() {
        // 日付入力フィールドをクリア
        if (this.elements.startDate) this.elements.startDate.value = '';
        if (this.elements.endDate) this.elements.endDate.value = '';

        // 全メッセージを表示
        this.loadAllMessages();
        this.uiStateManager.showNotification('検索条件をクリアしました', 'info');
    }
}

// グローバルスコープに公開
window.DateFilter = DateFilter;
