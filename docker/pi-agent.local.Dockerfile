ARG PI_AGENT_NODE_BASE=node:24-bookworm
FROM ${PI_AGENT_NODE_BASE}

ARG DEBIAN_MIRROR=
ARG DEBIAN_SECURITY_MIRROR=

ENV AGENTCRAFT_AGENT_TYPE=pi \
    AGENTCRAFT_AGENT_INTERFACE=print \
    AGENTCRAFT_PI_BACKEND=rpc \
    AGENTCRAFT_CLI_TIMEOUT_SECONDS=1800 \
    AGENTCRAFT_INCLUDE_RESPONSE_INSTRUCTIONS=true \
    AGENTCRAFT_PI_PROVIDER=agentcraft \
    PI_CODING_AGENT_DIR=/opt/data/.pi/agent \
    AGENTCRAFT_PI_SESSION_ROOT=/opt/data/.pi/sessions \
    AGENTCRAFT_CLI_COMMAND_TEMPLATE='pi --mode json --session-dir "$AGENTCRAFT_PI_SESSION_DIR" --session "$AGENTCRAFT_PI_SESSION_FILE" --provider "$AGENTCRAFT_PI_PROVIDER" --model "$API_SERVER_MODEL_NAME" ${AGENTCRAFT_PI_EXTRA_ARGS:-} $AGENTCRAFT_INSTRUCTIONS_ARG -p $AGENTCRAFT_TASK_QUOTED'

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
    && apt-get install -y --no-install-recommends \
      ca-certificates \
      curl \
      git \
      python3 \
    && rm -rf /var/lib/apt/lists/*

RUN npm install -g npm@11.14.1

ARG PI_AGENT_PACKAGE=@earendil-works/pi-coding-agent
RUN npm install -g --ignore-scripts "${PI_AGENT_PACKAGE}" \
    && pi --version

COPY docker/agentcraft-cli-adapter.mjs /opt/agentcraft/cli-adapter.mjs

WORKDIR /opt/data/workspace
EXPOSE 8642
CMD ["node", "/opt/agentcraft/cli-adapter.mjs"]
