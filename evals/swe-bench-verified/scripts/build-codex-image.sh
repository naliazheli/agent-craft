#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
IMAGE="${AGENTCRAFT_CODEX_SWEBENCH_IMAGE:-agentcraft/codex-swebench:local}"
CODEX_VERSION="${CODEX_VERSION:-0.129.0}"

docker build \
  --build-arg "CODEX_VERSION=${CODEX_VERSION}" \
  -f "${ROOT_DIR}/evals/swe-bench-verified/docker/codex-swebench.Dockerfile" \
  -t "${IMAGE}" \
  "${ROOT_DIR}"

echo "Built ${IMAGE}"

