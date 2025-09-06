@echo off
echo CliLog Viewer を起動中...
echo.

REM Python環境確認
python --version >nul 2>&1
if errorlevel 1 (
    echo エラー: Pythonがインストールされていません
    pause
    exit /b 1
)

REM 依存関係インストール
echo 依存関係を確認中...
pip install -r requirements.txt

REM アプリケーション起動
echo.
echo サーバーを起動中...
echo ブラウザで http://localhost:5000 にアクセスしてください
echo.
echo 終了するには Ctrl+C を押してください
echo.

python app.py

pause