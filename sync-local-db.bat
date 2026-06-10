@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "LOCAL_COMPOSE=%ROOT_DIR%docker-compose.local.yml"

echo ============================================
echo   AIFactory - Sync Local DB Schema
echo ============================================
echo.

echo [1/2] Applying AgentCraft API migrations...
docker compose -f "%LOCAL_COMPOSE%" run --rm api sh -lc "npx prisma migrate deploy"
if errorlevel 1 (
  echo.
  echo ERROR: AgentCraft API migrations failed.
  goto :end
)

echo [2/2] Applying agent-workspace service migrations...
docker compose -f "%LOCAL_COMPOSE%" run --rm agent-workspace sh -lc "npx prisma migrate deploy"
if errorlevel 1 (
  echo.
  echo ERROR: agent-workspace service migrations failed.
  goto :end
)

echo.
echo Schema sync complete.

:end
endlocal
