#!/bin/sh
set -eu

if [ "${RUN_DB_MIGRATIONS_ON_START:-false}" = "true" ]; then
  echo "[api] Applying Prisma migrations..."
  npx prisma migrate deploy
else
  echo "[api] Skipping Prisma migrations on startup."
fi

if [ "${RUN_DB_SEED_ON_START:-false}" = "true" ]; then
  echo "[api] Seeding database..."
  npm run prisma:seed
else
  echo "[api] Skipping database seed on startup."
fi

exec node dist/src/main.js
