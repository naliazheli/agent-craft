#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
IMAGE="${PI_AGENT_IMAGE:-aifactory/pi-agent:local}"
DOCKERFILE="${PI_AGENT_DOCKERFILE:-$ROOT/docker/pi-agent.local.Dockerfile}"
NODE_BASE="${PI_AGENT_NODE_BASE:-node:24-bookworm}"
PI_PACKAGE="${PI_AGENT_PACKAGE:-@earendil-works/pi-coding-agent}"
PLATFORM="${PI_AGENT_PLATFORM:-${DOCKER_DEFAULT_PLATFORM:-}}"
DEBIAN_MIRROR="${PI_AGENT_DEBIAN_MIRROR:-${DEBIAN_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian}}"
DEBIAN_SECURITY_MIRROR="${PI_AGENT_DEBIAN_SECURITY_MIRROR:-${DEBIAN_SECURITY_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian-security}}"

if [ -z "$PLATFORM" ]; then
  PLATFORM="$(docker info --format '{{.OSType}}/{{.Architecture}}' 2>/dev/null || true)"
  PLATFORM="${PLATFORM//x86_64/amd64}"
  PLATFORM="${PLATFORM//aarch64/arm64}"
fi
platform_args=()
if [ -n "$PLATFORM" ]; then
  platform_args=(--platform "$PLATFORM")
fi
build_args=(--build-arg "PI_AGENT_NODE_BASE=$NODE_BASE" --build-arg "PI_AGENT_PACKAGE=$PI_PACKAGE")
if [ -n "$DEBIAN_MIRROR" ]; then
  build_args+=(--build-arg "DEBIAN_MIRROR=$DEBIAN_MIRROR")
fi
if [ -n "$DEBIAN_SECURITY_MIRROR" ]; then
  build_args+=(--build-arg "DEBIAN_SECURITY_MIRROR=$DEBIAN_SECURITY_MIRROR")
fi

docker build \
  "${platform_args[@]}" \
  "${build_args[@]}" \
  -t "$IMAGE" \
  -f "$DOCKERFILE" \
  "$ROOT"
echo "Built pi agent image: $IMAGE${PLATFORM:+ ($PLATFORM)}"
