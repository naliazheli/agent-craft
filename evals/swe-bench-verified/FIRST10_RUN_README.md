# SWE-bench Verified First-10 Run Notes

Date: 2026-05-09

This note records the first 10-instance smoke run for comparing a single-agent baseline with AgentCraft projects mode using the same OpenAI-compatible model endpoint.

## Model And Endpoint

- Model: `gpt-4o-mini`
- API style: OpenAI-compatible `POST /v1/chat/completions`
- Endpoint env: `MIMO_API_URL=https://api.openai.com/v1`
- Secret env: `MIMO_API_KEY`
- Agent backend: `openai-chat`

Do not commit the real token. Put it in `evals/swe-bench-verified/.env`, which is ignored by git.

## Test Data Preparation

Direct access to `huggingface.co` was unstable from this machine, so the dataset parquet was downloaded through the Hugging Face mirror API:

```bash
mkdir -p evals/swe-bench-verified/.cache/hf-data
curl -L --connect-timeout 10 --max-time 300 --retry 5 --retry-delay 2 \
  -o evals/swe-bench-verified/.cache/hf-data/swebench_verified_test.parquet \
  https://hf-mirror.com/datasets/SWE-bench/SWE-bench_Verified/resolve/main/data/test-00000-of-00001.parquet
```

The first 10 rows were extracted into:

- `evals/swe-bench-verified/instances/first10.txt`
- `evals/swe-bench-verified/.cache/hf-data/swebench_verified_first10.json`

Instances:

```text
astropy__astropy-12907
astropy__astropy-13033
astropy__astropy-13236
astropy__astropy-13398
astropy__astropy-13453
astropy__astropy-13579
astropy__astropy-13977
astropy__astropy-14096
astropy__astropy-14182
astropy__astropy-14309
```

## Test Launch

The runner image was already built:

```bash
evals/swe-bench-verified/scripts/build-codex-image.sh
```

Baseline patch generation:

```bash
docker run --rm \
  -v "$PWD:/workspace/agentcraft" \
  -w /workspace/agentcraft \
  -e MIMO_API_URL \
  -e MIMO_API_KEY \
  -e MIMO_MODEL=gpt-4o-mini \
  -e EVAL_AGENT_BACKEND=openai-chat \
  agentcraft/codex-swebench:local \
  bash -c 'python evals/swe-bench-verified/scripts/run-codex-baseline.py \
    --dataset-file evals/swe-bench-verified/.cache/hf-data/swebench_verified_test.parquet \
    --instance-ids-file evals/swe-bench-verified/instances/first10.txt \
    --model gpt-4o-mini \
    --agent-backend openai-chat \
    --agent-max-turns 25 \
    --agent-command-timeout 180 \
    --agent-request-timeout 900 \
    --timeout 3600 \
    --output-dir evals/swe-bench-verified/runs/first10-baseline'
```

AgentCraft projects-mode fixture:

```bash
MIMO_MODEL=gpt-4o-mini \
MIMO_API_URL=https://api.openai.com/v1 \
MIMO_API_KEY="$MIMO_API_KEY" \
node evals/swe-bench-verified/scripts/seed-agentcraft-fixture.mjs \
  --model gpt-4o-mini \
  --write evals/swe-bench-verified/runs/agentcraft-fixture.json
```

AgentCraft projects-mode patch generation:

```bash
docker run --rm \
  -v "$PWD:/workspace/agentcraft" \
  -w /workspace/agentcraft \
  --add-host host.docker.internal:host-gateway \
  -e AGENT_WORKSPACE_BASE_URL=http://host.docker.internal:3010 \
  -e AGENT_WORKSPACE_HOST_KEY=dev-agent-workspace-host-key \
  -e MIMO_API_URL \
  -e MIMO_API_KEY \
  -e MIMO_MODEL=gpt-4o-mini \
  -e EVAL_AGENT_BACKEND=openai-chat \
  agentcraft/codex-swebench:local \
  bash -c 'python evals/swe-bench-verified/scripts/run-agentcraft-projects.py \
    --dataset-file evals/swe-bench-verified/.cache/hf-data/swebench_verified_test.parquet \
    --instance-ids-file evals/swe-bench-verified/instances/first10.txt \
    --fixture-json evals/swe-bench-verified/runs/agentcraft-fixture.json \
    --model gpt-4o-mini \
    --agent-backend openai-chat \
    --agent-max-turns 25 \
    --agent-command-timeout 180 \
    --agent-request-timeout 900 \
    --planner-max-turns 8 \
    --reviewer-max-turns 3 \
    --retry-max-turns 12 \
    --retry-empty-patch \
    --project-file-mode auto \
    --timeout 3600 \
    --output-dir evals/swe-bench-verified/runs/first10-agentcraft'
```

The optimized projects-mode runner now performs:

1. Structured task packet creation.
2. Project shared-file write with local project-file mirror fallback.
3. Planner pass.
4. Project memory write.
5. Worker implementation pass.
6. Reviewer pass before writing `predictions.jsonl`.
7. One retry for empty or reviewer-rejected patches.
8. Per-instance API/tool/token telemetry in `run-results.jsonl`.

The projects-mode run was interrupted after 8 instances by a transient `curl` certificate issue while downloading a GitHub commit tarball. The runner was patched to use `curl --insecure` for the public tarball fallback, then the remaining two instances were run through `evals/swe-bench-verified/instances/remaining2.txt` and merged into:

- `evals/swe-bench-verified/runs/first10-agentcraft-combined/predictions.jsonl`

Official SWE-bench harness commands on x86_64 Linux:

```bash
docker run --rm \
  -v "$PWD:/workspace/agentcraft" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /workspace/agentcraft \
  agentcraft/codex-swebench:local \
  bash -c 'python -m swebench.harness.run_evaluation \
    --dataset_name evals/swe-bench-verified/.cache/hf-data/swebench_verified_first10.json \
    --split test \
    --predictions_path evals/swe-bench-verified/runs/first10-baseline/predictions.jsonl \
    --max_workers 2 \
    --timeout 1800 \
    --run_id first10-baseline \
    --report_dir evals/swe-bench-verified/runs/first10-baseline/harness-reports'
```

```bash
docker run --rm \
  -v "$PWD:/workspace/agentcraft" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /workspace/agentcraft \
  agentcraft/codex-swebench:local \
  bash -c 'python -m swebench.harness.run_evaluation \
    --dataset_name evals/swe-bench-verified/.cache/hf-data/swebench_verified_first10.json \
    --split test \
    --predictions_path evals/swe-bench-verified/runs/first10-agentcraft-combined/predictions.jsonl \
    --max_workers 2 \
    --timeout 1800 \
    --run_id first10-agentcraft \
    --report_dir evals/swe-bench-verified/runs/first10-agentcraft-combined/harness-reports'
```

Local Apple Silicon harness preparation:

This machine is Apple Silicon (`arm64/aarch64`). The upstream SWE-bench CLI defaults to `x86_64`, and Docker Hub access for official `swebench/sweb.eval.x86_64.*` images was unstable. For the local run, arm64 instance images were pulled from the Epoch mirror and retagged to the naming convention expected by the SWE-bench harness:

```bash
for id in $(cat evals/swe-bench-verified/instances/first10.txt); do
  src="ghcr.nju.edu.cn/epoch-research/swe-bench.eval.arm64.${id}:latest"
  dst="swebench/sweb.eval.arm64.${id/__/_1776_}:latest"
  docker pull "$src"
  docker tag "$src" "$dst"
done
```

Then the local wrapper `evals/swe-bench-verified/scripts/run-harness-with-arch.py` was used to force `arch=arm64` while keeping the upstream harness logic:

```bash
docker run --rm \
  -v "$PWD:/workspace/agentcraft" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /workspace/agentcraft \
  agentcraft/codex-swebench:local \
  bash -c 'python evals/swe-bench-verified/scripts/run-harness-with-arch.py \
    --dataset_name evals/swe-bench-verified/.cache/hf-data/swebench_verified_first10.json \
    --split test \
    --predictions_path evals/swe-bench-verified/runs/first10-baseline/predictions.jsonl \
    --max_workers 2 \
    --timeout 1800 \
    --run_id first10-baseline-arm64 \
    --namespace swebench \
    --arch arm64 \
    --cache_level instance \
    --report_dir evals/swe-bench-verified/harness-reports'
```

```bash
docker run --rm \
  -v "$PWD:/workspace/agentcraft" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -w /workspace/agentcraft \
  agentcraft/codex-swebench:local \
  bash -c 'python evals/swe-bench-verified/scripts/run-harness-with-arch.py \
    --dataset_name evals/swe-bench-verified/.cache/hf-data/swebench_verified_first10.json \
    --split test \
    --predictions_path evals/swe-bench-verified/runs/first10-agentcraft-combined/predictions.jsonl \
    --max_workers 2 \
    --timeout 1800 \
    --run_id first10-agentcraft-arm64 \
    --namespace swebench \
    --arch arm64 \
    --cache_level instance \
    --report_dir evals/swe-bench-verified/harness-reports'
```

## Patch Generation Results

Both sides generated 10 prediction rows.

| Instance | Baseline patch bytes | Projects patch bytes |
| --- | ---: | ---: |
| `astropy__astropy-12907` | 500 | 504 |
| `astropy__astropy-13033` | 1679 | 1487 |
| `astropy__astropy-13236` | 2411 | 0 |
| `astropy__astropy-13398` | 0 | 4229 |
| `astropy__astropy-13453` | 571 | 377 |
| `astropy__astropy-13579` | 1091 | 1122 |
| `astropy__astropy-13977` | 0 | 727 |
| `astropy__astropy-14096` | 768 | 0 |
| `astropy__astropy-14182` | 825 | 1035 |
| `astropy__astropy-14309` | 556 | 574 |

Non-empty patches:

- Baseline: 8/10
- AgentCraft projects mode: 8/10

## Official Harness Results

The first x86_64 attempt failed at the SWE-bench Docker image pull layer because this local network could not reliably reach Docker Hub:

| Run | Submitted | Empty patch | Completed | Resolved | Unresolved | Harness errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 10 | 2 | 0 | 0 | 0 | 8 |
| AgentCraft projects | 10 | 2 | 0 | 0 | 0 | 8 |

Report files:

- `codex-baseline:gpt-4o-mini.first10-baseline.json`
- `agentcraft-projects:gpt-4o-mini.first10-agentcraft.json`

Representative error:

```text
failed to resolve reference "docker.io/swebench/sweb.eval.x86_64.astropy_1776_astropy-12907:latest":
failed to do request:
Head "https://registry-1.docker.io/v2/swebench/.../manifests/latest":
i/o timeout
```

This means the current numeric score is not a meaningful model comparison. It is an environment failure caused by Docker Hub / DNS / network access to SWE-bench prebuilt images.

After switching the local Mac run to pre-pulled arm64 Epoch images, both harness runs completed with zero harness errors:

| Run | Submitted | Empty patch | Completed | Resolved | Unresolved | Harness errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 10 | 2 | 8 | 6 | 2 | 0 |
| AgentCraft projects | 10 | 2 | 8 | 4 | 4 | 0 |
| AgentCraft projects optimized | 10 | 2 | 8 | 6 | 2 | 0 |

Arm64 report files:

- `codex-baseline:gpt-4o-mini.first10-baseline-arm64.json`
- `agentcraft-projects:gpt-4o-mini.first10-agentcraft-arm64.json`
- `agentcraft-projects:gpt-4o-mini.first10-agentcraft-optimized-arm64.json`

Resolved IDs:

| Instance | Baseline | AgentCraft projects | AgentCraft optimized |
| --- | --- | --- | --- |
| `astropy__astropy-12907` | resolved | resolved | resolved |
| `astropy__astropy-13033` | unresolved | unresolved | unresolved |
| `astropy__astropy-13236` | resolved | empty patch | resolved |
| `astropy__astropy-13398` | empty patch | unresolved | unresolved |
| `astropy__astropy-13453` | resolved | unresolved | resolved |
| `astropy__astropy-13579` | resolved | resolved | resolved |
| `astropy__astropy-13977` | empty patch | unresolved | empty patch |
| `astropy__astropy-14096` | resolved | empty patch | empty patch |
| `astropy__astropy-14182` | unresolved | resolved | resolved |
| `astropy__astropy-14309` | resolved | resolved | resolved |

Optimized projects-mode generation artifacts:

- Predictions: `evals/swe-bench-verified/runs/first10-agentcraft-optimized-combined/predictions.jsonl`
- Run telemetry: `evals/swe-bench-verified/runs/first10-agentcraft-optimized-combined/run-results.jsonl`
- Total optimized projects-mode tokens: 1,740,531
- Total optimized projects-mode API calls: 192
- Total optimized projects-mode tool calls: 259
- Empty-patch retry fired for `13977` and `14096`; both stayed empty.

## Preliminary Conclusion

The end-to-end patch-generation and harness-scoring path is now runnable for both modes with the same `gpt-4o-mini` model.

On this first 10-instance `astropy` smoke subset, the optimized AgentCraft projects mode now ties the single-agent baseline:

- Baseline: 6/10 resolved, 2/10 empty patches.
- AgentCraft projects mode before optimization: 4/10 resolved, 2/10 empty patches.
- AgentCraft projects mode after optimization: 6/10 resolved, 2/10 empty patches.

Observed behavior:

- The optimization improved projects mode from 4/10 to 6/10 on the same first-10 subset.
- It recovered `13236` and `13453`, which were regressions in the first projects-mode run.
- It preserved the unique projects-mode win on `14182`.
- It still missed `14096`, which the baseline resolved.
- `13977` remained empty even after the empty-patch retry.
- Projects mode is now competitive on this smoke subset, but does not yet prove a consistent advantage over baseline.

## Mixed10 Follow-Up

Date: 2026-05-11

The stable mixed subset is:

- `evals/swe-bench-verified/instances/mixed10.txt`
- `evals/swe-bench-verified/.cache/hf-data/swebench_verified_mixed10.json`

The mixed subset contains one instance from each of 10 repos: `astropy`, `django`, `matplotlib`, `seaborn`, `flask`, `xarray`, `pylint`, `pytest`, `scikit-learn`, and `sphinx`.

Local notes:

- The mixed set required x86_64 SWE-bench images because Epoch arm64 images were not available for all repos.
- Images were pulled from `ghcr.nju.edu.cn/epoch-research/swe-bench.eval.x86_64.<instance>:latest` and retagged as `swebench/sweb.eval.x86_64.<instance>:latest`.
- The harness ran on Apple Silicon through x86 emulation, so wall-clock time is not representative of an x86_64 Linux runner.
- Docker Desktop ran out of space while pulling images; dangling images and build cache were pruned before continuing.
- The model endpoint required local insecure TLS mode for Python urllib on 2026-05-11 because the certificate chain triggered `EE certificate key too weak`. This is controlled by ignored local env vars `EVAL_INSECURE_TLS=true` and `MIMO_INSECURE_TLS=true`.

Mixed10 patch-generation summary:

| Run | Non-empty patches | Total tokens | API calls |
| --- | ---: | ---: | ---: |
| Baseline | 5/10 | 717,996 | 120 |
| AgentCraft projects optimized | 6/10 | 953,754 | 156 |

Mixed10 harness results:

| Run | Submitted | Empty patch | Completed | Resolved | Unresolved | Harness errors |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Baseline | 10 | 5 | 5 | 3 | 2 | 0 |
| AgentCraft projects optimized | 10 | 4 | 6 | 4 | 2 | 0 |

Mixed10 report files:

- `codex-baseline:gpt-4o-mini.mixed10-baseline-x86.json`
- `agentcraft-projects:gpt-4o-mini.mixed10-agentcraft-optimized-x86.json`

Mixed10 per-instance outcomes:

| Instance | Baseline | AgentCraft optimized |
| --- | --- | --- |
| `astropy__astropy-12907` | empty patch | empty patch |
| `django__django-10097` | empty patch | empty patch |
| `matplotlib__matplotlib-13989` | resolved | resolved |
| `mwaskom__seaborn-3069` | empty patch | empty patch |
| `pallets__flask-5014` | unresolved | resolved |
| `pydata__xarray-2905` | empty patch | resolved |
| `pylint-dev__pylint-4551` | empty patch | empty patch |
| `pytest-dev__pytest-10051` | unresolved | unresolved |
| `scikit-learn__scikit-learn-10297` | resolved | unresolved |
| `sphinx-doc__sphinx-10323` | resolved | resolved |

Mixed10 conclusion:

- Optimized projects mode scored 4/10 versus baseline 3/10 on the stable mixed10 subset.
- The gain came from producing and resolving non-empty patches for `flask-5014` and `xarray-2905`.
- The regression was `scikit-learn-10297`, where baseline resolved and projects mode did not.
- Projects mode used about 33% more tokens than baseline on this mixed subset.
- This is the first subset where optimized projects mode beats the single-agent baseline under the same model, but it is still a 10-instance smoke result and should be expanded to `mixed25`.

## AgentCraft Projects Optimization Items

1. [x] Add structured SWE-bench task packets to project shared files.
   Implemented in `run-agentcraft-projects.py` as `task-packet.json` and `task-packet.md`, including problem statement, repo metadata, target tests, failure-to-pass tests, prior analysis, and explicit patch output contract.

2. [x] Add a project memory step before solving.
   Implemented `.agentcraft/memory.json` plus `swe-bench/<instance>/memory.json` sync. The memory captures planner output, worker transcript summaries, explored files, failed commands, reviewer feedback, retry output, and token usage.

3. [x] Add planner-worker split.
   Implemented a planner pass with read-only instructions and a separate worker pass. Planner output is written to `.agentcraft/planner-output.md` and project shared files before the worker starts.

4. [x] Add reviewer pass before patch export.
   Implemented a reviewer pass over `git diff` before prediction export. Empty patches are rejected locally; non-empty patches receive an `APPROVE:` / `REJECT:` reviewer decision.

5. [x] Add per-instance retry policy.
   Implemented one retry for empty or reviewer-rejected patches with previous final message, reviewer feedback, planner output, task packet, and memory in the retry prompt.

6. [x] Improve local project-file integration.
   Added `--project-file-mode auto|remote|local`. Every project file now writes to a local `.agentcraft/project-files/` mirror and attempts Agent Workspace project-file sync in `auto` / `remote` mode. The sync manifest records whether the primary path was remote or local.

7. [x] Capture cost and token telemetry.
   `openai_chat_agent.py` now aggregates `prompt_tokens`, `completion_tokens`, and `total_tokens` from Chat Completions responses. Baseline and projects-mode `run-results.jsonl` include per-instance token usage, API calls, and tool calls.

8. [x] Use a stable benchmark subset.
   Added `make-stable-subset.py` and generated mixed subsets:
   `instances/mixed10.txt`, `instances/mixed25.txt`, `.cache/hf-data/swebench_verified_mixed10.json`, and `.cache/hf-data/swebench_verified_mixed25.json`.

## Next Round Plan

1. Keep the arm64 mirror path for local smoke tests.
   Use `run-harness-with-arch.py --arch arm64` plus pre-pulled Epoch images on Apple Silicon.

2. Add an x86_64 Linux runner for publishable scores.
   SWE-bench official leaderboard-style numbers should still be produced on a stable x86_64 Linux host with official images.

3. [x] Re-run optimized projects mode on the same 10 instances.
   Result: optimized projects mode improved from 4/10 to 6/10 and tied the saved baseline.

4. [x] Re-run the same 10 instances through arm64 harness.
   Harness result: `agentcraft-projects:gpt-4o-mini.first10-agentcraft-optimized-arm64.json`.

5. Expand to `mixed10.txt` and then `mixed25.txt`.
   `mixed10.txt` is complete: projects optimized scored 4/10 versus baseline 3/10. Next target is `mixed25.txt`.
