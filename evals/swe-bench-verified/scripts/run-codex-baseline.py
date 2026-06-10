#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tarfile
import time
from pathlib import Path


DEFAULT_DATASET = "SWE-bench/SWE-bench_Verified"
DEFAULT_SPLIT = "test"

CHAT_AGENT_PATH = Path(__file__).resolve().with_name("openai_chat_agent.py")
CHAT_AGENT_SPEC = importlib.util.spec_from_file_location("openai_chat_agent", CHAT_AGENT_PATH)
if CHAT_AGENT_SPEC is None or CHAT_AGENT_SPEC.loader is None:
    raise RuntimeError(f"Unable to load chat agent from {CHAT_AGENT_PATH}")
chat_agent = importlib.util.module_from_spec(CHAT_AGENT_SPEC)
CHAT_AGENT_SPEC.loader.exec_module(chat_agent)


def run(cmd: list[str], cwd: Path | None = None, timeout: int | None = None, env: dict[str, str] | None = None) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        cmd,
        cwd=str(cwd) if cwd else None,
        timeout=timeout,
        env=env,
        check=False,
        text=True,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
    )


def require_ok(result: subprocess.CompletedProcess[str], label: str) -> None:
    if result.returncode != 0:
        raise RuntimeError(f"{label} failed with exit {result.returncode}\n{result.stdout}")


def safe_instance_dir(instance_id: str) -> str:
    return instance_id.replace("/", "__").replace(":", "_")


def load_instances(dataset_name: str, split: str, instance_ids: list[str], limit: int | None, dataset_file: str | None = None) -> list[dict]:
    try:
        from datasets import load_dataset
    except Exception as exc:
        raise RuntimeError("Missing dependency: install datasets or run install-swebench-harness.sh") from exc

    if dataset_file:
        suffix = Path(dataset_file).suffix.lower()
        if suffix == ".parquet":
            dataset = load_dataset("parquet", data_files=dataset_file, split="train")
        elif suffix in {".json", ".jsonl"}:
            dataset = load_dataset("json", data_files=dataset_file, split="train")
        else:
            raise RuntimeError(f"Unsupported dataset file type: {dataset_file}")
    else:
        dataset = load_dataset(dataset_name, split=split)
    wanted = set(instance_ids)
    rows = [dict(row) for row in dataset if not wanted or row["instance_id"] in wanted]
    if wanted:
        found = {row["instance_id"] for row in rows}
        missing = wanted - found
        if missing:
            raise RuntimeError(f"Instance ids not found in {dataset_name}/{split}: {sorted(missing)}")
    if limit is not None:
        rows = rows[:limit]
    return rows


def checkout_repo(instance: dict, workspace: Path) -> Path:
    repo = instance["repo"]
    base_commit = instance["base_commit"]
    repo_dir = workspace / safe_instance_dir(instance["instance_id"]) / "repo"
    repo_dir.parent.mkdir(parents=True, exist_ok=True)

    if not (repo_dir / ".git").exists():
        clone_url = f"https://github.com/{repo}.git"
        last_result = None
        for attempt in range(1, 4):
            if repo_dir.exists():
                shutil.rmtree(repo_dir)
            repo_dir.parent.mkdir(parents=True, exist_ok=True)
            last_result = run(
                [
                    "git",
                    "clone",
                    "--filter=blob:none",
                    "--no-checkout",
                    clone_url,
                    str(repo_dir),
                ]
            )
            if last_result.returncode == 0:
                break
            time.sleep(attempt * 5)
        if last_result is None or last_result.returncode != 0:
            tarball_url = f"https://codeload.github.com/{repo}/tar.gz/{base_commit}"
            archive_path = repo_dir.parent / f"{base_commit}.tar.gz"
            extract_dir = repo_dir.parent / "extract"
            shutil.rmtree(repo_dir, ignore_errors=True)
            shutil.rmtree(extract_dir, ignore_errors=True)
            extract_dir.mkdir(parents=True, exist_ok=True)
            download = run(
                [
                    "curl",
                    "-L",
                    "--fail",
                    "--insecure",
                    "--retry",
                    "5",
                    "--retry-delay",
                    "2",
                    "--connect-timeout",
                    "30",
                    "--max-time",
                    "600",
                    "-o",
                    str(archive_path),
                    tarball_url,
                ]
            )
            require_ok(download, f"download tarball {repo}@{base_commit}")
            with tarfile.open(archive_path, "r:gz") as archive:
                archive.extractall(extract_dir)
            children = [item for item in extract_dir.iterdir() if item.is_dir()]
            if len(children) != 1:
                raise RuntimeError(f"Unexpected tarball layout for {repo}@{base_commit}: {children}")
            shutil.move(str(children[0]), str(repo_dir))
            require_ok(run(["git", "init"], cwd=repo_dir), "git init fallback repo")
            require_ok(run(["git", "config", "user.email", "swebench-eval@agentcraft.local"], cwd=repo_dir), "git config email")
            require_ok(run(["git", "config", "user.name", "AgentCraft SWE-bench Eval"], cwd=repo_dir), "git config name")
            require_ok(run(["git", "add", "."], cwd=repo_dir), "git add fallback repo")
            require_ok(run(["git", "commit", "-m", f"baseline {base_commit}"], cwd=repo_dir), "git commit fallback repo")
    else:
        require_ok(run(["git", "fetch", "--all", "--tags", "--prune"], cwd=repo_dir), f"fetch {repo}")

    if (repo_dir / ".git").exists() and run(["git", "cat-file", "-e", f"{base_commit}^{{commit}}"], cwd=repo_dir).returncode == 0:
        require_ok(run(["git", "checkout", "-f", base_commit], cwd=repo_dir), f"checkout {base_commit}")
    require_ok(run(["git", "clean", "-fdx"], cwd=repo_dir), "git clean")
    return repo_dir


def write_task_files(instance: dict, repo_dir: Path) -> Path:
    task_dir = repo_dir / ".swe-bench"
    task_dir.mkdir(exist_ok=True)
    task_path = task_dir / "task.md"
    metadata_path = task_dir / "metadata.json"
    task_path.write_text(
        "\n".join(
            [
                f"# {instance['instance_id']}",
                "",
                "## Problem Statement",
                "",
                instance.get("problem_statement") or "",
                "",
                "## Hints",
                "",
                instance.get("hints_text") or "",
            ]
        ),
        encoding="utf-8",
    )
    metadata_path.write_text(
        json.dumps(
            {
                "instance_id": instance["instance_id"],
                "repo": instance["repo"],
                "base_commit": instance["base_commit"],
                "version": instance.get("version"),
                "FAIL_TO_PASS": instance.get("FAIL_TO_PASS"),
                "PASS_TO_PASS": instance.get("PASS_TO_PASS"),
            },
            ensure_ascii=True,
            indent=2,
        ),
        encoding="utf-8",
    )
    return task_path


def build_prompt(instance: dict, task_path: Path) -> str:
    return f"""You are solving one SWE-bench Verified task.

Repository: {instance['repo']}
Instance: {instance['instance_id']}
Base commit: {instance['base_commit']}

The full task statement is available at {task_path}.

Instructions:
- Modify this repository to fix the issue.
- Do not commit changes.
- Keep the patch focused on the issue.
- Run relevant tests when practical.
- Leave the final answer concise; the evaluator will read the git diff.
"""


def collect_patch(repo_dir: Path) -> str:
    run(["git", "add", "-N", "."], cwd=repo_dir)
    diff = run(
        [
            "git",
            "diff",
            "--binary",
            "--",
            ".",
            ":(exclude).swe-bench",
            ":(exclude).agentcraft",
        ],
        cwd=repo_dir,
    )
    return diff.stdout


def run_codex(instance: dict, repo_dir: Path, task_path: Path, args: argparse.Namespace, log_dir: Path) -> dict:
    prompt = build_prompt(instance, task_path)
    last_message = log_dir / f"{instance['instance_id']}.last-message.txt"
    cmd = [
        args.codex_bin,
        "exec",
        "--model",
        args.model,
        "--cd",
        str(repo_dir),
        "--sandbox",
        "danger-full-access",
        "--ask-for-approval",
        "never",
        "--skip-git-repo-check",
        "--output-last-message",
        str(last_message),
    ]
    if args.codex_json:
        cmd.append("--json")
    cmd.append(prompt)

    started = time.time()
    result = run(cmd, timeout=args.timeout)
    elapsed = time.time() - started
    (log_dir / f"{instance['instance_id']}.codex.log").write_text(result.stdout, encoding="utf-8")

    patch = collect_patch(repo_dir)
    return {
        "instance_id": instance["instance_id"],
        "returncode": result.returncode,
        "elapsed_seconds": elapsed,
        "patch_bytes": len(patch.encode("utf-8")),
        "last_message_path": str(last_message),
        "log_path": str(log_dir / f"{instance['instance_id']}.codex.log"),
        "prediction": {
            "instance_id": instance["instance_id"],
            "model_name_or_path": f"codex-baseline:{args.model}",
            "model_patch": patch,
        },
    }


def run_openai_chat_agent(instance: dict, repo_dir: Path, task_path: Path, args: argparse.Namespace, log_dir: Path) -> dict:
    prompt = build_prompt(instance, task_path)
    log_path = log_dir / f"{instance['instance_id']}.openai-chat-agent.json"
    started = time.time()
    agent = chat_agent.OpenAIChatShellAgent.from_env_and_args(args)
    agent_result = agent.run(
        repo_dir=repo_dir,
        prompt=prompt,
        log_path=log_path,
        env_summary={
            "mode": "codex-baseline",
            "instance_id": instance["instance_id"],
            "api_url": agent.api_url,
            "model": agent.model,
        },
    )
    elapsed = time.time() - started
    last_message = log_dir / f"{instance['instance_id']}.last-message.txt"
    last_message.write_text(agent_result.get("final_message", ""), encoding="utf-8")
    patch = collect_patch(repo_dir)
    return {
        "instance_id": instance["instance_id"],
        "returncode": 0,
        "elapsed_seconds": elapsed,
        "patch_bytes": len(patch.encode("utf-8")),
        "api_calls": agent_result.get("api_calls"),
        "tool_calls": agent_result.get("tool_calls"),
        "token_usage": agent_result.get("token_usage"),
        "last_message_path": str(last_message),
        "log_path": str(log_path),
        "prediction": {
            "instance_id": instance["instance_id"],
            "model_name_or_path": f"codex-baseline:{args.model}",
            "model_patch": patch,
        },
    }


def read_instance_ids(path: str | None) -> list[str]:
    if not path:
        return []
    return [
        line.strip()
        for line in Path(path).read_text(encoding="utf-8").splitlines()
        if line.strip() and not line.strip().startswith("#")
    ]


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-name", default=DEFAULT_DATASET)
    parser.add_argument("--dataset-file")
    parser.add_argument("--split", default=DEFAULT_SPLIT)
    parser.add_argument("--instance-id", action="append", default=[])
    parser.add_argument("--instance-ids-file")
    parser.add_argument("--limit", type=int)
    parser.add_argument("--model", default=os.environ.get("MIMO_MODEL") or os.environ.get("CODEX_MODEL", "gpt-4o-mini"))
    parser.add_argument(
        "--agent-backend",
        choices=["codex-cli", "openai-chat"],
        default=os.environ.get("EVAL_AGENT_BACKEND", "openai-chat"),
    )
    parser.add_argument("--chat-api-url", default=os.environ.get("MIMO_API_URL") or os.environ.get("EVAL_OPENAI_API_URL"))
    parser.add_argument("--chat-api-key", default=os.environ.get("MIMO_API_KEY") or os.environ.get("EVAL_OPENAI_API_KEY"))
    parser.add_argument("--temperature", type=float, default=float(os.environ.get("EVAL_TEMPERATURE", "0.0")))
    parser.add_argument("--agent-max-turns", type=int, default=int(os.environ.get("EVAL_AGENT_MAX_TURNS", "40")))
    parser.add_argument("--agent-command-timeout", type=int, default=int(os.environ.get("EVAL_AGENT_COMMAND_TIMEOUT", "180")))
    parser.add_argument("--agent-command-output-limit", type=int, default=int(os.environ.get("EVAL_AGENT_COMMAND_OUTPUT_LIMIT", "20000")))
    parser.add_argument("--agent-request-timeout", type=int, default=int(os.environ.get("EVAL_AGENT_REQUEST_TIMEOUT", "600")))
    parser.add_argument("--insecure-tls", action="store_true", default=os.environ.get("EVAL_INSECURE_TLS", "").lower() in {"1", "true", "yes"})
    parser.add_argument("--codex-bin", default=os.environ.get("CODEX_BIN", shutil.which("codex") or "codex"))
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("CODEX_EVAL_TIMEOUT", "3600")))
    parser.add_argument("--output-dir", default="evals/swe-bench-verified/runs/codex-baseline")
    parser.add_argument("--workspace-dir")
    parser.add_argument("--codex-json", action="store_true")
    args = parser.parse_args()

    instance_ids = args.instance_id + read_instance_ids(args.instance_ids_file)
    output_dir = Path(args.output_dir).resolve()
    workspace = Path(args.workspace_dir).resolve() if args.workspace_dir else output_dir / "workspaces"
    log_dir = output_dir / "logs"
    output_dir.mkdir(parents=True, exist_ok=True)
    workspace.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    instances = load_instances(args.dataset_name, args.split, instance_ids, args.limit, args.dataset_file)
    predictions_path = output_dir / "predictions.jsonl"
    results_path = output_dir / "run-results.jsonl"
    predictions_path.write_text("", encoding="utf-8")
    results_path.write_text("", encoding="utf-8")

    for instance in instances:
        print(f"[codex-baseline] {instance['instance_id']}", flush=True)
        repo_dir = checkout_repo(instance, workspace)
        task_path = write_task_files(instance, repo_dir)
        if args.agent_backend == "openai-chat":
            result = run_openai_chat_agent(instance, repo_dir, task_path, args, log_dir)
        else:
            result = run_codex(instance, repo_dir, task_path, args, log_dir)
        with predictions_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps(result["prediction"], ensure_ascii=True) + "\n")
        with results_path.open("a", encoding="utf-8") as f:
            f.write(json.dumps({k: v for k, v in result.items() if k != "prediction"}, ensure_ascii=True) + "\n")

    print(f"Wrote {predictions_path}")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        raise
    except Exception as exc:
        print(f"ERROR: {exc}", file=sys.stderr)
        raise SystemExit(1)
