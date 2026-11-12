@echo off
chcp 65001 >nul
REM Mo Chrome (profile rieng) de dang nhap PMS lan dau va luu phien
"%LOCALAPPDATA%\PunchlistDownloader\.venv\Scripts\python.exe" "%~dp0punchlist_downloader.py" --login
pause
