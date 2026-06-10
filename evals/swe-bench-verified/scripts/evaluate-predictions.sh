#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 2 ]; then
  echo "Usage: $0 <predictions.jsonl> <run_id> [instance_id ...]" >&2
  exit 2
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
PREDICTIONS_PATH="$1"
RUN_ID="$2"
shift 2

DATASET_NAME="${SWE_BENCH_DATASET_NAME:-SWE-bench/SWE-bench_Verified}"
SPLIT="${SWE_BENCH_SPLIT:-test}"
MAX_WORKERS="${SWE_BENCH_MAX_WORKERS:-1}"
TIMEOUT="${SWE_BENCH_TIMEOUT:-1800}"
REPORT_DIR="${SWE_BENCH_REPORT_DIR:-${ROOT_DIR}/evals/swe-bench-verified/runs/${RUN_ID}/harness-reports}"
VENV="${SWE_BENCH_VENV:-${ROOT_DIR}/evals/swe-bench-verified/.cache/venv}"

if [ -x "${VENV}/bin/python" ]; then
  PYTHON="${VENV}/bin/python"
else
  PYTHON="${PYTHON:-python3}"
fi

ARGS=(
  -m swebench.harness.run_evaluation
  --dataset_name "${DATASET_NAME}"
  --split "${SPLIT}"
  --predictions_path "${PREDICTIONS_PATH}"
  --max_workers "${MAX_WORKERS}"
  --timeout "${TIMEOUT}"
  --run_id "${RUN_ID}"
  --report_dir "${REPORT_DIR}"
)

if [ "$#" -gt 0 ]; then
  ARGS+=(--instance_ids "$@")
fi

"${PYTHON}" "${ARGS[@]}"
