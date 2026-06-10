# AgentCraft SWE-bench Verified Evaluation

This folder contains the first runnable scaffold for comparing:

- `codex-baseline`: a single coding agent on the checked-out SWE-bench repository only.
- `agentcraft-projects`: the same model/backend, with an AgentCraft project fixture, project runtime grant, and project context injected before solving.

Both runners emit SWE-bench-compatible `predictions.jsonl` rows:

```json
{"instance_id":"astropy__astropy-12907","model_name_or_path":"codex-baseline:gpt-4o-mini","model_patch":"diff --git ..."}
```

The official SWE-bench harness is still the judge. These scripts only produce patches.

## Why This Shape

SWE-bench Verified is a 500-task, human-validated subset. Current SWE-bench docs show the Hugging Face dataset as `SWE-bench/SWE-bench_Verified`; the older `princeton-nlp/SWE-bench_Verified` mirror is still commonly referenced. The runners default to the current docs namespace and can be overridden with `--dataset-name`.

Codex does not appear to ship an official SWE-bench Verified runner. The reusable pieces are:

- Official SWE-bench harness for Docker-based evaluation.
- Codex CLI non-interactive mode: `codex exec`.
- OpenAI-compatible Chat Completions mode, used here for `gpt-4o-mini`.
- Agent frameworks such as SWE-agent or mini-swe-agent as design references if we later want richer agent loops.

## Files

- `docker/codex-swebench.Dockerfile`: local image with Node, Codex CLI, Python, Docker CLI, and SWE-bench dependencies.
- `scripts/build-codex-image.sh`: builds `agentcraft/codex-swebench:local`.
- `scripts/install-swebench-harness.sh`: installs/updates a local SWE-bench checkout in `.cache/SWE-bench`.
- `scripts/seed-agentcraft-fixture.mjs`: creates a deterministic local AgentCraft eval owner, agent user, project, work item, and assignment through Prisma.
- `scripts/run-codex-baseline.py`: produces baseline Codex patches.
- `scripts/run-agentcraft-projects.py`: produces Codex patches after creating/resuming an AgentCraft project runtime grant.
- `scripts/openai_chat_agent.py`: lightweight OpenAI-compatible shell-agent backend for `gpt-4o-mini`.
- `scripts/evaluate-predictions.sh`: runs official SWE-bench evaluation for a prediction file.
- `instances/smoke.txt`: one Verified instance for a smoke run.
- `REPORT.md`: initial evaluation report template.

## Prerequisites

1. Start local AgentCraft services:

```bash
./restart-local-docker.sh
```

2. Install the SWE-bench harness:

```bash
evals/swe-bench-verified/scripts/install-swebench-harness.sh
```

3. Build the Codex runner image:

```bash
evals/swe-bench-verified/scripts/build-codex-image.sh
```

4. Configure the model endpoint in an ignored local env file:

```bash
cp evals/swe-bench-verified/.env.example evals/swe-bench-verified/.env
# fill MIMO_API_KEY in evals/swe-bench-verified/.env
set -a
. evals/swe-bench-verified/.env
set +a
```

The default eval backend is `openai-chat`, which calls:

- `MIMO_API_URL=https://api.openai.com/v1`
- `MIMO_MODEL=gpt-4o-mini`

You can still use Codex CLI by passing `--agent-backend codex-cli`, but that requires Codex auth/config separately.

## Smoke Run

Run one Codex baseline patch:

```bash
python3 evals/swe-bench-verified/scripts/run-codex-baseline.py \
  --instance-ids-file evals/swe-bench-verified/instances/smoke.txt \
  --model gpt-4o-mini \
  --agent-backend openai-chat \
  --output-dir evals/swe-bench-verified/runs/smoke-baseline
```

Seed the local AgentCraft fixture:

```bash
node evals/swe-bench-verified/scripts/seed-agentcraft-fixture.mjs
```

Run one AgentCraft projects-mode patch:

```bash
python3 evals/swe-bench-verified/scripts/run-agentcraft-projects.py \
  --instance-ids-file evals/swe-bench-verified/instances/smoke.txt \
  --model gpt-4o-mini \
  --agent-backend openai-chat \
  --planner-max-turns 8 \
  --reviewer-max-turns 3 \
  --retry-max-turns 12 \
  --project-file-mode auto \
  --output-dir evals/swe-bench-verified/runs/smoke-agentcraft
```

Projects mode writes a structured task packet, local/remote project files, planner output, project memory, reviewer feedback, retry details, and token telemetry under each instance workspace and `run-results.jsonl`.

Evaluate either output with the official harness:

```bash
evals/swe-bench-verified/scripts/evaluate-predictions.sh \
  evals/swe-bench-verified/runs/smoke-baseline/predictions.jsonl \
  smoke-baseline \
  astropy__astropy-12907
```

## Docker Runner

The image is for reproducibility. Mount this repo and the Docker socket:

```bash
docker run --rm -it \
  -v "$PWD:/workspace/agentcraft" \
  -v /var/run/docker.sock:/var/run/docker.sock \
  -e OPENAI_API_KEY \
  -e MIMO_API_URL \
  -e MIMO_API_KEY \
  -e MIMO_MODEL \
  -e CODEX_HOME=/workspace/.codex-home \
  -w /workspace/agentcraft \
  agentcraft/codex-swebench:local \
  bash
```

Inside the container, run the same commands from the smoke section.

## Notes

- Full SWE-bench Verified is expensive. Keep `--instance-ids-file` for reproducible subsets before scaling.
- If Hugging Face is slow from the local network, retry later or pass `--dataset-name princeton-nlp/SWE-bench_Verified` to use the older mirror.
- Use the same `--model`, timeout, and instance list for all competitors.
- Keep generated patches and official harness reports under `runs/<run-id>/`.
- Project shared file APIs require local project storage credentials. If storage is not configured, `run-agentcraft-projects.py --project-file-mode auto` mirrors project files under `.agentcraft/project-files/` while still attempting Agent Workspace project-file sync.
- Use `scripts/make-stable-subset.py` to create mixed repo subsets such as `instances/mixed10.txt` and `instances/mixed25.txt`.
