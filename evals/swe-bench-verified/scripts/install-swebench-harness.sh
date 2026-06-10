#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
CACHE_DIR="${SWE_BENCH_CACHE_DIR:-${ROOT_DIR}/evals/swe-bench-verified/.cache}"
SWE_BENCH_ROOT="${SWE_BENCH_ROOT:-${CACHE_DIR}/SWE-bench}"
VENV="${SWE_BENCH_VENV:-${CACHE_DIR}/venv}"

mkdir -p "${CACHE_DIR}"

if [ ! -d "${SWE_BENCH_ROOT}/.git" ]; then
  git clone https://github.com/SWE-bench/SWE-bench.git "${SWE_BENCH_ROOT}"
else
  git -C "${SWE_BENCH_ROOT}" pull --ff-only
fi

python3 -m venv "${VENV}"
"${VENV}/bin/pip" install --upgrade pip setuptools wheel
"${VENV}/bin/pip" install -e "${SWE_BENCH_ROOT}" datasets docker

echo "SWE-bench harness installed."
echo "Activate with: source ${VENV}/bin/activate"

