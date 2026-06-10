#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_COMPOSE="${ROOT_DIR}/docker-compose.local.yml"

echo "============================================"
echo "  AIFactory - Sync Local DB Schema"
echo "============================================"
echo

echo "[1/2] Applying AgentCraft API migrations..."
docker compose -f "${LOCAL_COMPOSE}" run --rm api sh -lc "npx prisma migrate deploy"

echo "[2/2] Applying agent-workspace service migrations..."
docker compose -f "${LOCAL_COMPOSE}" run --rm agent-workspace sh -lc "npx prisma migrate deploy"

echo
echo "Schema sync complete."
