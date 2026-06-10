#!/usr/bin/env python3
import json
import os
import re
import shlex
import subprocess
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


HOST = os.getenv("API_SERVER_HOST", "0.0.0.0")
PORT = int(os.getenv("API_SERVER_PORT", "8642"))
API_KEY = os.getenv("API_SERVER_KEY", "")
WORKSPACE_DIR = os.getenv("AGENT_RUNTIME_WORKSPACE_DIR", "/opt/data/workspace")
TIMEOUT_SECONDS = int(os.getenv("AGENTCRAFT_CLI_TIMEOUT_SECONDS", "900"))
SUBPROCESS_TIMEOUT_SECONDS = TIMEOUT_SECONDS if TIMEOUT_SECONDS > 0 else None
MAX_OUTPUT_CHARS = int(os.getenv("AGENTCRAFT_CLI_MAX_OUTPUT_CHARS", "8000"))
PI_SESSION_ROOT = os.getenv("AGENTCRAFT_PI_SESSION_ROOT", "/opt/data/.pi/sessions")


def response_payload(text, status="completed"):
    return {
        "id": f"resp_{int(time.time() * 1000)}",
        "object": "response",
        "status": status,
        "output": [
            {
                "type": "message",
                "role": "assistant",
                "content": [{"type": "output_text", "text": text.strip()}],
            }
        ],
    }


def limit_text(text):
    text = (text or "").strip()
    if len(text) <= MAX_OUTPUT_CHARS:
        return text
    return (
        text[:3000].rstrip()
        + "\n\n[... output truncated by AgentCraft CLI adapter ...]\n\n"
        + text[-3000:].lstrip()
    )


def extract_mini_output(output):
    sections = re.split(r"\n(?:\u2500|-){20,}\n", output or "")
    for section in reversed(sections):
        if "mini-swe-agent (step" not in section:
            continue
        if "Tool call error:" in section:
            continue
        content = re.sub(r"^.*?mini-swe-agent \(step[^:]*\):\s*", "", section, flags=re.DOTALL).strip()
        if "```" in content:
            content = content.split("```", 1)[0].strip()
        if "COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT" in section:
            lower_content = content.lower()
            if len(content) > 160 and "submitting final output" not in lower_content:
                return content
            continue
        tool_outputs = re.findall(
            r"<returncode>\s*0\s*<output>\s*(.*?)(?=\n\s*(?:Tool:|<exception_info>|Exit:|$))",
            section,
            flags=re.DOTALL,
        )
        for value in reversed(tool_outputs):
            cleaned = value.strip()
            if cleaned and cleaned != "COMPLETE_TASK_AND_SUBMIT_FINAL_OUTPUT":
                return cleaned
        if content:
            return content
    return ""


def clean_agent_output(output, returncode=0):
    if os.getenv("AGENTCRAFT_RAW_CLI_OUTPUT", "").lower() in {"1", "true", "yes"}:
        return limit_text(output)
    agent_type = os.getenv("AGENTCRAFT_AGENT_TYPE", "")
    if agent_type == "mini-swe-agent":
        extracted = extract_mini_output(output)
        if extracted:
            return limit_text(extracted)
    if returncode:
        return limit_text(output)
    return limit_text(output)


def extract_text(value):
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, str):
                parts.append(item)
            elif isinstance(item, dict):
                if isinstance(item.get("content"), str):
                    parts.append(item["content"])
                elif isinstance(item.get("content"), list):
                    parts.append(extract_text(item["content"]))
                elif isinstance(item.get("text"), str):
                    parts.append(item["text"])
        return "\n".join(part for part in parts if part)
    if isinstance(value, dict):
        return extract_text(value.get("content") or value.get("text") or "")
    return ""


def shell_quote(value):
    return shlex.quote(value or "")


def redact_sensitive_text(value):
    text = str(value or "")
    text = re.sub(r"eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", "[redacted-runtime-token]", text)
    text = re.sub(r"(Authorization:\s*Bearer\s+)(?!\$)[^\s\"'\\]+", r"\1[redacted]", text, flags=re.IGNORECASE)
    text = re.sub(
        r"(export\s+(?:AGENT_WORKSPACE_TOKEN|AIFACTORY_RUNTIME_TOKEN)=)[\"'][^\"']*[\"']",
        r'\1"[redacted]"',
        text,
    )
    return text


def template_passes_prompt_via_argument(template):
    value = str(template or "")
    return (
        "$AGENTCRAFT_TASK" in value
        or "${AGENTCRAFT_TASK}" in value
        or "$AGENTCRAFT_TASK_QUOTED" in value
        or "${AGENTCRAFT_TASK_QUOTED}" in value
    )


def safe_path_segment(value, fallback):
    cleaned = re.sub(r"[^A-Za-z0-9._-]", "_", str(value or "").strip())
    cleaned = cleaned.strip("_")[:160]
    return cleaned or fallback


def agentcraft_runtime_context(payload):
    agentcraft = payload.get("agentcraft") if isinstance(payload.get("agentcraft"), dict) else {}
    runtime_id = safe_path_segment(
        agentcraft.get("runtimeId") or os.getenv("AGENT_WORKSPACE_RUNTIME_ID") or "runtime",
        "runtime",
    )
    raw_conversation_id = (
        agentcraft.get("conversationId")
        or payload.get("conversation")
        or agentcraft.get("activeConversationId")
        or f"default-{runtime_id}"
    )
    conversation_id = safe_path_segment(raw_conversation_id, f"default-{runtime_id}")
    session_dir = os.path.join(PI_SESSION_ROOT, runtime_id)
    return {
        "runtimeId": runtime_id,
        "conversationId": conversation_id,
        "sessionDir": session_dir,
        "sessionFile": os.path.join(session_dir, f"{conversation_id}.jsonl"),
    }


def command_from_template(prompt, context):
    template = os.getenv("AGENTCRAFT_CLI_COMMAND_TEMPLATE", "").strip()
    if not template:
        return {
            "command": ["bash", "-lc", f"printf '%s\n' {shell_quote(prompt)}"],
            "stdin": "",
        }
    env = dict(os.environ)
    env["AGENTCRAFT_RUNTIME_ID"] = context["runtimeId"]
    env["AGENTCRAFT_CONVERSATION_ID"] = context["conversationId"]
    env["AGENTCRAFT_PI_SESSION_DIR"] = context["sessionDir"]
    env["AGENTCRAFT_PI_SESSION_FILE"] = context["sessionFile"]
    env["AGENTCRAFT_TASK"] = prompt
    env["AGENTCRAFT_TASK_QUOTED"] = shell_quote(prompt)
    pattern = re.compile(r"\$\{([A-Za-z_][A-Za-z0-9_]*)(?::-[^}]*)?\}|\$([A-Za-z_][A-Za-z0-9_]*)")

    def replace_var(match):
        key = match.group(1) or match.group(2)
        return str(env[key]) if key in env else match.group(0)

    expanded = pattern.sub(replace_var, template)
    expanded = f". /opt/data/AGENT_WORKSPACE_RUNTIME.env 2>/dev/null || true; {expanded}"
    return {
        "command": ["/bin/sh", "-lc", expanded],
        "stdin": "" if template_passes_prompt_via_argument(template) else prompt,
    }


def run_agent(prompt, context):
    os.makedirs(WORKSPACE_DIR, exist_ok=True)
    os.makedirs(context["sessionDir"], exist_ok=True)
    command_config = command_from_template(prompt, context)
    child_env = os.environ.copy()
    child_env.update(
        {
            "AGENTCRAFT_RUNTIME_ID": context["runtimeId"],
            "AGENTCRAFT_CONVERSATION_ID": context["conversationId"],
            "AGENTCRAFT_PI_SESSION_DIR": context["sessionDir"],
            "AGENTCRAFT_PI_SESSION_FILE": context["sessionFile"],
        }
    )
    completed = subprocess.run(
        command_config["command"],
        cwd=WORKSPACE_DIR,
        text=True,
        input=command_config["stdin"],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        timeout=SUBPROCESS_TIMEOUT_SECONDS,
        env=child_env,
    )
    output = completed.stdout or ""
    if completed.returncode:
        cleaned = redact_sensitive_text(clean_agent_output(output, completed.returncode))
        return response_payload(f"Agent command exited with {completed.returncode}.\n\n{cleaned}", "failed")
    return response_payload(redact_sensitive_text(clean_agent_output(output)) or "Agent command completed without output.")


class Handler(BaseHTTPRequestHandler):
    server_version = "AgentCraftCLIAdapter/1.0"

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            self.write_json({"ok": True, "service": "agentcraft-cli-adapter"})
            return
        self.send_error(404)

    def do_POST(self):
        if self.path.rstrip("/") != "/v1/responses":
            self.send_error(404)
            return
        if API_KEY:
            expected = f"Bearer {API_KEY}"
            if self.headers.get("authorization") != expected:
                self.send_error(401)
                return
        length = int(self.headers.get("content-length") or "0")
        body = self.rfile.read(length).decode("utf-8") if length else "{}"
        try:
            payload = json.loads(body)
        except json.JSONDecodeError:
            self.send_error(400, "Invalid JSON")
            return
        user_input = extract_text(payload.get("agentcraft", {}).get("currentUserMessage")).strip()
        if not user_input:
            user_input = extract_text(payload.get("input")).strip()
        instructions = extract_text(payload.get("instructions")).strip()
        include_instructions = os.getenv("AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS", "").lower() in {"1", "true", "yes"}
        prompt = (
            "\n\n".join(part for part in [instructions, user_input] if part)
            if include_instructions
            else user_input or instructions
        ).strip()
        if not prompt:
            self.write_json(response_payload("No input prompt was provided.", "failed"), status=400)
            return
        try:
            self.write_json(run_agent(prompt, agentcraft_runtime_context(payload)))
        except subprocess.TimeoutExpired:
            self.write_json(response_payload(f"Agent command timed out after {TIMEOUT_SECONDS} seconds.", "failed"), status=504)
        except Exception as exc:
            self.write_json(response_payload(f"Agent adapter error: {exc}", "failed"), status=500)

    def log_message(self, fmt, *args):
        print(f"{self.address_string()} - {fmt % args}", flush=True)

    def write_json(self, payload, status=200):
        encoded = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)


if __name__ == "__main__":
    print(f"agentcraft-cli-adapter listening on {HOST}:{PORT}", flush=True)
    ThreadingHTTPServer((HOST, PORT), Handler).serve_forever()
