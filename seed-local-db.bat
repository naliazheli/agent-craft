@echo off
setlocal

set "ROOT_DIR=%~dp0"
set "LOCAL_COMPOSE=%ROOT_DIR%docker-compose.local.yml"

echo ============================================
echo   AIFactory - Seed Local DB
echo ============================================
echo.

docker compose -f "%LOCAL_COMPOSE%" exec api sh -lc "npm run prisma:seed"
if errorlevel 1 (
  echo.
  echo ERROR: Prisma seed failed.
  goto :end
)

echo.
echo Seed complete.

:end
endlocal
