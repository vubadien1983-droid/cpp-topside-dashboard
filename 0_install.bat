@echo off
chcp 65001 >nul
REM Cai dat moi truong Python + Playwright (chi can chay 1 lan)
set "VENV=%LOCALAPPDATA%\PunchlistDownloader\.venv"
where uv >nul 2>nul || (echo Can cai uv truoc: https://docs.astral.sh/uv/ & pause & exit /b 1)
if not exist "%VENV%\Scripts\python.exe" uv venv --python 3.12 "%VENV%"
uv pip install --python "%VENV%\Scripts\python.exe" playwright
echo.
echo Cai dat xong. Tiep theo chay 1_login_setup.bat
pause
