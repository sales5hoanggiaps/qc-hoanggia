#!/bin/sh
# Runs on every container start (docker compose up, restart, etc.).
# 1) Applies any pending Prisma migrations — idempotent, safe to re-run.
# 2) Seeds ONLY when the database has no users yet, so an admin who
#    deliberately deactivated a user or deleted a category never has that
#    change silently undone by a restart (seed.ts's category upserts run
#    unconditionally on name).
# 3) Starts the Next.js standalone server.
set -e

SCHEMA="packages/db/prisma/schema.prisma"

echo "[entrypoint] Waiting for database to be ready and running prisma migrate deploy..."
MAX_RETRIES=30
RETRY_COUNT=0
until node_modules/.bin/prisma migrate deploy --schema="$SCHEMA"; do
  RETRY_COUNT=$((RETRY_COUNT + 1))
  if [ "$RETRY_COUNT" -ge "$MAX_RETRIES" ]; then
    echo "[entrypoint] Database connection failed after $MAX_RETRIES attempts. Exiting."
    exit 1
  fi
  echo "[entrypoint] Database is unavailable or initializing — waiting 2 seconds (attempt $RETRY_COUNT/$MAX_RETRIES)..."
  sleep 2
done

echo "[entrypoint] Checking whether the database already has users..."
USER_STATE=$(node -e "
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
prisma.user.count()
  .then((count) => {
    console.log(count === 0 ? 'EMPTY' : 'HAS_USERS');
  })
  .finally(() => prisma.\$disconnect());
")

if [ "$USER_STATE" = "EMPTY" ]; then
  echo "[entrypoint] No users found — running seed..."
  node_modules/.bin/tsx packages/db/prisma/seed.ts
else
  echo "[entrypoint] Users already exist — skipping seed."
fi

echo "[entrypoint] Starting Next.js server..."
exec node apps/web/server.js
