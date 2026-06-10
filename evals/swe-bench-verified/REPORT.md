# SWE-bench Verified Evaluation Report

Status: scaffolded; local fixture and Codex runner image verified; benchmark patch generation not yet run.

Date: 2026-05-08

## Goal

Show whether AgentCraft `projects` mode improves the score of the same underlying model compared with:

- the raw model / minimal scaffold,
- a single Codex CLI agent,
- a single Claude Code agent in a later run.

The first milestone is a one-instance SWE-bench Verified smoke test.

## Benchmark

Primary benchmark: `SWE-bench/SWE-bench_Verified`, split `test`.

Smoke instance:

- `astropy__astropy-12907`

Judge:

- Official SWE-bench Docker harness.

## Current Harness Design

The runners produce `predictions.jsonl` with `instance_id`, `model_name_or_path`, and `model_patch`.

The official SWE-bench harness evaluates the generated patch independently. This keeps AgentCraft orchestration separate from scoring.

## Experiment Matrix

| Run | Model | Agent shell | AgentCraft project context | Status |
| --- | --- | --- | --- | --- |
| `codex-baseline` | `gpt-4o-mini` | OpenAI-compatible shell agent | no | planned |
| `agentcraft-projects` | `gpt-4o-mini` | OpenAI-compatible shell agent | yes | planned |
| `claude-code-baseline` | TBD | Claude Code | no | later |

## Local Setup Verification

- Local AgentCraft Docker services were running on ports 3000, 3001, 3010, 3306, 6379, and 80.
- Prisma fixture seed succeeded for `swebench.owner@agentcraft.local`; project slug: `agentcraft-swebench-eval`.
- Codex SWE-bench image built successfully: `agentcraft/codex-swebench:local`.
- Image smoke check succeeded for `codex-cli 0.129.0` and `swebench.harness.run_evaluation --help`.
- Eval runners default to `gpt-4o-mini` through the OpenAI-compatible endpoint configured by `MIMO_API_URL` and `MIMO_API_KEY`.
- Hugging Face dataset load check timed out from the current network before confirming `astropy__astropy-12907`; retry from a better network path before the first real run.

## Success Metrics

- `resolved`: official SWE-bench per-instance result.
- `pass@1`: solved instances / attempted instances.
- Patch generation wall time.
- Evaluation wall time.
- Token/cost metrics, when provider telemetry is available.
- Qualitative delta: cases solved only by project mode.

## Known Gaps

- The first AgentCraft runner injects project context and runtime credentials, but it does not yet force Codex to communicate only through AgentCraft APIs.
- Project shared files need local object storage credentials. Without them, the runner falls back to a local context file.
- Claude Code baseline is not implemented yet.
- Full Verified runs need sharding, retry policy, cost guardrails, and a fixed instance subset manifest.

## Next Steps

1. Run `codex-baseline` on the smoke instance.
2. Run `agentcraft-projects` on the same instance with the same model and timeout.
3. Evaluate both prediction files through the official harness.
4. Record the official report JSON paths and outcome table here.
5. Add a 10-instance stable subset before expanding to all 500 tasks.
