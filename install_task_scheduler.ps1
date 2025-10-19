# clilog-viewer タスクスケジューラ自動登録スクリプト
# Windows環境で定期的にlog_converter.pyを実行するタスクを登録します

# 管理者権限チェック
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "エラー: このスクリプトは管理者権限で実行する必要があります" -ForegroundColor Red
    Write-Host "install_task_scheduler.bat を右クリックして「管理者として実行」を選択してください" -ForegroundColor Yellow
    Read-Host "Enterキーを押して終了"
    exit 1
}

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "  clilog-viewer タスクスケジューラ登録ツール" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# プロジェクトパスを取得（スクリプトのあるディレクトリ）
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectPath = $scriptDir
$logConverterPath = Join-Path $projectPath "log_converter.py"

Write-Host "[1/5] プロジェクトパスの確認..." -ForegroundColor Green
Write-Host "      パス: $projectPath" -ForegroundColor Gray

# log_converter.pyの存在確認
if (-not (Test-Path $logConverterPath)) {
    Write-Host "エラー: log_converter.py が見つかりません" -ForegroundColor Red
    Write-Host "      パス: $logConverterPath" -ForegroundColor Gray
    Read-Host "Enterキーを押して終了"
    exit 1
}
Write-Host "      log_converter.py を確認しました" -ForegroundColor Gray

# Python実行パスを検出
Write-Host ""
Write-Host "[2/5] Python実行パスの検出..." -ForegroundColor Green

$pythonCmd = $null
$pythonPaths = @("python", "python3", "py")

foreach ($cmd in $pythonPaths) {
    try {
        $version = & $cmd --version 2>&1
        if ($LASTEXITCODE -eq 0) {
            $pythonCmd = $cmd
            Write-Host "      Python実行コマンド: $pythonCmd" -ForegroundColor Gray
            Write-Host "      バージョン: $version" -ForegroundColor Gray
            break
        }
    } catch {
        continue
    }
}

if (-not $pythonCmd) {
    Write-Host "エラー: Pythonが見つかりません" -ForegroundColor Red
    Write-Host "      Pythonがインストールされているか確認してください" -ForegroundColor Yellow
    Read-Host "Enterキーを押して終了"
    exit 1
}

# タスク設定
$taskName = "clilog-viewer-auto-convert"
$taskDescription = "CLI Logの自動変換タスク - 毎日定期実行"

# 実行時刻の設定（デフォルト: 9:00 AM）
Write-Host ""
Write-Host "[3/5] タスク実行時刻の設定..." -ForegroundColor Green
Write-Host "      デフォルトは毎日 9:00 AM です" -ForegroundColor Gray
$useDefault = Read-Host "      デフォルトを使用しますか？ (Y/n)"

$triggerTime = "09:00"
if ($useDefault -ne "" -and $useDefault -ne "Y" -and $useDefault -ne "y") {
    $customTime = Read-Host "      実行時刻を入力してください (HH:mm 形式、例: 14:30)"
    if ($customTime -match "^\d{2}:\d{2}$") {
        $triggerTime = $customTime
    } else {
        Write-Host "      無効な形式です。デフォルト (09:00) を使用します" -ForegroundColor Yellow
    }
}

Write-Host "      実行時刻: 毎日 $triggerTime" -ForegroundColor Gray

# 既存タスクの確認
Write-Host ""
Write-Host "[4/5] 既存タスクの確認..." -ForegroundColor Green

$existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($existingTask) {
    Write-Host "      既存のタスク '$taskName' が見つかりました" -ForegroundColor Yellow
    $overwrite = Read-Host "      上書きしますか？ (Y/n)"

    if ($overwrite -ne "" -and $overwrite -ne "Y" -and $overwrite -ne "y") {
        Write-Host "キャンセルしました" -ForegroundColor Yellow
        Read-Host "Enterキーを押して終了"
        exit 0
    }

    Write-Host "      既存タスクを削除中..." -ForegroundColor Gray
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
}

# タスクスケジューラに登録
Write-Host ""
Write-Host "[5/5] タスクスケジューラに登録中..." -ForegroundColor Green

try {
    # アクション: Pythonスクリプトを実行
    $action = New-ScheduledTaskAction `
        -Execute $pythonCmd `
        -Argument "$logConverterPath --force" `
        -WorkingDirectory $projectPath

    # トリガー: 毎日指定時刻に実行
    $trigger = New-ScheduledTaskTrigger -Daily -At $triggerTime

    # 設定: 最高の特権で実行、バッテリー使用時も実行
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RunOnlyIfNetworkAvailable:$false

    # プリンシパル: 現在のユーザーで実行
    $principal = New-ScheduledTaskPrincipal `
        -UserId $env:USERNAME `
        -LogonType S4U `
        -RunLevel Highest

    # タスクを登録
    $task = New-ScheduledTask `
        -Action $action `
        -Trigger $trigger `
        -Settings $settings `
        -Principal $principal `
        -Description $taskDescription

    Register-ScheduledTask `
        -TaskName $taskName `
        -InputObject $task `
        -Force | Out-Null

    Write-Host ""
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host "  登録完了！" -ForegroundColor Green
    Write-Host "==================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "タスク名: $taskName" -ForegroundColor Cyan
    Write-Host "実行時刻: 毎日 $triggerTime" -ForegroundColor Cyan
    Write-Host "実行内容: $pythonCmd $logConverterPath --force" -ForegroundColor Cyan
    Write-Host "作業フォルダ: $projectPath" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "タスクスケジューラで確認するには:" -ForegroundColor Yellow
    Write-Host "  1. Windowsキー + R を押す" -ForegroundColor Gray
    Write-Host "  2. 'taskschd.msc' と入力してEnter" -ForegroundColor Gray
    Write-Host "  3. タスクスケジューラライブラリで '$taskName' を確認" -ForegroundColor Gray
    Write-Host ""

    # インストールログを記録
    $logFile = Join-Path $projectPath "install_log.txt"
    $logContent = @"
タスクスケジューラ登録ログ
========================================
登録日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
タスク名: $taskName
実行時刻: 毎日 $triggerTime
実行コマンド: $pythonCmd $logConverterPath --force
作業フォルダ: $projectPath
ユーザー: $env:USERNAME
ステータス: 成功
========================================
"@

    $logContent | Out-File -FilePath $logFile -Encoding UTF8 -Append
    Write-Host "インストールログ: $logFile" -ForegroundColor Gray

} catch {
    Write-Host ""
    Write-Host "エラー: タスクの登録に失敗しました" -ForegroundColor Red
    Write-Host "詳細: $($_.Exception.Message)" -ForegroundColor Gray

    # エラーログを記録
    $logFile = Join-Path $projectPath "install_log.txt"
    $errorLog = @"
タスクスケジューラ登録ログ（エラー）
========================================
登録日時: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
ステータス: 失敗
エラー内容: $($_.Exception.Message)
========================================
"@

    $errorLog | Out-File -FilePath $logFile -Encoding UTF8 -Append

    Read-Host "Enterキーを押して終了"
    exit 1
}

Read-Host "Enterキーを押して終了"
