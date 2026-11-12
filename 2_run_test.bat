@echo off
chcp 65001 >nul
REM Chay thu ngay, co hien trinh duyet de quan sat
"%LOCALAPPDATA%\PunchlistDownloader\.venv\Scripts\python.exe" "%~dp0punchlist_downloader.py" --show --retries 0
pause
