@echo off
setlocal EnableDelayedExpansion

set "ROOT_DIR=%~dp0"
set "DEV_COMPOSE=%ROOT_DIR%docker-compose.yml"
set "LOCAL_COMPOSE=%ROOT_DIR%docker-compose.local.yml"
set "SERVER_ENV=%ROOT_DIR%aifactory-server\.env"
set "EXIT_CODE=0"

if not defined DEBIAN_MIRROR set "DEBIAN_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian"
if not defined DEBIAN_SECURITY_MIRROR set "DEBIAN_SECURITY_MIRROR=http://mirrors.tuna.tsinghua.edu.cn/debian-security"
if not defined AGENTCRAFT_FRONTEND_PORT set "AGENTCRAFT_FRONTEND_PORT=8088"
if not defined AGENTCRAFT_API_PORT set "AGENTCRAFT_API_PORT=3100"
if not defined AGENTCRAFT_MCP_PORT set "AGENTCRAFT_MCP_PORT=3101"
if not defined AGENTCRAFT_WORKSPACE_PORT set "AGENTCRAFT_WORKSPACE_PORT=3110"
if not defined AGENTCRAFT_MYSQL_PORT set "AGENTCRAFT_MYSQL_PORT=33306"
if not defined AGENTCRAFT_REDIS_PORT set "AGENTCRAFT_REDIS_PORT=36379"
if not defined AGENTCRAFT_DB_NAME set "AGENTCRAFT_DB_NAME=agentcraft_public"
if not defined AGENTCRAFT_AGENT_CONTAINER_PREFIX set "AGENTCRAFT_AGENT_CONTAINER_PREFIX=agent-craft-public-hermes"

if not exist "%SERVER_ENV%" (
  echo ERROR: Missing %SERVER_ENV%
  echo Copy aifactory-server\.env.example to aifactory-server\.env and fill local values first.
  set "EXIT_CODE=1"
  goto :end
)

where docker >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker is not installed or not in PATH.
  echo Install Docker Desktop for Windows and ensure the docker command is available.
  set "EXIT_CODE=1"
  goto :end
)

docker info >nul 2>&1
if errorlevel 1 (
  echo ERROR: Docker daemon is not running.
  echo Start Docker Desktop and retry.
  set "EXIT_CODE=1"
  goto :end
)

echo ============================================
echo   AIFactory - Local Docker (local full-stack)
echo ============================================
echo.
echo Using Debian mirror: %DEBIAN_MIRROR%
echo Using Debian security mirror: %DEBIAN_SECURITY_MIRROR%
echo.

echo [1/8] Stopping existing containers...
docker compose -f "%DEV_COMPOSE%" down --remove-orphans >nul 2>&1
docker compose -f "%LOCAL_COMPOSE%" down --remove-orphans >nul 2>&1
set "REMOVED_STALE_AGENT_CONTAINERS="
if /I "%AGENTCRAFT_CLEAN_STALE_AGENT_CONTAINERS%"=="true" (
  for /f "delims=" %%C in ('docker ps -aq --filter "name=^/%AGENTCRAFT_AGENT_CONTAINER_PREFIX%-" 2^>nul') do (
    if not defined REMOVED_STALE_AGENT_CONTAINERS (
      echo   - Removing stale agent runtime containers with prefix %AGENTCRAFT_AGENT_CONTAINER_PREFIX%-
      set "REMOVED_STALE_AGENT_CONTAINERS=1"
    )
    docker rm -f %%C >nul 2>&1
  )
)

echo [2/8] Freeing public-repo dev ports (%AGENTCRAFT_FRONTEND_PORT%, %AGENTCRAFT_API_PORT%, %AGENTCRAFT_MCP_PORT%, %AGENTCRAFT_WORKSPACE_PORT%, %AGENTCRAFT_MYSQL_PORT%, %AGENTCRAFT_REDIS_PORT%)...
call :kill_port %AGENTCRAFT_API_PORT% Backend
call :kill_port %AGENTCRAFT_MCP_PORT% MCP
call :kill_port %AGENTCRAFT_WORKSPACE_PORT% "Agent Workspace"
call :kill_port %AGENTCRAFT_FRONTEND_PORT% Frontend
call :kill_port %AGENTCRAFT_MYSQL_PORT% MySQL
call :kill_port %AGENTCRAFT_REDIS_PORT% Redis

echo [3/8] Building app images and starting infrastructure...
docker compose -f "%LOCAL_COMPOSE%" build api mcp agent-workspace frontend

if errorlevel 1 (
  echo.
  echo ERROR: docker compose build failed. Check output above.
  set "EXIT_CODE=1"
  goto :end
)

docker compose -f "%LOCAL_COMPOSE%" up -d mysql redis

if errorlevel 1 (
  echo.
  echo ERROR: docker compose failed to start infrastructure. Check output above.
  set "EXIT_CODE=1"
  goto :end
)

echo [4/8] Ensuring local agent images exist...
call :ensure_image "aifactory/mini-swe-agent:local" "%ROOT_DIR%build-mini-swe-agent-image.ps1" "mini-swe-agent" "%ROOT_DIR%docker\mini-swe-agent.local.Dockerfile;%ROOT_DIR%docker\agentcraft-cli-adapter.py"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :end
)
call :ensure_image "aifactory/pi-agent:local" "%ROOT_DIR%build-pi-agent-image.ps1" "pi-agent" "%ROOT_DIR%docker\pi-agent.local.Dockerfile;%ROOT_DIR%docker\agentcraft-cli-adapter.mjs"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :end
)
call :ensure_image "aifactory/claude-code-agent:local" "%ROOT_DIR%build-claude-code-agent-image.ps1" "claude-code-agent" "%ROOT_DIR%docker\claude-code-agent.local.Dockerfile;%ROOT_DIR%docker\agentcraft-cli-adapter.mjs"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :end
)
call :ensure_image "aifactory/codex-agent:local" "%ROOT_DIR%build-codex-agent-image.ps1" "codex-agent" "%ROOT_DIR%docker\codex-agent.local.Dockerfile;%ROOT_DIR%docker\agentcraft-cli-adapter.mjs"
if errorlevel 1 (
  set "EXIT_CODE=1"
  goto :end
)

echo [5/8] Syncing database schema...
call "%ROOT_DIR%sync-local-db.bat"
if errorlevel 1 (
  echo.
  echo ERROR: Database schema sync failed.
  set "EXIT_CODE=1"
  goto :end
)

echo [6/8] Seeding default data...
call "%ROOT_DIR%seed-local-db.bat"
if errorlevel 1 (
  echo.
  echo ERROR: Database seed failed.
  set "EXIT_CODE=1"
  goto :end
)

echo [7/8] Restarting app services with migrated schema...
docker compose -f "%LOCAL_COMPOSE%" up -d api mcp agent-workspace frontend
if errorlevel 1 (
  echo.
  echo ERROR: App service restart failed.
  set "EXIT_CODE=1"
  goto :end
)

echo [8/8] Verifying API health...
call :wait_for_api_health
if errorlevel 1 (
  echo.
  echo ERROR: API health check failed.
  set "EXIT_CODE=1"
  goto :end
)

echo.
echo ============================================
echo   All services started!
echo.
echo   Frontend:  http://localhost:%AGENTCRAFT_FRONTEND_PORT%
echo   API:       http://localhost:%AGENTCRAFT_API_PORT%
echo   MCP:       http://localhost:%AGENTCRAFT_MCP_PORT%
echo   Workspace: http://localhost:%AGENTCRAFT_WORKSPACE_PORT%
echo   Redis:     localhost:%AGENTCRAFT_REDIS_PORT%
echo   MySQL:     localhost:%AGENTCRAFT_MYSQL_PORT%
echo   Database:  %AGENTCRAFT_DB_NAME%
echo.
echo   Startup checks completed:
echo     - mini-swe-agent image exists or was built: aifactory/mini-swe-agent:local
echo     - pi-agent image exists or was built: aifactory/pi-agent:local
echo     - Claude Code agent image exists or was built: aifactory/claude-code-agent:local
echo     - Codex agent image exists or was built: aifactory/codex-agent:local
echo     - Database schema synced
echo     - Default data seeded
echo.
echo   Logs:  docker compose -f docker-compose.local.yml logs -f
echo   Stop:  docker compose -f docker-compose.local.yml down
echo ============================================
goto :end

:kill_port
set "PORT=%~1"
set "NAME=%~2"
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  echo   - Killing !NAME! on port %PORT% ^(PID %%P^)
  taskkill /F /PID %%P >nul 2>&1
)
exit /b 0

:ensure_image
set "IMAGE=%~1"
set "SCRIPT=%~2"
set "LABEL=%~3"
set "SOURCES=%~4"
if "%SOURCES%"=="" set "SOURCES=%SCRIPT%"
set "AGENT_IMAGE=%IMAGE%"
set "AGENT_SOURCES=%SCRIPT%;%SOURCES%"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$image=$env:AGENT_IMAGE; $sources=@(); foreach($source in ($env:AGENT_SOURCES -split ';')) { if($source) { $sources += $source } }; if($env:REBUILD_LOCAL_AGENT_IMAGES -eq 'true') { exit 0 }; $created=docker image inspect --format '{{.Created}}' $image 2>$null; if($LASTEXITCODE -ne 0 -or -not $created) { exit 0 }; try { $imageCreated=[DateTimeOffset]::Parse($created).UtcDateTime } catch { exit 0 }; foreach($source in $sources) { if((Test-Path -LiteralPath $source) -and ((Get-Item -LiteralPath $source).LastWriteTimeUtc -gt $imageCreated)) { exit 0 } }; exit 2"
set "NEEDS_REBUILD=%ERRORLEVEL%"
set "AGENT_IMAGE="
set "AGENT_SOURCES="
if "%NEEDS_REBUILD%"=="2" (
  echo   - %LABEL% image is up to date: %IMAGE%
  exit /b 0
)
if not "%NEEDS_REBUILD%"=="0" (
  echo   - Could not inspect freshness for %LABEL%; rebuilding %IMAGE%
)
echo   - Building %LABEL% image: %IMAGE%
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT%"
set "BUILD_EXIT_CODE=%ERRORLEVEL%"
if "%BUILD_EXIT_CODE%"=="0" exit /b 0
docker image inspect "%IMAGE%" >nul 2>&1
if not errorlevel 1 (
  echo   - WARNING: Failed to rebuild %LABEL%; continuing with existing image %IMAGE%
  exit /b 0
)
exit /b %BUILD_EXIT_CODE%

:wait_for_api_health
for /L %%I in (1,1,30) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-RestMethod -Uri ('http://localhost:' + $env:AGENTCRAFT_API_PORT + '/api/health') | Out-Null"
  if not errorlevel 1 exit /b 0
  if not "%%I"=="30" (
    echo   - API not ready yet ^(%%I/30^); retrying...
    timeout /t 2 /nobreak >nul
  )
)
exit /b 1

:end
endlocal & exit /b %EXIT_CODE%
