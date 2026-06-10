#!/usr/bin/env python3
from __future__ import annotations

import argparse
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


BASELINE_PATH = Path(__file__).resolve().with_name("run-codex-baseline.py")
BASELINE_SPEC = importlib.util.spec_from_file_location("run_codex_baseline", BASELINE_PATH)
if BASELINE_SPEC is None or BASELINE_SPEC.loader is None:
    raise RuntimeError(f"Unable to load baseline runner from {BASELINE_PATH}")
baseline = importlib.util.module_from_spec(BASELINE_SPEC)
BASELINE_SPEC.loader.exec_module(baseline)


DEFAULT_SCOPES = [
    "PROJECT_READ_BASIC",
    "PROJECT_BOARD_READ",
    "PROJECT_MEMBER_READ",
    "PROJECT_FILE_READ",
    "PROJECT_FILE_WRITE",
    "THREAD_PARTICIPATE",
    "WORK_ITEM_UPDATE",
    "WORK_ITEM_STATUS_UPDATE",
    "ASSIGNMENT_DISPATCH",
    "REVIEW_SUBMIT",
    "PROPOSAL_CREATE",
]


def parse_json_field(value) -> list:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
            return parsed if isinstance(parsed, list) else []
        except json.JSONDecodeError:
            return []
    return []


def json_safe(value):
    try:
        json.dumps(value)
        return value
    except TypeError:
        return str(value)


def http_json(method: str, url: str, body: dict | None, headers: dict[str, str], timeout: int = 30) -> dict:
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    for key, value in headers.items():
        req.add_header(key, value)
    if body is not None:
        req.add_header("content-type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{method} {url} failed with {exc.code}: {detail}") from exc


def seed_fixture(args: argparse.Namespace) -> dict:
    script = Path(__file__).resolve().parent / "seed-agentcraft-fixture.mjs"
    cmd = ["node", str(script), "--model", args.model]
    if args.fixture_write:
        cmd.extend(["--write", args.fixture_write])
    result = subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, check=False)
    if result.returncode != 0:
        raise RuntimeError(f"Fixture seed failed:\n{result.stdout}")
    return json.loads(result.stdout)


def load_fixture(args: argparse.Namespace) -> dict:
    if args.fixture_json and Path(args.fixture_json).exists():
        return json.loads(Path(args.fixture_json).read_text(encoding="utf-8"))
    return seed_fixture(args)


def mint_runtime_token(args: argparse.Namespace, fixture: dict) -> dict:
    base_url = args.agent_workspace_base_url.rstrip("/")
    host_headers = {"x-agent-workspace-host-key": args.agent_workspace_host_key}
    runtime_id = args.runtime_id or f"agentcraft-swebench-{fixture['projectId'][:8]}"

    runtime = http_json(
        "POST",
        f"{base_url}/v1/runtimes/register",
        {
            "runtimeId": runtime_id,
            "memberId": fixture["workerMemberId"],
            "provider": "local",
            "framework": "codex",
            "model": args.model,
            "metadata": {
                "eval": "swe-bench-verified",
                "mode": "agentcraft-projects",
            },
        },
        host_headers,
    )
    grant = http_json(
        "POST",
        f"{base_url}/v1/projects/{fixture['projectId']}/access-grants",
        {
            "memberId": fixture["workerMemberId"],
            "runtimeId": runtime["runtimeId"],
            "scopes": DEFAULT_SCOPES,
            "reason": "SWE-bench Verified evaluation runner",
            "issuedByMemberId": fixture["leadMemberId"],
            "skillBundleRefs": ["agent-workspace"],
        },
        host_headers,
    )
    token = http_json(
        "POST",
        f"{base_url}/v1/access-grants/{grant['grantId']}/tokens",
        {},
        host_headers,
    )
    return {
        "runtimeId": runtime["runtimeId"],
        "grantId": grant["grantId"],
        "token": token["token"],
        "expiresIn": token["expiresIn"],
    }


def local_project_file_root(repo_dir: Path) -> Path:
    return repo_dir / ".agentcraft" / "project-files"


def write_local_project_file(repo_dir: Path, remote_path: str, content: str) -> Path:
    local_path = local_project_file_root(repo_dir) / remote_path
    local_path.parent.mkdir(parents=True, exist_ok=True)
    local_path.write_text(content, encoding="utf-8")
    return local_path


def try_write_project_file(args: argparse.Namespace, fixture: dict, runtime: dict, remote_path: str, content: str, repo_dir: Path | None = None) -> dict:
    local_path = None
    if repo_dir is not None:
        local_path = write_local_project_file(repo_dir, remote_path, content)
    if args.project_file_mode == "local":
        return {
            "path": remote_path,
            "primary": "local",
            "remoteWritten": False,
            "localPath": str(local_path) if local_path else None,
            "error": "",
        }

    headers = {"authorization": f"Bearer {runtime['token']}"}
    try:
        http_json(
            "POST",
            f"{args.agent_workspace_base_url.rstrip('/')}/v1/projects/{fixture['projectId']}/files/write",
            {
                "path": remote_path,
                "content": content,
                "encoding": "text",
                "contentType": "text/markdown; charset=utf-8" if remote_path.endswith(".md") else "application/json",
            },
            headers,
            timeout=60,
        )
        return {
            "path": remote_path,
            "primary": "remote",
            "remoteWritten": True,
            "localPath": str(local_path) if local_path else None,
            "error": "",
        }
    except Exception as exc:
        if args.project_file_mode == "remote":
            raise
        return {
            "path": remote_path,
            "primary": "local",
            "remoteWritten": False,
            "localPath": str(local_path) if local_path else None,
            "error": str(exc),
        }


def build_task_packet(instance: dict, fixture: dict, runtime: dict, previous_memory: dict | None = None) -> dict:
    fail_to_pass = parse_json_field(instance.get("FAIL_TO_PASS"))
    pass_to_pass = parse_json_field(instance.get("PASS_TO_PASS"))
    return {
        "schema": "agentcraft.swe_bench.task_packet.v1",
        "benchmark": "SWE-bench Verified",
        "instance": {
            "instance_id": instance["instance_id"],
            "repo": instance["repo"],
            "version": instance.get("version"),
            "base_commit": instance["base_commit"],
        },
        "project": {
            "projectId": fixture["projectId"],
            "projectSlug": fixture["projectSlug"],
            "workItemId": fixture["workItemId"],
            "assignmentId": fixture["assignmentId"],
            "workerMemberId": fixture["workerMemberId"],
            "runtimeId": runtime["runtimeId"],
        },
        "tests": {
            "FAIL_TO_PASS": fail_to_pass,
            "PASS_TO_PASS": pass_to_pass,
            "target_tests": fail_to_pass,
        },
        "problem_statement": instance.get("problem_statement") or "",
        "hints_text": instance.get("hints_text") or "",
        "prior_analysis": previous_memory or {},
        "patch_output_contract": {
            "format": "git diff --binary",
            "path": "predictions.jsonl",
            "rules": [
                "Modify only files needed to solve the issue.",
                "Do not include .swe-bench or .agentcraft files in the final patch.",
                "Return a non-empty patch unless the task is impossible.",
                "Run targeted tests when practical and record failures in project memory.",
            ],
        },
    }


def format_task_packet_markdown(packet: dict) -> str:
    instance = packet["instance"]
    return "\n".join(
        [
            f"# SWE-bench Task Packet: {instance['instance_id']}",
            "",
            "## Repository",
            "",
            f"- repo: `{instance['repo']}`",
            f"- version: `{instance.get('version')}`",
            f"- base_commit: `{instance['base_commit']}`",
            "",
            "## Target Tests",
            "",
            "```json",
            json.dumps(packet["tests"], indent=2, ensure_ascii=True),
            "```",
            "",
            "## Problem Statement",
            "",
            packet["problem_statement"],
            "",
            "## Hints",
            "",
            packet["hints_text"],
            "",
            "## Patch Output Contract",
            "",
            "```json",
            json.dumps(packet["patch_output_contract"], indent=2, ensure_ascii=True),
            "```",
        ]
    )


def extract_transcript_summary(log_path: Path) -> dict:
    if not log_path.exists():
        return {}
    try:
        transcript = json.loads(log_path.read_text(encoding="utf-8"))
    except Exception as exc:
        return {"error": f"Unable to read transcript: {exc}"}

    commands = []
    failed_commands = []
    explored_files = set()
    for event in transcript:
        if event.get("event") != "tool":
            continue
        output = event.get("output") or {}
        command = output.get("command") or ""
        if command:
            commands.append(
                {
                    "command": command,
                    "exit_code": output.get("exit_code"),
                    "elapsed_seconds": output.get("elapsed_seconds"),
                }
            )
            if output.get("exit_code") not in {0, None}:
                failed_commands.append(commands[-1])
            for token in command.replace("&&", " ").replace(";", " ").split():
                if "/" in token or token.endswith((".py", ".js", ".ts", ".tsx", ".md", ".rst", ".txt")):
                    cleaned = token.strip("'\"`:,")
                    if cleaned and not cleaned.startswith("-"):
                        explored_files.add(cleaned)

    return {
        "commands": commands[-20:],
        "failed_commands": failed_commands[-10:],
        "explored_files": sorted(explored_files)[:50],
    }


def write_project_memory(
    instance: dict,
    repo_dir: Path,
    fixture: dict,
    runtime: dict,
    args: argparse.Namespace,
    *,
    phase: str,
    plan_text: str | None = None,
    worker_result: dict | None = None,
    reviewer_result: dict | None = None,
    retry_result: dict | None = None,
) -> tuple[Path, dict]:
    memory = {
        "schema": "agentcraft.swe_bench.memory.v1",
        "instance_id": instance["instance_id"],
        "repo": instance["repo"],
        "phase": phase,
        "projectId": fixture["projectId"],
        "workItemId": fixture["workItemId"],
        "assignmentId": fixture["assignmentId"],
        "hypothesis_notes": [],
        "plan": plan_text or "",
        "worker": {},
        "reviewer": {},
        "retry": {},
    }
    if worker_result:
        memory["worker"] = {
            "patch_bytes": worker_result.get("patch_bytes"),
            "api_calls": worker_result.get("api_calls"),
            "tool_calls": worker_result.get("tool_calls"),
            "token_usage": worker_result.get("token_usage"),
            "transcript": extract_transcript_summary(Path(worker_result["log_path"])),
        }
    if reviewer_result:
        memory["reviewer"] = reviewer_result
    if retry_result:
        memory["retry"] = {
            "patch_bytes": retry_result.get("patch_bytes"),
            "api_calls": retry_result.get("api_calls"),
            "tool_calls": retry_result.get("tool_calls"),
            "token_usage": retry_result.get("token_usage"),
            "transcript": extract_transcript_summary(Path(retry_result["log_path"])),
        }

    remote_path = f"swe-bench/{instance['instance_id']}/memory.json"
    sync = try_write_project_file(
        args,
        fixture,
        runtime,
        remote_path,
        json.dumps(memory, indent=2, ensure_ascii=True),
        repo_dir,
    )
    memory["sync"] = sync
    memory_path = repo_dir / ".agentcraft" / "memory.json"
    memory_path.parent.mkdir(exist_ok=True)
    memory_path.write_text(json.dumps(memory, indent=2, ensure_ascii=True), encoding="utf-8")
    return memory_path, memory


def write_agentcraft_context(instance: dict, repo_dir: Path, fixture: dict, runtime: dict, args: argparse.Namespace, previous_memory: dict | None = None) -> tuple[Path, Path, dict]:
    context_dir = repo_dir / ".agentcraft"
    context_dir.mkdir(exist_ok=True)
    context_path = context_dir / "project-context.md"
    metadata = {
        "projectId": fixture["projectId"],
        "projectSlug": fixture["projectSlug"],
        "workItemId": fixture["workItemId"],
        "assignmentId": fixture["assignmentId"],
        "workerMemberId": fixture["workerMemberId"],
        "runtimeId": runtime["runtimeId"],
        "benchmark": "SWE-bench Verified",
        "instance_id": instance["instance_id"],
        "repo": instance["repo"],
        "base_commit": instance["base_commit"],
    }
    content = "\n".join(
        [
            f"# AgentCraft Project Context: {instance['instance_id']}",
            "",
            "## Project",
            "",
            json.dumps(metadata, indent=2, ensure_ascii=True),
            "",
            "## Problem Statement",
            "",
            instance.get("problem_statement") or "",
            "",
            "## Hints",
            "",
            instance.get("hints_text") or "",
        ]
    )
    context_path.write_text(content, encoding="utf-8")

    packet = build_task_packet(instance, fixture, runtime, previous_memory)
    packet_path = context_dir / "task-packet.json"
    packet_path.write_text(json.dumps(packet, indent=2, ensure_ascii=True), encoding="utf-8")
    packet_md_path = context_dir / "task-packet.md"
    packet_md_path.write_text(format_task_packet_markdown(packet), encoding="utf-8")

    remote_base = f"swe-bench/{instance['instance_id']}"
    syncs = [
        try_write_project_file(args, fixture, runtime, f"{remote_base}/task.md", content, repo_dir),
        try_write_project_file(
            args,
            fixture,
            runtime,
            f"{remote_base}/task-packet.json",
            json.dumps(packet, indent=2, ensure_ascii=True),
            repo_dir,
        ),
        try_write_project_file(
            args,
            fixture,
            runtime,
            f"{remote_base}/task-packet.md",
            format_task_packet_markdown(packet),
            repo_dir,
        ),
    ]
    syncs.append(try_write_project_file(
        args,
        fixture,
        runtime,
        f"{remote_base}/metadata.json",
        json.dumps(metadata, indent=2, ensure_ascii=True),
        repo_dir,
    ))
    status_path = context_dir / "project-file-sync.json"
    status_path.write_text(
        json.dumps(
            {
                "mode": args.project_file_mode,
                "syncs": syncs,
                "primary": "remote" if any(item.get("remoteWritten") for item in syncs) else "local",
            },
            indent=2,
            ensure_ascii=True,
        ),
        encoding="utf-8",
    )
    manifest = {
        "projectId": fixture["projectId"],
        "instance_id": instance["instance_id"],
        "files": syncs,
    }
    (local_project_file_root(repo_dir) / "manifest.json").parent.mkdir(parents=True, exist_ok=True)
    (local_project_file_root(repo_dir) / "manifest.json").write_text(json.dumps(manifest, indent=2, ensure_ascii=True), encoding="utf-8")
    return context_path, packet_path, packet


def build_planner_prompt(instance: dict, task_path: Path, context_path: Path, packet_path: Path, fixture: dict) -> str:
    return f"""You are the planner for one SWE-bench Verified task inside AgentCraft projects mode.

Repository: {instance['repo']}
Instance: {instance['instance_id']}
Base commit: {instance['base_commit']}

Read-only inputs:
- SWE-bench task statement: {task_path}
- AgentCraft project context: {context_path}
- Structured task packet: {packet_path}

Planning rules:
- Do not edit files.
- Use only read-only shell commands such as rg, sed, ls, find, git show, git grep, and python one-liners that inspect state.
- Produce a concise implementation plan, suspected modules/files, target tests, and known risks.
- Note any commands that failed or information still missing.
"""


def build_agentcraft_prompt(instance: dict, task_path: Path, context_path: Path, packet_path: Path, memory_path: Path, plan_path: Path, fixture: dict) -> str:
    return f"""You are solving one SWE-bench Verified task inside AgentCraft projects mode.

Repository: {instance['repo']}
Instance: {instance['instance_id']}
Base commit: {instance['base_commit']}

Local SWE-bench task statement: {task_path}
AgentCraft project context: {context_path}
Structured task packet: {packet_path}
Project memory: {memory_path}
Planner output: {plan_path}

AgentCraft project ids:
- projectId: {fixture['projectId']}
- workItemId: {fixture['workItemId']}
- assignmentId: {fixture['assignmentId']}

You have AGENT_WORKSPACE_* environment variables for the project runtime grant.
If the project file API is reachable, prefer reading project context from:
- swe-bench/{instance['instance_id']}/task.md
- swe-bench/{instance['instance_id']}/metadata.json
- swe-bench/{instance['instance_id']}/task-packet.json
- swe-bench/{instance['instance_id']}/memory.json

Instructions:
- Use the project context as the durable source of assignment metadata.
- Start from the planner output and project memory before searching broadly.
- Modify this repository to fix the issue.
- Do not commit changes.
- Keep the patch focused on the issue.
- Run relevant tests when practical.
- Record important findings in `.agentcraft/memory.json` if they would help a retry or reviewer.
- Leave the final answer concise; the evaluator will read the git diff.
"""


def run_planner(instance: dict, repo_dir: Path, task_path: Path, context_path: Path, packet_path: Path, fixture: dict, runtime: dict, args: argparse.Namespace, log_dir: Path) -> dict:
    prompt = build_planner_prompt(instance, task_path, context_path, packet_path, fixture)
    agent = baseline.chat_agent.OpenAIChatShellAgent.from_env_and_args(args)
    agent.max_turns = args.planner_max_turns
    log_path = log_dir / f"{instance['instance_id']}.planner.json"
    started = time.time()
    agent_result = agent.run(
        repo_dir=repo_dir,
        prompt=prompt,
        log_path=log_path,
        env_summary={
            "mode": "agentcraft-projects-planner",
            "projectId": fixture["projectId"],
            "runtimeId": runtime["runtimeId"],
            "instance_id": instance["instance_id"],
            "api_url": agent.api_url,
            "model": agent.model,
        },
    )
    elapsed = time.time() - started
    plan_path = repo_dir / ".agentcraft" / "planner-output.md"
    plan_path.parent.mkdir(exist_ok=True)
    plan_path.write_text(agent_result.get("final_message", ""), encoding="utf-8")
    try_write_project_file(
        args,
        fixture,
        runtime,
        f"swe-bench/{instance['instance_id']}/planner-output.md",
        agent_result.get("final_message", ""),
        repo_dir,
    )
    return {
        "elapsed_seconds": elapsed,
        "api_calls": agent_result.get("api_calls"),
        "tool_calls": agent_result.get("tool_calls"),
        "token_usage": agent_result.get("token_usage"),
        "final_message": agent_result.get("final_message", ""),
        "log_path": str(log_path),
        "plan_path": str(plan_path),
    }


def build_review_prompt(instance: dict, patch: str, memory_path: Path) -> str:
    truncated_patch = patch
    if len(truncated_patch) > 24000:
        truncated_patch = truncated_patch[:12000] + "\n\n[... diff truncated ...]\n\n" + truncated_patch[-12000:]
    return f"""Review this SWE-bench patch before it is exported.

Instance: {instance['instance_id']}
Repo: {instance['repo']}
Project memory: {memory_path}

Review checklist:
- Is the patch empty or effectively a no-op?
- Does it touch only relevant files?
- Does it appear to address the problem statement?
- Which targeted tests should be run next?
- Return one line starting with `APPROVE:` or `REJECT:` followed by a concise reason.

Patch:
```diff
{truncated_patch}
```
"""


def run_reviewer(instance: dict, repo_dir: Path, patch: str, memory_path: Path, fixture: dict, runtime: dict, args: argparse.Namespace, log_dir: Path) -> dict:
    if not patch.strip():
        return {
            "approved": False,
            "reason": "empty patch",
            "api_calls": 0,
            "tool_calls": 0,
            "token_usage": {},
            "log_path": "",
            "final_message": "REJECT: empty patch",
        }
    agent = baseline.chat_agent.OpenAIChatShellAgent.from_env_and_args(args)
    agent.max_turns = args.reviewer_max_turns
    log_path = log_dir / f"{instance['instance_id']}.reviewer.json"
    agent_result = agent.run(
        repo_dir=repo_dir,
        prompt=build_review_prompt(instance, patch, memory_path),
        log_path=log_path,
        env_summary={
            "mode": "agentcraft-projects-reviewer",
            "projectId": fixture["projectId"],
            "runtimeId": runtime["runtimeId"],
            "instance_id": instance["instance_id"],
            "api_url": agent.api_url,
            "model": agent.model,
        },
    )
    final_message = (agent_result.get("final_message") or "").strip()
    approved = final_message.upper().startswith("APPROVE:")
    return {
        "approved": approved,
        "reason": final_message,
        "api_calls": agent_result.get("api_calls"),
        "tool_calls": agent_result.get("tool_calls"),
        "token_usage": agent_result.get("token_usage"),
        "log_path": str(log_path),
        "final_message": final_message,
    }


def build_retry_prompt(instance: dict, task_path: Path, context_path: Path, packet_path: Path, memory_path: Path, plan_path: Path, previous_message: str, reviewer_message: str) -> str:
    return f"""Retry this SWE-bench Verified task because the previous attempt produced an empty or rejected patch.

Instance: {instance['instance_id']}
Repo: {instance['repo']}
Task: {task_path}
Project context: {context_path}
Task packet: {packet_path}
Project memory: {memory_path}
Planner output: {plan_path}

Previous final message:
{previous_message}

Reviewer feedback:
{reviewer_message}

Retry instructions:
- Produce a minimal patch or explain impossibility in `.agentcraft/memory.json`.
- Before giving up, inspect the suspected files from the planner output.
- Run at least one targeted test or import check when practical.
- Do not commit changes.
"""


def aggregate_usage(*items: dict | None) -> dict:
    total = {"api_calls": 0, "tool_calls": 0, "prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0}
    for item in items:
        if not item:
            continue
        total["api_calls"] += int(item.get("api_calls") or 0)
        total["tool_calls"] += int(item.get("tool_calls") or 0)
        usage = item.get("token_usage") or {}
        for key in ["prompt_tokens", "completion_tokens", "total_tokens"]:
            total[key] += int(usage.get(key) or 0)
    return total


def run_agentcraft_codex(instance: dict, repo_dir: Path, task_path: Path, context_path: Path, packet_path: Path, memory_path: Path, plan_path: Path, fixture: dict, runtime: dict, args: argparse.Namespace, log_dir: Path) -> dict:
    prompt = build_agentcraft_prompt(instance, task_path, context_path, packet_path, memory_path, plan_path, fixture)
    last_message = log_dir / f"{instance['instance_id']}.last-message.txt"
    env = os.environ.copy()
    env.update(
        {
            "AGENT_WORKSPACE_BASE_URL": args.agent_workspace_base_url,
            "AGENT_WORKSPACE_TOKEN": runtime["token"],
            "AGENT_WORKSPACE_PROJECT_ID": fixture["projectId"],
            "AGENT_WORKSPACE_RUNTIME_ID": runtime["runtimeId"],
            "AGENT_WORKSPACE_MEMBER_ID": fixture["workerMemberId"],
            "AGENTCRAFT_PROJECT_WORK_ITEM_ID": fixture["workItemId"],
            "AGENTCRAFT_PROJECT_ASSIGNMENT_ID": fixture["assignmentId"],
        }
    )

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
        "--config",
        "shell_environment_policy.inherit=\"all\"",
        "--output-last-message",
        str(last_message),
        prompt,
    ]

    started = time.time()
    result = baseline.run(cmd, timeout=args.timeout, env=env)
    elapsed = time.time() - started
    (log_dir / f"{instance['instance_id']}.codex.log").write_text(result.stdout, encoding="utf-8")
    patch = baseline.collect_patch(repo_dir)
    return {
        "instance_id": instance["instance_id"],
        "returncode": result.returncode,
        "elapsed_seconds": elapsed,
        "patch_bytes": len(patch.encode("utf-8")),
        "runtimeId": runtime["runtimeId"],
        "grantId": runtime["grantId"],
        "last_message_path": str(last_message),
        "log_path": str(log_dir / f"{instance['instance_id']}.codex.log"),
        "prediction": {
            "instance_id": instance["instance_id"],
            "model_name_or_path": f"agentcraft-projects:{args.model}",
            "model_patch": patch,
        },
    }


def run_agentcraft_openai_chat(instance: dict, repo_dir: Path, task_path: Path, context_path: Path, fixture: dict, runtime: dict, args: argparse.Namespace, log_dir: Path) -> dict:
    # Kept for backward compatibility; the main runner uses run_agentcraft_openai_chat_with_review.
    prompt = build_agentcraft_prompt(instance, task_path, context_path, context_path, context_path, context_path, fixture)
    env_summary = {
        "mode": "agentcraft-projects",
        "projectId": fixture["projectId"],
        "workItemId": fixture["workItemId"],
        "assignmentId": fixture["assignmentId"],
        "runtimeId": runtime["runtimeId"],
        "instance_id": instance["instance_id"],
    }
    agent = baseline.chat_agent.OpenAIChatShellAgent.from_env_and_args(args)
    log_path = log_dir / f"{instance['instance_id']}.openai-chat-agent.json"
    started = time.time()
    agent_result = agent.run(
        repo_dir=repo_dir,
        prompt=prompt,
        log_path=log_path,
        env_summary={**env_summary, "api_url": agent.api_url, "model": agent.model},
    )
    elapsed = time.time() - started
    last_message = log_dir / f"{instance['instance_id']}.last-message.txt"
    last_message.write_text(agent_result.get("final_message", ""), encoding="utf-8")
    patch = baseline.collect_patch(repo_dir)
    return {
        "instance_id": instance["instance_id"],
        "returncode": 0,
        "elapsed_seconds": elapsed,
        "patch_bytes": len(patch.encode("utf-8")),
        "api_calls": agent_result.get("api_calls"),
        "tool_calls": agent_result.get("tool_calls"),
        "runtimeId": runtime["runtimeId"],
        "grantId": runtime["grantId"],
        "last_message_path": str(last_message),
        "log_path": str(log_path),
        "prediction": {
            "instance_id": instance["instance_id"],
            "model_name_or_path": f"agentcraft-projects:{args.model}",
            "model_patch": patch,
        },
    }


def run_agentcraft_openai_chat_with_review(
    instance: dict,
    repo_dir: Path,
    task_path: Path,
    context_path: Path,
    packet_path: Path,
    memory_path: Path,
    plan_path: Path,
    fixture: dict,
    runtime: dict,
    args: argparse.Namespace,
    log_dir: Path,
    planner_result: dict,
) -> dict:
    prompt = build_agentcraft_prompt(instance, task_path, context_path, packet_path, memory_path, plan_path, fixture)
    env_summary = {
        "mode": "agentcraft-projects-worker",
        "projectId": fixture["projectId"],
        "workItemId": fixture["workItemId"],
        "assignmentId": fixture["assignmentId"],
        "runtimeId": runtime["runtimeId"],
        "instance_id": instance["instance_id"],
    }
    agent = baseline.chat_agent.OpenAIChatShellAgent.from_env_and_args(args)
    log_path = log_dir / f"{instance['instance_id']}.worker.json"
    started = time.time()
    agent_result = agent.run(
        repo_dir=repo_dir,
        prompt=prompt,
        log_path=log_path,
        env_summary={**env_summary, "api_url": agent.api_url, "model": agent.model},
    )
    worker_elapsed = time.time() - started
    last_message = log_dir / f"{instance['instance_id']}.last-message.txt"
    last_message.write_text(agent_result.get("final_message", ""), encoding="utf-8")
    patch = baseline.collect_patch(repo_dir)

    worker_result = {
        "patch_bytes": len(patch.encode("utf-8")),
        "api_calls": agent_result.get("api_calls"),
        "tool_calls": agent_result.get("tool_calls"),
        "token_usage": agent_result.get("token_usage"),
        "log_path": str(log_path),
        "final_message": agent_result.get("final_message", ""),
    }
    reviewer_result = run_reviewer(instance, repo_dir, patch, memory_path, fixture, runtime, args, log_dir)
    retry_result = None

    needs_retry = (args.retry_empty_patch and not patch.strip()) or (
        args.retry_rejected_patch and patch.strip() and not reviewer_result.get("approved")
    )
    if needs_retry:
        retry_agent = baseline.chat_agent.OpenAIChatShellAgent.from_env_and_args(args)
        retry_agent.max_turns = args.retry_max_turns
        retry_log_path = log_dir / f"{instance['instance_id']}.retry.json"
        retry_started = time.time()
        retry_agent_result = retry_agent.run(
            repo_dir=repo_dir,
            prompt=build_retry_prompt(
                instance,
                task_path,
                context_path,
                packet_path,
                memory_path,
                plan_path,
                agent_result.get("final_message", ""),
                reviewer_result.get("final_message", ""),
            ),
            log_path=retry_log_path,
            env_summary={**env_summary, "mode": "agentcraft-projects-retry", "api_url": retry_agent.api_url, "model": retry_agent.model},
        )
        retry_elapsed = time.time() - retry_started
        retry_patch = baseline.collect_patch(repo_dir)
        retry_result = {
            "elapsed_seconds": retry_elapsed,
            "patch_bytes": len(retry_patch.encode("utf-8")),
            "api_calls": retry_agent_result.get("api_calls"),
            "tool_calls": retry_agent_result.get("tool_calls"),
            "token_usage": retry_agent_result.get("token_usage"),
            "log_path": str(retry_log_path),
            "final_message": retry_agent_result.get("final_message", ""),
        }
        if retry_patch.strip():
            patch = retry_patch
            last_message.write_text(retry_agent_result.get("final_message", ""), encoding="utf-8")
            reviewer_result = run_reviewer(instance, repo_dir, patch, memory_path, fixture, runtime, args, log_dir)

    usage = aggregate_usage(planner_result, worker_result, reviewer_result, retry_result)
    elapsed = worker_elapsed + float(planner_result.get("elapsed_seconds") or 0)
    if retry_result:
        elapsed += float(retry_result.get("elapsed_seconds") or 0)

    final_worker_result = {
        "instance_id": instance["instance_id"],
        "returncode": 0,
        "elapsed_seconds": elapsed,
        "patch_bytes": len(patch.encode("utf-8")),
        "api_calls": usage["api_calls"],
        "tool_calls": usage["tool_calls"],
        "token_usage": {
            "prompt_tokens": usage["prompt_tokens"],
            "completion_tokens": usage["completion_tokens"],
            "total_tokens": usage["total_tokens"],
        },
        "planner": planner_result,
        "reviewer": reviewer_result,
        "retry": retry_result,
        "runtimeId": runtime["runtimeId"],
        "grantId": runtime["grantId"],
        "last_message_path": str(last_message),
        "log_path": str(log_path),
        "prediction": {
            "instance_id": instance["instance_id"],
            "model_name_or_path": f"agentcraft-projects:{args.model}",
            "model_patch": patch,
        },
    }
    return final_worker_result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--dataset-name", default=baseline.DEFAULT_DATASET)
    parser.add_argument("--dataset-file")
    parser.add_argument("--split", default=baseline.DEFAULT_SPLIT)
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
    parser.add_argument("--planner-max-turns", type=int, default=int(os.environ.get("EVAL_PLANNER_MAX_TURNS", "8")))
    parser.add_argument("--reviewer-max-turns", type=int, default=int(os.environ.get("EVAL_REVIEWER_MAX_TURNS", "3")))
    parser.add_argument("--retry-max-turns", type=int, default=int(os.environ.get("EVAL_RETRY_MAX_TURNS", "12")))
    parser.add_argument("--retry-empty-patch", action=argparse.BooleanOptionalAction, default=os.environ.get("EVAL_RETRY_EMPTY_PATCH", "true").lower() != "false")
    parser.add_argument("--retry-rejected-patch", action=argparse.BooleanOptionalAction, default=os.environ.get("EVAL_RETRY_REJECTED_PATCH", "false").lower() == "true")
    parser.add_argument("--project-file-mode", choices=["auto", "remote", "local"], default=os.environ.get("EVAL_PROJECT_FILE_MODE", "auto"))
    parser.add_argument("--codex-bin", default=os.environ.get("CODEX_BIN", shutil.which("codex") or "codex"))
    parser.add_argument("--timeout", type=int, default=int(os.environ.get("CODEX_EVAL_TIMEOUT", "3600")))
    parser.add_argument("--output-dir", default="evals/swe-bench-verified/runs/agentcraft-projects")
    parser.add_argument("--workspace-dir")
    parser.add_argument("--fixture-json", default="evals/swe-bench-verified/runs/agentcraft-fixture.json")
    parser.add_argument("--fixture-write", default="evals/swe-bench-verified/runs/agentcraft-fixture.json")
    parser.add_argument("--agent-workspace-base-url", default=os.environ.get("AGENT_WORKSPACE_BASE_URL", "http://localhost:3010"))
    parser.add_argument("--agent-workspace-host-key", default=os.environ.get("AGENT_WORKSPACE_HOST_KEY", "dev-agent-workspace-host-key"))
    parser.add_argument("--runtime-id")
    args = parser.parse_args()

    instance_ids = args.instance_id + baseline.read_instance_ids(args.instance_ids_file)
    output_dir = Path(args.output_dir).resolve()
    workspace = Path(args.workspace_dir).resolve() if args.workspace_dir else output_dir / "workspaces"
    log_dir = output_dir / "logs"
    output_dir.mkdir(parents=True, exist_ok=True)
    workspace.mkdir(parents=True, exist_ok=True)
    log_dir.mkdir(parents=True, exist_ok=True)

    fixture = load_fixture(args)
    runtime = mint_runtime_token(args, fixture)
    instances = baseline.load_instances(args.dataset_name, args.split, instance_ids, args.limit, args.dataset_file)

    predictions_path = output_dir / "predictions.jsonl"
    results_path = output_dir / "run-results.jsonl"
    predictions_path.write_text("", encoding="utf-8")
    results_path.write_text("", encoding="utf-8")

    for instance in instances:
        print(f"[agentcraft-projects] {instance['instance_id']}", flush=True)
        repo_dir = baseline.checkout_repo(instance, workspace)
        task_path = baseline.write_task_files(instance, repo_dir)
        context_path, packet_path, _packet = write_agentcraft_context(instance, repo_dir, fixture, runtime, args)
        initial_memory_path, _initial_memory = write_project_memory(
            instance,
            repo_dir,
            fixture,
            runtime,
            args,
            phase="initialized",
        )
        planner_result = run_planner(instance, repo_dir, task_path, context_path, packet_path, fixture, runtime, args, log_dir)
        memory_path, _memory = write_project_memory(
            instance,
            repo_dir,
            fixture,
            runtime,
            args,
            phase="planned",
            plan_text=planner_result.get("final_message", ""),
        )
        plan_path = Path(planner_result["plan_path"])
        if args.agent_backend == "openai-chat":
            result = run_agentcraft_openai_chat_with_review(
                instance,
                repo_dir,
                task_path,
                context_path,
                packet_path,
                memory_path,
                plan_path,
                fixture,
                runtime,
                args,
                log_dir,
                planner_result,
            )
        else:
            result = run_agentcraft_codex(instance, repo_dir, task_path, context_path, packet_path, memory_path, plan_path, fixture, runtime, args, log_dir)
        write_project_memory(
            instance,
            repo_dir,
            fixture,
            runtime,
            args,
            phase="completed",
            plan_text=planner_result.get("final_message", ""),
            worker_result=result,
            reviewer_result=result.get("reviewer"),
            retry_result=result.get("retry"),
        )
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
