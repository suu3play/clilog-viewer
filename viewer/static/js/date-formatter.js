/**
 * 日付フォーマット処理を提供するユーティリティクラス
 */
class DateFormatter {
    /**
     * ISO日時文字列を日本語フォーマットに変換
     * @param {string} dateStr - ISO形式の日時文字列
     * @param {Object} options - toLocaleStringに渡すオプション
     * @returns {string} フォーマット済み日時文字列
     */
    static format(dateStr, options = null) {
        if (!dateStr) return '';

        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                console.error('Invalid date string:', dateStr);
                return dateStr;
            }

            const defaultOptions = {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
            };

            const formatOptions = options || defaultOptions;
            return date.toLocaleString('ja-JP', formatOptions);
        } catch (error) {
            console.error('Date formatting error:', error);
            return dateStr;
        }
    }

    /**
     * シンプルフォーマット（デフォルトの日本語表示）
     * @param {string} dateStr - ISO形式の日時文字列
     * @returns {string} フォーマット済み日時文字列
     */
    static formatSimple(dateStr) {
        if (!dateStr) return '';

        try {
            const date = new Date(dateStr);
            if (isNaN(date.getTime())) {
                console.error('Invalid date string:', dateStr);
                return dateStr;
            }

            return date.toLocaleString('ja-JP');
        } catch (error) {
            console.error('Date formatting error:', error);
            return dateStr;
        }
    }
}

// グローバルスコープに公開
window.DateFormatter = DateFormatter;
