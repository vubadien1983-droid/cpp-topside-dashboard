@echo off
chcp 65001 >nul
REM Dang ky lich tu chay: khi mo may / mo khoa / 06:00 - moi ngay chi tai 1 lan
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install_schedule.ps1"
echo.
echo Xoa lich: schtasks /delete /tn "PTSC Punchlist Daily Download" /f
pause
