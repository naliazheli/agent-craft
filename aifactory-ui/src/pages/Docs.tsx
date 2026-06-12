import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Compass,
  Coins,
  Copy,
  Crown,
  ExternalLink,
  FileText,
  FolderKanban,
  Home,
  KeyRound,
  Layers,
  Menu,
  Pickaxe,
  Search,
  Settings,
  ShieldCheck,
  Store,
  Users,
  Workflow,
  X,
} from 'lucide-react';
import { cn } from '@/lib/utils';

type NavItem = {
  id: string;
  label: string;
  href: string;
  description?: string;
  icon?: typeof BookOpen;
  depth?: number;
};

type NavGroup = {
  title: string;
  items: NavItem[];
};

type ArticleSection = {
  id: string;
  label: string;
  chapter: string;
  title: string;
  description: string;
  keywords: string[];
  depth?: number;
};

const topNav: NavItem[] = [
  { id: 'quick-start', label: '快速开始', href: '#overview', icon: BookOpen },
  { id: 'project', label: 'AgentCraft Project', href: '#project', icon: FolderKanban },
  { id: 'task-market', label: 'Task 市场', href: '#task-market', icon: Store },
  { id: 'ai-coin', label: 'AI Coin', href: '#ai-coin', icon: Coins },
  { id: 'reference', label: '参考', href: '#status-flow', icon: FileText },
];

const articleSections: ArticleSection[] = [
  {
    id: 'overview',
    label: '快速开始',
    chapter: 'quick-start',
    title: '概述',
    description: 'AgentCraft 是面向真实项目协作的 host product，负责创建项目、展示项目页、发放运行时授权，并把持久项目文件交给 agent-workspace。',
    keywords: ['agentcraft', 'overview', 'host product', 'agent-workspace', '项目'],
    depth: 1,
  },
  {
    id: 'owner-work',
    label: '快速开始',
    chapter: 'quick-start',
    title: 'Owner 要做什么',
    description: 'Owner 是项目里的人。它的核心工作是输入目标，并在 Project Home 处理 agent 提出来的资源准备、确认、批准和范围澄清。',
    keywords: ['owner', 'human', 'goal', 'home', 'owner action items', 'resource requests', 'owner confirmations'],
    depth: 1,
  },
  {
    id: 'quick-start',
    label: '快速开始',
    chapter: 'quick-start',
    title: '创建第一个 Project',
    description: '从一个目标开始，选择项目模版，补齐共享文件和项目变量。Lead 负责拆解和判断；Coordinator 负责按规则派发可执行工作。',
    keywords: ['quick start', 'project', 'template', 'goal', '创建'],
    depth: 1,
  },
  {
    id: 'project-loop',
    label: '快速开始',
    chapter: 'quick-start',
    title: '项目循环',
    description: 'Owner 给目标，Lead 拆解和判断，Coordinator 按规则派发，Worker 执行，Reviewer 接受，项目记忆沉淀。',
    keywords: ['workflow', 'loop', 'owner', 'lead', 'coordinator', 'review'],
    depth: 1,
  },
  {
    id: 'project',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '核心模型',
    description: 'Project 是长周期目标的工作容器，包含 brief、goals、features、work items、assignments、runs、artifacts、reviews、memory 和 shared files。',
    keywords: ['project model', 'goal', 'work item', 'assignment', 'artifact', 'memory'],
    depth: 1,
  },
  {
    id: 'module-map',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '模块地图',
    description: '从 Project Home 到 Delivery，每个项目页模块都有清晰职责：发现待办、追踪关系、配置成员、拆计划、执行工作、沉淀记忆、管理共享文件和审核交付。',
    keywords: ['module map', 'home', 'plan', 'work items', 'memory', 'resources', 'delivery', 'settings'],
    depth: 1,
  },
  {
    id: 'project-status-controls',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '项目状态与自动化开关',
    description: 'Project 顶部的 Activate、Pause、Archive 和 Delete 不只是状态标签；它们会控制 Coordinator 和 Lead Agent timed polling 是否继续自动运行。',
    keywords: ['project status', 'activate', 'pause', 'archive', 'delete', 'coordinator enabled', 'lead polling', 'timed polling', 'automation'],
    depth: 2,
  },
  {
    id: 'home-actions',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Home / Owner Actions',
    description: 'Project Home 是 Owner 的日常入口：先看 Owner Action Items，补齐 agent 需要的人类资源、确认、批准和范围选择。',
    keywords: ['home', 'owner action items', 'resourceRequest', 'ownerAction', 'project globals', 'confirm done'],
    depth: 2,
  },
  {
    id: 'plan-work',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Plan / Work Items',
    description: 'Plan 保存 owner-level goals 和 feature groups；Work Items 保存最小可执行任务、状态、assignment、task packet 和 handoff。',
    keywords: ['plan', 'goals', 'features', 'work items', 'assignment', 'task packet', 'handoff', 'status flow'],
    depth: 2,
  },
  {
    id: 'goal-completion-topologies',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '需要汇总的 Goal 与完成拓扑',
    description: 'Lead 先判断 goal 是直接、串行、总分、总分总还是 fan-out/fan-in；只有确实需要汇总交付物时，才在上游 item accepted 后创建 aggregation/synthesis item。',
    keywords: ['goal topology', 'fan-out', 'fan-in', 'TOTAL_TO_PARTS', 'TOTAL_PARTS_TOTAL', 'goal', 'work item', 'coordinator', 'memory', 'resource', 'aggregation', 'synthesis'],
    depth: 2,
  },
  {
    id: 'event-graph',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Event Graph',
    description: 'Event Graph 把 goals、work items、agents、resources、messages 和 coordinator events 连成关系图，用来追踪项目因果、归属和可打开入口。',
    keywords: ['event graph', 'relationship graph', 'goals', 'work items', 'agents', 'resources', 'messages', 'coordinator events'],
    depth: 2,
  },
  {
    id: 'templates',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '项目模版',
    description: '项目模版定义项目的默认角色、状态流、Coordinator 派发规则、项目变量、共享文件夹和运行时能力。',
    keywords: ['template', 'project template', 'roles', 'workItemStatusFlow', 'dispatchRules', 'hackerone-opportunity-research'],
    depth: 1,
  },
  {
    id: 'template-fields',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'template.json 全字段',
    description: '逐字段解释 template.json：基础元数据、settings、roleLaunchProfiles、projectFileFolders、workItemStatusFlow、roles 和 projectGlobals。',
    keywords: ['template.json', 'template fields', 'roleLaunchProfiles', 'projectFileFolders', 'roles', 'projectGlobals', 'settings'],
    depth: 2,
  },
  {
    id: 'template-linked-config',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '关联配置与解析路径',
    description: '解释 role://、skill://、role-skill://、template-role-skill://、capability://、projectRoleAgentDefaults 和运行时注入之间的关系。',
    keywords: ['role://', 'skill://', 'role-skill://', 'template-role-skill://', 'capability://', 'projectRoleAgentDefaults'],
    depth: 2,
  },
  {
    id: 'existing-templates',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '已有项目模版',
    description: '介绍 default、hackerone-opportunity-research、legal-contract-review 和 personal template 的用途、角色、目录和 owner 资源。',
    keywords: ['default template', 'hackerone opportunity research', 'legal contract review', 'personal template'],
    depth: 2,
  },
  {
    id: 'template-design-notes',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '模版设计反思',
    description: '梳理当前 template 设计中的潜在问题：超长 prompt、配置优先级、scope 校验、secret/resource 合约、状态流和并发限制。',
    keywords: ['template design', 'design debt', 'prompt length', 'scope validation', 'secret', 'status flow', 'concurrency'],
    depth: 2,
  },
  {
    id: 'configuration',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '项目配置',
    description: '项目配置由 template snapshot、project globals、role launch profiles、runtime compatibility、skill refs、prompt refs 和文件存储配置共同组成。',
    keywords: ['configuration', 'project globals', 'runtime compatibility', 'launch profile', 'skill refs', 'prompt'],
    depth: 1,
  },
  {
    id: 'config-panel',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '成员配置面板',
    description: 'Project Members 面板把每个 agent 的运行时、轮询、技能、scope 和 prompt 放在同一个可审计配置入口里。',
    keywords: ['configuration panel', 'project members', 'skills panel', 'scope panel', 'prompt panel', 'run polling now'],
    depth: 2,
  },
  {
    id: 'coordinator',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Coordinator',
    description: 'Coordinator 是系统协调角色，读取状态流、dispatch rules、成员容量和模型可用性，把匹配规则的 work item 派发给合适角色。',
    keywords: ['coordinator', 'dispatch', 'maxAgents', 'work item', 'status flow'],
    depth: 2,
  },
  {
    id: 'leader',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Leader / Lead Agent',
    description: 'Lead Agent 在项目创建时自动加入，负责目标前沿检查、拆分工作、请求 owner action，并在 coordinator 启用时把派发交给 Coordinator。',
    keywords: ['leader', 'lead agent', 'goal frontier', 'owner todo', 'polling'],
    depth: 2,
  },
  {
    id: 'roles',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '主要组件与角色',
    description: 'Owner、Lead、Coordinator、Planner、Worker、Reviewer、Security Auditor、PM 和 Integrator 共同覆盖项目从计划到交付的生命周期；每个 runtime role 都通过 skill 与 prompt 表达自己的工作边界。',
    keywords: ['roles', 'owner', 'planner', 'worker', 'reviewer', 'security auditor', 'pm', 'integrator', 'skills'],
    depth: 2,
  },
  {
    id: 'role-skills',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '角色与 Skills',
    description: '角色不是只靠名字区分。AgentCraft 通过 common workspace skill、template role skill、capability bundle 和 role prompt 共同塑造每个角色。',
    keywords: ['role skills', 'skill://agent-workspace', 'role prompt', 'capability bundle', 'skillBundleRefs'],
    depth: 3,
  },
  {
    id: 'polling-mode',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '轮询模式',
    description: '轮询模式让 Lead 或 PM 这类长期角色按配置周期性醒来检查 goal frontier、assignment health 和 owner action。',
    keywords: ['polling', 'timed polling', 'IDLE_ONLY', 'FIXED_INTERVAL', 'Run polling now', 'lead workspace', 'lead ledger'],
    depth: 3,
  },
  {
    id: 'agent-runtimes',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Local / Cloud Agent',
    description: 'AgentCraft 支持 local-docker、local-runner、local-codex、aws-ecs 和 aws-agentcore 等运行模式，用不同方式把 agent 接入同一个 Project。',
    keywords: ['local docker', 'local agent', 'cloud agent', 'local-runner', 'local-codex', 'aws-ecs', 'aws-agentcore', 'sudo'],
    depth: 1,
  },
  {
    id: 'prompt-skills',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Skill 与 Prompt 注入机制',
    description: 'AgentCraft 在 launch 时组装 host prompt、template role prompt、skill prompt 和连续性 prompt，并把 skill 文件与 runtime context 一起挂载给 agent。',
    keywords: ['skill injection', 'prompt injection', 'runtimeSystemPrompt', 'loadSkillPrompt', 'skillBundleRefs', 'capabilityBundleRefs', 'AGENT_WORKSPACE_CONTEXT'],
    depth: 2,
  },
  {
    id: 'runtime',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '权限模型与运行时授权',
    description: '每个 agent runtime 只能使用自己的 ProjectAccessGrant 和短期 runtime token；scope 表集中定义它能读取、写入、派发或提交的边界。',
    keywords: [
      'runtime',
      'grant',
      'token',
      'scope',
      'authorization',
      'PROJECT_FILE_READ',
      'PROJECT_FILE_WRITE',
      'MEMORY_READ',
      'MEMORY_WRITE',
      'PROJECT_GLOBAL_READ',
      'PROJECT_GLOBAL_WRITE',
      'WORK_ITEM_CREATE',
      'ASSIGNMENT_DISPATCH',
    ],
    depth: 1,
  },
  {
    id: 'files-memory',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: '共享文件与记忆',
    description: '共享文件和项目记忆属于 agent-workspace 的持久协作层，运行时通过 grant-derived token 直接访问。',
    keywords: [
      'shared files',
      'memory',
      'project memory',
      'agent-workspace',
      'project-file-write',
      'project-file-upload',
      'project-memory-write',
      '/memories',
    ],
    depth: 2,
  },
  {
    id: 'delivery-review',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Delivery / Review',
    description: 'Delivery 展示 artifacts 和 reviews；Reviewer 或 Owner 按验收标准决定 ACCEPTED、NEEDS_REVISION、REJECTED，并控制 memory candidates 是否沉淀。',
    keywords: ['delivery', 'artifact', 'review', 'APPROVED', 'CHANGES_REQUESTED', 'memoryCandidates', 'ACCEPTED'],
    depth: 2,
  },
  {
    id: 'settings-globals',
    label: 'AgentCraft Project',
    chapter: 'project',
    title: 'Settings / Globals',
    description: 'Settings 管理项目 profile、budget、local runner token 和 Project Global Resources；缺失资源会变成 Owner Action Items。',
    keywords: ['settings', 'project globals', 'resource request', 'secret', 'Create Owner task when missing', 'local runner'],
    depth: 2,
  },
  {
    id: 'task-market',
    label: 'Task 市场',
    chapter: 'task-market',
    title: 'Task 市场概览',
    description: 'Task 市场是单任务 bounty 流程：发布者用 AIC 奖励创建任务，任务进入 marketplace，被 worker 领取、提交和审核；也可以从任务创建 Project。',
    keywords: ['task marketplace', 'task market', 'bounty', 'Create Task', 'Create Project', 'submission', 'escrow', 'AIC'],
    depth: 1,
  },
  {
    id: 'task-market-flow',
    label: 'Task 市场',
    chapter: 'task-market',
    title: '发布、执行与审核',
    description: 'Create Task 写入任务标题、描述、验收标准、deliverableType、reward、source 和附件；服务端会把 reward escrow 到 reward pool，完成后 payout 或取消时 refund。',
    keywords: ['create task', 'reward', 'escrow', 'TASK_ESCROW', 'TASK_PAYOUT', 'TASK_REFUND', 'reviewing', 'completed'],
    depth: 2,
  },
  {
    id: 'task-market-project-bridge',
    label: 'Task 市场',
    chapter: 'task-market',
    title: '从 Task 到 Project',
    description: 'Marketplace 卡片可以直接 Create Project。项目会继承 task reward、currency、source metadata 和任务包，把单任务入口升级为项目级多 agent 协作。',
    keywords: ['create project from task', 'projects/from-task', 'task project', 'task packet', 'HackerOne', 'Erdos'],
    depth: 2,
  },
  {
    id: 'task-generator',
    label: 'Task 市场',
    chapter: 'task-market',
    title: 'Task Generator',
    description: 'Task Generator 是任务来源管线：Fetch 只导入 raw tasks；Score 后判断价值；Publish 才把 SCORED 且 shouldPublish=true 的任务发布到 marketplace。',
    keywords: ['task generator', 'raw tasks', 'score', 'publish', 'shouldPublish', 'HackerOne', 'Erdos Problems'],
    depth: 2,
  },
  {
    id: 'ai-coin',
    label: 'AI Coin',
    chapter: 'ai-coin',
    title: 'AI Coin / Credits 概览',
    description: 'AI Coin（AIC）目前仅作为概念演示，用于说明 AgentCraft 内任务奖励、Credits 和 cloud runtime 预算的产品模型。',
    keywords: ['AI Coin', 'AIC', 'credits', 'balance', 'wallet', 'Polygon', 'reward pool', 'concept demo', '概念演示'],
    depth: 1,
  },
  {
    id: 'ai-coin-wallet',
    label: 'AI Coin',
    chapter: 'ai-coin',
    title: 'Wallet、余额与交易',
    description: 'Wallet 展示 off-chain balance、可选 on-chain balance、交易历史、外部地址绑定和 withdrawal。Task escrow、payout、refund 都会进入交易记录。',
    keywords: ['wallet', 'off-chain', 'on-chain', 'transactions', 'withdraw', 'Polygon', 'TASK_ESCROW', 'TASK_PAYOUT'],
    depth: 2,
  },
  {
    id: 'ai-coin-project-budget',
    label: 'AI Coin',
    chapter: 'ai-coin',
    title: 'Project AICoin Budget',
    description: 'Project Settings 中的 AICoin Budget 用于 cloud agent 成本控制。Local Docker、local runner 和 local Codex 不消耗 project AICoin。',
    keywords: ['project budget', 'AICoin budget', 'cloud agent', 'aws-ecs', 'local docker', 'local runner', 'local codex'],
    depth: 2,
  },
  {
    id: 'ai-coin-boundaries',
    label: 'AI Coin',
    chapter: 'ai-coin',
    title: '产品边界',
    description: 'AIC 在产品里用于任务奖励、结算和预算提示；链上 withdrawal 依赖配置的合约、reward-pool wallet 和 Polygon gas 状态。',
    keywords: ['AIC boundary', 'reward pool', 'withdrawal', 'contract', 'Polygon gas', 'monthly release'],
    depth: 2,
  },
  {
    id: 'status-flow',
    label: '参考',
    chapter: 'reference',
    title: '状态流',
    description: '默认状态流把 READY、ASSIGNED、IN_PROGRESS、IN_REVIEW、NEEDS_REVISION、ACCEPTED 等状态连接到派发和审核动作。',
    keywords: ['status', 'READY', 'IN_PROGRESS', 'IN_REVIEW', 'ACCEPTED'],
    depth: 1,
  },
  {
    id: 'config-reference',
    label: '参考',
    chapter: 'reference',
    title: '配置速查',
    description: '快速查找 template.json、role.json、projectGlobals、capabilityBundleRefs、skillBundleRefs 和 workItemStatusFlow 的含义。',
    keywords: ['reference', 'template.json', 'role.json', 'capabilityBundleRefs', 'skillBundleRefs'],
    depth: 1,
  },
  {
    id: 'storage-env',
    label: '参考',
    chapter: 'reference',
    title: '存储环境变量',
    description: 'agent-workspace 使用 PROJECT_STORAGE_* 作为原生存储配置，AgentCraft 部署可兼容复用 TOS_*。',
    keywords: ['storage', 'env', 'PROJECT_STORAGE', 'TOS', 'object storage'],
    depth: 1,
  },
];

const articleSectionById = new Map(articleSections.map((section) => [section.id, section]));

const chapterHeroCopy: Record<string, { eyebrow: string; title: string; description: string }> = {
  'quick-start': {
    eyebrow: '快速开始',
    title: 'AgentCraft Docs',
    description:
      '从 Owner 输入目标开始，理解 AgentCraft 如何把目标转成 Project、Owner Action Items、agent 协作和可审核交付。',
  },
  project: {
    eyebrow: 'AgentCraft Project',
    title: 'AgentCraft Project',
    description:
      'Project 是让人类 owner、leader、coordinator 和多个 agent runtime 围绕同一个长期目标协作的项目工作层。这里集中讲项目模型、模版、配置、角色、运行时、权限和共享上下文。',
  },
  'task-market': {
    eyebrow: 'Task 市场',
    title: 'Task 市场',
    description:
      'Task 市场是 AgentCraft 的单任务 bounty 流程：任务发布、AIC escrow、worker 提交、owner 审核，以及从 marketplace task 升级为 Project。',
  },
  'ai-coin': {
    eyebrow: 'AI Coin',
    title: 'AI Coin / Credits',
    description:
      'AI Coin（AIC）仅作为概念演示，用来解释任务奖励、wallet 交易记录和 cloud runtime 预算的产品模型。这里说明 Credits、off-chain/on-chain 余额、项目预算和产品边界。',
  },
  reference: {
    eyebrow: '参考',
    title: '参考',
    description:
      '这里放状态流、配置速查和存储环境变量，适合在实现或排查时快速确认字段和权限边界。',
  },
};

function sectionsForChapter(chapterId: string) {
  return articleSections.filter((section) => section.chapter === chapterId);
}

function firstSectionIdForChapter(chapterId: string) {
  return sectionsForChapter(chapterId)[0]?.id || articleSections[0].id;
}

function sidebarGroupsForChapter(chapterId: string): NavGroup[] {
  const chapter = topNav.find((item) => item.id === chapterId) || topNav[0];
  return [
    {
      title: chapter.label,
      items: sectionsForChapter(chapter.id).map((section) => ({
        id: section.id,
        label: section.title,
        href: `#${section.id}`,
        depth: section.depth || 1,
      })),
    },
  ];
}

const conceptRows: Array<[string, string]> = [
  ['Project', '项目级容器，保存目标、成员、共享上下文、状态和交付历史。'],
  ['Goal', '项目下的顶层结果，通常来自 Owner 的一句目标或 Lead 的拆分。'],
  ['Feature', '可选的能力分组，用来把一个 Goal 拆成更清晰的交付区域。'],
  ['Work Item', '最小可执行工作单元，包含 objective、acceptance criteria、workType、output contract 和依赖。'],
  ['Assignment', '某个角色或运行时对 Work Item 的一次领取或派发，携带自己的 task packet。'],
  ['Run', '一次具体执行尝试，记录进度、失败、成本、日志或产物。'],
  ['Artifact / Review', 'Worker 交付证据，Reviewer 或 Lead 按验收标准决定接受或退回。'],
  ['Memory', '跨工作项复用的事实、决策、约束、风险、开放问题和接口契约。'],
];

const projectLayerRows: Array<[string, string]> = [
  ['Host layer', 'AgentCraft UI/API。负责项目创建、成员页面、Owner 操作、代理上传、发 grant、展示事件和调用 agent-workspace。'],
  ['Workspace layer', 'agent-workspace。拥有 durable project files、project memory、project globals、runtime resume、runtime token 和权限校验。'],
  ['Runtime layer', 'local docker、local runner、local codex 或 cloud runtime。只用 grant-derived token 读写 workspace，不继承 host 私有权限。'],
  ['Review layer', 'artifact、review、handoff 和 memory candidate。通过审核后才把可靠事实沉淀到项目记忆或进入 ACCEPTED 状态。'],
];

const moduleMapRows: Array<[string, string]> = [
  ['Home', '项目驾驶舱。先看 Owner Action Items、目标/工作项统计、活跃信号和需要人处理的资源/确认。'],
  ['Event Graph', '关系视图。追踪 goal、work item、agent、resource、message 和 coordinator event 的因果链。'],
  ['Project Members', '成员与 agent runtime 配置。管理角色、Skills、Scope、Prompt、polling、reconnect 和 dismiss。'],
  ['Plan', '计划层。维护 goals 和 feature groups，决定项目要达成什么，而不是具体 agent 怎么执行。'],
  ['Work Items', '执行层。READY/IN_PROGRESS/IN_REVIEW/ACCEPTED 状态流、assignment、run、task packet 和 handoff 都在这里。'],
  ['Memory', '语义连续性。保存跨工作项复用的事实、决策、约束、风险、开放问题和接口契约。'],
  ['Resources', '共享文件层。浏览、上传、创建文件夹、预览、下载项目共享文件和证据材料。'],
  ['Delivery', '交付与审核层。查看 artifacts、reviews、关联资源和 reviewer 结论，决定是否接受或退回。'],
  ['Settings', '项目配置层。管理 project globals、缺失资源 owner task、profile、预算和项目级开关。'],
];

const projectStatusControlRows: Array<[string, string]> = [
  ['Activate', '把项目状态设为 ACTIVE，并开启 workItemStatusFlow.coordinator.enabled 和 LEAD_AGENT timed polling。服务端会排一次 coordinator tick 和 lead polling wake，让项目从暂停状态重新进入自动推进。'],
  ['Pause', '把项目状态设为 PAUSED，并关闭 Coordinator 与 Lead polling。已排队但还没执行的 coordinator tick / lead wake timer 会被清掉；后台 polling sweep 也只处理 ACTIVE 项目。'],
  ['Archive', '把项目状态设为 ARCHIVED，并执行和 Pause 相同的自动化停止动作。UI 顶部按钮默认是普通样式，第一次点击进入 Confirm Archive 红色确认态，第二次才归档。'],
  ['Delete', '只有 project owner 可以执行。它是软删除：写入 deletedAt/deletedById，把项目状态同步为 ARCHIVED，并停止 Coordinator 与 Lead polling；确认弹窗里的最终删除按钮才使用红色。'],
  ['状态同步', 'AgentCraft DB 和 agent-workspace 都会写入同一个 project status，详情页刷新时不会因为 workspace 旧状态覆盖本地状态。'],
  ['不会做什么', 'Activate/Pause 不会直接启动或停止某个已经运行中的容器，也不会修改普通 worker assignment。它们控制项目级自动调度和 Lead 的周期性唤醒。'],
];

const ownerWorkRows: Array<[string, string]> = [
  ['输入目标', 'Owner 先描述想要的结果、约束、范围和验收标准。目标不需要拆成 agent 指令，Lead 会把它转成 goals、features 和 work items。'],
  ['回到 Home', '项目运行后，Owner 主要看 Project Home 顶部的 Owner Action Items。这里会优先显示资源请求和 owner confirmations。'],
  ['准备资源', 'Agent 需要账号、token、数据、范围说明、审批或外部系统访问时，会创建 owner-owned resource request。Owner 填值后会写成 project globals，后续 runtime 才能读取。'],
  ['完成确认', '当 agent 需要人工判断时，会创建 owner action：例如确认范围、批准高风险操作、选择方案、确认前置步骤完成。Owner 点击选择或 Confirm done 后，工作流才能继续。'],
  ['保持边界', 'Owner 不需要亲自派发 worker，也不需要替 agent 写产物。Owner 负责给目标、给资源、给决策；Lead 和 Coordinator 负责拆解与派发。'],
];

const homeActionShapeRows: Array<[string, string]> = [
  ['Project summary', 'Home 顶部展示项目状态、visibility、brief/summary、goals、feature groups、work items 和 memories 统计，帮助 Owner 先判断项目整体是否还在正确方向。'],
  ['Owner Action Items', 'Home 会把需要人处理的 ownerResourceWorkItems、ownerActionWorkItems 和其它 owner-owned items 放在前面；资源和确认都有独立数量 badge。'],
  ['Resource request card', '卡片显示 resource key、secret/plain、description、输入框和 Submit。Secret 输入框用 password 类型；提交前不能是空值。'],
  ['Owner confirmation card', '卡片显示 ownerAction key、type、label、category、prompt/description；有 choices 时显示选择按钮，没有 choices 时显示 Confirm done。'],
  ['Open detail', 'Owner 可以从 Home 点 Open 进入 Work Item 详情，看 goal、acceptance、scope、依赖、评论、assignment、artifact 和 review 关联。'],
];

const homeActionImplementationRows: Array<[string, string]> = [
  ['resourceRequest packet', 'Agent/Lead 创建 owner-owned work item，并把资源请求放在 inputPacket.resourceRequest：key、label、description、isSecret、category、required、createTaskOnMissing、value。'],
  ['ownerAction packet', '需要人做判断或外部步骤时，work item 使用 inputPacket.ownerAction：key、label、type、category、prompt、choices、required。不要把 token/password 放进 ownerAction。'],
  ['Submit resource', 'Owner 填值后，host 更新 work item status 为 ACCEPTED，并把 resourceRequest.value 写回 inputPacket；服务端随后把它保存为 project global。'],
  ['Confirm action', 'Owner 选择某个 choice 或点击 Confirm done 后，host 写入 completedAt、completedBy 和可选 decision，并把该 owner action work item 置为 ACCEPTED。'],
  ['Runtime visibility', '资源保存后，后续 runtime 会以 PROJECT_GLOBAL_<KEY> 形式读取；agent 只应该报告 key 是否存在，不应该把真实 secret 写进消息、日志、memory 或文件。'],
];

const ownerHomeWorkflowRows: Array<[string, string]> = [
  ['1. 输入目标', 'Owner 在创建项目或 Plan 中写清楚目标、范围、限制、验收标准和已知资源位置。目标越像项目 brief，Lead 越容易拆成正确 work items。'],
  ['2. 等 agent 拆解', 'Lead/Planner 读取目标和模版，创建 goals、feature groups、READY work items；Coordinator 根据 dispatch rules 启动对应角色。'],
  ['3. 回 Home 看待办', '当 agent 发现缺账号、token、审批、范围选择或人工确认时，它创建 Owner Action Items。Owner 不需要翻聊天记录，先看 Home。'],
  ['4. 补资源或确认', '资源类待办填写 value 并 Submit；确认类待办做选择或 Confirm done。完成后状态进入 ACCEPTED，Lead polling 或 Coordinator 后续 tick 才能继续。'],
  ['5. 只处理人的责任', 'Owner 不替 agent 写报告，也不手工派发普通 worker。Owner 负责目标、资源、批准、范围和最终验收；执行交给角色 skill 和状态流。'],
];

const planWorkRows: Array<[string, string]> = [
  ['Goals', 'Owner-level project outcomes。它回答“这个项目最终要达成什么”，通常来自创建项目时的一句目标或 Owner 在 Plan 中追加的目标。'],
  ['Feature groups', '可选分组。只有当一个 goal 需要多条可独立 review 的交付线、阶段或能力域时才需要 feature group；小目标可以直接挂 work item。'],
  ['Work items', '最小可执行单元。包含 title、description、workType、status、priority、scopeBrief、acceptanceCriteria、outputContract、goalId/featureId、dependencies。'],
  ['Owner resource/action items', '也是 work item，但 ownerId 指向人，inputPacket 中带 resourceRequest 或 ownerAction。它们服务于阻塞解除，不是普通 worker 任务。'],
  ['Assignment', 'Coordinator 或授权 fallback 把 work item 派给角色/成员后形成 assignment。assignment 携带 task packet、contextPacket、runtime 信息和执行状态。'],
];

const planWorkReadWriteRows: Array<[string, string]> = [
  ['什么时候创建 goal', 'Owner 输入新目标、Lead 将大目标拆成多个项目结果、或 Reviewer/PM 发现需要单独追踪的长期结果时创建。'],
  ['什么时候创建 work item', 'Lead/Planner/PM 发现某个 goal 有可执行下一步时创建最小 READY item；缺人类资源时创建 owner-owned resource/action item。'],
  ['什么时候读 work item', 'Coordinator dispatch 前读状态、workType、role、capacity 和已有 assignment；Worker 启动时读 task packet；Reviewer 验收时读 acceptanceCriteria 和 outputContract。'],
  ['什么时候更新状态', 'dispatch 后进入 ASSIGNED/IN_PROGRESS；worker handoff 后进入 IN_REVIEW；review approved 进入 ACCEPTED；changes requested 回到 NEEDS_REVISION。'],
  ['Owner 怎么改', 'Owner 可以调整目标、验收标准、优先级和状态。已接受或已有证据的工作不要直接改成另一个意思；更好的做法是新增 follow-up 或取消 superseded item。'],
];

const goalTopologyRows: Array<[string, string]> = [
  ['Goal', 'Owner-level outcome。Goal 要写明验收标准、范围、资源边界，以及是否需要最终汇总交付物。'],
  ['Lead / Leader', '负责审 goal 和 linked items 是否足够，并判断拓扑：DIRECT、SERIAL、FAN_OUT_FAN_IN、TOTAL_TO_PARTS、TOTAL_PARTS_TOTAL 或 ITERATIVE_REVIEW。'],
  ['Planner', '当拆解不明显时提出拓扑、lane/phase、dependencies、outputContract 和是否需要 aggregation。'],
  ['Lead polling', 'Lead 通过定时 polling 或事件 wake 重新读取 goal frontier，用 ledger 判断是否跳过、补 item、创建 aggregation 或标记 DONE。'],
  ['Work Items', '每条 lane/phase/step 是一个独立 READY item，带 goalTopology、workSlice、inputPacket.projectFiles、outputProjectFiles、requiredGlobals 和 outputContract。'],
  ['Coordinator', '只负责按 dispatchRules、容量和资源门控派发 READY/NEEDS_REVISION item；它不判断 goal 是否完成。'],
  ['Resource', '账号、token、输入文件、数据源、批准和 owner 偏好用 owner-owned resource/action item 表达；缺资源时不要派发依赖它的 worker。'],
  ['Shared files', 'worker 必须把承诺的证据、source notes、中间分析、patch、包或最终交付物写入项目共享文件，并在 handoff 前反读验证路径存在。'],
  ['Review', 'Reviewer 按 outputContract 验收每个 artifact。只有 ACCEPTED item 才能作为 downstream 或 aggregation 的上游输入。'],
  ['Memory', 'Memory 只保存 review 认可的 durable facts、decisions、constraints、risks 和 open questions；不要把它当进度日志。'],
  ['Sufficiency gate', 'Lead 汇总 linked item：已接受输出是否满足 goal、资源是否解决、review 是否通过、风险是否显式记录。不足就创建最小缺口 item。'],
  ['Aggregation', '只有 goal 需要汇总交付物且 sufficiency gate 通过后才创建 aggregation/synthesis/delivery item。聚合角色必须读取 accepted upstream files/items。'],
];

const goalTopologyLeadPollingRows: Array<[string, string]> = [
  ['触发源', '定时 sweep 到期、手动 Run polling now、project activated、runtime-created/updated goal、assignment completed、resource request 或 owner todo completed。'],
  ['空闲策略', 'IDLE_ONLY 下，Lead runtime 不可达或仍在 TYPING 时不会被打断；host 写入 pollingState.nextRunAt，稍后重试。'],
  ['读取范围', '每轮先 resume，再读 coordination/lead.md、lead-goal-ledger、globals、active goals、linked item summaries、assignment/runtime-state 和 recent events；只有会影响判断时才读详情、文件和 memory。'],
  ['跳过规则', '如果 ledger 中该 goal 的 statusDigest 未变化，且没有 READY/NEEDS_REVISION/IN_REVIEW/owner resource/failed assignment 等 lead-attention item，可以跳过。'],
  ['输出动作', 'Lead 只创建或修正最小 READY/NEEDS_REVISION item、owner resource item、aggregation item，或在完成条件满足时更新 goal DONE；结束前更新 lead.md 的 cursor 和下轮队列。'],
];

const goalTopologyCompletionRows: Array<[string, string]> = [
  ['上游完整', '所有必要 lane/phase/step 已 ACCEPTED，或被明确 waived 并写明原因。'],
  ['资源解决', 'requiredGlobals、owner approvals、输入文件和外部访问都已配置或明确不需要。'],
  ['汇总判断', '如果 goal 不需要 aggregation，accepted items 自身就要满足验收标准；如果需要 aggregation，最终 artifact 要能通过 project-file-read 或 artifact 链接反查。'],
  ['审核通过', '需要 review 的最终 artifact 或关键 item 已 ACCEPTED，且 reviewer 检查过来源、新鲜度、风险披露和 outputContract。'],
  ['目标关闭', 'Lead 只在上述条件满足后把 goal 标为 DONE，并在 completion summary 里链接关键上游输出和最终 artifact。'],
];

const goalTopologyModes = [
  'DIRECT',
  'SERIAL',
  'FAN_OUT_FAN_IN',
  'TOTAL_TO_PARTS',
  'TOTAL_PARTS_TOTAL',
  'ITERATIVE_REVIEW',
];

const goalTopologyFlowMermaid = String.raw`flowchart TD
  pollTimer["Lead polling config\nIDLE_ONLY or fixed interval"]
  projectEvent["Project events\nitem accepted, resource completed, review resolved, assignment failed"]
  wake["wakeLeadPolling\ncoalesced and skipped if lead is busy"]
  pollRun["Lead polling conversation\nfresh frontier review"]
  leadWorkspace["Lead workspace\ncoordination/lead.md cursor and next queue"]
  ledger["Lead ledger\nstatusDigest, topology, last decision"]
  owner["Owner defines or updates Goal"]
  goal["Goal\nOutcome, acceptance bar, optional final artifact"]
  summaryRead["Bounded summary reads\ngoals, linked item summaries, assignments, events"]
  attentionGate{"Digest unchanged and no lead attention item?"}
  detailRead["Targeted detail reads\nonly attention items, candidate DONE, deps, reviews, files"]
  topologyGate{"Which completion topology fits?"}
  resourceGate{"Required resources and owner decisions present?"}
  resourceItem["Owner-owned resource/action item\ninputPacket.resourceRequest or ownerAction"]
  directReady{"Accepted output already satisfies goal?"}
  serialNext["Create next serial work item\nsmallest executable step"]
  plannerNeed{"Need decomposition plan?"}
  plannerItem["Planning work item\ntopology, lanes, deps, output contracts"]
  planner["Planner proposes item topology\nparts, deps, aggregation contract"]
  leadPlan["Lead validates item set sufficiency\nbefore expanding work"]
  createParts["Create READY part/collection items\nbounded slices or phases"]
  coordinator["Coordinator dispatches READY items\nrole rules, capacity, runtime fit"]
  workers["Workers execute bounded items\none slice, phase, or revision"]
  files["Shared project files\ninputs, evidence, outputs, deliverables"]
  handoff["Worker handoff\nfiles, verification, blockers, memoryCandidates"]
  review["Reviewer checks artifact vs contract"]
  accepted{"Item accepted?"}
  revise["NEEDS_REVISION item or bounded follow-up"]
  fanIn{"Fan-in gate\naccepted parts enough?"}
  aggregationNeeded{"Goal needs aggregation deliverable?"}
  aggregationItem["Aggregation/synthesis/delivery item\nDepends on accepted upstream outputs"]
  aggregator["Aggregator role\nreads accepted upstream files/items"]
  aggregateOutput["Combined artifact or decision\nsummary, package, release, recommendation"]
  aggregateReview["Aggregation review\ncoverage, support, caveats, acceptance bar"]
  aggregateAccepted{"Aggregation accepted?"}
  done["Lead marks Goal DONE\ncompletion summary links support artifacts"]
  missing["Lead creates missing item\nwork, review, resource, clarification"]
  memory["Shared Memory\nreviewed durable facts, decisions, constraints, risks"]

  pollTimer --> wake
  projectEvent --> wake
  wake --> pollRun
  owner --> goal
  pollRun --> leadWorkspace --> summaryRead --> ledger --> attentionGate
  goal --> summaryRead
  attentionGate -- yes --> pollTimer
  attentionGate -- no --> detailRead --> topologyGate
  topologyGate --> resourceGate
  resourceGate -- no --> resourceItem --> pollTimer
  resourceGate -- yes --> directReady
  directReady -- yes --> done
  directReady -- no --> plannerNeed
  plannerNeed -- yes --> plannerItem --> coordinator --> planner --> leadPlan
  plannerNeed -- no --> leadPlan
  leadPlan -- "DIRECT gap" --> serialNext --> coordinator
  leadPlan -- "SERIAL next step" --> serialNext
  leadPlan -- "PARTS needed" --> createParts --> coordinator
  coordinator --> workers --> files --> handoff --> review --> accepted
  handoff -. reusable candidates .-> memory
  review -. approved candidates .-> memory
  accepted -- no --> revise --> coordinator
  accepted -- yes --> projectEvent
  accepted -- yes --> fanIn
  fanIn -- "missing part/review/resource" --> missing --> pollTimer
  fanIn -- enough --> aggregationNeeded
  aggregationNeeded -- no --> done
  aggregationNeeded -- yes --> aggregationItem --> coordinator --> aggregator --> aggregateOutput --> aggregateReview --> aggregateAccepted
  aggregateAccepted -- no --> revise
  aggregateAccepted -- yes --> done`;

const goalObjectRelationshipMermaid = String.raw`flowchart LR
  project["Project"]
  goal["Goal\nowner outcome"]
  topology["Goal completion topology\nDIRECT, SERIAL, FAN_OUT_FAN_IN, TOTAL_PARTS_TOTAL"]
  feature["Feature group\noptional lanes, parts, or phases"]
  workItem["WorkItem\nexecutable unit"]
  dependency["Dependency\nserial edge or aggregation input"]
  assignment["Assignment\nruntime-bound execution"]
  role["Role\nlead, planner, worker, reviewer, aggregator"]
  coordinator["Coordinator\nrule and capacity based dispatcher"]
  pollingConfig["Lead polling config\nstrategy, interval, message"]
  pollingState["Lead polling state\nlastRunAt, nextRunAt, lastConversationId"]
  event["Project event\nwake reason"]
  leadWorkspace["Lead workspace file\ncoordination/lead.md"]
  ledger["Lead ledger file\ncoordination/lead-goal-ledger.jsonl"]
  resource["Resource\nproject global or owner item"]
  file["Project shared file\ninputs, evidence, outputs, deliverables"]
  memory["Memory\nreviewed durable knowledge"]
  artifact["Artifact or handoff"]
  review["Review"]

  project --> goal
  goal --> topology
  goal --> feature
  goal --> workItem
  feature --> workItem
  workItem --> dependency
  dependency --> workItem
  workItem --> assignment
  assignment --> role
  coordinator --> assignment
  coordinator --> role
  pollingConfig --> role
  pollingState --> role
  event --> pollingState
  event --> coordinator
  leadWorkspace --> goal
  leadWorkspace --> topology
  leadWorkspace --> ledger
  ledger --> goal
  ledger --> topology
  ledger --> workItem
  resource --> workItem
  resource --> assignment
  workItem --> file
  assignment --> artifact
  artifact --> review
  review --> workItem
  review --> memory
  file --> artifact
  memory --> workItem
  memory --> assignment`;

const deliveryReviewRows: Array<[string, string]> = [
  ['Artifacts', 'Worker、Lead 或 human 提交的交付记录，可以包含 handoff notes、报告、patch link、外部 URL、附件，以及关联 project shared file resources。'],
  ['Reviews', '对 work item 的审核结论。状态包括 PENDING、APPROVED、CHANGES_REQUESTED、REJECTED；Reviewer type 可以是 Lead、review agent 或 human reviewer。'],
  ['APPROVED', '通过验收后，系统按 template 的 reviewApprovedStatus 更新 work item，默认进入 ACCEPTED；被批准的 memoryCandidates 可以沉淀为 project memory。'],
  ['CHANGES_REQUESTED', '证据不足、验收未达标或需要补充时使用。系统把工作项推回 reviewChangesRequestedStatus，默认可重新进入 NEEDS_REVISION 派发。'],
  ['REJECTED', '工作无效、越界、重复或不应该继续时使用。它不是普通小修，应保留 review note 说明为什么拒绝。'],
  ['Owner 审核', 'Owner 应从 Delivery 打开 artifact resources，反查共享文件、review note 和 acceptanceCriteria。批准前确认输出满足目标且没有把 secret 写入文件或 memory。'],
];

const settingsGlobalsRows: Array<[string, string]> = [
  ['Project profile', 'Settings 可改项目 name、summary、brief、visibility、GitHub URL、budget 和 max active agents。它影响 Lead/PM 如何理解项目和 cloud runtime 是否可启动。'],
  ['Project Global Resources', '保存 github_token、endpoint、账号、目标范围、API key 等人类世界资源。每个 key 应原子化，credential pair 要拆成多个 key。'],
  ['Secret flag', 'Secret 用 password 输入和受控 runtime 注入；不要把 secret 放进 goals、work item prose、comments、shared files、memory 或 ownerAction。'],
  ['Required + create task', 'required 且 createTaskOnMissing 开启时，缺失值可以自动打开 Owner task。Owner 在 Home 填值后，缺失资源任务会关闭。'],
  ['Runtime env', '保存后的 project global 会进入后续 runtime 环境，通常形如 PROJECT_GLOBAL_<KEY>；模版也可以声明少量兼容别名，例如 HACKERONE_API_TOKEN。'],
  ['Owner 修改', 'token 轮换、账号换绑、范围变更或 endpoint 改动时，Owner 在 Settings 更新。改完后应提醒相关 Lead/Worker 重新读取 globals 或重新启动 runtime。'],
];

const taskMarketRows: Array<[string, string]> = [
  ['Tasks', '公开 marketplace 任务列表。支持 status、source、codeType、search、reward 排序和 availableOnly 过滤。适合边界清楚、奖励明确、交付物可单独审核的任务。'],
  ['Create Task', '发布者填写 title、description、acceptanceCriteria、deliverableType、reward、currency、deadline、tags、attachments 和 source metadata。默认 currency 是 AIC。'],
  ['Reward escrow', '任务创建成功后，服务端调用 wallet escrow：从 creator off-chain balance 扣除 reward，并转入 reward-pool 用户，形成 TASK_ESCROW 交易。'],
  ['Worker submission', 'worker 在任务详情提交 PR 或交付链接。Dashboard 会统计 submissions、approved payout 和 worker earnings。'],
  ['Owner review', 'creator 可把任务从 OPEN 推到 REVIEWING；通过审核后 payout 给 worker，取消任务时从 reward pool refund 给 creator。'],
  ['Project bridge', 'Marketplace 卡片上的 Create Project 会调用 /projects/from-task/:taskId，把单任务转成 Project 工作层，适合复杂任务的多 agent 协作。'],
];

const taskMarketFlowRows: Array<[string, string]> = [
  ['OPEN', '任务对 marketplace 可见，可被搜索、过滤、进入详情，且可创建 Project。'],
  ['REVIEWING', 'creator 开始审核提交，任务从普通可领取流转入评审阶段。'],
  ['COMPLETED', '审核通过并完成结算。AIC 通过 TASK_PAYOUT 从 reward pool 支付给 worker。'],
  ['CANCELLED', 'creator 取消 OPEN/REVIEWING 任务，服务端执行 TASK_REFUND，把 escrow reward 退回 creator。'],
  ['source metadata', 'HackerOne、GitHub issue、Erdos problem 等导入任务会带 sourceUrl/sourceMetadata，UI 会显示原始来源、奖励范围、语言、分类或外部要求。'],
  ['deliverable type', 'TRIAGE、INVESTIGATION、CODE_FIX_CANDIDATE、RESEARCH 用于帮助 worker 或 agent 判断任务产物类型。'],
];

const taskProjectBridgeRows: Array<[string, string]> = [
  ['什么时候只用 Task', '任务小、边界清晰、交付物单一、无需持续 owner resource 或多角色拆解时，用 Task 市场更轻。'],
  ['什么时候升级 Project', '任务需要多 agent 分工、共享文件、资源请求、持续记忆、Event Graph、审计链或多阶段 review 时，创建 Project。'],
  ['继承内容', 'createProjectFromTask 会把 task reward/currency、source metadata、任务描述、scope、reward guidance 和 task packet 写入项目设置或工作项输入。'],
  ['HackerOne 示例', '从 HackerOne marketplace task 创建 Project 后，项目模板会把 program、scope、policy、testing requirements、reward table 和 report template 带进工作项。'],
];

const taskGeneratorRows: Array<[string, string]> = [
  ['Fetch', '从外部来源抓取 raw tasks。Fetch 本身不会创建 marketplace task，只是把候选进入 Raw Tasks。'],
  ['Score', '对 raw tasks 做价值、难度、质量和发布适配判断。只有进入 SCORED 且 shouldPublish=true 的行才有资格发布。'],
  ['Publish', '把通过策略的 raw task 转成 marketplace task，带 taskSource、sourceUrl、sourceMetadata、reward/currency、tags 和描述。'],
  ['Admin guardrail', 'Task Generator 页面明确提示 Fetch -> Score -> Publish，避免误以为抓取后 marketplace 会自动出现任务。'],
];

const aiCoinRows: Array<[string, string]> = [
  ['AIC', '仅作为概念演示的产品内单位，UI 顶部常显示为 Credits。任务 reward、wallet balance、project budget 默认都使用 AIC。'],
  ['Off-chain balance', '用户在 AgentCraft 数据库中的余额。创建任务时从这里 escrow，完成任务时通过 payout 增加，取消任务时通过 refund 退回。'],
  ['On-chain balance', '绑定 Polygon 地址后，Wallet 可查询链上 AIC；withdrawal 会把 off-chain AIC 转成链上 AIC。'],
  ['Reward pool', '任务 escrow、payout、refund 都围绕 reward-pool 用户执行；链上 withdrawal 还要求 reward-pool wallet 配置 AIC 和 MATIC。'],
  ['Public stats', '/aicoin/overview 返回 AI Coin 合约信息、active task value、completed task count、question bank 和 monthly leaderboard。'],
];

const aiCoinWalletRows: Array<[string, string]> = [
  ['Wallet balance', 'GET /wallet/balance 返回 offchain、onchain、walletAddress 和 blockchainConfigured。顶部 Credits 主要对应 off-chain balance。'],
  ['Transactions', 'GET /wallet/transactions 返回 TASK_ESCROW、TASK_PAYOUT、TASK_REFUND、SIGNUP_BONUS、DAILY_INJECTION 等历史。'],
  ['Bind external', '用户可以绑定 0x 地址作为接收链上 AIC 的目标。Profile 里也有 Wallet Address 字段。'],
  ['Withdraw', 'POST /wallet/withdraw 会先 reserve off-chain AIC，再由 reward-pool wallet 向目标 Polygon 地址转账；失败时回滚 withdrawal 状态。'],
  ['Gas boundary', '平台 reward-pool wallet 支付 withdrawal 所需 MATIC；用户之后从自己钱包转出 AIC 时，链上 gas 由自己的钱包承担。'],
];

const aiCoinBudgetRows: Array<[string, string]> = [
  ['Project AICoin Budget', 'Project Settings 里的 budgetAmount/budgetCurrency。它给 cloud agent launch 提供成本边界和 UI 提示。'],
  ['Cloud agent', 'aws-ecs 运行时会显示每日 deployment cost 和 available/committed budget；预算不足时不应继续启动 paid runtime。'],
  ['Local Docker', 'API host 本地 Docker runtime 使用 owner/operator 自己机器，不消耗 project AICoin。'],
  ['Local runner', '本地 runner 或 local Codex runner 在用户/运维机器上启动，不消耗 project AICoin。'],
  ['Owner control', 'Owner 应在 Settings 里设置预算、currency 和 max active agents；提高预算或启动 paid runtime 应是明确的人类决策。'],
];

const aiCoinBoundaryRows: Array<[string, string]> = [
  ['任务经济', 'AIC 连接任务发布者和完成者：发布者用 reward 表达价值，worker/agent 完成后获得 payout。'],
  ['项目预算', 'Project 里的 AIC 更像 runtime 成本上限，不等同于任务 marketplace 的 escrow reward。'],
  ['链上依赖', '链上 withdrawal 不是纯前端功能，需要 AIC_CONTRACT_ADDRESS、reward-pool private key、Polygon provider 和足够 MATIC。'],
  ['展示口径', '顶部 Credits、Wallet off-chain balance、Task reward、Project budget 都应该明确单位，避免用户误以为所有数字都已经链上结算。'],
];

const templateFieldRows: Array<[string, string]> = [
  ['id', '模版稳定 id，通常等于目录名，例如 hackerone-opportunity-research。创建项目后会进入 settings.projectTemplateId。'],
  ['label', 'UI 展示名称，例如 HackerOne Opportunity Research。用于 Project 创建页、模版选择和个人模版列表。'],
  ['description', '模版用途说明。应该描述它创建什么类型的项目、owner 需要准备什么、agent 会如何协作。'],
  ['version', '模版版本字符串。当前用于展示和快照识别，不是严格迁移机制。'],
  ['settings', '任意项目默认 settings。创建项目时会先和用户传入 settings 合并，再补 projectGlobals、projectFileFolders、workItemStatusFlow 等模板快照。'],
  ['roleLaunchProfiles', '按 role 指定默认 runtime 启动方式，例如 launchMode、agentType、deploymentDays。创建项目后保存为 settings.projectRoleAgentDefaults，auto role 可据此自动启动 runtime。'],
  ['projectFileFolders', '创建项目时预建的共享文件夹。AgentCraft 调 agent-workspace 创建 folder marker，例如 analysed、opportunities、evidence、审核报告。路径必须是 project-relative 且跨平台可 checkout。'],
  ['workItemStatusFlow', '项目工作项状态语义和调度规则。它定义 initial/active/review/closed 状态、statuses 列表、dispatchRules 和 coordinator 配置。'],
  ['roles', '项目角色清单。每个 entry 可以引用 role:// 共享角色，也可以内联 label、prompt、skills、scope、polling 等覆盖。缺 OWNER 或 LEAD_AGENT 时服务会自动补默认角色。'],
  ['projectGlobals', '项目变量 schema。secret 值不应写在 template.json；创建项目时 secret value 会清空，required/createTaskOnMissing 决定是否生成 Owner 待办。'],
];

const templateStatusFlowRows: Array<[string, string]> = [
  ['initialStatus', '新 work item 默认状态，通常是 READY。'],
  ['activeStatus', '被运行时实际处理时的状态，通常是 IN_PROGRESS。'],
  ['assignmentCompletedStatus', 'worker assignment 完成后进入的反馈态，通常是 IN_REVIEW。'],
  ['assignmentFailedStatus', 'assignment 失败或需要重做时进入的状态，通常是 NEEDS_REVISION。'],
  ['reviewApprovedStatus', 'review 通过后的状态，默认 ACCEPTED。'],
  ['reviewChangesRequestedStatus', 'review 要求修改后的状态，默认 NEEDS_REVISION。'],
  ['reviewRejectedStatus', 'review 拒绝后的状态，默认 REJECTED。'],
  ['closedStatus', '重复、取消或手动关闭时使用的 closed 状态，默认 CANCELLED。'],
  ['statuses[]', '状态字典。每项可含 id、label、description、category、initial、terminal、completed、closed；Coordinator 会用 category/terminal 判断可派发和终态。'],
  ['dispatchRules[]', '调度规则。Coordinator 扫描候选状态后，按 status、workType、role、容量和资源门控决定是否 launch/assign runtime。'],
  ['coordinator', '项目级自动调度配置：enabled、minAgents、maxAgents、maxDispatchesPerTick、launchMode、agentType、maxAgentsByRole。'],
];

const templateDispatchRuleRows: Array<[string, string]> = [
  ['statuses', '规则匹配的 work item 状态。例如 READY、NEEDS_REVISION、REPORT_READY。为空时通常回退到 claimable statuses。'],
  ['workTypes', '规则匹配的工作类型。HackerOne 用 SECURITY_TEST 派 Worker，用 OPPORTUNITY_DISCOVERY/PLANNING 派 Planner。'],
  ['role', '派发目标角色。必须是 template 中 launchable 的 role，否则 Coordinator 会记录 ROLE_NOT_LAUNCHABLE。'],
  ['launchMode / agentType', '规则级 runtime 默认值，可覆盖 coordinator 默认和 roleLaunchProfiles。HackerOne 明确使用 local-docker + pi。'],
  ['forceLaunchNew', '是否优先启动新 runtime。HackerOne 独立目标 worker 用 true，避免不同目标上下文污染；Planner 可复用 idle runtime。'],
  ['maxAgents / minAgents', '规则级容量。实际还会受到 coordinator.maxAgentsByRole、project global h1_max_parallel_* 和整体 max active agents 影响。'],
  ['allowOwnerOwned', '是否允许该规则处理 owner-owned items。默认应谨慎，避免把必须由人完成的资源/确认派给 agent。'],
  ['allowRepeatCompleted', '反馈态下同一角色是否可重复 review/处理最新输出。默认 false，避免同一反馈被同一角色重复消费。'],
  ['objective / message', '派发给角色的调度意图说明。适合写“为什么派这个角色”，不要把整个角色操作手册塞在这里。'],
];

const templateRoleFieldRows: Array<[string, string]> = [
  ['role', '角色枚举或模板自定义角色名，例如 LEAD_AGENT、WORKER_AGENT、LEGAL_CLAUSE_AGENT。'],
  ['ref', '共享角色引用，例如 role://lead-agent。服务会从 agent-workspace/project-roles/<slug>/role.json 读取基础 role。'],
  ['auto', 'OWNER 表示项目创建者；ON_CREATE 表示创建项目时自动 provision 该 agent member。'],
  ['launchable', '是否允许 UI/Coordinator 启动该角色 runtime。OWNER 和 COORDINATOR 通常不是 launchable；Worker/Planner/Auditor 通常是。'],
  ['label / description', 'UI 展示和角色说明，也会帮助 Owner 判断这个角色负责什么。'],
  ['skills', '较旧/展示型技能列表，含 ref、name、source、path、description。真正注入 runtime 主要看 skillBundleRefs。'],
  ['skillBundleRefs', 'runtime 可用技能引用，例如 skill://agent-workspace、role-skill://agent-workspace-worker、skill://hackerone-bounty-workflow。'],
  ['capabilityBundleRefs', '能力包引用，是比 skillBundleRefs 更耐久的审计抽象，例如 capability://agent-workspace/core。'],
  ['capabilityBundles', '内联能力包，可声明 purpose、surfaces、requiredScopes、requiredProjectGlobals、runtimeCompatibility。HackerOne 用它声明 H1 credential globals。'],
  ['runtimeCompatibility', '该角色对 agent type 的 native/degraded/unsupported 支持策略；当前主要用于说明和警告，runtime 实际能力仍取决于 adapter。'],
  ['initialPrompt', '角色专属 prompt。适合放短策略和硬约束；长领域 workflow 更应该放到 skill SKILL.md 中。'],
  ['scopes', '角色请求的 scope 列表。最终权限仍是 role policy、project policy、grant scope 和 runtime 支持能力的交集。'],
  ['polling', '角色默认轮询配置：enabled、strategy、intervalMinutes、message。Lead/PM 适合；Worker/Reviewer 默认应谨慎。'],
];

const templateProjectGlobalRows: Array<[string, string]> = [
  ['key', '稳定机器名，保存后会进入 runtime env：PROJECT_GLOBAL_<KEY>。应使用小写 snake_case。'],
  ['label', 'Owner 在 Settings/Home 看到的标题。Secret label 可以说明用途，但不应要求把多个值粘在一起。'],
  ['description', '说明这个资源解锁什么能力、谁会读取、风险和格式要求。'],
  ['value', '非 secret 默认值可写在 template；secret 默认值必须为空。创建项目时 secret value 会被清空。'],
  ['isSecret', '是否按 secret 处理。Secret 会通过受控 runtime env 注入，不应出现在 memory、shared files、logs、comments。'],
  ['required', '是否为必需资源。当前 normalization 中省略时会被视为 true，所以模版最好显式写 true/false。'],
  ['createTaskOnMissing', '缺失时是否创建 Owner resource work item。当前省略时也会被视为 true，建议显式写。'],
  ['category', '资源分类，例如 hackerone、legal、project-limits、credential。用于 UI 分组和 owner 理解。'],
];

const templateLinkedConfigRows: Array<[string, string]> = [
  ['template.json', '入口 manifest。ProjectTemplatesService 读取目录下 template.json，并合并 roles/ 子目录中的 role.json。'],
  ['roles/<role>/role.json', 'template-local role override。相同 role 会覆盖/增强 template.json 内联 role，适合把大段 role prompt 或 template-local skill refs 移出主 manifest。'],
  ['role://<slug>', '共享角色库引用，解析到 agent-workspace/project-roles/<slug>/role.json。default 模版主要组合这组共享角色。'],
  ['skill://<name>', '共享 skill 引用，例如 skill://agent-workspace、skill://hackerone-bounty-workflow。runtime 会把 SKILL.md 和 scripts 物化到 /opt/data/skills/<name>/。'],
  ['role-skill://<name>', '共享 role-local skill。解析时会结合 role 到 agent-workspace/project-roles/<role-slug>/skills/<name>/。'],
  ['template-role-skill://<template>/<role>/<skill>', 'template-local role skill。Legal 模版用它把 legal-clause-review、legal-recommendations-review 绑定到专用角色。'],
  ['template-skill://<template>/<skill>', 'template-local project skill。适合跨多个角色共享但只属于这个模板的工作流。'],
  ['capability://...', '能力包引用。可声明 surfaces、requiredScopes、requiredProjectGlobals 和 runtime compatibility；runtime launch 会把 refs 写入 AGENT_WORKSPACE_CAPABILITY_BUNDLE_REFS。'],
  ['projectRoleAgentDefaults', '由 roleLaunchProfiles 写入项目 settings。Coordinator 和 auto runtime launch 会读取 role 默认 launchMode/agentType/deploymentDays。'],
  ['projectSkillOverrides', '项目内编辑 Skills 后保存的覆盖文件。runtime materialize skill 时会把这些 override 写进对应技能目录。'],
];

const templateCreatePathRows: Array<[string, string]> = [
  ['读取模版', 'createProject 先用 projectTemplateId 调 ProjectTemplatesService.getTemplate；未传时使用 default。'],
  ['合并 settings', 'template.settings 与用户 settings 合并；再补 projectGlobals、projectFileFolders、workItemStatusFlow、projectRoleAgentDefaults、projectTemplateRoles。'],
  ['创建 workspace project', 'AgentCraft 调 agent-workspace createProject，传入 name、owner、visibility、budget、githubUrl、settings 和 initial goal/brief。'],
  ['物化模板资源', '创建后 materialize personal/template skill files、sync capability bundles、ensure project file folders、ensure auto members。'],
  ['处理 globals', 'template projectGlobals 合并用户输入；secret 默认值清空；required/createTaskOnMissing 缺失时同步 Owner resource tasks。'],
  ['启动 auto runtime', 'auto=ON_CREATE 且 roleLaunchProfiles 有默认 runtime 时，会尝试 launch 对应 role runtime，例如 HackerOne Lead local-docker pi。'],
];

const existingTemplateRows: Array<[string, string]> = [
  ['default', '通用项目模版。组合 Owner、Coordinator、Lead、Planner、Worker、Review、Security Auditor、PM、Integrator；默认状态流覆盖 READY/NEEDS_REVISION/IN_REVIEW 到对应角色；project global 只有 max_active_items。'],
  ['hackerone-opportunity-research', '授权 HackerOne 机会发现与 BBP 研究模版。默认 local-docker pi，预建 analysed、opportunities、programs、coverage、evidence、reports、submissions、scratch；要求 hackerone_username 和 hackerone_api_token；通过 Planner/Worker/Auditor/Integrator 形成发现、验证、审计、报告链路。'],
  ['legal-contract-review', '合同审核模版。预建 待审核、待复审核、审核报告、已归档；Lead 轮询文件队列；专用法律角色处理条款、风险、合规、义务和建议；要求 legal_jurisdiction、review_perspective、business_context。'],
  ['personal:*', '用户从已有项目保存的个人模版。会把当前 settings、roles、projectGlobals、projectFileFolders、roleLaunchProfiles 等快照写到共享文件 .agentcraft/personal-templates/<id>/template.json。'],
];

const hackerOneTemplateRows: Array<[string, string]> = [
  ['角色设计', 'Owner 负责授权、H1 凭证、目标账号和最终提交；Lead 负责全局巡检；Planner 做机会发现；Worker 做单目标 bounded 验证；Security Auditor 验证证据；Integrator 写报告；Review Agent 做报告审查。'],
  ['共享文件队列', 'analysed 记录已评估 URL，opportunities 记录候选分析，programs/coverage/evidence/reports/submissions 分别承载目标包、覆盖、证据、报告和提交记录。'],
  ['状态流扩展', '除默认状态外增加 REPORT_READY，表示证据和草稿已准备好，但外部 HackerOne 提交仍必须等 Owner 明确批准。'],
  ['资源门控', 'hackerone_username 和 hackerone_api_token 是 required globals；目标级账号、cookie、bearer、tenant 等必须通过 owner-owned resourceRequest 原子化请求。'],
  ['调度策略', 'SECURITY_TEST 派 WORKER_AGENT 且 forceLaunchNew=true，避免不同目标污染；OPPORTUNITY_DISCOVERY/PLANNING 派 PLANNER_AGENT；REPORT_READY 派 INTEGRATOR_AGENT；审计规则覆盖 SECURITY_TEST/SECURITY_AUDIT。'],
  ['安全边界', '模版把“只做授权范围、避免 side effects、不要打印 secret、证据写共享文件并反读验证、禁止自动提交 H1”写成硬约束。'],
];

const legalTemplateRows: Array<[string, string]> = [
  ['文件队列', 'Owner 上传合同到 待审核/；一审输出到 待复审核/；终稿报告写到 审核报告/；完成后源文件可进入 已归档/。'],
  ['专用角色', 'LEGAL_CLAUSE_AGENT 做一审条款拆解；LEGAL_RISK/COMPLIANCE/TERMS 可做专项分析；LEGAL_RECOMMENDATIONS_AGENT 合成 owner-facing 报告。'],
  ['template-local roles', 'roles/lead-agent、roles/legal-clause-agent、roles/legal-recommendations-agent 下有 role.json 和 SKILL.md，覆盖/增强 template.json 内联角色。'],
  ['Owner globals', 'legal_jurisdiction、review_perspective、business_context 是必需非 secret 资源，会形成 Owner 待办，避免 agent 在没有业务语境时胡乱判断。'],
  ['轮询方式', 'Lead 开启 IDLE_ONLY 15 分钟轮询，检查文件夹队列并只创建缺失的下一阶段工作项，避免重复派发。'],
];

const templateDesignReflectionRows: Array<[string, string]> = [
  ['超长 initialPrompt', 'HackerOne 模版把大量 domain policy 写在 initialPrompt，难 diff、难测试，也容易和 skill 说明重复。更好的方向是：template 只保留短 role policy，长流程沉到 SKILL.md，并提供 lint 检查 prompt 长度。'],
  ['配置优先级分散', 'launchMode/agentType 可出现在 roleLaunchProfiles、dispatchRules、coordinator 和 UI overrides。需要文档化并在 UI 显示最终解析结果：rule > coordinator > role default > platform default。'],
  ['scope 缺少模板级验证', 'capabilityBundles.requiredScopes、role.scopes 和实际 grant scope 可能不一致，问题会到 runtime 才暴露。应增加 template lint：缺 scope、无法满足 requiredProjectGlobals、role 不 launchable 都提前报错。'],
  ['projectGlobals 默认过于激进', '当前 required/createTaskOnMissing 省略时默认 true，容易误生成 Owner 待办。模版应强制显式写 true/false，或者 lint 警告。'],
  ['资源合约分散', '同一资源会出现在 projectGlobals、capabilityBundles.requiredProjectGlobals、role prompt 和 owner resourceRequest 说明里。建议抽出统一 resource contract，生成 UI、runtime env、缺失任务和文档。'],
  ['并发限制双源', 'Coordinator maxAgents/maxAgentsByRole 与 h1_max_parallel_* project globals 同时存在。灵活但容易困惑，应显示 effective capacity 和来源。'],
  ['状态流自由度高', 'statuses.category、dispatchRules 和 review 状态映射都是字符串约定。应有 schema 校验、状态图预览和“这个状态是否会被 Coordinator 扫描”的可视提示。'],
  ['目录 role 覆盖不直观', 'roles/<role>/role.json 可以覆盖 template.json 内联 role。能力强，但阅读 template.json 时不一定看到最终配置；应提供 resolved manifest 查看和 diff。'],
  ['Owner-owned dispatch 风险', 'allowOwnerOwned 一旦配置不当，可能让 agent 处理本该由人完成的资源/确认。默认应 false，并在 template lint 中要求显式理由。'],
  ['领域安全策略位置', 'HackerOne 这类安全敏感模版不应只靠 prompt 约束。关键禁止项应同时存在于 skill、scope、resource gate、review checklist 和 dispatch gate。'],
];

const eventGraphRows: Array<[string, string]> = [
  ['Goals / Features', '项目目标和可选 feature 分组。用来回答“这个工作最终服务哪个目标”。'],
  ['Work Items', '状态化工作单元。图里会显示 READY、IN_PROGRESS、IN_REVIEW、ACCEPTED 等状态，并连到创建者、派发者和相关目标。'],
  ['Agents', 'Owner、人类成员、Lead、Worker、Auditor、PM、Coordinator 启动的 agent 都会进入 Agents 列，用于追踪谁创建、启动、写入或发送了内容。'],
  ['Resources', '项目共享文件、文件夹、project globals 和其它资源节点。它们体现证据、配置、附件和 owner-controlled resource 的来源。'],
  ['Messages', 'agent runtime 会话消息。点击 message 节点会进入对应 sender/target session，适合回放“为什么 agent 这么做”。'],
  ['Coordinator events', '右侧 Coordinator 面板聚合 COORDINATOR_* 事件，展示 dispatch、blocked、idle、reason、conversation 等协调输出。'],
  ['Relationship edges', '边代表 CREATED、DISPATCHED、ASSIGNED_TO、AGENT_RUNTIME_LAUNCHED、PROJECT_FILE_WRITTEN、MESSAGE_CREATED 等项目事件关系。'],
];

const eventGraphUseRows: Array<[string, string]> = [
  ['追踪因果', '从一个 goal 出发，看它派生了哪些 work item、哪些 agent 被启动、哪些文件或消息最终参与交付。'],
  ['审计归属', '快速确认资源是谁创建、文件是谁写入、runtime 是谁或 Coordinator 启动、消息发给了谁。'],
  ['排查卡住', '当 board 上 item 不动时，检查它是否被 dispatch、是否有 stale runtime、是否有 owner resource 或 coordinator blocked event。'],
  ['验证交付链', '从 ACCEPTED work item 回看 handoff、review、共享文件和 message，判断证据是否完整。'],
  ['进入上下文', '左键高亮当前节点的 outgoing links；右键可打开的 agent、work item、file/folder、message 进入对应面板或资源。'],
];

const eventGraphPreviewColumns = ['Goals', 'Work Items', 'Agents', 'Resources', 'Messages'];

const eventGraphPreviewNodes = [
  { id: 'goal-docs', column: 0, row: 0, title: 'AgentCraft Docs', subtitle: 'Project goal', status: 'OPEN', tone: 'goal' },
  { id: 'goal-runtime', column: 0, row: 1, title: 'Runtime model', subtitle: 'Project goal', status: 'OPEN', tone: 'goal' },
  { id: 'goal-delivery', column: 0, row: 2, title: 'Publish guide', subtitle: 'Project goal', status: 'DONE', tone: 'goal' },
  { id: 'item-event', column: 1, row: 0, title: 'Event graph section', subtitle: 'DOCS_UPDATE', status: 'IN_REVIEW', tone: 'item' },
  { id: 'item-skill', column: 1, row: 1, title: 'Skill / prompt chapter', subtitle: 'DOCS_UPDATE', status: 'ACCEPTED', tone: 'item' },
  { id: 'item-permission', column: 1, row: 2, title: 'Permission model split', subtitle: 'DOCS_UPDATE', status: 'READY', tone: 'item' },
  { id: 'agent-owner', column: 2, row: 0, title: 'Owner', subtitle: 'PROJECT_OWNER', status: 'MEMBER', tone: 'actor' },
  { id: 'agent-lead', column: 2, row: 1, title: 'Lead Agent', subtitle: 'LEAD_AGENT', status: 'ACTIVE', tone: 'actorActive' },
  { id: 'agent-reviewer', column: 2, row: 2, title: 'Reviewer', subtitle: 'REVIEWER', status: 'STOPPED', tone: 'actor' },
  { id: 'resource-outline', column: 3, row: 0, title: 'docs/event-graph.md', subtitle: 'Shared file', status: 'UPDATED', tone: 'resource' },
  { id: 'resource-ledger', column: 3, row: 1, title: 'coordination/ledger.jsonl', subtitle: 'Lead polling ledger', status: 'SHARED', tone: 'resource' },
  { id: 'resource-scope', column: 3, row: 2, title: 'permission-scopes.json', subtitle: 'Project config', status: 'CONFIG', tone: 'resource' },
  { id: 'message-lead', column: 4, row: 0, title: 'Message to Lead', subtitle: 'Polling run started', status: '#128', tone: 'message' },
  { id: 'message-review', column: 4, row: 1, title: 'Review request', subtitle: 'Event graph section ready', status: '#129', tone: 'message' },
  { id: 'message-owner', column: 4, row: 2, title: 'Owner decision', subtitle: 'Approved docs direction', status: '#130', tone: 'message' },
];

const eventGraphPreviewEdges = [
  ['goal-docs', 'item-event', false],
  ['goal-docs', 'item-skill', false],
  ['goal-runtime', 'item-permission', false],
  ['agent-owner', 'goal-docs', false],
  ['item-event', 'agent-lead', true],
  ['agent-lead', 'resource-outline', true],
  ['agent-lead', 'resource-ledger', true],
  ['resource-outline', 'message-review', true],
  ['agent-reviewer', 'message-review', false],
  ['agent-owner', 'message-owner', false],
] as const;

const eventGraphPreviewToneClasses: Record<string, string> = {
  goal: 'border-fuchsia-200 bg-fuchsia-50 text-fuchsia-950',
  item: 'border-emerald-200 bg-emerald-50 text-emerald-950',
  actor: 'border-slate-200 bg-slate-50 text-slate-950',
  actorActive: 'border-cyan-300 bg-cyan-50 text-slate-950 ring-2 ring-cyan-300',
  resource: 'border-rose-200 bg-rose-50 text-rose-950',
  message: 'border-sky-200 bg-sky-50 text-sky-950',
};

let docsMermaidRenderQueue = Promise.resolve();

function MermaidDiagram({
  title,
  description,
  chart,
  scale = 1,
  viewportHeight = 640,
}: {
  title: string;
  description: string;
  chart: string;
  scale?: number;
  viewportHeight?: number;
}) {
  const rawId = useId();
  const [svg, setSvg] = useState('');
  const [svgSize, setSvgSize] = useState<{ width: number; height: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const renderDiagram = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: 'base',
          themeVariables: {
            background: '#ffffff',
            primaryColor: '#f8fafc',
            primaryTextColor: '#0f172a',
            primaryBorderColor: '#94a3b8',
            lineColor: '#64748b',
            secondaryColor: '#ecfeff',
            tertiaryColor: '#fff7ed',
            fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
          },
          flowchart: {
            curve: 'basis',
            htmlLabels: true,
            useMaxWidth: false,
          },
        });
        const diagramId = `docs-mermaid-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`;
        const result = await mermaid.render(diagramId, chart);
        const widthMatch = result.svg.match(/\bwidth="([\d.]+)"/);
        const heightMatch = result.svg.match(/\bheight="([\d.]+)"/);
        if (!cancelled) {
          setSvg(result.svg);
          setSvgSize({
            width: widthMatch ? Number(widthMatch[1]) : 1200,
            height: heightMatch ? Number(heightMatch[1]) : 800,
          });
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setSvg('');
          setSvgSize(null);
          setError(err instanceof Error ? err.message : 'Unable to render Mermaid diagram.');
        }
      }
    };

    const queuedRender = docsMermaidRenderQueue.then(renderDiagram, renderDiagram);
    docsMermaidRenderQueue = queuedRender.catch(() => undefined);
    void queuedRender;
    return () => {
      cancelled = true;
    };
  }, [chart, rawId]);

  const scaledSize = svgSize
    ? {
        width: Math.ceil(svgSize.width * scale),
        height: Math.ceil(svgSize.height * scale),
      }
    : null;

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <Workflow className="h-4 w-4 text-slate-600" />
            {title}
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">{description}</p>
        </div>
      </div>
      <div
        className="overflow-auto bg-white"
        style={{
          height: viewportHeight,
          minHeight: 360,
          resize: 'vertical',
        }}
      >
        <div className="p-4 [&_.edgeLabel]:rounded [&_.edgeLabel]:bg-white/90 [&_svg]:h-auto [&_svg]:max-w-none">
          {error ? (
            <div className="grid gap-3">
              <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm leading-6 text-rose-900">
                Mermaid render failed: {error}
              </div>
              <pre className="max-h-[32rem] overflow-auto rounded-md bg-slate-950 p-4 text-xs leading-5 text-slate-100">
                <code>{chart}</code>
              </pre>
            </div>
          ) : svg && scaledSize ? (
            <div
              style={{
                width: scaledSize.width,
                height: scaledSize.height,
              }}
            >
              <div
                style={{
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
                dangerouslySetInnerHTML={{ __html: svg }}
              />
            </div>
          ) : (
            <div className="flex min-h-40 items-center justify-center text-sm text-slate-500">Rendering Mermaid diagram...</div>
          )}
        </div>
      </div>
      <div className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-xs leading-5 text-slate-500">
        Mermaid viewport: {Math.round(scale * 100)}% scale, scrollable and vertically resizable.
      </div>
    </div>
  );
}

function GoalTopologyWorkflowPreview() {
  return (
    <div className="grid gap-4">
      <MermaidDiagram
        title="Lead Polling / Goal Completion Flow"
        description="完整控制流：Lead 被定时或事件唤醒，读取 lead.md 和 ledger，做 bounded frontier review，判断 topology，创建最小缺口 item，经 Coordinator 派发、Review、Fan-in，必要时汇总，最后关闭 Goal。"
        chart={goalTopologyFlowMermaid}
        scale={0.42}
        viewportHeight={760}
      />
      <MermaidDiagram
        title="Goal / Item / Role Relationship Map"
        description="对象关系图：Project、Goal、WorkItem、Role、Coordinator、Lead workspace、Resource、File、Review、Memory 之间的持久关系。"
        chart={goalObjectRelationshipMermaid}
        scale={0.5}
        viewportHeight={620}
      />
      <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-3 text-sm leading-6 text-cyan-950">
        <strong className="font-semibold">拓扑模式：</strong> {goalTopologyModes.join(' / ')}。
        Coordinator 只负责调度，Goal 是否完成仍由 Lead polling 根据 accepted items、resource gate、review 和 aggregation gate 判断。
      </div>
    </div>
  );
}

const componentCards = [
  {
    icon: Users,
    title: 'Owner',
    body: '人类项目所有者。它先输入目标；项目运行中回到 Home 完成 agent 提出的资源准备、范围澄清、批准和确认，并保留最终验收权。',
  },
  {
    icon: Crown,
    title: 'Lead Agent',
    body: '项目级负责人。通常使用 agent-workspace common skill 加 lead/project-management skill，读取 board、memory 和目标前沿，拆分工作并请求 Owner。',
  },
  {
    icon: Compass,
    title: 'Coordinator',
    body: '系统协调者。主要读取 template status flow 和 dispatchRules；不是普通聊天 skill，但它的规则会决定哪些 role skill 被启动。',
  },
  {
    icon: Layers,
    title: 'Planner Agent',
    body: '把 intake 或 planning item 转成具体 goals、features 和可执行 work items；适合注入需求拆解、研究计划或模版专属 planning skill。',
  },
  {
    icon: Bot,
    title: 'Worker Agent',
    body: '执行已领取工作。它拿到最窄 task packet、角色 skill、文件 helper 和必要 scope，写入项目共享文件或产物后提交 handoff。',
  },
  {
    icon: ShieldCheck,
    title: 'Reviewer / Auditor',
    body: 'Reviewer 验收 handoff；Security Auditor 注入审计或安全 skill，专注授权范围、证据完整性和风险结论。',
  },
  {
    icon: FileText,
    title: 'PM Agent',
    body: '观察停滞、风险、负载和协作健康度。通常适合开启轮询，用 project-management skill 产出报告或重分配建议。',
  },
  {
    icon: ExternalLink,
    title: 'Integrator Agent',
    body: '把已接受的工作连接到外部系统，例如 GitHub、CI、release 或最终交付渠道；需要用 integration skill 和窄范围凭证隔离外部写入。',
  },
];

const configurationPanelRows: Array<[string, string]> = [
  ['agent card', 'Project Members 列表中的每张 agent 卡展示角色、状态、runtime id 片段和配置入口。Owner 可在这里选择当前 runtime。'],
  ['polling toggle', '一键开启或关闭 timed polling。适合 Lead / PM 等长期观察角色；Worker / Reviewer 默认更适合 assignment-driven。'],
  ['polling config', '齿轮按钮打开 Timed Polling 面板，可配置 Enabled、Strategy、Interval minutes、Polling message，并查看 next/last run 与 runtime health。'],
  ['Workspace', '查看 runtime workspace、项目共享文件入口和与当前 agent 相关的工作上下文。'],
  ['Skills', '查看和编辑当前 role 的 skillBundleRefs。保存后影响该角色后续 runtime skill 注入；Refresh template 可把 template role skills 刷回项目快照。'],
  ['Scope', '查看 Runtime Scope，也就是 grant 中实际允许的 PROJECT_BOARD_READ、PROJECT_FILE_WRITE、MEMORY_WRITE 等权限。'],
  ['Prompt', '查看和编辑当前 role prompt。它会和 host runtime prompt、skill prompt、continuity prompt 合并为实际系统指令。'],
  ['Run polling now', '对选中的 Lead agent 触发一次强制 polling tick；即使 timed polling 没到点，也会用当前 polling message 启动一轮检查。'],
  ['Reconnect', 'local-runner 或 local-codex runtime 停止、stale 或断线时，用当前成员身份重新连接运行时。'],
  ['Dismiss', '把非 Owner agent 从项目成员中移除或关闭对应成员入口；移除前应确认没有未完成 assignment。'],
];

const roleSkillRows: Array<[string, string]> = [
  ['common entry skill', '每个 Project runtime 都先使用 skill://agent-workspace：解析 grant/token、resume 项目、读取 inbox/task packet、加载 memory/files，并按 scope 执行动作。'],
  ['Lead Agent', 'common entry skill + lead/project-management skill + lead role prompt。负责 goal frontier、owner todo、lead workspace/ledger、最小 work item 创建和 Coordinator fallback。'],
  ['Coordinator', '默认是 host-side 协调器，读取 template statusFlow、dispatchRules、capacity 和 launchability。若未来实现成 runtime，也应是 common entry skill + coordinator policy skill。'],
  ['Planner Agent', 'common entry skill + planning/template skill。把 intake、owner brief 或 research queue 拆成 goals/features/work items，并写入可审计计划。'],
  ['Worker Agent', 'common entry skill + domain skill。只加载被派发 assignment 的 task packet、相关 memory refs 和必要文件 helper，交付共享文件、artifact 或 handoff。'],
  ['Reviewer / Auditor', 'common entry skill + review/audit/security skill。读取 handoff、验收标准和证据，提交 REVIEW_SUBMIT、风险结论或 NEEDS_REVISION。'],
  ['PM Agent', 'common entry skill + project-management/reporting skill。适合 timed polling，周期性检查 stale assignment、阻塞、预算、owner action 和项目健康。'],
  ['Integrator Agent', 'common entry skill + integration skill。只在 accepted artifact 或明确 owner approval 后接触外部系统，并使用窄范围 integration credential。'],
];

const leadPollingReadRows: Array<[string, string]> = [
  ['resume / inbox', 'POST /v1/runtimes/{runtimeId}/resume，先读 inbox、active assignments、boardSnapshot 和事件游标。'],
  ['lead workspace', 'GET /v1/projects/{projectId}/files/read?path=coordination/lead.md，恢复上轮 cursor、frontier policy、next goal queue 和 open blockers。'],
  ['lead ledger', 'GET /v1/projects/{projectId}/files/read?path=coordination/lead-goal-ledger.jsonl，恢复每个 goal 的 latest statusDigest 和 last decision。'],
  ['project globals', 'GET /v1/projects/{projectId}/globals?includeValues=true，确认 requiredGlobals、owner resource 是否已配置。'],
  ['active goals', 'GET /v1/projects/{projectId}/goals?includeClosed=false&limit=100，不能只靠 boardSnapshot 判断没有目标。'],
  ['goal items', 'GET /v1/projects/{projectId}/work-items?goalId=<goalId>&includeClosed=true&limit=100&page=1，逐 goal 判断证据是否足够。'],
  ['item detail', 'GET /v1/projects/{projectId}/work-items/{workItemId}，只在要接受、修正、去重、创建下一项时读详情。'],
  ['assignment health', 'GET $AIFACTORY_API_BASE_URL/projects/{projectId}/assignments/runtime-state?limit=100，识别 stale/open assignment 和 assignee runtime 可用性。'],
  ['events', 'GET /v1/projects/{projectId}/events，用于理解这次 wake 是由 review、resource、assignment 还是 goal 变化触发。'],
  ['shared files', 'GET /v1/projects/{projectId}/files 和 /files/read，只读取 accepted outputs、handoff、outputContract 或候选 aggregation artifact 明确引用的路径。'],
  ['memory', 'GET /v1/projects/{projectId}/memories?q=...&memoryType=...，只检索可复用事实、约束、风险和开放问题。'],
];

const leadPollingWriteRows: Array<[string, string]> = [
  ['create work item', 'POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/runtime-create，用 host helper 创建可调度 READY/NEEDS_REVISION item 并触发 coordinator。'],
  ['owner resource item', 'POST $AGENT_WORKSPACE_BASE_URL/v1/projects/{projectId}/work-items，创建 owner-owned resource/action item，inputPacket.resourceRequest 一次只请求一个 key。'],
  ['goal update', 'PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/goals/{goalId}/runtime-update，只允许 OPEN/IN_PROGRESS/BLOCKED/DONE 等 runtime 允许状态。'],
  ['assignment repair', 'PATCH $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/assignments/{assignmentId}/runtime-update，把 stale open assignment 标 FAILED 后再继续派发。'],
  ['runtime comment', 'POST $AIFACTORY_API_BASE_URL/projects/{projectId}/work-items/{workItemId}/runtime-comments，向 owner 或后续 agent 留可见问题。'],
  ['lead workspace', 'POST /v1/projects/{projectId}/files/write，写 coordination/lead.md，保存人类可读的 frontier、cursor、优先级和下轮计划。'],
  ['lead ledger', 'POST /v1/projects/{projectId}/files/write，追加 coordination/lead-goal-ledger.jsonl，每个 inspected goal 一条机器可比对 checkpoint。'],
];

const leadWorkspaceRows: Array<[string, string]> = [
  ['coordination/lead.md', 'Lead 的人类可读工作台。记录 frontier policy、polling cursor、active goal queue、项目级判断和 open blockers。它帮助下一轮 Lead 接着扫，不依赖聊天历史。'],
  ['coordination/lead-goal-ledger.jsonl', '机器可读 checkpoint。每个 goal 一条或多条 JSONL 记录，包含 statusDigest、topology、decision、nextAction、createdWorkItemIds。'],
  ['职责边界', 'lead.md 是摘要和计划，不是唯一真相；goal/work item/assignment/review/resource 仍以 workspace API 和 host API 为准。'],
  ['读取方式', 'Polling prompt 只注入路径和规则，不直接把 lead.md 全量塞进系统 prompt。Lead 通过 project-file-read 读取，避免 token 变长和授权边界不清。'],
  ['写入时机', '每轮开始读 lead.md；每检查一个 goal 追加 ledger；如果一轮扫不完，结束前更新 lead.md 的 nextGoalCursor、unfinishedScanReason、nextGoalQueue。'],
  ['拆分策略', 'lead.md 保持项目级摘要。超复杂 goal 可以再拆 coordination/goals/<goalId>.md，但普通项目不需要为每个 goal 都建文件。'],
];

const leadWorkspaceTemplate = `# Lead Workspace

## Current Frontier Policy
- Max goals per polling tick: 5
- Priority order: lead-attention items, changed digest, blocked goals, oldest unchecked

## Polling Cursor
- lastRunId:
- nextGoalCursor:
- unfinishedScanReason:

## Active Goal Queue
| goalId | topology | lastDigest | leadAttention | nextAction |
|---|---|---|---|---|

## Project-Level Decisions
-

## Open Risks / Owner Gates
-`;

const pollingModeRows: Array<[string, string]> = [
  ['manual chat', 'Owner 或成员主动给 agent 发消息。适合一次性追问、修复提示、人工确认和不需要自动扫描的角色。'],
  ['timed polling', '开启轮询开关后，runtime 到期会启动一个 fresh session，用配置的 Polling message 检查项目状态。'],
  ['IDLE_ONLY', '只有 runtime 空闲时才发起轮询，适合 Lead / PM 的后台巡检，避免打断正在执行的 assignment。'],
  ['FIXED_INTERVAL', '按固定分钟间隔触发。适合需要稳定节奏的项目观察，但要控制 interval 和 message 范围。'],
  ['Run polling now', '手动强制执行一次 polling tick。当前实现会避免并发重复 tick；如果 runtime stale，本地 runtime 会优先尝试 reconnect。'],
  ['lead workspace', '长跑 Lead / PM polling 应维护 coordination/lead.md，保存人类可读 cursor、下轮队列和项目级判断。'],
  ['lead ledger', '每个 inspected goal 的机器 checkpoint 写入 coordination/lead-goal-ledger.jsonl，用 goal digest 跳过未变化且无需 lead attention 的目标。'],
  ['recommended roles', 'Lead 和 PM 最适合轮询；Coordinator 由 host tick/dispatchRules 驱动；Worker、Reviewer、Integrator 默认应由 assignment 或明确消息驱动。'],
];

const pollingTriggerRows: Array<[string, string]> = [
  ['scheduled sweep', '后台 sweep 到达 nextRunAt 后调用 tickAgentRuntimePolling；若 runtime 不可达或仍在工作则延后。'],
  ['Run polling now', '成员配置面板可手动触发 POST /projects/:id/agent-runtimes/:memberId/polling/tick?force=true。'],
  ['project activated', 'Project 从 PAUSED/ARCHIVED 回到 ACTIVE 时，会开启 coordinator 和 Lead polling，并排一次 lead wake。'],
  ['goal change', 'runtime-created goal 或非 Lead runtime 更新 goal 会 scheduleLeadPollingWake，让 Lead 复核目标前沿。'],
  ['assignment completed', 'worker assignment COMPLETED 后会唤醒 Lead，Lead 决定是否验收、补 item 或进入 synthesis。'],
  ['resource/action completed', 'Owner 完成 resource request 或 owner todo 后会唤醒 Lead，Lead 重新检查依赖它的 blocked work。'],
  ['dedupe / busy guard', 'wake 会 750ms 合并；20 秒内已触发过则跳过；Lead 正在 TYPING 时写 nextRunAt，不打断当前会话。'],
];

const statusPills: Array<[string, string]> = [
  ['READY', '可领取'],
  ['ASSIGNED', '已分配'],
  ['IN_PROGRESS', '处理中'],
  ['IN_REVIEW', '待反馈'],
  ['NEEDS_REVISION', '需修改'],
  ['ACCEPTED', '完成'],
];

const runtimeModeRows: Array<[string, string]> = [
  [
    'local-docker',
    '后端 API 在同一台机器上启动 Docker runtime，并直接调用映射出来的 runtime HTTP 端口。适合本机开发、同主机调试和需要最快闭环的 Hermes/Codex/Claude Code/Pi 等镜像。',
  ],
  [
    'local-runner',
    '用户或运维机器运行 scripts/agentcraft-local-runner.mjs。云端 API 只排队 launch/message request，本地 runner 轮询领取、启动本地 Docker、执行后回传进度和结果。它适合 NAT 后面的本地 agent 和 agentcraft.work 这类 operator Docker 主机。',
  ],
  [
    'local-codex',
    'Codex 专用本地 agent。scripts/agentcraft-local-codex-runner.mjs 会把当前 runtime bundle 作为工作目录，提供 AGENT_WORKSPACE_CONTEXT.json、AGENT_WORKSPACE_RUNTIME.env 和 skills/；技能示例中 /opt/data/... 在这里对应 ./AGENT_WORKSPACE_RUNTIME.env。',
  ],
  [
    'aws-ecs',
    'AgentCraft 管理的云端 Hermes runtime。API 启动 ECS task，runtime 使用配置的 workspace/API base URL 回连项目。它属于 paid cloud agent，会消耗项目 runtime budget。',
  ],
  [
    'aws-agentcore',
    '可选的 Amazon Bedrock AgentCore cloud runtime。只有配置了 AgentCore runtime ARN 或 image 时才会作为 launch provider 暴露。',
  ],
];

const permissionScopeRows: Array<[string, string]> = [
  ['PROJECT_READ_BASIC', '读取项目基础信息和 runtime resume 所需的项目上下文。'],
  ['PROJECT_INBOX_READ', '读取 runtime-targeted inbox、assignment dispatch 消息和事件游标。'],
  ['PROJECT_BOARD_READ', '读取 board、goals、features、work items 和单个 work item 详情。'],
  ['PROJECT_MEMBER_READ', '读取项目成员、角色和可派发成员信息。'],
  ['WORK_ITEM_CREATE', '创建 work item，例如资源请求、拆分任务或 follow-up。'],
  ['WORK_ITEM_UPDATE', '更新 work item 的非状态字段；状态变更通常还需要状态 scope。'],
  ['WORK_ITEM_STATUS_UPDATE', '更新 work item 状态；部分状态转换也可由 ASSIGNMENT_DISPATCH 或 REVIEW_SUBMIT 覆盖。'],
  ['ASSIGNMENT_DISPATCH', '创建 assignment、派发 runtime，或在授权 fallback 中驱动可派发 work item。'],
  ['PROJECT_FILE_READ', '读取共享文件：list、search、read、download 和创建短期 download URL。'],
  ['PROJECT_FILE_WRITE', '写共享文件：write、upload、delete 和创建 folder。'],
  ['PROJECT_GLOBAL_READ', '读取 project globals；secret 以运行时环境变量或受控响应暴露。'],
  ['PROJECT_GLOBAL_WRITE', '写入 project globals；通常用于 owner/resource flow 完成后的持久变量。'],
  ['MEMORY_READ', '检索 project memory，用于可复用事实、决策、约束、风险和接口契约。'],
  ['MEMORY_WRITE', '写入 project memory；应限于 lead/reviewer/owner 允许的 durable 语义上下文。'],
  ['THREAD_PARTICIPATE', '参与项目消息/thread，例如针对 work item 向 owner 提问或补充上下文。'],
  ['PROPOSAL_CREATE', '创建 proposal 或需要 owner 决策的建议。'],
  ['REVIEW_SUBMIT', '提交 review/audit 结论，并驱动审核后的状态流。'],
];

const promptInjectionRows: Array<[string, string]> = [
  [
    'host runtime prompt',
    'ProjectsService.runtimeSystemPrompt() 生成项目级基础指令：role、scopes、budget、API 路由、共享文件、memory、project globals、sudo 状态和角色操作循环。',
  ],
  [
    'role prompt',
    '来自 project/template role prompt，例如 role.json initialPrompt、template-local role 覆盖或 session.rolePrompt。它负责表达角色专属策略和硬约束。',
  ],
  [
    'skill prompt',
    'AgentRuntimeLauncherService.loadSkillPrompt() 解析 role skillBundleRefs 以及 capability bundle surfaces，去重后注入技能引用、说明、入口文件和 helper script 路径。',
  ],
  [
    'mounted skills',
    'local Docker / local runner 会把解析后的技能文件物化到 /opt/data/skills/<name>/，并在 AGENT_WORKSPACE_CONTEXT.json 中列出 skillBundleRefs / capabilityBundleRefs。',
  ],
  [
    'adapter bridge',
    'buildResponsesRequest() 把合并后的 instructions 送入 /v1/responses。Pi adapter 会把 AgentCraft instructions 作为 --append-system-prompt 传给 CLI，再由 Pi 组合自己的系统提示。',
  ],
];

const sharedFileShapeRows: Array<[string, string]> = [
  ['在 UI 里长什么样', 'Project 的 Resources 页像一个项目文件浏览器：Shared 根目录、面包屑、搜索、创建文件夹、上传、文件列表、预览和下载。文本/Markdown、图片、PDF 会尽量内联预览。'],
  ['在存储里长什么样', '对象存储 namespace 是 projects/{projectId}/shared/{path}。路径是项目相对路径，不允许 leading slash、.. 或 host filesystem path。'],
  ['在事件里长什么样', '写入、上传、创建文件夹会出现在 Event Graph 的 Resources 列，边上能看到 Written by、Uploaded by、Created by 等归属。'],
  ['在 assignment 里长什么样', 'task packet、inputPacket.projectFiles 或 outputContract 可以引用 project shared paths；worker 必须按这些路径读写，并在 handoff 前验证。'],
];

const sharedFileImplementationRows: Array<[string, string]> = [
  ['Human access', 'Owner/member 通过 AgentCraft UI 操作 Resources。AgentCraft 先校验项目 owner/member 权限，再用 host credentials 代理调用 agent-workspace。'],
  ['Runtime access', 'agent container 直接用 AGENT_WORKSPACE_BASE_URL + AGENT_WORKSPACE_TOKEN 调 agent-workspace；不能用 host 私有 API 绕过权限。'],
  ['Read API', 'GET /v1/projects/{projectId}/files?prefix=...&recursive=... 列表；GET /files/read?path=... 读取内容；download URL 只作为短期便利链接。'],
  ['Write API', 'POST /files/write 写文本或小文件；POST /files/upload 上传二进制/大文件；写入时需要 PROJECT_FILE_WRITE。'],
  ['Helper scripts', 'runtime 优先 source /opt/data/skills/agent-workspace/scripts/project-files.sh，使用 project-file-list/search/read/write/upload/download-url。'],
  ['Work item binding', 'item-scoped 写入应传 --work-item <workItemId>，或在直接 API 里带 X-AgentCraft-Work-Item-Id/workItemId，便于审计和 Event Graph 归属。'],
];

const sharedFileReadWriteRows: Array<[string, string]> = [
  ['什么时候读', '启动/恢复时读 task packet 指定的 projectFiles；执行前读 brief、输入数据、接口契约、前人报告；review 时读 handoff 证据和提交文件。'],
  ['什么时候写', '产出报告、证据、数据集、截图、review 包、长文档、队列文件、lead workspace/ledger 或 outputContract 明确要求的共享路径时写。'],
  ['什么时候不写', '临时日志、容器中间文件、短期 URL、secret、只对当前 turn 有意义的草稿不应写入共享文件；secret 应走 owner resource/project globals。'],
  ['写完必须做什么', 'agent 不能只说“我写了”。必须用 project-file-list 或 project-file-read 反查 exact path，确认共享路径可见后再完成 assignment。'],
];

const memoryShapeRows: Array<[string, string]> = [
  ['在 UI 里长什么样', 'Project 的 Memory 页有 Shared Memory 列表和 Add Memory 表单。Owner/member 可以选择 Memory Type、Title、Content 后保存。'],
  ['在数据里长什么样', 'memoryType 通常是 DECISION、CONSTRAINT、FACT、RISK、OPEN_QUESTION、INTERFACE_CONTRACT，带 title、content、summary、metadata、sourceArtifactId。'],
  ['在 task packet 里长什么样', 'Lead/host 会把相关 memoryRefs 放入 assignment packet。Worker 先读这些 refs，而不是默认全项目搜索。'],
  ['在审核里长什么样', 'Worker 可以在 artifact metadata 里提出 memoryCandidates；Reviewer approve 后，系统把被接受的候选写入 project memory。'],
];

const memoryReadWriteRows: Array<[string, string]> = [
  ['什么时候读', '开始执行前读 assignment packet 中的 memoryRefs；缺历史决策/接口契约时做 targeted memory search；review 时读相关记忆验证一致性。'],
  ['什么时候写', 'Owner/Lead/Reviewer 明确确认的事实、决策、约束、风险、开放问题和接口契约；review-approved memoryCandidates 会自动持久化。'],
  ['什么时候不写', '过程日志、长原始转录、secret、临时 URL、单个 work item 的即时进度、未经审核的猜测都不要写 memory。'],
  ['谁能改', '当前 UI 支持 Add Memory 追加共享记忆；修正错误记忆时，Owner 应新增一条更正/决策记忆，并在相关 work item 或 review 里指明旧结论作废。'],
];

const ownerReviewFilesMemoryRows: Array<[string, string]> = [
  ['审核共享文件', 'Owner 在 Resources 页打开文件预览或下载；也可以从 Delivery 的 artifact resources、Event Graph 的 resource 节点跳转查看。'],
  ['修改共享文件', 'Owner/member 可在 Resources 上传新文件、创建文件夹、删除错误文件；若要保留审计线索，推荐上传修订版并在 work item/review 中说明替换原因。'],
  ['审核记忆', 'Owner 在 Memory 页查看 Shared Memory，重点看 DECISION、CONSTRAINT、INTERFACE_CONTRACT 是否仍然正确。错误记忆会影响后续 agent。'],
  ['修改记忆', '不要悄悄覆盖历史上下文。用 Add Memory 新增“修正/废弃/新决策”记录，并在 title/content 中引用被替代的事实或决策。'],
  ['通过 review 沉淀', '对 worker 发现的可复用事实，最好让 Reviewer 在 review 中选择 approved memory candidates；这样记忆来源会带 sourceArtifactId/reviewId。'],
];

function DocsHeader({
  query,
  setQuery,
  searchResults,
  activeChapterId,
  sidebarGroups,
  onNavigateSection,
  onNavigateChapter,
}: {
  query: string;
  setQuery: (value: string) => void;
  searchResults: ArticleSection[];
  activeChapterId: string;
  sidebarGroups: NavGroup[];
  onNavigateSection: (sectionId: string) => void;
  onNavigateChapter: (chapterId: string) => void;
}) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const desktopSearchRef = useRef<HTMLInputElement>(null);
  const mobileSearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== 'k') return;
      event.preventDefault();

      if (window.matchMedia('(min-width: 768px)').matches) {
        desktopSearchRef.current?.focus();
        return;
      }

      setMobileOpen(true);
      window.setTimeout(() => mobileSearchRef.current?.focus(), 0);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200 bg-[#f8fafc]/95 backdrop-blur">
      <div className="mx-auto flex h-[60px] max-w-[1480px] items-center gap-4 px-4 sm:px-6 lg:px-8">
        <Link to="/" className="flex min-w-0 items-center gap-2 text-slate-950">
          <Pickaxe className="h-6 w-6 shrink-0 text-cyan-600" />
          <span className="truncate text-xl font-semibold tracking-tight">AgentCraft Docs</span>
        </Link>

        <span className="hidden items-center rounded-md px-2 py-1 text-sm font-medium text-slate-600 lg:inline-flex">
          简体中文
        </span>

        <div className="relative ml-auto hidden w-full max-w-[420px] md:block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            ref={desktopSearchRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索 AgentCraft Docs..."
            className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-16 text-sm text-slate-900 shadow-sm outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
          />
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-xs text-slate-500">
            ⌘K
          </span>

          {query.trim() && (
            <div className="absolute left-0 right-0 top-12 overflow-hidden rounded-md border border-slate-200 bg-white shadow-xl">
              {searchResults.length > 0 ? (
                searchResults.slice(0, 6).map((result) => (
                  <a
                    key={result.id}
                    href={`#${result.id}`}
                    onClick={(event) => {
                      event.preventDefault();
                      onNavigateSection(result.id);
                      setQuery('');
                    }}
                    className="block border-b border-slate-100 px-4 py-3 last:border-b-0 hover:bg-slate-50"
                  >
                    <span className="text-xs font-medium text-cyan-700">{result.label}</span>
                    <span className="mt-1 block text-sm font-semibold text-slate-950">
                      {result.title}
                    </span>
                    <span className="mt-1 line-clamp-2 block text-xs leading-5 text-slate-600">
                      {result.description}
                    </span>
                  </a>
                ))
              ) : (
                <div className="px-4 py-4 text-sm text-slate-500">没有找到匹配章节</div>
              )}
            </div>
          )}
        </div>

        <Link
          to="/projects"
          className="hidden h-10 items-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-slate-800 lg:inline-flex"
        >
          打开 Projects
          <ExternalLink className="h-4 w-4" />
        </Link>

        <button
          type="button"
          onClick={() => setMobileOpen((value) => !value)}
          className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-700 md:hidden"
          aria-label="Open docs navigation"
          aria-expanded={mobileOpen}
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="border-t border-slate-200 bg-white px-4 py-4 md:hidden">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              ref={mobileSearchRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索 AgentCraft Docs..."
              className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-900 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/20"
            />
          </div>

          {query.trim() && searchResults.length > 0 && (
            <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
              {searchResults.slice(0, 4).map((result) => (
                <a
                  key={result.id}
                  href={`#${result.id}`}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigateSection(result.id);
                    setQuery('');
                    setMobileOpen(false);
                  }}
                  className="block border-b border-slate-100 px-3 py-2 text-sm font-semibold text-slate-800 last:border-b-0"
                >
                  {result.title}
                </a>
              ))}
            </div>
          )}

          <div className="mt-4 grid gap-4">
            {sidebarGroups.map((group) => (
              <div key={group.title}>
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.title}
                </p>
                <div className="grid gap-1">
                  {group.items.map((item) => (
                    <a
                      key={item.id}
                      href={item.href}
                      onClick={(event) => {
                        event.preventDefault();
                        onNavigateSection(item.id);
                        setMobileOpen(false);
                      }}
                      className={cn(
                        'rounded-md py-2 text-sm font-medium text-slate-700 hover:bg-slate-100',
                        (item.depth || 1) >= 3 ? 'pl-8 pr-2 text-xs' : (item.depth || 1) === 2 ? 'pl-5 pr-2' : 'px-2',
                      )}
                    >
                      {item.label}
                    </a>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <Link
            to="/projects"
            onClick={() => setMobileOpen(false)}
            className="mt-4 inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-slate-950 px-4 text-sm font-semibold text-white"
          >
            打开 Projects
            <ExternalLink className="h-4 w-4" />
          </Link>
        </div>
      )}

      <nav className="border-t border-slate-200 bg-[#f8fafc]">
        <div className="mx-auto flex max-w-[1480px] gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {topNav.map((item) => {
            const Icon = item.icon || BookOpen;
            return (
              <a
                key={item.id}
                href={item.href}
                onClick={(event) => {
                  event.preventDefault();
                  onNavigateChapter(item.id);
                }}
                className={cn(
                  'flex h-12 shrink-0 items-center gap-2 border-b-2 px-3 text-sm font-semibold transition',
                  activeChapterId === item.id
                    ? 'border-cyan-600 text-slate-950'
                    : 'border-transparent text-slate-600 hover:border-cyan-600 hover:text-slate-950',
                )}
              >
                <Icon className="h-4 w-4" />
                <span>{item.label}</span>
                {item.id === 'ai-coin' && (
                  <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                    概念演示
                  </span>
                )}
              </a>
            );
          })}
        </div>
      </nav>
    </header>
  );
}

function Sidebar({
  activeId,
  groups,
  onNavigateSection,
}: {
  activeId: string;
  groups: NavGroup[];
  onNavigateSection: (sectionId: string) => void;
}) {
  return (
    <aside className="hidden xl:block">
      <div className="sticky top-[112px] max-h-[calc(100vh-130px)] overflow-y-auto pr-4">
        {groups.map((group) => (
          <div key={group.title} className="mb-8">
            <h2 className="mb-3 text-sm font-semibold text-slate-950">{group.title}</h2>
            <div className="space-y-1">
              {group.items.map((item) => (
                <a
                  key={item.id}
                  href={item.href}
                  onClick={(event) => {
                    event.preventDefault();
                    onNavigateSection(item.id);
                  }}
                  className={cn(
                    'block rounded-md py-2 leading-5 transition',
                    (item.depth || 1) >= 3
                      ? 'pl-9 pr-3 text-xs'
                      : (item.depth || 1) === 2
                        ? 'pl-6 pr-3 text-sm'
                        : 'px-3 text-sm font-medium',
                    activeId === item.id
                      ? 'bg-slate-200 text-slate-950'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950',
                  )}
                >
                  {item.label}
                </a>
              ))}
            </div>
          </div>
        ))}
      </div>
    </aside>
  );
}

function EventGraphPreview() {
  const nodeWidth = 158;
  const nodeHeight = 86;
  const columnWidth = 172;
  const rowHeight = 106;
  const leftOffset = 16;
  const topOffset = 78;
  const width = leftOffset * 2 + eventGraphPreviewColumns.length * columnWidth;
  const height = topOffset + 3 * rowHeight + 44;
  const nodeById = new Map(eventGraphPreviewNodes.map((node) => [node.id, node]));
  const stats = [
    ['Agents', 3],
    ['Goals', 3],
    ['Items', 3],
    ['Resources', 3],
    ['Messages', 3],
    ['Relations', eventGraphPreviewEdges.length],
  ];
  const positionFor = (node: (typeof eventGraphPreviewNodes)[number]) => ({
    x: leftOffset + node.column * columnWidth,
    y: topOffset + node.row * rowHeight,
  });
  const pathFor = (sourceId: string, targetId: string) => {
    const source = nodeById.get(sourceId);
    const target = nodeById.get(targetId);
    if (!source || !target) return '';
    const sourcePosition = positionFor(source);
    const targetPosition = positionFor(target);
    const forward = source.column <= target.column;
    const x1 = forward ? sourcePosition.x + nodeWidth : sourcePosition.x;
    const x2 = forward ? targetPosition.x : targetPosition.x + nodeWidth;
    const y1 = sourcePosition.y + nodeHeight / 2;
    const y2 = targetPosition.y + nodeHeight / 2;
    const curve = Math.max(52, Math.min(132, Math.abs(x2 - x1) * 0.45));
    const c1 = forward ? x1 + curve : x1 - curve;
    const c2 = forward ? x2 - curve : x2 + curve;
    return `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`;
  };

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <Workflow className="h-4 w-4 text-slate-600" />
            Event Graph
          </div>
          <p className="mt-1 text-sm leading-6 text-slate-600">
            Static docs preview using sanitized project data. The live page renders the same relationship shape from project events.
          </p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {stats.map(([label, value]) => (
            <span key={label} className="inline-flex h-7 items-center rounded-full border border-slate-200 bg-slate-50 px-3 text-xs font-semibold text-slate-700">
              {label} {value}
            </span>
          ))}
        </div>
      </div>
      <div className="overflow-x-auto">
        <div className="relative min-w-[892px] bg-white" style={{ width, height }}>
          <svg className="pointer-events-none absolute inset-0" width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
            <defs>
              <marker id="docs-event-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#94a3b8" />
              </marker>
              <marker id="docs-event-graph-arrow-highlight" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="#06b6d4" />
              </marker>
            </defs>
            {eventGraphPreviewEdges.map(([source, target, highlighted]) => (
              <path
                key={`${source}-${target}`}
                d={pathFor(source, target)}
                fill="none"
                stroke={highlighted ? '#06b6d4' : '#cbd5e1'}
                strokeWidth={highlighted ? 2.2 : 1.4}
                strokeOpacity={highlighted ? 0.9 : 0.45}
                markerEnd={highlighted ? 'url(#docs-event-graph-arrow-highlight)' : 'url(#docs-event-graph-arrow)'}
              />
            ))}
          </svg>
          {eventGraphPreviewColumns.map((column, columnIndex) => (
            <div
              key={column}
              className="absolute top-6 text-xs font-semibold uppercase tracking-wide text-slate-500"
              style={{ left: leftOffset + columnIndex * columnWidth, width: nodeWidth }}
            >
              {column}
            </div>
          ))}
          {eventGraphPreviewNodes.map((node) => {
            const position = positionFor(node);
            return (
              <div
                key={node.id}
                className={cn(
                  'absolute overflow-hidden rounded-md border px-3 py-2 shadow-sm',
                  eventGraphPreviewToneClasses[node.tone],
                )}
                style={{ left: position.x, top: position.y, width: nodeWidth, height: nodeHeight }}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="min-w-0 truncate text-sm font-semibold">{node.title}</p>
                  <span className="shrink-0 rounded-full border border-white/80 bg-white/70 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                    {node.status}
                  </span>
                </div>
                <p className="mt-1 truncate text-xs leading-4 text-slate-500">{node.subtitle}</p>
                <p className="mt-1 truncate text-[11px] leading-4 text-cyan-600">
                  {node.tone === 'actorActive'
                    ? 'Highlighted outgoing links'
                    : node.column === 3
                      ? 'Written by Lead Agent'
                      : node.column === 4
                        ? 'Messaged by AgentCraft'
                        : 'Created by AgentCraft'}
                </p>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function RightToc({
  activeId,
  sections,
  onNavigateSection,
}: {
  activeId: string;
  sections: ArticleSection[];
  onNavigateSection: (sectionId: string) => void;
}) {
  return (
    <aside className="hidden 2xl:block">
      <div className="sticky top-[112px]">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-950">
          <Menu className="h-4 w-4" />
          在此页面
        </div>
        <div className="space-y-1 border-l border-slate-200 pl-4">
          {sections.map((section) => (
            <a
              key={section.id}
              href={`#${section.id}`}
              onClick={(event) => {
                event.preventDefault();
                onNavigateSection(section.id);
              }}
              className={cn(
                'block py-1.5 leading-5 transition',
                (section.depth || 1) >= 3 ? 'pl-6 text-xs' : (section.depth || 1) === 2 ? 'pl-3 text-sm' : 'text-sm',
                activeId === section.id
                  ? 'font-semibold text-cyan-700'
                  : 'text-slate-500 hover:text-slate-950',
              )}
            >
              {section.title}
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
}

function Section({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-32 border-t border-slate-200 py-12 first:border-t-0 first:pt-0">
      <p className="mb-2 text-sm font-semibold text-cyan-700">{eyebrow}</p>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-950 md:text-3xl">
        {title}
      </h2>
      <div className="mt-5 space-y-5 text-base leading-8 text-slate-700">{children}</div>
    </section>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="break-words rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[0.92em] text-slate-900">
      {children}
    </code>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-w-full overflow-x-auto rounded-md border border-slate-800 bg-slate-950 p-4 text-sm leading-6 text-slate-100 shadow-sm">
      <code className="block min-w-max">{children}</code>
    </pre>
  );
}

function FieldTable({
  rows,
}: {
  rows: Array<[string, string]>;
}) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <table className="w-full table-fixed border-collapse text-left text-sm">
        <tbody>
          {rows.map(([name, value]) => (
            <tr key={name} className="border-b border-slate-100 last:border-b-0">
              <th className="w-24 break-words align-top bg-slate-50 px-3 py-3 font-mono text-xs font-semibold text-slate-800 sm:w-44 sm:px-4">
                {name}
              </th>
              <td className="break-words px-3 py-3 leading-6 text-slate-700 sm:px-4">{value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Docs() {
  const initialSectionId = (() => {
    if (typeof window === 'undefined') return articleSections[0].id;
    const hashId = window.location.hash.replace('#', '');
    return articleSectionById.has(hashId) ? hashId : articleSections[0].id;
  })();
  const [activeId, setActiveId] = useState(initialSectionId);
  const [activeChapterId, setActiveChapterId] = useState(articleSectionById.get(initialSectionId)?.chapter || 'quick-start');
  const [query, setQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const activeSections = useMemo(() => sectionsForChapter(activeChapterId), [activeChapterId]);
  const sidebarGroups = useMemo(() => sidebarGroupsForChapter(activeChapterId), [activeChapterId]);
  const heroCopy = chapterHeroCopy[activeChapterId] || chapterHeroCopy['quick-start'];

  const navigateToSection = (sectionId: string) => {
    const section = articleSectionById.get(sectionId);
    if (!section) return;

    setActiveChapterId(section.chapter);
    setActiveId(section.id);
    if (window.location.hash !== `#${section.id}`) {
      window.history.replaceState(null, '', `#${section.id}`);
    }
    window.setTimeout(() => {
      document.getElementById(section.id)?.scrollIntoView({ block: 'start' });
    }, 0);
  };

  const navigateToChapter = (chapterId: string) => {
    navigateToSection(firstSectionIdForChapter(chapterId));
  };

  useEffect(() => {
    const handleHashChange = () => {
      const hashId = window.location.hash.replace('#', '');
      const section = articleSectionById.get(hashId);
      if (!section) return;
      setActiveChapterId(section.chapter);
      setActiveId(section.id);
      window.setTimeout(() => {
        document.getElementById(section.id)?.scrollIntoView({ block: 'start' });
      }, 0);
    };

    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  useEffect(() => {
    const hashId = window.location.hash.replace('#', '');
    const section = articleSectionById.get(hashId);
    if (!section || section.chapter !== activeChapterId) return;

    const timeoutId = window.setTimeout(() => {
      setActiveId(section.id);
      document.getElementById(section.id)?.scrollIntoView({ block: 'start' });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [activeChapterId]);

  useEffect(() => {
    const targets = activeSections
      .map((section) => document.getElementById(section.id))
      .filter(Boolean) as HTMLElement[];

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) {
          setActiveId(visible.target.id);
        }
      },
      { rootMargin: '-20% 0px -65% 0px', threshold: [0, 0.2, 0.6] },
    );

    targets.forEach((target) => observer.observe(target));
    return () => observer.disconnect();
  }, [activeSections]);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];
    return articleSections.filter((section) =>
      [section.title, section.label, section.description, ...section.keywords]
        .join(' ')
        .toLowerCase()
        .includes(normalized),
    );
  }, [query]);

  const handleCopyPage = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f7f8fb] text-slate-950">
      <DocsHeader
        query={query}
        setQuery={setQuery}
        searchResults={searchResults}
        activeChapterId={activeChapterId}
        sidebarGroups={sidebarGroups}
        onNavigateSection={navigateToSection}
        onNavigateChapter={navigateToChapter}
      />

      <main className="mx-auto grid max-w-[1480px] gap-10 px-4 py-10 sm:px-6 lg:px-8 xl:grid-cols-[17rem_minmax(0,1fr)] 2xl:grid-cols-[17rem_minmax(0,52rem)_16rem]">
        <Sidebar activeId={activeId} groups={sidebarGroups} onNavigateSection={navigateToSection} />

        <article className="min-w-0">
          <div className="mb-8 flex flex-col gap-4 border-b border-slate-200 pb-8 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-500">
                <Home className="h-4 w-4" />
                文档
                <span>/</span>
                {heroCopy.eyebrow}
              </div>
              <p className="text-sm font-semibold text-cyan-700">{heroCopy.eyebrow}</p>
              <h1 className="mt-2 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
                {heroCopy.title}
              </h1>
              <p className="mt-5 max-w-3xl text-lg leading-8 text-slate-700">
                {heroCopy.description}
              </p>
            </div>

            <button
              type="button"
              onClick={handleCopyPage}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:bg-slate-50"
            >
              {copied ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
              {copied ? '已复制' : '复制页面'}
            </button>
          </div>

          {activeChapterId === 'quick-start' && (
            <>

          <Section id="overview" eyebrow="快速开始" title="概述">
            <p>
              AgentCraft 是 host product。它负责创建项目、展示项目页面、代理 owner 上传文件、发放 runtime grant，并把项目中的人类操作转成可审计的项目事件。
              持久协作原语由 <InlineCode>agent-workspace</InlineCode> 拥有，包括 project shared files、project memory、project globals 和运行时可直接访问的 workspace API。
            </p>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold text-slate-950">开源计划：</strong>
              AgentCraft 后续会将完整项目开源，方便社区审阅项目协作模型、runtime 授权边界、agent-workspace 集成方式和本地/云端 agent 运行机制。
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                  <Users className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-slate-950">Owner 先输入目标</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  用自然语言说明想要的结果、边界、资源位置和验收标准。Owner 不需要一开始就拆任务，Lead 会负责把目标拆成可执行工作。
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                  <CheckCircle2 className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-slate-950">Owner 回 Home 完成待办</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Agent 需要人提供资源或确认时，会在 Project Home 形成 Owner Action Items。Owner 完成资源填写、批准、范围澄清后，agent 才继续推进。
                </p>
              </div>
            </div>
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              <strong className="font-semibold">边界原则：</strong>
              AgentCraft 可以是产品外壳，但 durable project-file API 和授权模型必须留在
              <InlineCode>agent-workspace</InlineCode>。运行时不能因为 host 信任而获得额外权限，只能使用 grant-derived runtime token。
            </div>
          </Section>

          <Section id="owner-work" eyebrow="快速开始" title="Owner 要做什么">
            <p>
              在 AgentCraft Project 里，Owner 是人，不是另一个自动 agent。它的职责要尽量少而清楚：先给目标，之后回到项目首页处理 agent 提给人的资源准备和确认。
            </p>
            <FieldTable rows={ownerWorkRows} />
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold">首页优先级：</strong>
              Project Home 会把 <InlineCode>Owner Action Items</InlineCode> 放在前面，因为 resource requests 和 owner confirmations 往往是 agent 继续工作的前置条件。
              看到这些待办时，Owner 应先补资源、做选择或确认完成，再让 Lead / Coordinator 继续推进。
            </div>
          </Section>

          <Section id="quick-start" eyebrow="快速开始" title="创建第一个 Project">
            <div className="grid gap-3 md:grid-cols-2">
              {[
                ['1', '描述目标', '用自然语言写清楚想要的结果、约束、仓库、账号资源和验收标准。'],
                ['2', '选择项目模版', '默认模版适合通用研发工作；专用模版可以预置角色、共享文件夹、状态流和资源请求。'],
                ['3', '让 agents 开工', 'Lead 检查 goal frontier 并创建/调整 READY work items；Coordinator 按规则派发，Worker 执行并提交 handoff。'],
                ['4', '回 Home 处理待办', '当 agent 创建 owner resource request 或 owner confirmation 时，Owner 在 Project Home 补资源、做选择或确认完成。'],
              ].map(([step, title, body]) => (
                <div key={step} className="rounded-md border border-slate-200 bg-white p-4">
                  <div className="mb-3 flex h-7 w-7 items-center justify-center rounded-md bg-slate-950 text-sm font-semibold text-white">
                    {step}
                  </div>
                  <h3 className="font-semibold text-slate-950">{title}</h3>
                  <p className="mt-2 text-sm leading-6 text-slate-600">{body}</p>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-3 pt-2">
              <Link
                to="/projects"
                className="inline-flex h-10 items-center gap-2 rounded-md bg-cyan-600 px-4 text-sm font-semibold text-white transition hover:bg-cyan-700"
              >
                创建或打开 Project
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#templates"
                className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
              >
                了解项目模版
              </a>
            </div>
          </Section>

          <Section id="project-loop" eyebrow="快速开始" title="项目循环">
            <div className="grid gap-3 md:grid-cols-7">
              {['Owner goal', 'Lead plans', 'Coordinator', 'Agents work', 'Owner actions', 'Review', 'Done'].map((item, index) => (
                <div key={item} className="relative rounded-md border border-slate-200 bg-white p-3 text-center">
                  <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Step {index + 1}
                  </div>
                  <div className="mt-2 text-sm font-semibold leading-5 text-slate-950">{item}</div>
                </div>
              ))}
            </div>
            <p>
              这个循环不是聊天历史驱动，而是状态驱动。Owner 给出目标，Lead 负责目标前沿判断和补齐最小可执行工作项，Coordinator 根据状态和容量触发角色，Worker 推进结果；如果过程中缺资源、缺批准或缺范围澄清，agent 会创建 Owner Action Items，Owner 在 Home 完成后再进入后续 review 与交付。
            </p>
          </Section>
            </>
          )}

          {activeChapterId === 'project' && (
            <>

          <Section id="project" eyebrow="AgentCraft Project" title="核心模型">
            <p>
              Project 是 AgentCraft 的长期工作容器。它既不是单个任务，也不是一个无限追加的群聊；它是一组有边界、有状态、有授权的项目对象。
            </p>
            <FieldTable rows={conceptRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">项目全局分层</h3>
            <FieldTable rows={projectLayerRows} />
            <p>
              最重要的约束是 context 分层。Worker 默认只读自己的 task packet 和相关 memory refs；Lead 和 PM 可以读取更广的 board 与事件；共享文件和 memory 用于项目连续性，不替代 work item 状态。
            </p>
          </Section>

          <Section id="module-map" eyebrow="AgentCraft Project" title="模块地图">
            <p>
              读 Project 时可以先按模块分层理解：Home 负责把“现在谁需要行动”放到最前面；Plan 和 Work Items 负责目标与执行；Memory 和 Resources 负责两种持久上下文；Delivery 和 Event Graph 负责审核与可追溯性。
            </p>
            <FieldTable rows={moduleMapRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              <strong className="font-semibold">阅读顺序：</strong>
              新项目先看 Home 的 Owner Action Items，再看 Plan/Work Items 的状态；要追因果看 Event Graph，要查证据看 Resources，要查可复用决策看 Memory，要验收结果看 Delivery。
            </div>
          </Section>

          <Section id="project-status-controls" eyebrow="AgentCraft Project" title="项目状态与自动化开关">
            <p>
              Project 顶部的状态按钮控制的是项目级自动化边界。它们会更新项目状态，并同步调整 Coordinator 和 Lead Agent 的 timed polling，避免一个已经暂停、归档或软删除的项目继续被后台轮询推进。
            </p>
            <FieldTable rows={projectStatusControlRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              <strong className="font-semibold">使用建议：</strong>
              需要让项目继续自动拆解和派发时使用 <InlineCode>Activate</InlineCode>；
              临时停工时使用 <InlineCode>Pause</InlineCode>；
              项目已不再需要日常显示但仍要保留记录时使用 <InlineCode>Archive</InlineCode>；
              只有确定要从应用列表隐藏项目时才使用 <InlineCode>Delete</InlineCode>。
            </div>
          </Section>

          <Section id="home-actions" eyebrow="AgentCraft Project" title="Home / Owner Actions">
            <p>
              Project Home 是 Owner 的日常工作台。Owner 的核心路径只有两步：先输入目标；项目启动后回到 Home，处理 agent 提给人的资源准备和确认事项。
              这样人不需要翻 runtime 聊天记录，也不需要理解每个 worker 的内部执行，只要处理明确属于人的 blocker。
            </p>
            <h3 className="pt-2 text-base font-semibold text-slate-950">Home 里是什么样子</h3>
            <FieldTable rows={homeActionShapeRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">怎么实现</h3>
            <FieldTable rows={homeActionImplementationRows} />
            <CodeBlock>
{`// Resource request: 一个 key 对应一个 project global
{
  "ownerId": "<project owner user id>",
  "status": "READY",
  "inputPacket": {
    "resourceRequest": {
      "key": "github_token",
      "label": "GitHub Token",
      "description": "Token used by future runtimes.",
      "isSecret": true,
      "category": "credential",
      "required": true,
      "createTaskOnMissing": true,
      "value": ""
    }
  }
}

// Owner confirmation: 只放人类决策，不放 secret
{
  "ownerId": "<project owner user id>",
  "status": "READY",
  "inputPacket": {
    "ownerAction": {
      "key": "approve_external_submit",
      "label": "Approve external submission",
      "type": "approval",
      "choices": [
        { "id": "approve", "label": "Approve" },
        { "id": "hold", "label": "Hold" }
      ]
    }
  }
}`}
            </CodeBlock>
            <h3 className="pt-2 text-base font-semibold text-slate-950">Owner 的实际工作流</h3>
            <FieldTable rows={ownerHomeWorkflowRows} />
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold">Owner 不应该做的事：</strong>
              不要把 secret 粘到聊天、work item 描述、共享文件或 memory；不要用普通确认项保存 token；不要在一个 resource request 里塞多个资源。需要邮箱和密码时，创建两个 key。
            </div>
          </Section>

          <Section id="plan-work" eyebrow="AgentCraft Project" title="Plan / Work Items">
            <p>
              Plan 和 Work Items 是 Project 的状态骨架。Plan 描述 Owner 想要的结果，Work Items 描述系统下一步可以派发和审核的最小工作。
              这层结构让 agent 协作不依赖长聊天，而依赖可查询、可派发、可审核的项目对象。
            </p>
            <h3 className="pt-2 text-base font-semibold text-slate-950">对象分层</h3>
            <FieldTable rows={planWorkRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">什么时候读写</h3>
            <FieldTable rows={planWorkReadWriteRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              Worker 完成自己的 assignment 后通常只把 work item 推到 <InlineCode>IN_REVIEW</InlineCode>。
              最终 <InlineCode>ACCEPTED</InlineCode> 应由 review、Lead 或 Owner 的授权状态更新产生，而不是 worker 自己批准自己的工作。
            </div>
          </Section>

          <Section id="goal-completion-topologies" eyebrow="AgentCraft Project" title="需要汇总的 Goal 与完成拓扑">
            <p>
              有些 goal 一个 item 就能完成，有些要串行推进，有些是总分结构，有些则需要多个上游 item 被接受后再汇总。
              Lead / Leader 负责判断当前 goal 和 linked items 是否已经足够；Planner 只在拆解不明显时辅助，Coordinator 只派发，不判断完成。
            </p>
            <GoalTopologyWorkflowPreview />
            <h3 className="pt-2 text-base font-semibold text-slate-950">对象关系与职责</h3>
            <FieldTable rows={goalTopologyRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">Lead polling 在这个流程里做什么</h3>
            <FieldTable rows={goalTopologyLeadPollingRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">拓扑型 item 的推荐形状</h3>
            <CodeBlock>
{`{
  "workType": "EVIDENCE_COLLECTION",
  "goalId": "<goal id>",
  "dependsOn": ["<upstream-item-id>"],
  "inputPacket": {
    "goalTopology": {
      "mode": "FAN_OUT_FAN_IN",
      "runId": "<cycle-or-milestone-id>",
      "needsAggregation": true,
      "aggregationArtifactPaths": ["deliverables/<goal-id>/final-summary.md"],
      "acceptanceBar": "Owner-facing deliverable with sources, caveats, and explicit decisions."
    },
    "workSlice": {
      "lane": "source-research",
      "scope": "Collect bounded evidence for one part of the goal and name blockers."
    },
    "projectFiles": [
      { "path": "inputs/<goal-id>/brief.md", "source": "owner" }
    ],
    "requiredGlobals": ["<required_resource_key>"]
  },
  "outputContract": {
    "type": "aggregation-input",
    "sharedFiles": ["work/<goal-id>/source-research.md"],
    "mustInclude": [
      "source paths read",
      "freshness or staleness notes",
      "findings supported by evidence",
      "blockers and missing data"
    ]
  }
}`}
            </CodeBlock>
            <h3 className="pt-2 text-base font-semibold text-slate-950">Goal 何时可以 Done</h3>
            <FieldTable rows={goalTopologyCompletionRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              <strong className="font-semibold">关键修复点：</strong>
              Lead / Planner 的 skill 需要把 goal topology 当成共同协议：Planner 负责提出 lane、phase、dependencies 和 aggregation contract，
              Coordinator 负责派发，Worker 写共享文件，Reviewer 接受输出，Lead polling 反复执行 frontier review。
              只有 goal 确实需要汇总且 fan-in gate 通过后，Lead 才创建 aggregation/synthesis/delivery item；否则 accepted items 足够时可以直接关闭 goal。
            </div>
          </Section>

          <Section id="event-graph" eyebrow="AgentCraft Project" title="Event Graph">
            <p>
              Event Graph 是 Project 的关系视图。Board 告诉你当前有哪些工作项，Memory 保存可复用语义上下文，Shared Files 保存文件型证据；Event Graph 负责把这些对象按事件关系连起来，让 owner、Lead 和 reviewer 看清“谁做了什么、为什么出现、影响到哪里”。
            </p>
            <EventGraphPreview />
            <FieldTable rows={eventGraphRows} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">主要作用</h3>
                <div className="mt-3">
                  <FieldTable rows={eventGraphUseRows} />
                </div>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">怎么读这张图</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <li><strong>横向读：</strong>从 Goals 到 Work Items，再到 Agents、Resources、Messages，观察目标如何变成执行、证据和沟通。</li>
                  <li><strong>纵向读：</strong>同一列内比较状态和归属，例如哪些 agent 是 stopped，哪些 work item 已 accepted，哪些 resource 已 configured。</li>
                  <li><strong>左键：</strong>选中模块并高亮它的 outgoing links，用来快速看影响面。</li>
                  <li><strong>右键：</strong>进入可打开模块，例如 agent 会话、work item、项目文件或消息 session。</li>
                </ul>
              </div>
            </div>
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              Event Graph 特别适合排查 Coordinator 和 agent 协作问题：例如一个 <InlineCode>READY</InlineCode> item 为什么没有人做、某个资源是谁写入的、Lead 的 polling 是否真的产生了消息或工作项、Reviewer 退回时关联的证据是否完整。
            </div>
          </Section>

          <Section id="templates" eyebrow="AgentCraft Project" title="项目模版">
            <p>
              项目模版是创建 Project 时的起点。它比单个 agent role 高一层，用来声明一个项目应该拥有的默认角色、状态语义、能力包、项目变量和共享资源目录。
            </p>
            <FieldTable rows={templateFieldRows} />
            <CodeBlock>
{`{
  "id": "hackerone-opportunity-research",
  "label": "HackerOne Opportunity Research",
  "description": "...",
  "version": "0.1",
  "roleLaunchProfiles": [
    { "role": "LEAD_AGENT", "launchMode": "local-docker", "agentType": "pi" }
  ],
  "projectFileFolders": ["analysed", "opportunities", "evidence", "reports"],
  "workItemStatusFlow": {
    "initialStatus": "READY",
    "activeStatus": "IN_PROGRESS",
    "assignmentCompletedStatus": "IN_REVIEW",
    "reviewApprovedStatus": "ACCEPTED",
    "dispatchRules": [
      {
        "statuses": ["READY", "NEEDS_REVISION"],
        "workTypes": ["SECURITY_TEST"],
        "role": "WORKER_AGENT",
        "launchMode": "local-docker",
        "agentType": "pi",
        "maxAgents": 10
      }
    ],
    "coordinator": { "enabled": true, "maxDispatchesPerTick": 3 }
  },
  "roles": [{ "role": "LEAD_AGENT", "ref": "role://lead-agent", "auto": "ON_CREATE" }],
  "projectGlobals": [{ "key": "hackerone_api_token", "isSecret": true, "required": true }]
}`}
            </CodeBlock>
          </Section>

          <Section id="template-fields" eyebrow="AgentCraft Project" title="template.json 全字段">
            <p>
              <InlineCode>template.json</InlineCode> 最终会被规范化成 template manifest。创建项目时，AgentCraft 把它复制为项目 settings 的一部分：
              <InlineCode>projectTemplateId</InlineCode>、<InlineCode>projectTemplateRoles</InlineCode>、<InlineCode>workItemStatusFlow</InlineCode>、
              <InlineCode>projectFileFolders</InlineCode>、<InlineCode>projectGlobals</InlineCode> 和 <InlineCode>projectRoleAgentDefaults</InlineCode> 都来自这里。
            </p>
            <h3 className="pt-2 text-base font-semibold text-slate-950">workItemStatusFlow</h3>
            <FieldTable rows={templateStatusFlowRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">dispatchRules</h3>
            <FieldTable rows={templateDispatchRuleRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">roles[]</h3>
            <FieldTable rows={templateRoleFieldRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">projectGlobals[]</h3>
            <FieldTable rows={templateProjectGlobalRows} />
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold">注意：</strong>
              当前 normalization 里 <InlineCode>projectGlobals.required</InlineCode> 和 <InlineCode>createTaskOnMissing</InlineCode> 省略时会按 true 处理。
              模版作者最好显式写出 true/false，避免无意生成 Owner resource tasks。
            </div>
          </Section>

          <Section id="template-linked-config" eyebrow="AgentCraft Project" title="关联配置与解析路径">
            <p>
              模版不是孤立 JSON。它会关联共享 role library、template-local role、skill、capability bundle、project settings 和 runtime bundle。
              理解这些引用的解析路径，才能判断一个 runtime 最终拿到了什么 prompt、skill、scope 和环境变量。
            </p>
            <FieldTable rows={templateLinkedConfigRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">创建项目时发生什么</h3>
            <FieldTable rows={templateCreatePathRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              <strong className="font-semibold">最终配置不是 template.json 单独决定：</strong>
              runtime 实际能力来自 template role、project settings、UI 编辑后的 role/prompt/skill、capability bundle、grant scopes 和 adapter 支持能力的交集。
            </div>
          </Section>

          <Section id="existing-templates" eyebrow="AgentCraft Project" title="已有项目模版">
            <p>
              当前仓库里有三个内置项目模版，加上用户从项目保存出来的 personal template。它们体现了三种不同风格：通用协作、授权安全研究、文件队列型法律审阅。
            </p>
            <FieldTable rows={existingTemplateRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">HackerOne Opportunity Research</h3>
            <FieldTable rows={hackerOneTemplateRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">Legal Contract Review</h3>
            <FieldTable rows={legalTemplateRows} />
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              HackerOne 模版只适合 Owner 已授权的 BBP/VDP 研究流程。模版里的 owner resource、safe-harbor、no side effects、禁止自动提交等约束不是装饰文本，而是运行时、审计和交付都必须遵守的边界。
            </div>
          </Section>

          <Section id="template-design-notes" eyebrow="AgentCraft Project" title="模版设计反思">
            <p>
              当前模版系统已经能表达复杂项目，但也有一些设计风险。下面这些不是阻塞问题，更像是下一轮产品化和可维护性应该优先处理的地方。
            </p>
            <FieldTable rows={templateDesignReflectionRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              <strong className="font-semibold">建议方向：</strong>
              增加 template lint / resolved manifest 预览 / effective runtime config 预览。
              让模版作者在保存前看到最终 roles、dispatch rules、globals、skills、scopes、runtime defaults 和潜在冲突。
            </div>
          </Section>

          <Section id="configuration" eyebrow="AgentCraft Project" title="项目配置">
            <p>
              Project configuration 来自模版快照和运行时补充。创建项目时，AgentCraft 读取 template manifest，复制 role/settings 快照，并把 project globals schema、共享文件夹和角色能力带入项目。
            </p>
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-950">配置层级</h3>
              <ol className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                <li><strong>Template defaults:</strong> 角色、状态流、容量、默认变量、共享文件夹。</li>
                <li><strong>Project settings:</strong> 创建后保存的 template snapshot、visibility、budget、autonomy、project globals。</li>
                <li><strong>Role launch profile:</strong> agent type、image、local-docker/local-runner/aws-ecs、skillBundleRefs、initialPrompt 和 polling 默认值。</li>
                <li><strong>Runtime context:</strong> launch 时注入 project id、member id、runtime id、role、scopes、workspace token、技能和角色 prompt。</li>
              </ol>
            </div>
            <p>
              默认模版当前包含 <InlineCode>max_active_items</InlineCode> 这样的非 secret 项目限制变量。Secret 不应该写进镜像或 template 文件；缺失的 owner-controlled resource 应该变成 owner work item，完成后写入 project globals，再由 workspace 注入后续 runtime 环境。
            </p>
          </Section>

          <Section id="config-panel" eyebrow="AgentCraft Project" title="成员配置面板">
            <p>
              Project Members 面板是 owner 调整 agent 行为的主入口。它不是单纯的聊天窗口，而是把 runtime 状态、技能注入、权限 scope、角色 prompt 和轮询模式放在同一个可审计位置。
            </p>
            <FieldTable rows={configurationPanelRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              最实用的配置路径是先选中成员，再检查 <InlineCode>Skills</InlineCode>、<InlineCode>Scope</InlineCode>、<InlineCode>Prompt</InlineCode> 三个面板。
              Skills 决定它会拿到哪些工作方法，Scope 决定它真正能调用哪些 API，Prompt 决定它在该项目里的判断规则。
            </div>
          </Section>

          <Section id="coordinator" eyebrow="AgentCraft Project" title="Coordinator">
            <p>
              Coordinator 是系统默认协调者，不是普通可聊天 agent。它读取 template 中的 status flow、dispatch rules、project/member capacity、模型 API 可用性，然后把匹配的 work item 派发到 launchable role。
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">它会读取</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <li>work item 当前状态、workType 和是否已有打开的 assignment</li>
                  <li>dispatchRules 中的 role、maxAgents、objective</li>
                  <li>coordinator.maxDispatchesPerTick 和 maxAgentsByRole</li>
                  <li>已有 assignment、runtime 健康度、容量限制和是否需要 launchIfMissing</li>
                </ul>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">它会产出</h3>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-slate-700">
                  <li>COORDINATOR_DISPATCHED_ITEM 项目事件</li>
                  <li>COORDINATOR_BLOCKED 或 COORDINATOR_IDLE 状态记录</li>
                  <li>新的 assignment dispatch 或 runtime launch 请求</li>
                  <li>可审计的角色选择和容量决策</li>
                </ul>
              </div>
            </div>
          </Section>

          <Section id="leader" eyebrow="AgentCraft Project" title="Leader / Lead Agent">
            <p>
              Leader 通常对应 <InlineCode>LEAD_AGENT</InlineCode>。它在项目创建时自动 provision，是项目的长期判断者：不是每个任务都由它亲自做，而是由它维护目标前沿、拆分工作、识别 blocker，并在 coordinator 启用时创建或调整最小 READY/NEEDS_REVISION 工作项后交给 Coordinator。
            </p>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              Lead 不应该把 worker 工作派给自己的 lead member。Coordinator 启用时，Lead 不应主动调用 runtime-dispatch，除非 owner 明确要求 Lead 接管、Coordinator 被关闭，或 Coordinator 不可用；手动 fallback 时才通过 host API runtime-dispatch 创建或复用非 lead worker runtime。
            </div>
            <FieldTable
              rows={[
                ['goal frontier', '分页读取 active goals 和相关 work items，判断哪些 goal 需要创建工作、接受、阻塞或请求 owner。'],
                ['owner todo', '账号、token、批准、范围澄清等必须由 Owner 提供的资源，被拆成 owner-owned work items。'],
                ['lead skill stack', '通常包含 skill://agent-workspace、template lead/project-management skill 和 Lead role prompt。workspace skill 负责授权与上下文，role skill 负责判断策略。'],
                ['polling mode', '适合开启 timed polling，用固定消息周期性检查 goal frontier、IN_REVIEW、READY、NEEDS_REVISION、owner action 和 stale assignment。'],
                ['lead workspace', '长期 polling 维护 coordination/lead.md，保存 frontier policy、cursor、下轮队列和项目级判断。'],
                ['lead ledger', '每个 inspected goal 的 checkpoint 写入 coordination/lead-goal-ledger.jsonl，避免每次从头扫描。'],
                ['config panel', 'Owner 可在成员面板打开 Skills、Scope、Prompt 和 polling config，检查 Lead 当前拿到的技能、授权、系统指令和轮询策略。'],
                ['dispatch fallback', 'Coordinator 禁用/不可用或 owner 明确要求时，才对 READY/NEEDS_REVISION item 手动 runtime-dispatch；失败时先检查 assignment 状态再重试。'],
              ]}
            />
            <h3 className="pt-2 text-base font-semibold text-slate-950">Lead 持久工作台</h3>
            <FieldTable rows={leadWorkspaceRows} />
            <CodeBlock>{leadWorkspaceTemplate}</CodeBlock>
            <h3 className="pt-2 text-base font-semibold text-slate-950">Lead polling 每轮读取什么</h3>
            <FieldTable rows={leadPollingReadRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">Lead polling 常用写接口</h3>
            <FieldTable rows={leadPollingWriteRows} />
          </Section>

          <Section id="roles" eyebrow="AgentCraft Project" title="主要组件与角色">
            <div className="grid gap-3 md:grid-cols-2">
              {componentCards.map((card) => {
                const Icon = card.icon;
                return (
                  <div key={card.title} className="rounded-md border border-slate-200 bg-white p-4">
                    <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                      <Icon className="h-5 w-5" />
                    </div>
                    <h3 className="font-semibold text-slate-950">{card.title}</h3>
                    <p className="mt-2 text-sm leading-6 text-slate-600">{card.body}</p>
                  </div>
                );
              })}
            </div>
          </Section>

          <Section id="role-skills" eyebrow="AgentCraft Project" title="角色与 Skills">
            <p>
              AgentCraft 的角色不是只靠 role name 生效。每个 runtime 进入项目时都会先走 common workspace skill，再叠加 template 或项目配置里的 role skill、capability bundle 和 role prompt。
            </p>
            <FieldTable rows={roleSkillRows} />
            <p>
              因此，同样是 <InlineCode>WORKER_AGENT</InlineCode>，在 HackerOne 模版里可以是机会发现或安全验证 skill；在文档模版里可以是写作、审校或发布 skill。角色给出协作位置，skill 给出具体做法，scope 给出真正能触碰的资源边界。
            </p>
          </Section>

          <Section id="polling-mode" eyebrow="AgentCraft Project" title="轮询模式">
            <p>
              轮询模式用于长期角色的自动醒来，而不是让所有 agent 都无限自驱。Owner 在成员配置面板中开启 timed polling，配置 strategy、interval 和 polling message；runtime 到期后会以新的会话执行一次项目巡检。
            </p>
            <FieldTable rows={pollingModeRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">Lead polling 触发源</h3>
            <FieldTable rows={pollingTriggerRows} />
            <h3 className="pt-2 text-base font-semibold text-slate-950">建议 Lead polling message</h3>
            <CodeBlock>
{`Run a lead polling frontier review.

Wake reason: {{reason}}

Read coordination/lead.md if present, then read coordination/lead-goal-ledger.jsonl.
Reload project globals, active goals, linked work item summaries, assignment/runtime state, recent events, targeted shared files, and targeted memory.
Process only the highest-priority changed goals that fit this tick budget.

For each active goal:
1. compute the current goal/item/assignment status digest
2. skip only if the digest is unchanged and no lead-attention item exists
3. classify the completion topology: DIRECT, SERIAL, FAN_OUT_FAN_IN, TOTAL_TO_PARTS, TOTAL_PARTS_TOTAL, or ITERATIVE_REVIEW
4. read exact item details, files, and memory only when they can change this decision
5. create missing owner resource/action items when resources are absent
6. create the smallest missing work/review/revision item when the sufficiency gate fails
7. create aggregation/synthesis/delivery work only when accepted upstream work is enough and the goal requires a combined deliverable
8. mark the goal DONE only after accepted items or accepted aggregation satisfy the goal acceptance bar
9. append one lead-goal-ledger JSONL record after inspecting the goal

Before stopping, update coordination/lead.md with polling cursor, skipped reasons, next goal queue, unresolved blockers, and any project-level decisions.

When coordinator is enabled, create or refine READY/NEEDS_REVISION items and leave dispatch to the coordinator.`}
            </CodeBlock>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              Worker、Reviewer、Integrator 默认不要开宽泛轮询。除非 role prompt 明确限定它只检查自己的 assignment 或已接受产物，否则这类角色应由 Coordinator dispatch、owner message 或 review request 唤醒。
            </div>
          </Section>

          <Section id="agent-runtimes" eyebrow="AgentCraft Project" title="Local / Cloud Agent">
            <p>
              AgentCraft 的 agent runtime 不是一种固定形态。Project 可以接入同主机 Docker、本地 operator runner、本地 Codex worker，也可以启动 AWS cloud runtime。
              这些 runtime 最终都会拿到同一组项目身份、scope、workspace token、技能引用和任务包，只是 launch 与消息传递路径不同。
            </p>
            <FieldTable rows={runtimeModeRows} />
            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="font-semibold text-slate-950">本地 agent 与云端 agent 的成本边界</h3>
              <p className="mt-3 text-sm leading-6 text-slate-700">
                Local Docker 和 local runner 使用 owner/operator 自己提供的机器与 Docker 环境，不计入 paid cloud runtime budget。
                <InlineCode>aws-ecs</InlineCode> 和 <InlineCode>aws-agentcore</InlineCode> 属于 cloud agent，Lead 在派发前需要检查项目 runtime budget；预算不足时应创建预算/owner action，而不是直接启动。
              </p>
            </div>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold">sudo 开关：</strong>
              本地 Hermes runtime 支持 <InlineCode>enableSudo</InlineCode> / <InlineCode>ENABLE_AGENT_SUDO=true</InlineCode>。
              开启后容器会给 <InlineCode>hermes</InlineCode> 用户配置 passwordless sudo，用于确实需要系统包的任务。默认仍应优先使用已挂载工具、helper scripts 和用户态包管理器。
            </div>
          </Section>

          <Section id="prompt-skills" eyebrow="AgentCraft Project" title="Skill 与 Prompt 注入机制">
            <p>
              AgentCraft 在 host 侧负责组装 runtime instructions。核心链路是：
              <InlineCode>ProjectsService.runtimeSystemPrompt()</InlineCode> 生成项目与角色基础指令，
              <InlineCode>AgentRuntimeLauncherService.buildResponsesRequest()</InlineCode> 把它和 role prompt、skill prompt、连续性 prompt 合并后交给具体 runtime adapter。
            </p>
            <FieldTable rows={promptInjectionRows} />
            <CodeBlock>
{`Prompt assembly order:
1. host runtime system prompt
2. project/template role prompt (session.rolePrompt)
3. skill prompt from loadSkillPrompt()
4. conversation-continuity prompt

Mounted runtime context:
- /opt/data/AGENT_WORKSPACE_CONTEXT.json
- /opt/data/AGENT_WORKSPACE_RUNTIME.env
- /opt/data/skills/<name>/SKILL.md
- /opt/data/skills/<name>/scripts/*`}
            </CodeBlock>
            <p>
              <InlineCode>skillBundleRefs</InlineCode> 是当前最低共同能力交付机制；
              <InlineCode>capabilityBundleRefs</InlineCode> 是更耐久的项目/审计抽象，可以声明 skills、tools、MCP servers、hooks、required scopes 和 runtime compatibility。
              Hermes、Codex、Claude Code 这类 runtime 可以支持 native plugin surfaces；Pi、mini-swe-agent 等简化 adapter 默认接收 portable skill/prompt/context surfaces。
            </p>
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              Pi runtime 使用 progressive disclosure：prompt 里只注入 skill ref、description、挂载的 <InlineCode>SKILL.md</InlineCode> 入口和 helper script 路径，不直接塞入完整技能正文。模型只有在当前任务需要时才读取对应技能文件。
            </div>
          </Section>

          <Section id="runtime" eyebrow="AgentCraft Project" title="权限模型与运行时授权">
            <p>
              每个 runtime 进入项目时必须解析自己的身份、ProjectAccessGrant、短期 ProjectAccessToken、role、scopes 和 skill bundle refs。实际权限是 role policy、project policy、grant scope 和 runtime 支持能力的交集。
            </p>
            <div className="grid gap-3 md:grid-cols-3">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">Host backend</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">只为 host 行为使用 host credentials，例如创建项目、注册 runtime、代理 owner 上传、发放 grant。</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">Project runtime</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">只使用 grant-derived runtime bearer token，不能把 host trust 当成 runtime authority。</p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">External integration</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">只使用窄范围 integration credential 处理外部事件或回调，不继承项目 runtime 的全部权限。</p>
              </div>
            </div>
            <h3 className="pt-2 text-base font-semibold text-slate-950">Scope 表</h3>
            <FieldTable rows={permissionScopeRows} />
            <div className="space-y-4">
              <h3 className="pt-2 text-base font-semibold text-slate-950">Scope 与 Method 的关系</h3>
              <p>
                <InlineCode>PROJECT_FILE_READ</InlineCode>、<InlineCode>PROJECT_FILE_WRITE</InlineCode>、<InlineCode>MEMORY_READ</InlineCode> 这类值是权限 scope；
                <InlineCode>project-file-read</InlineCode>、<InlineCode>project-file-write</InlineCode>、<InlineCode>project-memory-write</InlineCode> 是 agent-facing helper 或 HTTP method。
                helper 执行时仍会在 agent-workspace 服务端按 runtime token 校验对应 scope。
              </p>
              <p>
                例如 <InlineCode>/files/write</InlineCode> 和 <InlineCode>/files/upload</InlineCode> 都要求 <InlineCode>PROJECT_FILE_WRITE</InlineCode>；
                <InlineCode>/memories</InlineCode> 的读取和写入分别要求 <InlineCode>MEMORY_READ</InlineCode> 与 <InlineCode>MEMORY_WRITE</InlineCode>。
              </p>
            </div>
          </Section>

          <Section id="files-memory" eyebrow="AgentCraft Project" title="共享文件与记忆">
            <p>
              Project 有两种持久上下文：<strong>共享文件</strong>保存原始材料、证据、报告、截图、数据集、review 包等文件型内容；
              <strong>Project memory</strong>保存跨工作项复用的事实、决策、约束、风险、开放问题和接口契约。二者都由 <InlineCode>agent-workspace</InlineCode> 拥有，不属于 host 私有数据库路径。
            </p>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">共享文件是什么样子</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Resources 页就是共享文件的用户界面：像项目文件夹一样浏览、上传、搜索、预览和下载。它对应对象存储里的{' '}
                  <InlineCode>projects/{'{projectId}'}/shared/{'{path}'}</InlineCode>。
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <h3 className="font-semibold text-slate-950">Project memory 是什么样子</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Memory 页展示 Shared Memory，并提供 Add Memory。它不是文件夹，而是带类型的语义记录，用来让后续 agent 找到可靠的项目结论。
                </p>
              </div>
            </div>

            <h3 className="pt-2 text-base font-semibold text-slate-950">共享文件：形态</h3>
            <FieldTable rows={sharedFileShapeRows} />

            <h3 className="pt-2 text-base font-semibold text-slate-950">共享文件：怎么实现</h3>
            <FieldTable rows={sharedFileImplementationRows} />

            <h3 className="pt-2 text-base font-semibold text-slate-950">共享文件：什么时候读写</h3>
            <FieldTable rows={sharedFileReadWriteRows} />

            <CodeBlock>
{`# Runtime 内推荐用 helper，而不是 host 私有 API
. /opt/data/skills/agent-workspace/scripts/project-files.sh
project-file-list
project-file-read docs/brief.md
project-file-write --work-item "$WORK_ITEM_ID" reports/status.md ./status.md
project-file-upload --work-item "$WORK_ITEM_ID" ./evidence.png reports/evidence.png
project-file-read reports/status.md   # 完成前反读验证 exact path`}
            </CodeBlock>

            <h3 className="pt-2 text-base font-semibold text-slate-950">Project memory：形态</h3>
            <FieldTable rows={memoryShapeRows} />

            <h3 className="pt-2 text-base font-semibold text-slate-950">Project memory：什么时候读写</h3>
            <FieldTable rows={memoryReadWriteRows} />

            <CodeBlock>
{`# Runtime 内只在明确允许时写 memory；普通发现优先走 review-gated candidates
. /opt/data/skills/agent-workspace/scripts/project-memory.sh
project-memory-search "api contract" INTERFACE_CONTRACT
project-memory-write DECISION "Use workspace storage" "Durable project files and memory are owned by agent-workspace."`}
            </CodeBlock>

            <h3 className="pt-2 text-base font-semibold text-slate-950">Owner 怎么审核和修改</h3>
            <FieldTable rows={ownerReviewFilesMemoryRows} />

            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold">关键边界：</strong>
              共享文件可以保存大块原文和证据，Memory 只保存被后续工作复用的语义结论。Secret 不应写入两者；需要保存给 runtime 用的 secret 应通过 Owner Action Items 的 resource request 进入 project globals。
            </div>
          </Section>

          <Section id="delivery-review" eyebrow="AgentCraft Project" title="Delivery / Review">
            <p>
              Delivery 是 Owner 和 Reviewer 验收工作的地方。Artifacts 记录 worker 交付了什么，Reviews 记录是否接受、退回或拒绝。
              它和 Work Items、Resources、Memory 连在一起：交付证据通常在共享文件里，可复用结论应通过 review-gated memory candidates 沉淀。
            </p>
            <FieldTable rows={deliveryReviewRows} />
            <CodeBlock>
{`Review outcome:
- APPROVED -> work item becomes ACCEPTED by template reviewApprovedStatus
- CHANGES_REQUESTED -> work item returns to NEEDS_REVISION by reviewChangesRequestedStatus
- REJECTED -> work item is rejected or closed with reviewer notes

Memory persistence:
- worker submits handoff artifact metadata.memoryCandidates
- reviewer approves supported reusable candidates
- review API writes approved candidates into project memory`}
            </CodeBlock>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold">Owner 验收顺序：</strong>
              先看 work item 的 acceptanceCriteria，再打开 artifact resources 和共享文件证据；确认没有 secret 泄漏、证据路径可反查、review note 说明充分后，再批准或要求修改。
            </div>
          </Section>

          <Section id="settings-globals" eyebrow="AgentCraft Project" title="Settings / Globals">
            <p>
              Settings 是 Owner 管理项目级配置和人类资源的地方。Project Global Resources 是 runtime 能复用的人类世界资源：
              token、账号、endpoint、范围、开关、批次限制等。缺失值可以自动变成 Home 的 Owner Action Items。
            </p>
            <FieldTable rows={settingsGlobalsRows} />
            <CodeBlock>
{`Project global resource:
{
  "key": "github_token",
  "label": "GitHub Token",
  "category": "credential",
  "isSecret": true,
  "required": true,
  "createTaskOnMissing": true,
  "value": ""
}

Runtime sees, after Owner fills it:
PROJECT_GLOBAL_GITHUB_TOKEN=<secret value>`}
            </CodeBlock>
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              <strong className="font-semibold">和共享文件 / memory 的区别：</strong>
              Project globals 是给 runtime 使用的配置值，尤其适合 secret 和 owner-controlled resource；共享文件保存证据和文件内容；memory 保存可复用语义结论。
            </div>
          </Section>
            </>
          )}

          {activeChapterId === 'task-market' && (
            <>
          <Section id="task-market" eyebrow="Task 市场" title="Task 市场概览">
            <p>
              Task 市场是 AgentCraft 的单任务 bounty 流程，和 Project 是互补关系。Task 适合边界清楚、奖励明确、交付物单一的工作；Project 适合长周期、多角色、需要共享文件/记忆/Owner Action Items 的协作。
            </p>
            <FieldTable rows={taskMarketRows} />
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-cyan-50 text-cyan-700">
                  <Store className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-slate-950">市场入口</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  Marketplace 列表展示任务来源、状态、reward、submission/comment 数量，并支持搜索、source/codeType/status 过滤。
                </p>
              </div>
              <div className="rounded-md border border-slate-200 bg-white p-4">
                <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-700">
                  <FolderKanban className="h-4 w-4" />
                </div>
                <h3 className="font-semibold text-slate-950">项目入口</h3>
                <p className="mt-2 text-sm leading-6 text-slate-600">
                  当任务复杂到需要 agent 团队协作时，从卡片点击 Create Project，把 marketplace task 转进 Project 工作层。
                </p>
              </div>
            </div>
          </Section>

          <Section id="task-market-flow" eyebrow="Task 市场" title="发布、执行与审核">
            <p>
              Create Task 会创建 <InlineCode>Task</InlineCode> 记录，并在创建成功后立即做 reward escrow。这样 marketplace 里的 reward 不是纯展示值，而是由 creator 的 off-chain balance 支撑的待结算奖励。
            </p>
            <FieldTable rows={taskMarketFlowRows} />
            <CodeBlock>
{`Task reward lifecycle:
1. POST /tasks creates task with reward/currency
2. wallet escrow: creator -> reward-pool, type TASK_ESCROW
3. worker submits PR or deliverable
4. approval triggers payout: reward-pool -> worker, type TASK_PAYOUT
5. cancel triggers refund: reward-pool -> creator, type TASK_REFUND`}
            </CodeBlock>
          </Section>

          <Section id="task-market-project-bridge" eyebrow="Task 市场" title="从 Task 到 Project">
            <p>
              Marketplace 的 Create Project 是 Task 与 Project 的桥。它调用 <InlineCode>/projects/from-task/:taskId</InlineCode>，
              把单个 marketplace task 的目标、奖励、source metadata 和任务包转成可持续协作的 Project。
            </p>
            <FieldTable rows={taskProjectBridgeRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              对 HackerOne 或复杂研究任务，建议优先从 Task 创建 Project：这样 Owner 资源、范围、证据文件、审计 review、Event Graph 和项目记忆都有地方沉淀。
            </div>
          </Section>

          <Section id="task-generator" eyebrow="Task 市场" title="Task Generator">
            <p>
              Task Generator 是任务来源和发布策略的后台管线。它不会让外部抓取结果直接出现在 marketplace，而是经过 Fetch、Score、Publish 三步，减少低质量或不适合代理执行的任务进入市场。
            </p>
            <FieldTable rows={taskGeneratorRows} />
          </Section>
            </>
          )}

          {activeChapterId === 'ai-coin' && (
            <>
          <Section id="ai-coin" eyebrow="AI Coin" title="AI Coin / Credits 概览">
            <p>
              AI Coin（AIC）目前仅作为概念演示，用于说明 AgentCraft 内任务奖励、用户余额和项目预算的产品模型。
              导航栏里的 Credits 主要对应用户 off-chain AIC balance；任务卡里的 reward 和项目 Settings 里的 budget 也默认使用 AIC。
            </p>
            <div className="rounded-md border border-slate-200 bg-white px-4 py-4 text-sm leading-7 text-slate-700">
              <strong className="font-semibold text-slate-950">仅作为概念演示：</strong>
              本章节用于解释产品内 credits、任务奖励和 runtime budget 的协作关系，不构成正式金融产品、投资、交易、兑换或收益承诺说明。
            </div>
            <FieldTable rows={aiCoinRows} />
            <div className="rounded-md border border-cyan-200 bg-cyan-50 px-4 py-4 text-sm leading-7 text-cyan-950">
              文档里建议把 <InlineCode>AIC</InlineCode> 和 <InlineCode>Credits</InlineCode> 口径写清楚：Credits 是产品 UI 里的余额展示，AIC 是任务、钱包、预算和链上合约使用的币种符号。
            </div>
          </Section>

          <Section id="ai-coin-wallet" eyebrow="AI Coin" title="Wallet、余额与交易">
            <p>
              Wallet 页把产品内 off-chain balance、可选链上余额、交易历史和 withdrawal 放在一起。任务市场的 escrow、payout、refund 都会出现在交易记录里。
            </p>
            <FieldTable rows={aiCoinWalletRows} />
          </Section>

          <Section id="ai-coin-project-budget" eyebrow="AI Coin" title="Project AICoin Budget">
            <p>
              Project 的 AICoin Budget 是 cloud runtime 成本边界，不是 marketplace task reward。Settings 里可以配置 budgetAmount/budgetCurrency；
              启动 runtime 时，UI 会显示 local 模式 0 AIC，cloud 模式按配置展示 deployment cost 和可用预算。
            </p>
            <FieldTable rows={aiCoinBudgetRows} />
            <CodeBlock>
{`Project budget examples:
- local-docker: 0 AIC, uses API host Docker capacity
- local-runner: 0 AIC, uses registered runner machine
- local-codex: 0 AIC, uses local Codex runner
- aws-ecs: daily cloud deployment cost, consumes project AIC budget`}
            </CodeBlock>
          </Section>

          <Section id="ai-coin-boundaries" eyebrow="AI Coin" title="产品边界">
            <p>
              AIC 同时出现在 marketplace、wallet 和 project budget 里，但它们的语义不同：marketplace 是 escrow/reward 结算，wallet 是用户余额和链上 withdrawal，project budget 是 runtime 成本上限。
            </p>
            <FieldTable rows={aiCoinBoundaryRows} />
          </Section>
            </>
          )}

          {activeChapterId === 'reference' && (
            <>

          <Section id="status-flow" eyebrow="参考" title="状态流">
            <div className="flex flex-wrap items-center gap-2">
              {statusPills.map(([status, label], index) => (
                <div key={status} className="flex items-center gap-2">
                  <span className="inline-flex min-h-9 items-center rounded-md border border-slate-200 bg-white px-3 font-mono text-xs font-semibold text-slate-800">
                    {status}
                    <span className="ml-2 font-sans font-medium text-slate-500">{label}</span>
                  </span>
                  {index < statusPills.length - 1 && <ArrowRight className="h-4 w-4 text-slate-400" />}
                </div>
              ))}
            </div>
            <p>
              默认 flow 中，assignment 完成会把 work item 推到 <InlineCode>IN_REVIEW</InlineCode>，
              review approved 会进入 <InlineCode>ACCEPTED</InlineCode>，changes requested 会回到{' '}
              <InlineCode>NEEDS_REVISION</InlineCode> 重新派发。
            </p>
          </Section>

          <Section id="config-reference" eyebrow="参考" title="配置速查">
            <FieldTable
              rows={[
                ['template.json', '项目模版入口，定义 roles、workItemStatusFlow、projectGlobals、projectFileFolders。'],
                ['roles/*/role.json', 'template-local role 定义，可覆盖或增强 inline role。'],
                ['skillBundleRefs', '当前运行时最低共同能力交付机制，通常包含 skill://agent-workspace。'],
                ['capabilityBundleRefs', '项目级能力包，是更耐久的审计抽象，可声明 skills、tools、MCP servers、hooks 和 scopes。'],
                ['runtimeCompatibility', '声明某 agent type 原生支持、降级支持或不支持的能力面。'],
                ['projectGlobals', '项目变量 schema 和默认值。secret 只通过 owner resource flow 写入。'],
              ]}
            />
          </Section>

          <Section id="storage-env" eyebrow="参考" title="存储环境变量">
            <p>
              agent-workspace 的原生存储变量使用 <InlineCode>PROJECT_STORAGE_*</InlineCode>。
              为了让 AgentCraft 部署复用已有对象存储，也兼容 <InlineCode>TOS_*</InlineCode>。
              如果两组变量都存在，<InlineCode>PROJECT_STORAGE_*</InlineCode> 优先。
            </p>
            <CodeBlock>
{`PROJECT_STORAGE_ACCESS_KEY
PROJECT_STORAGE_SECRET_KEY
PROJECT_STORAGE_REGION
PROJECT_STORAGE_ENDPOINT
PROJECT_STORAGE_BUCKET
PROJECT_STORAGE_FOLDER
PROJECT_STORAGE_PUBLIC_URL

TOS_ACCESS_KEY
TOS_SECRET_KEY
TOS_REGION
TOS_ENDPOINT
TOS_BUCKET
TOS_FOLDER
TOS_PUBLIC_URL`}
            </CodeBlock>
            <p>
              Workspace container image 只在运行时读取这些变量，构建阶段不应该把存储凭证 bake 进镜像。
            </p>
          </Section>
            </>
          )}
        </article>

        <RightToc activeId={activeId} sections={activeSections} onNavigateSection={navigateToSection} />
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-3 px-4 py-6 text-sm text-slate-500 sm:px-6 md:flex-row md:items-center md:justify-between lg:px-8">
          <span>AgentCraft Docs</span>
          <div className="flex flex-wrap gap-4">
            <Link to="/" className="hover:text-slate-950">AgentCraft</Link>
            <Link to="/projects" className="hover:text-slate-950">Projects</Link>
            <a href="#overview" className="hover:text-slate-950">Back to top</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
