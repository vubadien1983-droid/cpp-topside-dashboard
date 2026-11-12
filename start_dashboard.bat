@echo off
chcp 65001 >nul
title CPP TOPSIDE Dashboard Server
cd /d "%~dp0"
echo Đang khởi động Dashboard Server tại http://localhost:8080 ...
start "" "http://localhost:8080"
"%LOCALAPPDATA%\PunchlistDownloader\.venv\Scripts\python.exe" -m http.server 8080
pause
