#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEV_COMPOSE="${ROOT_DIR}/docker-compose.yml"
LOCAL_COMPOSE="${ROOT_DIR}/docker-compose.local.yml"
SERVER_ENV="${ROOT_DIR}/aifactory-server/.env"

export DEBIAN_MIRROR="${DEBIAN_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian}"
export DEBIAN_SECURITY_MIRROR="${DEBIAN_SECURITY_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian-security}"
export AGENTCRAFT_FRONTEND_PORT="${AGENTCRAFT_FRONTEND_PORT:-8088}"
export AGENTCRAFT_API_PORT="${AGENTCRAFT_API_PORT:-3100}"
export AGENTCRAFT_MCP_PORT="${AGENTCRAFT_MCP_PORT:-3101}"
export AGENTCRAFT_WORKSPACE_PORT="${AGENTCRAFT_WORKSPACE_PORT:-3110}"
export AGENTCRAFT_MYSQL_PORT="${AGENTCRAFT_MYSQL_PORT:-33306}"
export AGENTCRAFT_REDIS_PORT="${AGENTCRAFT_REDIS_PORT:-36379}"
export AGENTCRAFT_DB_NAME="${AGENTCRAFT_DB_NAME:-agentcraft_public}"
export AGENTCRAFT_AGENT_CONTAINER_PREFIX="${AGENTCRAFT_AGENT_CONTAINER_PREFIX:-agent-craft-public-hermes}"

kill_port() {
  local port="$1"
  local name="$2"
  local pids

  pids="$(lsof -ti tcp:"${port}" -sTCP:LISTEN 2>/dev/null || true)"
  if [[ -z "${pids}" ]]; then
    return 0
  fi

  for pid in ${pids}; do
    echo "  - Killing ${name} on port ${port} (PID ${pid})"
    kill -9 "${pid}" 2>/dev/null || true
  done
}

file_mtime_epoch() {
  local path="$1"
  stat -f %m "${path}" 2>/dev/null || stat -c %Y "${path}" 2>/dev/null || echo 0
}

image_created_epoch() {
  local image="$1"
  local created
  created="$(docker image inspect --format '{{.Created}}' "${image}" 2>/dev/null || true)"
  if [[ -z "${created}" ]]; then
    echo 0
    return 0
  fi
  date -d "${created}" +%s 2>/dev/null \
    || date -j -f "%Y-%m-%dT%H:%M:%S" "${created:0:19}" +%s 2>/dev/null \
    || echo 0
}

local_agent_image_needs_rebuild() {
  local image="$1"
  shift
  if [[ "${REBUILD_LOCAL_AGENT_IMAGES:-false}" == "true" ]]; then
    return 0
  fi
  if ! docker image inspect "${image}" >/dev/null 2>&1; then
    return 0
  fi
  local image_epoch
  image_epoch="$(image_created_epoch "${image}")"
  if [[ "${image_epoch}" -le 0 ]]; then
    return 0
  fi
  local source
  for source in "$@"; do
    if [[ -f "${source}" && "$(file_mtime_epoch "${source}")" -gt "${image_epoch}" ]]; then
      return 0
    fi
  done
  return 1
}

ensure_local_agent_image() {
  local label="$1"
  local image="$2"
  local build_script="$3"
  shift 3
  echo "${label}"
  if local_agent_image_needs_rebuild "${image}" "${build_script}" "$@"; then
    echo "  - Building ${image}"
    if ! "${build_script}"; then
      if docker image inspect "${image}" >/dev/null 2>&1; then
        echo "  - WARNING: failed to rebuild ${image}; continuing with the existing image"
      else
        return 1
      fi
    fi
  else
    echo "  - ${image} is up to date"
  fi
}

wait_for_api_health() {
  local attempts="${1:-30}"
  local delay_seconds="${2:-2}"
  local attempt

  for attempt in $(seq 1 "${attempts}"); do
    if curl -fsS "http://localhost:${AGENTCRAFT_API_PORT}/api/health" >/dev/null; then
      return 0
    fi
    if [[ "${attempt}" -lt "${attempts}" ]]; then
      echo "  - API not ready yet (${attempt}/${attempts}); retrying..."
      sleep "${delay_seconds}"
    fi
  done

  return 1
}

if [[ ! -f "${SERVER_ENV}" ]]; then
  echo "ERROR: Missing ${SERVER_ENV}"
  echo "Copy aifactory-server/.env.example to aifactory-server/.env and fill local values first."
  exit 1
fi

if ! command -v docker >/dev/null 2>&1; then
  echo "ERROR: Docker is not installed or not in PATH."
  echo "Install Docker Desktop for Mac and ensure the \`docker\` command is available."
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "ERROR: Docker daemon is not running."
  echo "Start Docker Desktop and retry."
  exit 1
fi

echo "============================================"
echo "  AIFactory - Local Docker (local full-stack)"
echo "============================================"
echo
echo "Using Debian mirror: ${DEBIAN_MIRROR}"
echo "Using Debian security mirror: ${DEBIAN_SECURITY_MIRROR}"
echo

echo "[1/12] Stopping existing containers..."
docker compose -f "${DEV_COMPOSE}" down --remove-orphans >/dev/null 2>&1 || true
docker compose -f "${LOCAL_COMPOSE}" down --remove-orphans >/dev/null 2>&1 || true
if [[ "${AGENTCRAFT_CLEAN_STALE_AGENT_CONTAINERS:-false}" == "true" ]]; then
  stale_agent_containers="$(docker ps -aq --filter "name=^/${AGENTCRAFT_AGENT_CONTAINER_PREFIX}-" 2>/dev/null || true)"
  if [[ -n "${stale_agent_containers}" ]]; then
    echo "  - Removing stale agent runtime containers with prefix ${AGENTCRAFT_AGENT_CONTAINER_PREFIX}-"
    docker rm -f ${stale_agent_containers} >/dev/null 2>&1 || true
  fi
fi

echo "[2/12] Freeing public-repo dev ports (${AGENTCRAFT_FRONTEND_PORT}, ${AGENTCRAFT_API_PORT}, ${AGENTCRAFT_MCP_PORT}, ${AGENTCRAFT_WORKSPACE_PORT}, ${AGENTCRAFT_MYSQL_PORT}, ${AGENTCRAFT_REDIS_PORT})..."
kill_port "${AGENTCRAFT_API_PORT}" "Backend"
kill_port "${AGENTCRAFT_MCP_PORT}" "MCP"
kill_port "${AGENTCRAFT_WORKSPACE_PORT}" "Agent Workspace"
kill_port "${AGENTCRAFT_FRONTEND_PORT}" "Frontend"
kill_port "${AGENTCRAFT_MYSQL_PORT}" "MySQL"
kill_port "${AGENTCRAFT_REDIS_PORT}" "Redis"

echo "[3/12] Building app images and starting infrastructure..."
docker compose -f "${LOCAL_COMPOSE}" build api mcp agent-workspace frontend
docker compose -f "${LOCAL_COMPOSE}" up -d mysql redis

echo "[4/12] Ensuring Hermes agent image exists..."
if docker image inspect "${HERMES_AGENT_IMAGE:-aifactory/hermes-agent:real-local}" >/dev/null 2>&1; then
  echo "  - Hermes agent image already exists: ${HERMES_AGENT_IMAGE:-aifactory/hermes-agent:real-local}"
else
  "${ROOT_DIR}/build-hermes-agent-image.sh"
fi

ensure_local_agent_image \
  "[5/12] Ensuring mini-swe-agent image exists..." \
  "${MINI_SWE_AGENT_IMAGE:-aifactory/mini-swe-agent:local}" \
  "${ROOT_DIR}/build-mini-swe-agent-image.sh" \
  "${ROOT_DIR}/docker/mini-swe-agent.local.Dockerfile" \
  "${ROOT_DIR}/docker/agentcraft-cli-adapter.py"

ensure_local_agent_image \
  "[6/12] Ensuring pi-agent image exists..." \
  "${PI_AGENT_IMAGE:-aifactory/pi-agent:local}" \
  "${ROOT_DIR}/build-pi-agent-image.sh" \
  "${ROOT_DIR}/docker/pi-agent.local.Dockerfile" \
  "${ROOT_DIR}/docker/agentcraft-cli-adapter.mjs"

ensure_local_agent_image \
  "[7/12] Ensuring Claude Code agent image exists..." \
  "${CLAUDE_CODE_AGENT_IMAGE:-aifactory/claude-code-agent:local}" \
  "${ROOT_DIR}/build-claude-code-agent-image.sh" \
  "${ROOT_DIR}/docker/claude-code-agent.local.Dockerfile" \
  "${ROOT_DIR}/docker/agentcraft-cli-adapter.mjs"

ensure_local_agent_image \
  "[8/12] Ensuring Codex agent image exists..." \
  "${CODEX_AGENT_IMAGE:-aifactory/codex-agent:local}" \
  "${ROOT_DIR}/build-codex-agent-image.sh" \
  "${ROOT_DIR}/docker/codex-agent.local.Dockerfile" \
  "${ROOT_DIR}/docker/agentcraft-cli-adapter.mjs"

echo "[9/12] Syncing database schema..."
"${ROOT_DIR}/sync-local-db.sh"

echo "[10/12] Seeding default data..."
"${ROOT_DIR}/seed-local-db.sh"

echo "[11/12] Restarting app services with migrated schema..."
docker compose -f "${LOCAL_COMPOSE}" up -d api mcp agent-workspace frontend

echo "[12/12] Verifying API health..."
wait_for_api_health
echo
echo "============================================"
echo "  All services started!"
echo
echo "  Frontend:  http://localhost:${AGENTCRAFT_FRONTEND_PORT}"
echo "  API:       http://localhost:${AGENTCRAFT_API_PORT}"
echo "  MCP:       http://localhost:${AGENTCRAFT_MCP_PORT}"
echo "  Workspace: http://localhost:${AGENTCRAFT_WORKSPACE_PORT}"
echo "  Redis:     localhost:${AGENTCRAFT_REDIS_PORT}"
echo "  MySQL:     localhost:${AGENTCRAFT_MYSQL_PORT}"
echo "  Database:  ${AGENTCRAFT_DB_NAME}"
echo
echo "  Startup checks completed:"
echo "    - Hermes agent image exists or was built: ${HERMES_AGENT_IMAGE:-aifactory/hermes-agent:real-local}"
echo "    - mini-swe-agent image exists or was built: ${MINI_SWE_AGENT_IMAGE:-aifactory/mini-swe-agent:local}"
echo "    - pi-agent image exists or was built: ${PI_AGENT_IMAGE:-aifactory/pi-agent:local}"
echo "    - Claude Code agent image exists or was built: ${CLAUDE_CODE_AGENT_IMAGE:-aifactory/claude-code-agent:local}"
echo "    - Codex agent image exists or was built: ${CODEX_AGENT_IMAGE:-aifactory/codex-agent:local}"
echo "    - Database schema synced"
echo "    - Default data seeded"
echo
echo "  Logs:  docker compose -f docker-compose.local.yml logs -f"
echo "  Stop:  docker compose -f docker-compose.local.yml down"
echo "============================================"
