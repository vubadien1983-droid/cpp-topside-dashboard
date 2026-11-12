@echo off
chcp 65001 >nul
REM Chạy thử tải Checksheet Overview ngay, có hiện trình duyệt
"%LOCALAPPDATA%\PunchlistDownloader\.venv\Scripts\python.exe" "%~dp0checksheet_downloader.py" --show --retries 0
pause
