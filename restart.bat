@echo off
setlocal EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
set "DEV_COMPOSE=%ROOT_DIR%docker-compose.yml"
set "LOCAL_COMPOSE=%ROOT_DIR%docker-compose.local.yml"
set "SERVER_ENV=%ROOT_DIR%aifactory-server\.env"

if not defined AGENTCRAFT_UI_DEV_PORT set "AGENTCRAFT_UI_DEV_PORT=5174"
if not defined AGENTCRAFT_API_PORT set "AGENTCRAFT_API_PORT=3100"
if not defined AGENTCRAFT_MCP_PORT set "AGENTCRAFT_MCP_PORT=3101"
if not defined AGENTCRAFT_MYSQL_PORT set "AGENTCRAFT_MYSQL_PORT=33306"
if not defined AGENTCRAFT_REDIS_PORT set "AGENTCRAFT_REDIS_PORT=36379"
if not defined AGENTCRAFT_DB_NAME set "AGENTCRAFT_DB_NAME=agentcraft_public"

if not exist "%SERVER_ENV%" (
  echo ERROR: Missing %SERVER_ENV%
  echo Copy aifactory-server\.env.example to aifactory-server\.env and fill local values first.
  goto :end
)

echo [1/6] Stopping local full-stack docker stack if running...
docker compose -f "%LOCAL_COMPOSE%" down --remove-orphans >nul 2>&1

echo [2/6] Killing processes on dev ports...
call :kill_port %AGENTCRAFT_API_PORT% Backend
call :kill_port %AGENTCRAFT_MCP_PORT% MCP
call :kill_port %AGENTCRAFT_UI_DEV_PORT% Frontend

echo [3/6] Restarting local infra containers (mysql, redis)...
docker compose -f "%DEV_COMPOSE%" stop mysql redis >nul 2>&1
docker compose -f "%DEV_COMPOSE%" up -d mysql redis
if errorlevel 1 (
  echo Failed to start mysql/redis containers.
  goto :end
)

echo [4/6] Starting backend (port %AGENTCRAFT_API_PORT%)...
start "AIFactory Backend" cmd /k "cd /d ""%ROOT_DIR%aifactory-server"" && set PORT=%AGENTCRAFT_API_PORT%&& npm run start:dev"

echo [5/6] Starting MCP server (port %AGENTCRAFT_MCP_PORT%)...
start "AIFactory MCP" cmd /k "cd /d ""%ROOT_DIR%aifactory-server"" && set MCP_PORT=%AGENTCRAFT_MCP_PORT%&& set AIFACTORY_API_BASE_URL=http://localhost:%AGENTCRAFT_API_PORT%/api&& npm run mcp:dev"

echo [6/6] Starting frontend (port %AGENTCRAFT_UI_DEV_PORT%)...
start "AIFactory Frontend" cmd /k "cd /d ""%ROOT_DIR%aifactory-ui"" && set VITE_DEV_PORT=%AGENTCRAFT_UI_DEV_PORT%&& set AGENTCRAFT_API_PORT=%AGENTCRAFT_API_PORT%&& set AGENTCRAFT_MCP_PORT=%AGENTCRAFT_MCP_PORT%&& npm run dev"

echo.
echo Restart completed. Check the 3 new terminal windows for logs.
echo.
echo Local app:      http://localhost:%AGENTCRAFT_UI_DEV_PORT%
echo Local API:      http://localhost:%AGENTCRAFT_API_PORT%
echo Local MCP:      http://localhost:%AGENTCRAFT_MCP_PORT%/mcp
echo Local MySQL:    localhost:%AGENTCRAFT_MYSQL_PORT%
echo Local Redis:    localhost:%AGENTCRAFT_REDIS_PORT%
echo Local database: %AGENTCRAFT_DB_NAME%
goto :end

:kill_port
set "PORT=%~1"
set "NAME=%~2"
set "FOUND=0"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "FOUND=1"
  echo   - Killing !NAME! on port %PORT% ^(PID %%P^)
  taskkill /F /PID %%P >nul 2>&1
)
if "!FOUND!"=="0" (
  echo   - Port %PORT% is free.
)
exit /b 0

:end
endlocal
