@echo off
setlocal enabledelayedexpansion

:: Check for virtual environment activation script
if not exist "backend\.venv\Scripts\activate.bat" (
    echo [ERROR] Python venv not found at backend\.venv\Scripts\activate.bat
    echo         Run: cd backend && python -m venv .venv && .venv\Scripts\activate.bat && pip install -r requirements.txt
    exit /b 1
)

echo Starting Backend in a new window...
start "Spotify Backend" cmd /c "cd /d %~dp0backend && call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

echo Starting Frontend in a new window...
start "Spotify Frontend" cmd /c "cd /d %~dp0frontend && npm run dev"

echo.
echo Both servers have been launched in their own terminal windows.
timeout /t 3 >nul
