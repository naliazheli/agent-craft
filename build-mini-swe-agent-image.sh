#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${MINI_SWE_AGENT_IMAGE:-aifactory/mini-swe-agent:local}"
DOCKERFILE="${MINI_SWE_AGENT_DOCKERFILE:-$ROOT/docker/mini-swe-agent.local.Dockerfile}"
BASE_IMAGE="${MINI_SWE_AGENT_BASE_IMAGE:-python:3.12-slim}"
PLATFORM="${MINI_SWE_AGENT_PLATFORM:-${DOCKER_DEFAULT_PLATFORM:-}}"
DEBIAN_MIRROR="${MINI_SWE_AGENT_DEBIAN_MIRROR:-${DEBIAN_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian}}"
DEBIAN_SECURITY_MIRROR="${MINI_SWE_AGENT_DEBIAN_SECURITY_MIRROR:-${DEBIAN_SECURITY_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian-security}}"
PIP_INDEX_URL="${MINI_SWE_AGENT_PIP_INDEX_URL:-${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}}"

if [ -z "$PLATFORM" ]; then
  PLATFORM="$(docker info --format '{{.OSType}}/{{.Architecture}}' 2>/dev/null || true)"
  PLATFORM="${PLATFORM//x86_64/amd64}"
  PLATFORM="${PLATFORM//aarch64/arm64}"
fi
platform_args=()
if [ -n "$PLATFORM" ]; then
  platform_args=(--platform "$PLATFORM")
fi
build_args=(--build-arg "MINI_SWE_AGENT_BASE_IMAGE=$BASE_IMAGE")
if [ -n "$DEBIAN_MIRROR" ]; then
  build_args+=(--build-arg "DEBIAN_MIRROR=$DEBIAN_MIRROR")
fi
if [ -n "$DEBIAN_SECURITY_MIRROR" ]; then
  build_args+=(--build-arg "DEBIAN_SECURITY_MIRROR=$DEBIAN_SECURITY_MIRROR")
fi
if [ -n "$PIP_INDEX_URL" ]; then
  build_args+=(--build-arg "PIP_INDEX_URL=$PIP_INDEX_URL")
fi

docker build \
  "${platform_args[@]}" \
  "${build_args[@]}" \
  -t "$IMAGE" \
  -f "$DOCKERFILE" \
  "$ROOT"
echo "Built mini-swe-agent image: $IMAGE${PLATFORM:+ ($PLATFORM)}"
