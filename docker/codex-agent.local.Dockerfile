ARG CODEX_AGENT_NODE_BASE=node:24-bookworm
FROM ${CODEX_AGENT_NODE_BASE}

ARG DEBIAN_MIRROR=
ARG DEBIAN_SECURITY_MIRROR=
ARG CODEX_VERSION=0.130.0

ENV AGENTCRAFT_AGENT_TYPE=codex \
    AGENTCRAFT_AGENT_INTERFACE=cli \
    AGENTCRAFT_CLI_TIMEOUT_SECONDS=1800 \
    AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS=true \
    AGENTCRAFT_CLI_COMMAND_TEMPLATE='codex exec --skip-git-repo-check --ephemeral --ignore-user-config --ignore-rules --color never --sandbox read-only --model "$API_SERVER_MODEL_NAME" $AGENTCRAFT_TASK_QUOTED'

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

RUN npm install -g "@openai/codex@${CODEX_VERSION}"

COPY docker/agentcraft-cli-adapter.mjs /opt/agentcraft/cli-adapter.mjs

WORKDIR /opt/data/workspace
EXPOSE 8642
CMD ["node", "/opt/agentcraft/cli-adapter.mjs"]
