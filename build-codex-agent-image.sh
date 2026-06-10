#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${CODEX_AGENT_IMAGE:-aifactory/codex-agent:local}"
DOCKERFILE="${CODEX_AGENT_DOCKERFILE:-$ROOT/docker/codex-agent.local.Dockerfile}"
NODE_BASE="${CODEX_AGENT_NODE_BASE:-node:24-bookworm}"
PLATFORM="${CODEX_AGENT_PLATFORM:-${DOCKER_DEFAULT_PLATFORM:-}}"
DEBIAN_MIRROR="${CODEX_AGENT_DEBIAN_MIRROR:-${DEBIAN_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian}}"
DEBIAN_SECURITY_MIRROR="${CODEX_AGENT_DEBIAN_SECURITY_MIRROR:-${DEBIAN_SECURITY_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian-security}}"

if [ -z "$PLATFORM" ]; then
  PLATFORM="$(docker info --format '{{.OSType}}/{{.Architecture}}' 2>/dev/null || true)"
  PLATFORM="${PLATFORM//x86_64/amd64}"
  PLATFORM="${PLATFORM//aarch64/arm64}"
fi
platform_args=()
if [ -n "$PLATFORM" ]; then
  platform_args=(--platform "$PLATFORM")
fi
build_args=(--build-arg "CODEX_AGENT_NODE_BASE=$NODE_BASE")
if [ -n "$DEBIAN_MIRROR" ]; then
  build_args+=(--build-arg "DEBIAN_MIRROR=$DEBIAN_MIRROR")
fi
if [ -n "$DEBIAN_SECURITY_MIRROR" ]; then
  build_args+=(--build-arg "DEBIAN_SECURITY_MIRROR=$DEBIAN_SECURITY_MIRROR")
fi

docker build \
  "${platform_args[@]}" \
  "${build_args[@]}" \
  -f "$DOCKERFILE" \
  -t "$IMAGE" \
  "$ROOT"

echo "Built codex agent image: $IMAGE${PLATFORM:+ ($PLATFORM)}"
