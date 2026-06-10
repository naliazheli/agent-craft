ARG HERMES_AGENT_BASE_IMAGE=debian:13.4
FROM ${HERMES_AGENT_BASE_IMAGE}

ARG DEBIAN_MIRROR=
ARG DEBIAN_SECURITY_MIRROR=
ARG PIP_INDEX_URL=

ENV PYTHONUNBUFFERED=1
ENV HERMES_HOME=/opt/data
ENV PIP_INDEX_URL=${PIP_INDEX_URL}

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
    && apt-get update && \
    apt-get install -y --no-install-recommends \
        bash build-essential ca-certificates curl ffmpeg git procps python3 python3-dev python3-pip python3-venv ripgrep sudo util-linux && \
    rm -rf /var/lib/apt/lists/*

RUN git config --system --add safe.directory /opt/data/workspace && \
    git config --system --add safe.directory /opt/data/workspace/*

RUN useradd -u 10000 -m -d /opt/data hermes

COPY . /opt/hermes
WORKDIR /opt/hermes

RUN chown -R hermes:hermes /opt/hermes
USER hermes

RUN python3 -m venv .venv && \
    .venv/bin/python -m pip install --no-cache-dir --upgrade pip setuptools wheel uv && \
    .venv/bin/python -m pip install --no-cache-dir -e ".[pty]" aiohttp

USER root
RUN { \
      echo '#!/usr/bin/env bash'; \
      echo 'set -euo pipefail'; \
      echo ''; \
      echo 'HERMES_HOME="${HERMES_HOME:-/opt/data}"'; \
      echo 'mkdir -p "$HERMES_HOME"/{cron,sessions,logs,hooks,memories,skills,skins,plans,workspace,home}'; \
      echo 'chown -R hermes:hermes "$HERMES_HOME" 2>/dev/null || true'; \
      echo ''; \
      echo 'if [ "${ENABLE_AGENT_SUDO:-false}" = "true" ]; then'; \
      echo '  usermod -aG sudo hermes 2>/dev/null || true'; \
      echo "  printf 'hermes ALL=(ALL) NOPASSWD:ALL\n' >/etc/sudoers.d/90-hermes-agent"; \
      echo '  chmod 0440 /etc/sudoers.d/90-hermes-agent'; \
      echo 'fi'; \
      echo ''; \
      echo 'if [ ! -f "$HERMES_HOME/.env" ]; then'; \
      echo '  cp /opt/hermes/.env.example "$HERMES_HOME/.env"'; \
      echo 'fi'; \
      echo ''; \
      echo 'if [ ! -f "$HERMES_HOME/config.yaml" ]; then'; \
      echo '  cp /opt/hermes/cli-config.yaml.example "$HERMES_HOME/config.yaml"'; \
      echo 'fi'; \
      echo ''; \
      echo 'if [ ! -f "$HERMES_HOME/SOUL.md" ]; then'; \
      echo '  cp /opt/hermes/docker/SOUL.md "$HERMES_HOME/SOUL.md"'; \
      echo 'fi'; \
      echo ''; \
      echo "exec runuser -u hermes -- bash -lc 'source /opt/hermes/.venv/bin/activate && python3 /opt/hermes/tools/skills_sync.py >/dev/null 2>&1 || true && exec hermes \"\$@\"' bash \"\$@\""; \
    } > /usr/local/bin/hermes-docker-entrypoint && chmod +x /usr/local/bin/hermes-docker-entrypoint

VOLUME [ "/opt/data" ]
ENTRYPOINT [ "/usr/local/bin/hermes-docker-entrypoint" ]
