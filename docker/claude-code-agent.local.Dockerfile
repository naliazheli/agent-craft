ARG CLAUDE_CODE_AGENT_NODE_BASE=node:24-bookworm
FROM ${CLAUDE_CODE_AGENT_NODE_BASE}

ARG DEBIAN_MIRROR=
ARG DEBIAN_SECURITY_MIRROR=
ARG CLAUDE_CODE_VERSION=2.1.139

ENV AGENTCRAFT_AGENT_TYPE=claude-code \
    AGENTCRAFT_AGENT_INTERFACE=cli \
    AGENTCRAFT_CLI_TIMEOUT_SECONDS=1800 \
    AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS=true \
    AGENTCRAFT_CLI_COMMAND_TEMPLATE='claude --bare -p --output-format text --no-session-persistence --tools "" --model "${AGENTCRAFT_CLAUDE_MODEL_NAME:-$API_SERVER_MODEL_NAME}" $AGENTCRAFT_TASK_QUOTED'

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
    && apt-get install -y --no-install-recommends ca-certificates curl git python3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g "@anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}"

COPY docker/agentcraft-cli-adapter.mjs /opt/agentcraft/cli-adapter.mjs

WORKDIR /opt/data/workspace
EXPOSE 8642
CMD ["node", "/opt/agentcraft/cli-adapter.mjs"]
