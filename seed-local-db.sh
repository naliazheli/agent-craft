#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
LOCAL_COMPOSE="${ROOT_DIR}/docker-compose.local.yml"

echo "============================================"
echo "  AIFactory - Seed Local DB"
echo "============================================"
echo

docker compose -f "${LOCAL_COMPOSE}" run --rm api sh -lc "npm run prisma:seed"

echo
echo "Seed complete."
