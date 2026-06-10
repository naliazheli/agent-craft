#!/usr/bin/env bash
set -euo pipefail

IMAGE="${HERMES_AGENT_IMAGE:-aifactory/hermes-agent:real-local}"
DOCKERHUB_MIRROR="${HERMES_AGENT_DOCKERHUB_MIRROR:-docker.1ms.run}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DOCKERFILE="${HERMES_AGENT_DOCKERFILE:-$ROOT/docker/hermes-agent.real.Dockerfile}"
BASE_IMAGE="${HERMES_AGENT_BASE_IMAGE:-node:24-bookworm}"
NODE_BASE="${HERMES_AGENT_NODE_BASE:-node:24-bookworm}"
DEBIAN_MIRROR="${HERMES_AGENT_DEBIAN_MIRROR:-${DEBIAN_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian}}"
DEBIAN_SECURITY_MIRROR="${HERMES_AGENT_DEBIAN_SECURITY_MIRROR:-${DEBIAN_SECURITY_MIRROR:-http://mirrors.tuna.tsinghua.edu.cn/debian-security}}"
PIP_INDEX_URL="${HERMES_AGENT_PIP_INDEX_URL:-${PIP_INDEX_URL:-https://pypi.tuna.tsinghua.edu.cn/simple}}"
if [ -n "${HERMES_AGENT_SOURCE_PATH:-}" ]; then
  CONTEXT="$HERMES_AGENT_SOURCE_PATH"
elif [ -d "$ROOT/../hermes/hermes-agent" ]; then
  CONTEXT="$ROOT/../hermes/hermes-agent"
elif [ -d /mnt/e/hermes/hermes-agent ]; then
  CONTEXT="/mnt/e/hermes/hermes-agent"
else
  CONTEXT="$ROOT/hermes-agent"
fi

if [ ! -f "$CONTEXT/Dockerfile" ]; then
  echo "ERROR: Hermes agent source not found at $CONTEXT"
  echo "Set HERMES_AGENT_SOURCE_PATH to the hermes-agent checkout before building $IMAGE."
  exit 1
fi

ARGS=(build -t "$IMAGE")
ARGS+=(
  --build-arg "HERMES_AGENT_BASE_IMAGE=$BASE_IMAGE"
  --build-arg "HERMES_AGENT_NODE_BASE=$NODE_BASE"
  --build-arg "DEBIAN_MIRROR=$DEBIAN_MIRROR"
  --build-arg "DEBIAN_SECURITY_MIRROR=$DEBIAN_SECURITY_MIRROR"
  --build-arg "PIP_INDEX_URL=$PIP_INDEX_URL"
)
if [ -n "$DOCKERFILE" ]; then
  ARGS+=(-f "$DOCKERFILE")
elif [ -n "$DOCKERHUB_MIRROR" ]; then
  TEMP_DOCKERFILE="$(mktemp "${TMPDIR:-/tmp}/hermes-agent.Dockerfile.XXXXXX")"
  trap 'rm -f "$TEMP_DOCKERFILE"' EXIT
  sed \
    -e "s#^FROM tianon/gosu:#FROM ${DOCKERHUB_MIRROR}/tianon/gosu:#" \
    -e "s#^FROM debian:#FROM ${DOCKERHUB_MIRROR}/debian:#" \
    -e "s#^COPY --chmod=0755 --from=#COPY --from=#" \
    "$CONTEXT/Dockerfile" > "$TEMP_DOCKERFILE"
  {
    echo
    echo "RUN chmod 0755 /usr/local/bin/gosu /usr/local/bin/uv /usr/local/bin/uvx"
  } >> "$TEMP_DOCKERFILE"
  ARGS+=(-f "$TEMP_DOCKERFILE")
  echo "Using Docker Hub mirror for Hermes base images: $DOCKERHUB_MIRROR"
fi
ARGS+=("$CONTEXT")

docker "${ARGS[@]}"
echo "Built Hermes agent image: $IMAGE"
