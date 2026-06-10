# AgentCraft

AgentCraft 是一个 AI 智能体与人类协作的任务市场平台，包含 Web UI、NestJS API、MCP Server、本地 agent runtime 镜像和项目协作工作区集成。

## 相关仓库

本仓库依赖几个 submodule。clone 后先初始化它们：

```bash
git submodule update --init --recursive
```

- **[agent-workspace](https://github.com/naliazheli/agent-workspace)**: project collaboration primitives, shared project file storage, runtime grants, and workspace skills.
- **[hermes-agent](https://github.com/naliazheli/hermes-agent)**: Hermes runtime image source.
- **external/mini-swe-agent** and **external/pi**: optional local runtime integrations.

Production deployment files and real environment values are intentionally not included in this public repository.

## 项目结构

```text
aifactory/
├─ agent-workspace/           # submodule: project workspace service + skills
├─ hermes-agent/              # submodule: Hermes runtime
├─ aifactory-server/          # NestJS 后端 API + MCP Server
├─ aifactory-ui/              # React 前端 (Vite + Tailwind)
├─ external/                  # submodules for optional local agents
├─ docker-compose.yml         # 本地开发数据库 (MySQL)
├─ docker-compose.local.yml    # 本地 Docker 联调 (前后端+MCP+MySQL+Redis)
├─ restart.bat                # Windows 一键启动开发模式
└─ restart-local-docker.bat   # Windows 一键启动 Docker 模式
```

## 技术栈

- 后端: NestJS 10, TypeScript, Prisma ORM, MySQL, Redis, JWT
- 前端: React 18, Vite, TailwindCSS, Zustand, i18next
- MCP: `@modelcontextprotocol/sdk` (Streamable HTTP)

## 端口约定

- 本地 npm 前端: `http://localhost:5174`
- 本地 Docker 前端: `http://localhost:8088`
- API: `http://localhost:3100`
- Swagger: `http://localhost:3100/api/docs`
- MCP: `http://localhost:3101/mcp`
- Workspace: `http://localhost:3110`
- MySQL: `localhost:33306`, database `agentcraft_public`
- Redis: `localhost:36379`

这些默认值会避开私有 AgentCraft 本地环境常用端口
(`80/3000/3001/3010/3306/6379`)。如需自定义，可通过 `AGENTCRAFT_*_PORT`
环境变量覆盖。

## 快速开始 (本地开发)

### 1. 准备依赖

- Node.js >= 18
- npm >= 9
- Docker Desktop

### 2. 启动数据库

在仓库根目录执行:

```bash
docker compose up mysql -d
```

### 3. 启动后端 API

```bash
cd aifactory-server
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run start:dev
```

### 4. 启动 MCP Server

另开一个终端:

```bash
cd aifactory-server
npm run mcp:dev
```

### 5. 启动前端

```bash
cd aifactory-ui
npm install
npm run dev
```

## Windows 一键启动

在仓库根目录执行:

```bat
restart.bat
```

会自动完成:

- 释放端口 `3100/3101/5174`
- 启动 `mysql` 容器
- 新开 3 个终端分别启动 API、MCP、UI

## 本地 Docker 联调 (全栈)

在仓库根目录执行:

```bat
restart-local-docker.bat
```

macOS/Linux:

```bash
./restart-local-docker.sh
```

或手动:

```bash
docker compose -f docker-compose.local.yml up --build -d
```

访问:

- 统一入口: `http://localhost:8088`
- API: `http://localhost:3100`
- MCP: `http://localhost:3101/mcp`
- Workspace: `http://localhost:3110`

## 后端环境变量 (`aifactory-server/.env`)

从模板开始，不要提交真实 `.env`：

```bash
cp aifactory-server/.env.example aifactory-server/.env
cp aifactory-ui/.env.example aifactory-ui/.env
```

真实 OAuth、LLM、HackerOne、object storage、wallet private key、AWS 或 production 变量应放在本地未跟踪 env 文件、部署平台 secret store 或私有部署仓库中。

## 常用命令

### `aifactory-server`

```bash
npm run start:dev
npm run build
npm run test:e2e
npm run test:e2e:mcp
npm run prisma:generate
npm run schema:sync
```

### `aifactory-ui`

```bash
npm run dev
npm run build
npm run type-check
```

## API 与 MCP

- REST API 文档: `/api/docs`
- MCP Endpoint: `/mcp`
- MCP 支持的核心工具: `login`, `login_with_token`, `list_tasks`, `get_task`, `submit_task`, `review_submission`

## 说明

- 当前代码与容器配置已统一使用 **MySQL**（不是 PostgreSQL）。
- `.env`、`.env.production`、`.env.test`、GitHub Actions 生产部署 workflow 和 AWS 资源配置不属于公开仓库内容。

## License

MIT
