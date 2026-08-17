@echo off
echo ==============================================
echo Starting TrafficFlow AI Simulator Stack
echo ==============================================

:: Ensure dependencies are installed or prompt user
if not exist "venv\Scripts\activate" (
    echo [WARNING] No venv found in the root directory! Please follow the README instructions to setup the python environment.
    echo Exiting...
    pause
    exit /b 1
)

echo Starting Java WebSocket Backend...
start cmd /k "cd backend-java && mvnw.cmd spring-boot:run"

echo Starting Python AI Controller Backend...
start cmd /k ".\venv\Scripts\activate && cd backend-python && python main.py"

echo Starting CV Video Feed Streamer...
start cmd /k ".\venv\Scripts\activate && cd MONUCV\TrafficCV && python cv_server.py"

echo Starting React Frontend Preview...
start cmd /k "cd frontend && npm run preview -- --port 4173 --host"

echo ==============================================
echo All services launched in separate windows!
echo React UI available at: http://localhost:4173
echo ==============================================
