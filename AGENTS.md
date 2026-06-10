# Agent Workspace Boundary

`agent-workspace` owns project collaboration primitives, including project shared file storage.

AgentCraft is a host product. It may create projects, issue runtime grants, show project pages, and proxy owner uploads, but the durable project-file API and authorization model must live in `agent-workspace`.

## Project Shared Storage

- Storage namespace: `projects/{projectId}/shared/{path}` under the configured object-storage folder.
- Human access: the host product verifies project owner/member authorization, then calls `agent-workspace` with host credentials.
- Runtime access: agent containers call `agent-workspace` directly with their grant-derived runtime token.
- Required runtime scopes:
  - `PROJECT_FILE_READ` for list, search, read, and download URL.
  - `PROJECT_FILE_WRITE` for write, upload, and delete.
- Agent-facing common methods should stay in the shared workspace skill, with names such as `project-file-list`, `project-file-search`, `project-file-read`, `project-file-write`, and `project-file-upload`.

## Host Independence

`agent-workspace` must not import AgentCraft server modules, call AgentCraft private APIs, or depend on AgentCraft database-only code paths.

Host products may pass compatible storage configuration through environment variables. AgentCraft can reuse its existing TOS values for local or deployed environments:

- `TOS_ACCESS_KEY`
- `TOS_SECRET_KEY`
- `TOS_REGION`
- `TOS_ENDPOINT`
- `TOS_BUCKET`
- `TOS_FOLDER`
- `TOS_PUBLIC_URL`

The preferred workspace-native aliases are:

- `PROJECT_STORAGE_ACCESS_KEY`
- `PROJECT_STORAGE_SECRET_KEY`
- `PROJECT_STORAGE_REGION`
- `PROJECT_STORAGE_ENDPOINT`
- `PROJECT_STORAGE_BUCKET`
- `PROJECT_STORAGE_FOLDER`
- `PROJECT_STORAGE_PUBLIC_URL`

If both are present, `PROJECT_STORAGE_*` wins. This keeps `agent-workspace` portable while allowing AgentCraft deployments to share the same object-storage backend.

The workspace container image must be deployed with these variables at runtime. The image does not bake storage credentials into the build.

## Operations

Local development, local runtime checks, and local testing should be run through the repository scripts:

- Windows: `restart-local-docker.bat`
- macOS/Linux: `restart-local-docker.sh`

These restart scripts are durable project files. Do not delete them during cleanup, synchronization, or deployment-related changes.

Production deployment configuration lives outside this public repository. Private GitHub Actions deploy AgentCraft to AWS.

Production domain: https://www.agentcraft.work/

## Cross-Platform Paths

Do not create or commit repository paths that are incompatible with Windows checkouts. In particular, avoid `:` in file or directory names; use a portable separator such as `__` instead.
