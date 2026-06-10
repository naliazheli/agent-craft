FROM node:24-bookworm

ARG CODEX_VERSION=0.129.0

ENV PYTHONUNBUFFERED=1
ENV PIP_DISABLE_PIP_VERSION_CHECK=1
ENV PIP_DEFAULT_TIMEOUT=120
ENV PIP_RETRIES=10
ENV SWE_BENCH_ROOT=/opt/SWE-bench
ENV PATH=/opt/swebench-venv/bin:$PATH

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bash \
      ca-certificates \
      curl \
      docker.io \
      git \
      jq \
      openssh-client \
      patch \
      procps \
      python3 \
      python3-pip \
      python3-venv \
      ripgrep \
      sudo \
      tini \
      unzip \
      xz-utils && \
    rm -rf /var/lib/apt/lists/*

RUN npm install -g "@openai/codex@${CODEX_VERSION}"

RUN python3 -m venv /opt/swebench-venv && \
    /opt/swebench-venv/bin/pip install --upgrade pip setuptools wheel && \
    git clone --depth 1 https://github.com/SWE-bench/SWE-bench.git "$SWE_BENCH_ROOT" && \
    for attempt in 1 2 3; do \
      /opt/swebench-venv/bin/pip install --retries 10 --timeout 120 -e "$SWE_BENCH_ROOT" datasets docker && break; \
      if [ "$attempt" = "3" ]; then exit 1; fi; \
      sleep $((attempt * 10)); \
    done

WORKDIR /workspace/agentcraft

ENTRYPOINT ["/usr/bin/tini", "--"]
CMD ["bash"]
