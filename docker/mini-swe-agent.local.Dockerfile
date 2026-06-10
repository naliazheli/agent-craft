ARG MINI_SWE_AGENT_BASE_IMAGE=python:3.12-slim
FROM ${MINI_SWE_AGENT_BASE_IMAGE}

ARG DEBIAN_MIRROR=
ARG DEBIAN_SECURITY_MIRROR=
ARG PIP_INDEX_URL=

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    MSWEA_CONFIGURED=true \
    MSWEA_COST_TRACKING=ignore_errors \
    AGENTCRAFT_CLI_TIMEOUT_SECONDS=1800 \
    AGENTCRAFT_AGENT_TYPE=mini-swe-agent \
    AGENTCRAFT_AGENT_INTERFACE=tui \
    AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS=true \
    AGENTCRAFT_CLI_COMMAND_TEMPLATE='mini -y --exit-immediately -m "${AGENTCRAFT_MINI_MODEL_NAME:-$API_SERVER_MODEL_NAME}" -t $AGENTCRAFT_TASK_QUOTED' \
    PIP_INDEX_URL=${PIP_INDEX_URL}

RUN if [ -n "$DEBIAN_MIRROR" ] || [ -n "$DEBIAN_SECURITY_MIRROR" ]; then \
      debian_mirror="${DEBIAN_MIRROR:-http://deb.debian.org/debian}"; \
      debian_security_mirror="${DEBIAN_SECURITY_MIRROR:-http://deb.debian.org/debian-security}"; \
      find /etc/apt -type f -exec sed -i \
        -e "s|http://deb.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|https://deb.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|http://security.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|https://security.debian.org/debian-security|${debian_security_mirror}|g" \
        -e "s|http://deb.debian.org/debian|${debian_mirror}|g" \
        -e "s|https://deb.debian.org/debian|${debian_mirror}|g" {} +; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates curl \
    && rm -rf /var/lib/apt/lists/*

COPY docker/agentcraft-cli-adapter.py /opt/agentcraft/cli-adapter.py
COPY external/mini-swe-agent /opt/mini-swe-agent

RUN python -m pip install --no-cache-dir \
      pyyaml \
      requests \
      jinja2 \
      "pydantic>=2.0" \
      "litellm!=1.82.7,!=1.82.8,>=1.75.5" \
      tenacity \
      rich \
      python-dotenv \
      typer \
      platformdirs \
      textual \
      prompt_toolkit \
      "openai!=1.100.0,!=1.100.1" \
    && python -m pip install --no-cache-dir --no-deps -e /opt/mini-swe-agent

WORKDIR /opt/data/workspace
EXPOSE 8642
CMD ["python3", "/opt/agentcraft/cli-adapter.py"]
