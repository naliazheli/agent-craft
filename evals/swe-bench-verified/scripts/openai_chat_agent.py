#!/usr/bin/env python3
from __future__ import annotations

import json
import os
import ssl
import subprocess
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any


RUN_SHELL_TOOL = {
    "type": "function",
    "function": {
        "name": "run_shell",
        "description": "Run a shell command inside the repository. Use this to inspect files, edit code, and run tests.",
        "parameters": {
            "type": "object",
            "properties": {
                "command": {
                    "type": "string",
                    "description": "Shell command to run from the repository root.",
                },
                "timeout_seconds": {
                    "type": "integer",
                    "description": "Command timeout in seconds.",
                    "default": 120,
                },
            },
            "required": ["command"],
        },
    },
}


def truncate_output(text: str, limit: int) -> str:
    if len(text) <= limit:
        return text
    half = max(1, limit // 2)
    return text[:half] + "\n\n[... output truncated ...]\n\n" + text[-half:]


class OpenAIChatShellAgent:
    def __init__(
        self,
        *,
        api_url: str,
        api_key: str,
        model: str,
        temperature: float,
        max_turns: int,
        command_timeout: int,
        command_output_limit: int,
        request_timeout: int,
        extra_headers: dict[str, str] | None = None,
        insecure_tls: bool = False,
    ) -> None:
        self.api_url = api_url.rstrip("/")
        self.api_key = api_key
        self.model = model
        self.temperature = temperature
        self.max_turns = max_turns
        self.command_timeout = command_timeout
        self.command_output_limit = command_output_limit
        self.request_timeout = request_timeout
        self.extra_headers = extra_headers or {}
        self.insecure_tls = insecure_tls

    @classmethod
    def from_env_and_args(cls, args: Any) -> "OpenAIChatShellAgent":
        api_url = (
            getattr(args, "chat_api_url", None)
            or os.environ.get("MIMO_API_URL")
            or os.environ.get("EVAL_OPENAI_API_URL")
            or os.environ.get("OPENAI_BASE_URL")
            or "https://api.openai.com/v1"
        )
        api_key = (
            getattr(args, "chat_api_key", None)
            or os.environ.get("MIMO_API_KEY")
            or os.environ.get("EVAL_OPENAI_API_KEY")
            or os.environ.get("OPENAI_API_KEY")
            or ""
        )
        if not api_key:
            raise RuntimeError(
                "Missing API key. Set MIMO_API_KEY, EVAL_OPENAI_API_KEY, or OPENAI_API_KEY."
            )
        return cls(
            api_url=api_url,
            api_key=api_key,
            model=getattr(args, "model", None) or os.environ.get("MIMO_MODEL", "gpt-4o-mini"),
            temperature=float(getattr(args, "temperature", 0.0)),
            max_turns=int(getattr(args, "agent_max_turns", 40)),
            command_timeout=int(getattr(args, "agent_command_timeout", 180)),
            command_output_limit=int(getattr(args, "agent_command_output_limit", 20000)),
            request_timeout=int(getattr(args, "agent_request_timeout", 600)),
            extra_headers={
                "User-Agent": "AgentCraft-SWE-bench-Eval/0.1",
                "Accept": "*/*",
            },
            insecure_tls=(
                str(getattr(args, "insecure_tls", "") or "").lower() in {"1", "true", "yes"}
                or os.environ.get("EVAL_INSECURE_TLS", "").lower() in {"1", "true", "yes"}
                or os.environ.get("MIMO_INSECURE_TLS", "").lower() in {"1", "true", "yes"}
            ),
        )

    def request(self, messages: list[dict[str, Any]]) -> dict[str, Any]:
        payload = {
            "model": self.model,
            "messages": messages,
            "stream": False,
            "temperature": self.temperature,
            "tools": [RUN_SHELL_TOOL],
            "tool_choice": "auto",
        }
        data = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        request = urllib.request.Request(
            f"{self.api_url}/chat/completions",
            data=data,
            method="POST",
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
                **self.extra_headers,
            },
        )
        last_error: Exception | None = None
        for attempt in range(1, 4):
            try:
                context = ssl._create_unverified_context() if self.insecure_tls else None
                with urllib.request.urlopen(request, timeout=self.request_timeout, context=context) as response:
                    return json.loads(response.read().decode("utf-8"))
            except urllib.error.HTTPError as exc:
                body = exc.read().decode("utf-8", errors="replace")
                if 400 <= exc.code < 500 and exc.code not in {408, 409, 429}:
                    raise RuntimeError(f"Chat completion failed with HTTP {exc.code}: {body}") from exc
                last_error = RuntimeError(f"Chat completion failed with HTTP {exc.code}: {body}")
            except Exception as exc:
                last_error = exc
            if attempt < 3:
                time.sleep(attempt * 5)
        raise RuntimeError(f"Chat completion failed after retries: {last_error}")

    def run_shell(self, repo_dir: Path, command: str, timeout_seconds: int | None = None) -> dict[str, Any]:
        timeout = min(max(1, int(timeout_seconds or self.command_timeout)), self.command_timeout)
        started = time.time()
        try:
            result = subprocess.run(
                ["bash", "-lc", command],
                cwd=str(repo_dir),
                timeout=timeout,
                check=False,
                text=True,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
            )
            elapsed = time.time() - started
            return {
                "command": command,
                "exit_code": result.returncode,
                "elapsed_seconds": elapsed,
                "output": truncate_output(result.stdout, self.command_output_limit),
            }
        except subprocess.TimeoutExpired as exc:
            return {
                "command": command,
                "exit_code": 124,
                "elapsed_seconds": time.time() - started,
                "output": truncate_output((exc.stdout or "") + "\n[TIMEOUT]", self.command_output_limit),
            }

    def run(self, *, repo_dir: Path, prompt: str, log_path: Path, env_summary: dict[str, Any] | None = None) -> dict[str, Any]:
        system = (
            "You are an autonomous coding agent solving a SWE-bench Verified task. "
            "Use run_shell to inspect and edit the repository. "
            "Prefer small, targeted changes. Do not commit. "
            "When finished, respond with a short summary and stop calling tools."
        )
        messages: list[dict[str, Any]] = [
            {"role": "system", "content": system},
            {"role": "user", "content": prompt},
        ]
        transcript: list[dict[str, Any]] = [
            {"event": "start", "model": self.model, "api_url": self.api_url, "env": env_summary or {}}
        ]

        final_message = ""
        api_calls = 0
        tool_calls = 0
        token_usage = {
            "prompt_tokens": 0,
            "completion_tokens": 0,
            "total_tokens": 0,
        }
        for turn in range(1, self.max_turns + 1):
            api_calls += 1
            response = self.request(messages)
            usage = response.get("usage") or {}
            for key in token_usage:
                value = usage.get(key)
                if isinstance(value, int):
                    token_usage[key] += value
            choice = (response.get("choices") or [{}])[0]
            message = choice.get("message") or {}
            transcript.append({"event": "assistant", "turn": turn, "message": message, "usage": usage})
            messages.append(message)

            calls = message.get("tool_calls") or []
            if not calls:
                final_message = message.get("content") or ""
                break

            for call in calls:
                tool_calls += 1
                name = ((call.get("function") or {}).get("name") or "").strip()
                raw_args = (call.get("function") or {}).get("arguments") or "{}"
                try:
                    parsed = json.loads(raw_args)
                except json.JSONDecodeError:
                    parsed = {"command": raw_args}

                if name != "run_shell":
                    output = {"error": f"Unknown tool: {name}"}
                else:
                    output = self.run_shell(
                        repo_dir,
                        str(parsed.get("command", "")),
                        parsed.get("timeout_seconds"),
                    )

                transcript.append({"event": "tool", "turn": turn, "call": call, "output": output})
                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": call.get("id"),
                        "content": json.dumps(output, ensure_ascii=False),
                    }
                )
        else:
            final_message = f"Stopped after max_turns={self.max_turns}."

        log_path.write_text(json.dumps(transcript, ensure_ascii=False, indent=2), encoding="utf-8")
        return {
            "api_calls": api_calls,
            "tool_calls": tool_calls,
            "token_usage": token_usage,
            "final_message": final_message,
            "log_path": str(log_path),
        }
