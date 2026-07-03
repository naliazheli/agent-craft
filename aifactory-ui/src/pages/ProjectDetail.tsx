import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ArrowUp,
  Bot,
  Boxes,
  Brain,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  Compass,
  Copy,
  CornerDownRight,
  Crown,
  Download,
  FileUp,
  FileSearch,
  FileText,
  FolderOpen,
  FolderPlus,
  GitPullRequest,
  History,
  Hammer,
  Inbox,
  Info,
  KeyRound,
  Layers3,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  Radar,
  RefreshCw,
  Rocket,
  Route,
  Save,
  Send,
  Search,
  ShieldCheck,
  Sparkles,
  Settings2,
  Square,
  Trash2,
  Upload,
  UserRoundCheck,
  Workflow,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { GuidedTour, type GuidedTourStep } from '@/components/onboarding/GuidedTour';
import { MathMarkdown } from '@/components/math/MathMarkdown';
import { appEnv } from '@/lib/env';
import {
  api,
  type ApiConfigRecord,
  type ProjectBoard as ProjectBoardData,
  type ProjectGlobalVariable,
  type ProjectActivityItem,
  type ProjectAgentPollingConfig,
  type ProjectAgentProfile,
  type ProjectAgentRuntime,
  type ProjectAgentRuntimeBudget,
  type ProjectAgentRuntimeConversation,
  type ProjectAgentRuntimeImage,
  type ProjectAgentRuntimeSession,
  type ProjectAgentRuntimeStreamEvent,
  type ProjectAgentRuntimeWorkspaceFile,
  type ProjectAssignmentRuntimeState,
  type ProjectCockpitMember,
  type ProjectCoordinatorConfig,
  type ProjectCoordinatorDispatchRule,
  type ProjectEventItem,
  type ProjectEventGraph,
  type ProjectEventGraphEdge,
  type ProjectEventGraphNode,
  type ProjectFileEntry,
  type ProjectFolderEntry,
  type ProjectMember,
  type ProjectLocalRunnerPresence,
  type ProjectTemplateRoleEntry,
  type ProjectRun,
  type ProjectRoleSkillDetail,
  type ProjectWorkItem,
  type ProjectWorkItemCommentAttachment,
  type ProjectWorkItemListMeta,
  type UserSearchResult,
} from '@/lib/api';
import { useAuthStore } from '@/store/auth';

const WORK_ITEM_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  DRAFT: 'secondary',
  READY: 'default',
  ASSIGNED: 'default',
  IN_PROGRESS: 'warning',
  IN_REVIEW: 'warning',
  NEEDS_REVISION: 'destructive',
  ACCEPTED: 'success',
  REJECTED: 'destructive',
  CANCELLED: 'secondary',
};

const PROJECT_SIGNAL_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  ...WORK_ITEM_STATUS_VARIANT,
  ACTIVE: 'default',
  PAUSED: 'warning',
  ARCHIVED: 'secondary',
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  QUEUED: 'secondary',
  RUNNING: 'warning',
  APPROVED: 'success',
  CHANGES_REQUESTED: 'warning',
  PENDING: 'secondary',
};

const DEFAULT_PROJECT_MAX_ACTIVE_AGENTS = 10;
const PROJECT_MAX_ACTIVE_AGENTS_CAP = 50;
const DEFAULT_PROJECT_MAX_ACTIVE_GOALS = 5;
const PROJECT_MAX_ACTIVE_GOALS_CAP = 50;

function projectMaxActiveAgentsFromSettings(settings?: Record<string, unknown> | null) {
  const numeric = Number(settings?.maxActiveAgents);
  if (!Number.isFinite(numeric)) return DEFAULT_PROJECT_MAX_ACTIVE_AGENTS;
  return Math.min(Math.max(Math.floor(numeric), 1), PROJECT_MAX_ACTIVE_AGENTS_CAP);
}

function projectMaxActiveGoalsFromSettings(settings?: Record<string, unknown> | null) {
  const numeric = Number(settings?.maxActiveGoals);
  if (!Number.isFinite(numeric)) return DEFAULT_PROJECT_MAX_ACTIVE_GOALS;
  return Math.min(Math.max(Math.floor(numeric), 1), PROJECT_MAX_ACTIVE_GOALS_CAP);
}

const PROJECT_DETAIL_TOUR_BASE_STEPS: GuidedTourStep[] = [
  {
    selector: '[data-tour="project-members-nav"]',
    title: 'Open Project Members',
    body: 'This is where you create the lead agent, add worker agents, open agent chats, and launch runtimes.',
    actionLabel: 'Click Project Members first.',
  },
  {
    selector: '[data-tour="project-local-agent"]',
    title: 'Launch Local Agent',
    body: 'After a lead agent member exists, select it and click Local Agent. This queues a local CLI runtime that your device runner can claim.',
    actionLabel: 'Choose Local Agent for the lead agent.',
  },
  {
    selector: '[data-tour="project-confirm-local-agent"]',
    title: 'Confirm the launch',
    body: 'The confirmation dialog lets you choose the role, model config, and local runtime mode. Queueing the agent does not start work until your local runner connects.',
    actionLabel: 'Click Queue Local Agent when the dialog is ready.',
  },
  {
    selector: '[data-tour="project-copy-command"]',
    title: 'Copy the runner command',
    body: 'Paste this command into your terminal. The runner connects this computer to AgentCraft and claims pending local agent jobs.',
    actionLabel: 'Copy the command, then run it in your terminal.',
  },
  {
    selector: '[data-tour="project-agent-message"]',
    title: 'Start the conversation',
    body: 'Once the agent is online, send the project objective or first request here. The lead agent can break broad work into tasks and coordinate worker agents.',
    actionLabel: 'Tell the lead agent what outcome to drive next.',
  },
  {
    selector: '[data-tour="project-send-agent-message"]',
    title: 'Let the lead delegate',
    body: 'Send the message. As work grows, the lead agent can create or use worker-agent roles to execute implementation, review, research, and integration tasks.',
  },
];

const ACTIVITY_LABEL: Record<ProjectActivityItem['type'], string> = {
  WORK_ITEM: 'Work Item',
  ASSIGNMENT: 'Assignment',
  RUN: 'Run',
  RUN_LOG: 'Run Log',
  ARTIFACT: 'Artifact',
  REVIEW: 'Review',
  MEMORY: 'Memory',
};

const EVENT_GRAPH_COLUMNS = [
  { key: 'GOAL', label: 'Goals' },
  { key: 'FEATURE', label: 'Features' },
  { key: 'WORK_ITEM', label: 'Work Items' },
  { key: 'ACTOR', label: 'Agents' },
  { key: 'RUN', label: 'Runs' },
  { key: 'ARTIFACT', label: 'Artifacts' },
  { key: 'REVIEW', label: 'Reviews' },
  { key: 'RESOURCE', label: 'Resources' },
  { key: 'MESSAGE', label: 'Messages' },
  { key: 'EVENT', label: 'Changes' },
];

const EVENT_GRAPH_NODE_TYPE_CLASS: Record<string, string> = {
  PROJECT: 'border-cyan-400/40 bg-cyan-500/10',
  GOAL: 'border-fuchsia-400/40 bg-fuchsia-500/10',
  FEATURE: 'border-indigo-400/40 bg-indigo-500/10',
  WORK_ITEM: 'border-emerald-400/40 bg-emerald-500/10',
  RUN: 'border-blue-400/40 bg-blue-500/10',
  ARTIFACT: 'border-orange-400/40 bg-orange-500/10',
  REVIEW: 'border-lime-400/40 bg-lime-500/10',
  AGENT: 'border-amber-400/40 bg-amber-500/10',
  HUMAN: 'border-sky-400/40 bg-sky-500/10',
  RESOURCE: 'border-rose-400/40 bg-rose-500/10',
  FILE: 'border-violet-400/40 bg-violet-500/10',
  FOLDER: 'border-violet-400/40 bg-violet-500/10',
  MESSAGE: 'border-sky-400/40 bg-sky-500/10',
  EVENT: 'border-border bg-muted/20',
};

type EventGraphMode = 'all' | 'execution' | 'blockers' | 'resources' | 'review' | 'timeline';

const EVENT_GRAPH_MODE_OPTIONS: Array<{
  id: EventGraphMode;
  label: string;
  question: string;
  caption: string;
  empty: string;
  icon: typeof Workflow;
}> = [
  {
    id: 'all',
    label: 'All Links',
    question: 'Full project relationship graph',
    caption: 'Complete graph',
    empty: 'No graph links are visible yet.',
    icon: Workflow,
  },
  {
    id: 'execution',
    label: 'Execution Path',
    question: 'Goal -> work item -> run -> artifact',
    caption: 'Goal to artifact',
    empty: 'No execution path is visible yet.',
    icon: Route,
  },
  {
    id: 'blockers',
    label: 'Blocker',
    question: 'Why is work stuck?',
    caption: 'Stuck or failed',
    empty: 'No blocked, waiting, or failed signals are visible.',
    icon: AlertTriangle,
  },
  {
    id: 'resources',
    label: 'Resource Access',
    question: 'Who touched which resources?',
    caption: 'Files and variables',
    empty: 'No resource access signals are visible.',
    icon: KeyRound,
  },
  {
    id: 'review',
    label: 'Review',
    question: 'Artifacts, reviews, and decisions',
    caption: 'Artifacts and decisions',
    empty: 'No artifacts or review decisions are visible.',
    icon: ClipboardCheck,
  },
  {
    id: 'timeline',
    label: 'Timeline',
    question: 'Status changes in the last 24 hours',
    caption: '24h status changes',
    empty: 'No status changes are visible from the last 24 hours.',
    icon: History,
  },
];

const EVENT_GRAPH_EXECUTION_EDGE_TYPES = new Set([
  'HAS_FEATURE',
  'HAS_WORK_ITEM',
  'CHILD_WORK_ITEM',
  'HAS_RUN',
  'PRODUCED',
  'HAS_ARTIFACT',
]);

const EVENT_GRAPH_RESOURCE_EDGE_TYPES = new Set([
  'USES_RESOURCE',
  'PROJECT_GLOBAL_CREATED',
  'PROJECT_GLOBAL_WRITTEN',
  'PROJECT_GLOBALS_UPDATED',
  'PROJECT_FILE_WRITTEN',
  'PROJECT_FILE_UPLOADED',
  'PROJECT_FOLDER_CREATED',
  'PROJECT_FILE_DELETED',
  'PROJECT_FOLDER_DELETED',
]);

const EVENT_GRAPH_REVIEW_EDGE_TYPES = new Set([
  'HAS_ARTIFACT',
  'PRODUCED',
  'HAS_REVIEW',
  'REVIEWED',
  'DECIDED',
  'CREATED',
]);

const EVENT_GRAPH_BLOCKER_EDGE_TYPES = new Set([
  'HAS_FEATURE',
  'HAS_WORK_ITEM',
  'CHILD_WORK_ITEM',
  'ASSIGNED_TO',
  'DISPATCHED',
  'OWNS',
  'RAN',
  'HAS_RUN',
  'HAS_REVIEW',
  'DECIDED',
  'USES_RESOURCE',
  'COORDINATOR_BLOCKED',
  'WORK_ITEM_STATUS_CHANGED',
  'RUN_UPDATED',
  'REVIEW_CREATED',
  'PROJECT_GLOBAL_CREATED',
  'PROJECT_GLOBAL_WRITTEN',
  'PROJECT_GLOBALS_UPDATED',
]);

const EVENT_GRAPH_TIMELINE_EVENT_TYPES = new Set([
  'WORK_ITEM_STATUS_CHANGED',
  'RUN_CREATED',
  'RUN_UPDATED',
  'REVIEW_CREATED',
  'COORDINATOR_BLOCKED',
  'PROJECT_GLOBAL_WRITTEN',
  'PROJECT_GLOBALS_UPDATED',
  'PROJECT_FILE_WRITTEN',
  'PROJECT_FILE_UPLOADED',
  'PROJECT_FOLDER_CREATED',
]);

const EVENT_GRAPH_BLOCKER_STATUSES = new Set([
  'BLOCKED',
  'FAILED',
  'ERROR',
  'NEEDS_REVISION',
  'CHANGES_REQUESTED',
  'REJECTED',
  'REQUIRED',
  'PAUSED',
  'WAITING',
  'WAITING_OWNER',
  'WAITING_FOR_OWNER',
  'WAITING_CONFIRMATION',
  'WAITING_LOCAL_RUNNER',
  'WAITING_LOCAL_CODEX',
]);

const WORK_ITEM_STATUS_OPTIONS = Object.keys(WORK_ITEM_STATUS_VARIANT);
const CLOSED_WORK_ITEM_STATUSES = ['ACCEPTED', 'DONE', 'COMPLETED', 'REJECTED', 'CANCELLED'];
const OPEN_ASSIGNMENT_STATUSES = ['PROPOSED', 'ACTIVE', 'PAUSED'];
const PROJECT_FILE_EVENT_TYPES = ['PROJECT_FILE_WRITTEN', 'PROJECT_FILE_UPLOADED', 'PROJECT_FOLDER_CREATED', 'PROJECT_FILE_DELETED'];
const DEFAULT_WORK_ITEM_PAGE_SIZE = 100;
const WORK_ITEM_TYPE_OPTIONS = ['PLANNING', 'DESIGN', 'IMPLEMENTATION', 'REVIEW', 'RESEARCH', 'INTEGRATION', 'VERIFICATION'];
const CONCURRENCY_MODE_OPTIONS = ['SINGLE', 'RACE', 'MULTI_ROLE', 'PRIMARY_BACKUP'];
const MEMORY_TYPE_OPTIONS = ['DECISION', 'CONSTRAINT', 'FACT', 'RISK', 'OPEN_QUESTION', 'INTERFACE_CONTRACT'];
const ARTIFACT_TYPE_OPTIONS = ['HANDOFF', 'SPEC', 'REPORT', 'PATCH', 'PR_LINK', 'TEST_RESULT', 'DECISION_NOTE'];
const REVIEWER_TYPE_OPTIONS = ['LEAD_AGENT', 'REVIEW_AGENT', 'HUMAN'];
const REVIEW_STATUS_OPTIONS = ['PENDING', 'APPROVED', 'CHANGES_REQUESTED', 'REJECTED'];
type ProjectGoalOption = { id: string; title: string; status?: string };
type ProjectFeatureOption = {
  id: string;
  title: string;
  goalId?: string | null;
  spec?: Record<string, unknown> | null;
};
type WorkItemMentionField = 'description' | 'scopeBrief' | 'acceptanceCriteria' | 'outputContract';
type ProjectFileMentionTarget = 'agentMessage' | 'workItemComment' | WorkItemMentionField;
type ProjectFileMentionEntry = {
  type: 'folder' | 'file';
  path: string;
  name: string;
  key: string;
  size?: number;
  lastModified?: string | null;
};
type AgentRuntimeMessage = NonNullable<ProjectAgentRuntimeSession['messageHistory']>[number];
type ProjectResourceRequest = {
  key: string;
  label: string;
  description?: string | null;
  value?: string;
  isSecret?: boolean;
  required?: boolean;
  createTaskOnMissing?: boolean;
  category?: string | null;
  scope?: string | null;
  goalId?: string | null;
};
type ProjectOwnerActionChoice = {
  id: string;
  label: string;
  description?: string | null;
};
type ProjectOwnerAction = {
  key: string;
  label: string;
  type?: string | null;
  prompt?: string | null;
  description?: string | null;
  required?: boolean;
  category?: string | null;
  goalId?: string | null;
  choices: ProjectOwnerActionChoice[];
};

function isRuntimeSteeringMessage(message?: AgentRuntimeMessage | null) {
  return message?.role === 'user' && String(message.status || '').toUpperCase() === 'STEERING';
}

const isGoalScopedProjectGlobal = (global: ProjectGlobalVariable) =>
  global.scope === 'goal' && Boolean(global.goalId);

const isProjectScopedProjectGlobal = (global: ProjectGlobalVariable) =>
  !isGoalScopedProjectGlobal(global);

const AGENT_MESSAGE_COLLAPSE_CHARS = 900;
const AGENT_MESSAGE_COLLAPSE_LINES = 12;
const AGENT_ACTION_COLLAPSE_CHARS = 360;

function shouldCollapseRuntimeText(text: string, charLimit = AGENT_MESSAGE_COLLAPSE_CHARS) {
  if (text.length > charLimit) return true;
  return text.split(/\r\n|\r|\n/).length > AGENT_MESSAGE_COLLAPSE_LINES;
}

function collapseRuntimeText(text: string, charLimit = AGENT_MESSAGE_COLLAPSE_CHARS) {
  if (!shouldCollapseRuntimeText(text, charLimit)) return text;
  const clipped = text.slice(0, charLimit);
  const lastBreak = Math.max(clipped.lastIndexOf('\n'), clipped.lastIndexOf(' '));
  const end = lastBreak > Math.floor(charLimit * 0.72) ? lastBreak : charLimit;
  return `${text.slice(0, end).trimEnd()}\n...`;
}

function ExpandableLineClampText({
  text,
  className = '',
}: {
  text: string;
  className?: string;
}) {
  const measureRef = useRef<HTMLParagraphElement | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [canToggle, setCanToggle] = useState(false);

  useEffect(() => {
    setExpanded(false);
  }, [text]);

  useEffect(() => {
    const element = measureRef.current;
    if (!element || typeof window === 'undefined') return;

    let frameId = 0;
    const measure = () => {
      const current = measureRef.current;
      if (!current) return;

      const nextCanToggle = current.scrollHeight > current.clientHeight + 1;
      setCanToggle(nextCanToggle);
      if (!nextCanToggle) {
        setExpanded(false);
      }
    };
    const scheduleMeasure = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(measure);
    };

    scheduleMeasure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(scheduleMeasure);
    observer?.observe(element);
    window.addEventListener('resize', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer?.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
    };
  }, [text]);

  return (
    <div className="relative min-w-0">
      <p className={`${expanded ? '' : 'line-clamp-2'} ${className}`}>
        {text}
      </p>
      <p
        ref={measureRef}
        aria-hidden="true"
        className={`pointer-events-none invisible absolute inset-x-0 top-0 line-clamp-2 ${className}`}
      >
        {text}
      </p>
      {canToggle ? (
        <button
          type="button"
          className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          aria-expanded={expanded}
          onClick={() => setExpanded((current) => !current)}
        >
          {expanded ? 'Show less' : 'Show more'}
          <ChevronDown className={`h-3.5 w-3.5 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
      ) : null}
    </div>
  );
}

const AGENT_RUNTIME_STATUS_VARIANT: Record<string, 'default' | 'secondary' | 'success' | 'warning' | 'destructive'> = {
  IDLE: 'success',
  TYPING: 'success',
  STARTING: 'warning',
  WAITING_CONFIRMATION: 'warning',
  WAITING_LOCAL_RUNNER: 'warning',
  WAITING_LOCAL_CODEX: 'warning',
  STOPPED: 'secondary',
  ERROR: 'destructive',
};

const WORK_ITEM_ACCEPTED_STATUSES = new Set(['ACCEPTED', 'DONE', 'COMPLETED']);
const WORK_ITEM_ACTIVE_STATUSES = new Set(['READY', 'ASSIGNED', 'IN_PROGRESS', 'IN_REVIEW', 'NEEDS_REVISION', 'REJECTED']);

function agentRoleSortRank(role?: string | null) {
  const normalized = String(role || '').toUpperCase();
  const ranks: Record<string, number> = {
    LEAD_AGENT: 0,
    PLANNER_AGENT: 1,
    WORKER_AGENT: 2,
    SECURITY_AUDITOR: 3,
    AGGREGATOR_AGENT: 4,
    INTEGRATOR_AGENT: 5,
  };
  return ranks[normalized] ?? 9;
}

function agentRuntimeStatus(runtime?: { session?: { status?: string | null } | null } | null) {
  return String(runtime?.session?.status || '').toUpperCase();
}

function agentRuntimeIsOffline(runtime?: {
  session?: {
    status?: string | null;
    dockerStatus?: Record<string, unknown>;
    apiHealth?: Record<string, unknown>;
  } | null;
} | null) {
  const session = runtime?.session;
  if (!runtime || !session) return true;
  const status = agentRuntimeStatus(runtime);
  if (status === 'STOPPED' || status === 'ERROR') return true;
  if (session.dockerStatus?.running === false || session.apiHealth?.ok === false) return true;
  return false;
}

function agentRuntimeHasAgentRole(runtime: ProjectAgentRuntime) {
  return runtime.user?.role === 'AI_AGENT' || runtime.role.endsWith('_AGENT');
}

function agentConversationSortRank(member: ProjectMember, runtime?: ProjectAgentRuntime | null) {
  const offlineRank = agentRuntimeIsOffline(runtime) ? 1 : 0;
  return {
    offlineRank,
    roleRank: agentRoleSortRank(member.role),
    joinedAt: member.joinedAt || '',
    name: formatAgentDisplayName(member).toLowerCase(),
  };
}

type RoleSkillSummary = {
  ref: string;
  name: string;
  source: 'external' | 'role' | 'project';
  description: string;
};

type RoleContract = {
  description: string;
  reads: string;
  writes: string;
  trigger: string;
  skills: RoleSkillSummary[];
  capabilityBundleRefs?: string[];
  runtimeCompatibility?: ProjectTemplateRoleEntry['runtimeCompatibility'];
  initialPrompt?: string;
};

type LaunchLogEntry = {
  at: string;
  level: 'info' | 'success' | 'error';
  message: string;
};

type AgentLaunchMode = 'local-docker' | 'local-runner' | 'local-codex' | 'aws-ecs' | 'aws-agentcore';

type AgentMessageAttachment = {
  name: string;
  size: number;
  url: string;
  key: string;
};

type AgentConfirmationChoice = {
  label: string;
  value: string;
};

const COORDINATOR_MEMBER_ID = 'project-coordinator';

const CONFIRMATION_TEXT_PATTERN = new RegExp(
  [
    'approval_required',
    'do you approve',
    'waiting for user confirmation',
    'requires human approval',
    'please confirm',
    '\\u8bf7\\u9009\\u62e9',
    '\\u9009\\u9879',
    '\\u786e\\u8ba4',
    '\\u6279\\u51c6',
    '\\u7ee7\\u7eed',
    '\\u9700\\u8981\\u4f60\\u786e\\u8ba4',
  ].join('|'),
  'i',
);
const OPTION_CHOICE_PATTERN = new RegExp(
  '^(?:[-*]\\s+|(?:option\\s*)?([A-Da-d]|\\d{1,2})(?:[.)\\u3001:\\uff1a]\\s+|\\s+))(.+)$',
  'i',
);

function deriveAgentConfirmationChoices(message: AgentRuntimeMessage): AgentConfirmationChoice[] {
  if (message.role === 'user') return [];
  const content = message.content || '';
  const isConfirmation = message.status === 'WAITING_CONFIRMATION' || CONFIRMATION_TEXT_PATTERN.test(content);
  if (!isConfirmation) return [];

  const optionChoices = content
    .split('\n')
    .map((line) => line.trim())
    .map((line) => {
      const match = line.match(OPTION_CHOICE_PATTERN);
      if (!match) return null;
      const text = (match[2] || '').replace(/\s+/g, ' ').trim();
      if (!text || text.length > 180) return null;
      return {
        label: match[1] ? `${match[1].toString().toUpperCase()}. ${text}` : text,
        value: text,
      };
    })
    .filter(Boolean) as AgentConfirmationChoice[];

  if (optionChoices.length) return optionChoices.slice(0, 4);

  return [
    { label: 'Approve and continue', value: 'Approved. Continue.' },
    { label: 'Let agent decide', value: 'Please choose the best reasonable option yourself and continue without asking me to decide.' },
    { label: 'Reject / stop', value: 'Rejected. Do not continue with that action.' },
  ];
}

function runtimeConversationTitle(messages: AgentRuntimeMessage[], fallback = 'Conversation') {
  const message = messages.find((item) => item.role === 'user' && item.content?.trim());
  const firstLine = message?.content?.trim().split('\n')[0].replace(/\s+/g, ' ');
  return firstLine ? Array.from(firstLine).slice(0, 10).join('') : fallback;
}

function runtimeConversationUpdatedAt(messages: AgentRuntimeMessage[], fallback?: string | null) {
  return [...messages].reverse().find((item) => item.createdAt)?.createdAt || fallback || new Date().toISOString();
}

function normalizeRuntimeConversations(session: ProjectAgentRuntimeSession | null | undefined): ProjectAgentRuntimeConversation[] {
  if (!session) return [];
  const messageHistory = session.messageHistory || [];
  const conversations = (session.conversations || []).map((conversation) => ({
    ...conversation,
    title: conversation.titleLocked
      ? conversation.title
      : conversation.title || runtimeConversationTitle(conversation.messageHistory || []),
    titleLocked: Boolean(conversation.titleLocked),
    messageHistory: conversation.messageHistory || [],
  }));
  if (!conversations.length) {
    return [
      {
        id: session.activeConversationId || `default-${session.runtimeId}`,
        title: runtimeConversationTitle(messageHistory, 'Current session'),
        createdAt: session.launchedAt,
        updatedAt: runtimeConversationUpdatedAt(messageHistory, session.updatedAt),
        messageHistory,
      },
    ];
  }
  return conversations;
}

function preferredActiveRuntimeConversationId(session: ProjectAgentRuntimeSession | null | undefined) {
  if (!session) return '';
  return session.status === 'TYPING'
    ? session.activeRequestConversationId || session.activeConversationId || ''
    : session.activeConversationId || session.activeRequestConversationId || '';
}

function applyConversationMessages(
  session: ProjectAgentRuntimeSession,
  conversationId: string,
  messageHistory: AgentRuntimeMessage[],
) {
  const conversations = normalizeRuntimeConversations(session);
  const targetId = conversationId || session.activeConversationId || conversations[0]?.id || `default-${session.runtimeId}`;
  const nextConversations = conversations.some((conversation) => conversation.id === targetId)
    ? conversations.map((conversation) =>
        conversation.id === targetId
          ? {
              ...conversation,
              title: conversation.titleLocked
                ? conversation.title
                : runtimeConversationTitle(messageHistory, conversation.title),
              updatedAt: runtimeConversationUpdatedAt(messageHistory, conversation.updatedAt),
              messageHistory,
            }
          : conversation,
      )
    : [
        {
          id: targetId,
          title: runtimeConversationTitle(messageHistory, 'Current session'),
          titleLocked: false,
          createdAt: session.launchedAt,
          updatedAt: runtimeConversationUpdatedAt(messageHistory, session.updatedAt),
          messageHistory,
        },
        ...conversations,
      ];
  return {
    ...session,
    activeConversationId: targetId,
    conversations: nextConversations,
    messageHistory,
  };
}

function runtimeMessageTime(message?: Pick<AgentRuntimeMessage, 'createdAt'> | null) {
  const time = message?.createdAt ? new Date(message.createdAt).getTime() : 0;
  return Number.isFinite(time) ? time : 0;
}

function hasEquivalentRuntimeMessage(messages: AgentRuntimeMessage[], candidate: AgentRuntimeMessage) {
  const candidateTime = runtimeMessageTime(candidate);
  return messages.some((message) => {
    if (message.id === candidate.id) return true;
    if (message.role !== candidate.role) return false;
    if (message.content.trim() !== candidate.content.trim()) return false;
    const messageTime = runtimeMessageTime(message);
    return Boolean(candidateTime && messageTime && Math.abs(messageTime - candidateTime) <= 5 * 60 * 1000);
  });
}

function preferRuntimeMessageForUi(current: AgentRuntimeMessage, incoming: AgentRuntimeMessage) {
  const statusRank = (message: AgentRuntimeMessage) =>
    message.status === 'TYPING' || message.status === 'sending' ? 0 : 1;
  const rankDelta = statusRank(incoming) - statusRank(current);
  if (rankDelta > 0) return incoming;
  if (rankDelta < 0) return current;
  if ((incoming.content || '').length > (current.content || '').length) return incoming;
  return runtimeMessageTime(incoming) >= runtimeMessageTime(current) ? incoming : current;
}

function dedupeRuntimeMessagesForUi(messages: AgentRuntimeMessage[]) {
  const deduped: AgentRuntimeMessage[] = [];
  const byIdentity = new Map<string, number>();
  messages.forEach((message) => {
    const identity = message.id || `${message.role}:${message.status || ''}:${message.createdAt || ''}:${message.content.trim()}`;
    const existingIndex = byIdentity.get(identity);
    if (existingIndex !== undefined) {
      deduped[existingIndex] = preferRuntimeMessageForUi(deduped[existingIndex], message);
      return;
    }
    byIdentity.set(identity, deduped.length);
    deduped.push(message);
  });
  return deduped;
}

function shouldPreserveOutgoingRuntimeMessage(
  message: AgentRuntimeMessage,
  currentSession: ProjectAgentRuntimeSession,
) {
  if (message.role !== 'user') return false;
  if (message.id.startsWith('local-') || message.status === 'sending' || message.status === 'failed') return true;
  if (currentSession.status !== 'TYPING' || !currentSession.lastMessageAt) return false;
  const messageTime = runtimeMessageTime(message);
  const lastMessageTime = new Date(currentSession.lastMessageAt).getTime();
  return Boolean(
    messageTime &&
      Number.isFinite(lastMessageTime) &&
      messageTime >= lastMessageTime - 30 * 1000,
  );
}

function mergeAgentRuntimeSessionForUi(
  currentSession: ProjectAgentRuntimeSession,
  incomingSession: ProjectAgentRuntimeSession,
) {
  const incomingConversations = normalizeRuntimeConversations(incomingSession);
  const currentConversations = normalizeRuntimeConversations(currentSession);
  const currentById = new Map(currentConversations.map((conversation) => [conversation.id, conversation]));
  const incomingIds = new Set(incomingConversations.map((conversation) => conversation.id));
  const conversations = incomingConversations.map((conversation) => {
    const currentConversation = currentById.get(conversation.id);
    if (!currentConversation) return conversation;
    const preserved = (currentConversation.messageHistory || []).filter((message) =>
      shouldPreserveOutgoingRuntimeMessage(message, currentSession),
    );
    if (!preserved.length) return conversation;
    const messageHistory = [...(conversation.messageHistory || [])];
    preserved.forEach((message) => {
      if (!hasEquivalentRuntimeMessage(messageHistory, message)) {
        messageHistory.push(message);
      }
    });
    messageHistory.sort((left, right) => runtimeMessageTime(left) - runtimeMessageTime(right));
    return {
      ...conversation,
      title: conversation.titleLocked
        ? conversation.title
        : runtimeConversationTitle(messageHistory, conversation.title),
      updatedAt: runtimeConversationUpdatedAt(messageHistory, conversation.updatedAt),
      messageHistory,
    };
  });
  currentConversations.forEach((conversation) => {
    if (!incomingIds.has(conversation.id)) {
      conversations.push(conversation);
    }
  });
  const activeConversationId =
    preferredActiveRuntimeConversationId(incomingSession) ||
    currentSession.activeConversationId ||
    conversations[0]?.id ||
    `default-${incomingSession.runtimeId || currentSession.runtimeId}`;
  const activeConversation =
    conversations.find((conversation) => conversation.id === activeConversationId) ||
    conversations[0];
  return {
    ...currentSession,
    ...incomingSession,
    activeConversationId,
    conversations,
    messageHistory: activeConversation?.messageHistory || incomingSession.messageHistory || [],
  };
}

function mergeAgentRuntimeListForUi(
  current: ProjectAgentRuntime[],
  incoming: ProjectAgentRuntime[],
) {
  const currentByMemberId = new Map(current.map((runtime) => [runtime.memberId, runtime]));
  return incoming.map((runtime) => {
    const currentRuntime = currentByMemberId.get(runtime.memberId);
    if (!currentRuntime) return runtime;
    return {
      ...currentRuntime,
      ...runtime,
      session: mergeAgentRuntimeSessionForUi(currentRuntime.session, runtime.session),
    };
  });
}

const COMMON_WORKSPACE_SKILL: RoleSkillSummary = {
  ref: 'skill://agent-workspace',
  name: 'agent-workspace',
  source: 'external',
  description: 'Common workspace entry skill mounted from the shared skills directory.',
};

const roleLocalSkill = (name: string, description: string): RoleSkillSummary => ({
  ref: `role-skill://${name}`,
  name,
  source: 'role',
  description,
});

const ROLE_CONTRACTS: Record<string, RoleContract> = {
  OWNER: {
    description: 'Human authority for project direction, budget, scope, and final approval gates.',
    reads: 'Everything',
    writes: 'Goals, approvals',
    trigger: 'Approves scope and budget gates',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-owner', 'Goal, budget, proposal, and membership authority instructions.'),
    ],
  },
  LEAD_AGENT: {
    description: 'Coordinates the project, turns owner goals into the shallowest useful work structure, dispatches work, and escalates human-gate decisions.',
    reads: 'Brief, memory, events',
    writes: 'Plan, dispatch, proposals',
    trigger: 'Keeps the project moving',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-lead', 'Planning, dispatch, proposals, and project coordination instructions.'),
    ],
  },
  PLANNER_AGENT: {
    description: 'Breaks goals into optional feature groups and ready-to-dispatch work items with acceptance criteria and output contracts.',
    reads: 'Goal and relevant memory',
    writes: 'Feature groups and work items',
    trigger: 'Breaks large goals into packets',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-planner', 'Decomposition, dependencies, capability tags, and task packet instructions.'),
    ],
  },
  WORKER_AGENT: {
    description: 'Executes assigned scoped work, or when idle self-selects unowned unassigned work items, then returns artifacts, evidence, and a reviewable handoff.',
    reads: 'Task packet or unassigned item',
    writes: 'Runs, artifacts, handoff',
    trigger: 'Executes assigned or idle work',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-worker', 'Claiming work, discovering idle unassigned items, executing runs, submitting artifacts, and handoff instructions.'),
    ],
  },
  REVIEW_AGENT: {
    description: 'Reviews worker handoffs against acceptance criteria and records approved decisions or requested changes.',
    reads: 'Handoff and acceptance criteria',
    writes: 'Reviews and memory',
    trigger: 'Accepts or requests changes',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-reviewer', 'Evidence checks, review resolution, and durable memory instructions.'),
    ],
  },
  SECURITY_AUDITOR: {
    description: 'Audits vibe-coded or release-bound work for secrets, injection, auth flaws, IDOR, validation gaps, dependency risk, CORS, XSS, and breach-class issues.',
    reads: 'Code, configs, handoffs, dependencies',
    writes: 'Security reports, risks, proposals',
    trigger: 'Audits vibe-coded work before release',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-security-auditor', 'Security audit checklist and prioritized finding output contract.'),
    ],
  },
  PM_AGENT: {
    description: 'Watches project health, detects stalls and risks, writes PM reports, and proposes coordination changes.',
    reads: 'Metrics and event stream',
    writes: 'Reports and reassignment proposals',
    trigger: 'Finds stalls and risks',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-pm', 'Metric snapshots, risk reports, and reassignment proposal instructions.'),
    ],
  },
  AGGREGATOR_AGENT: {
    description: 'Synthesizes accepted upstream work into grounded reports, deliveries, and decision packages.',
    reads: 'Accepted upstream items and project files',
    writes: 'Combined shared-file deliverables',
    trigger: 'Closes fan-in work',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-aggregator', 'Grounded fan-in synthesis, source caveats, and deliverable packaging.'),
    ],
  },
  INTEGRATOR_AGENT: {
    description: 'Connects accepted work to external systems such as GitHub, CI, releases, deployments, or merge workflows.',
    reads: 'Accepted work and external links',
    writes: 'Merge or external events',
    trigger: 'Closes the external loop',
    skills: [
      COMMON_WORKSPACE_SKILL,
      roleLocalSkill('agent-workspace-integrator', 'External events, protected gates, and merge/action safety instructions.'),
    ],
  },
  STAKEHOLDER: {
    description: 'Human participant who gives feedback and approvals without taking agent-runtime ownership.',
    reads: 'Public project state',
    writes: 'Feedback and approvals',
    trigger: 'Human attention when needed',
    skills: [],
  },
  CONTRIBUTOR: {
    description: 'Human or external contributor working inside a bounded assigned scope.',
    reads: 'Assigned scope',
    writes: 'Artifacts and notes',
    trigger: 'Contributes bounded work',
    skills: [],
  },
};

function getWorkItemResourceRequest(item?: ProjectWorkItem | null): ProjectResourceRequest | null {
  const inputPacket = item?.inputPacket;
  if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) return null;
  const request = (inputPacket as Record<string, unknown>).resourceRequest;
  if (!request || typeof request !== 'object' || Array.isArray(request)) return null;
  const record = request as Record<string, unknown>;
  const key = typeof record.key === 'string' ? record.key.trim() : '';
  if (!key) return null;
  const label = typeof record.label === 'string' && record.label.trim() ? record.label.trim() : key;
  return {
    key,
    label,
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : null,
    value: Object.prototype.hasOwnProperty.call(record, 'value') ? String(record.value ?? '') : '',
    isSecret: Boolean(record.isSecret),
    required: record.required !== false,
    createTaskOnMissing: record.createTaskOnMissing !== false,
    category: typeof record.category === 'string' && record.category.trim() ? record.category.trim() : null,
  };
}

function getInferredOwnerAction(item?: ProjectWorkItem | null): ProjectOwnerAction | null {
  const title = item?.title?.trim() || '';
  if (!title) return null;
  if (/^Owner Decision:/i.test(title)) {
    return {
      key: `owner_decision_${item?.id || 'unknown'}`,
      label: title.replace(/^Owner Decision:\s*/i, '').trim() || title,
      type: 'DECISION',
      prompt: item?.description || null,
      description: item?.description || null,
      required: true,
      category: 'owner-decision',
      goalId: item?.goalId || null,
      choices: [
        { id: 'approve', label: 'Approve' },
        { id: 'needs_revision', label: 'Needs revision' },
        { id: 'decline', label: 'Decline' },
      ],
    };
  }
  if (/^Owner Action:/i.test(title)) {
    return {
      key: `owner_action_${item?.id || 'unknown'}`,
      label: title.replace(/^Owner Action:\s*/i, '').trim() || title,
      type: 'EXTERNAL_STEP',
      prompt: item?.description || null,
      description: item?.description || null,
      required: true,
      category: 'owner-action',
      goalId: item?.goalId || null,
      choices: [],
    };
  }
  return null;
}

function getWorkItemOwnerAction(item?: ProjectWorkItem | null): ProjectOwnerAction | null {
  const inputPacket = item?.inputPacket;
  if (!inputPacket || typeof inputPacket !== 'object' || Array.isArray(inputPacket)) {
    return getInferredOwnerAction(item);
  }
  const action = (inputPacket as Record<string, unknown>).ownerAction;
  if (!action || typeof action !== 'object' || Array.isArray(action)) {
    return getInferredOwnerAction(item);
  }
  const record = action as Record<string, unknown>;
  const key =
    typeof record.key === 'string' && record.key.trim()
      ? record.key.trim()
      : typeof record.id === 'string' && record.id.trim()
        ? record.id.trim()
        : '';
  if (!key) return null;
  const label =
    typeof record.label === 'string' && record.label.trim()
      ? record.label.trim()
      : typeof record.title === 'string' && record.title.trim()
        ? record.title.trim()
        : key;
  const rawChoices = Array.isArray(record.choices)
    ? record.choices
    : Array.isArray(record.options)
      ? record.options
      : [];
  const choices = rawChoices
    .map((choice, index): ProjectOwnerActionChoice | null => {
      if (typeof choice === 'string') {
        const value = choice.trim();
        return value ? { id: value, label: value } : null;
      }
      if (!choice || typeof choice !== 'object' || Array.isArray(choice)) return null;
      const choiceRecord = choice as Record<string, unknown>;
      const id =
        typeof choiceRecord.id === 'string' && choiceRecord.id.trim()
          ? choiceRecord.id.trim()
          : typeof choiceRecord.value === 'string' && choiceRecord.value.trim()
            ? choiceRecord.value.trim()
            : typeof choiceRecord.key === 'string' && choiceRecord.key.trim()
              ? choiceRecord.key.trim()
              : `choice-${index + 1}`;
      const choiceLabel =
        typeof choiceRecord.label === 'string' && choiceRecord.label.trim()
          ? choiceRecord.label.trim()
          : typeof choiceRecord.title === 'string' && choiceRecord.title.trim()
            ? choiceRecord.title.trim()
            : id;
      return {
        id,
        label: choiceLabel,
        description:
          typeof choiceRecord.description === 'string' && choiceRecord.description.trim()
            ? choiceRecord.description.trim()
            : null,
      };
    })
    .filter((choice): choice is ProjectOwnerActionChoice => Boolean(choice));
  return {
    key,
    label,
    type: typeof record.type === 'string' && record.type.trim() ? record.type.trim() : null,
    prompt: typeof record.prompt === 'string' && record.prompt.trim() ? record.prompt.trim() : null,
    description: typeof record.description === 'string' && record.description.trim() ? record.description.trim() : null,
    required: record.required !== false,
    category: typeof record.category === 'string' && record.category.trim() ? record.category.trim() : null,
    goalId: typeof record.goalId === 'string' && record.goalId.trim() ? record.goalId.trim() : item?.goalId ?? null,
    choices,
  };
}

function isRuntimeNotReachableReason(reason?: string | null) {
  return /runtime\s+is\s+not\s+reachable|lead\s+runtime\s+is\s+not\s+reachable/i.test(reason || '');
}

function canReconnectAgentRuntime(runtime?: ProjectAgentRuntime | null) {
  const provider = runtime?.session?.provider;
  return provider === 'local-docker' || provider === 'local-runner' || provider === 'local-codex';
}

const PROJECT_MEMBER_ROLE_OPTIONS = [
  { value: 'LEAD_AGENT', label: 'Lead Agent' },
  { value: 'PLANNER_AGENT', label: 'Planner Agent' },
  { value: 'WORKER_AGENT', label: 'Worker Agent' },
  { value: 'REVIEW_AGENT', label: 'Review Agent' },
  { value: 'SECURITY_AUDITOR', label: 'Security Auditor' },
  { value: 'PM_AGENT', label: 'PM Agent' },
  { value: 'AGGREGATOR_AGENT', label: 'Aggregator Agent' },
  { value: 'INTEGRATOR_AGENT', label: 'Integrator Agent' },
  { value: 'STAKEHOLDER', label: 'Stakeholder' },
  { value: 'CONTRIBUTOR', label: 'Contributor' },
];

function formatRoleLabel(role: string) {
  return role
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const PROJECT_ROLE_ICON: Record<string, typeof Bot> = {
  OWNER: UserRoundCheck,
  LEAD_AGENT: Crown,
  PLANNER_AGENT: Compass,
  WORKER_AGENT: Hammer,
  REVIEW_AGENT: ClipboardCheck,
  SECURITY_AUDITOR: ShieldCheck,
  PM_AGENT: CalendarDays,
  AGGREGATOR_AGENT: Layers3,
  INTEGRATOR_AGENT: Workflow,
  FINDING_VALIDATOR: FileSearch,
  REPORT_REVIEWER: ClipboardCheck,
  REPORT_WRITER: FileText,
  LEGAL_AGENT: FileText,
};

function roleIconForRole(role: string) {
  if (role.includes('LEGAL')) return FileText;
  if (role.includes('REVIEW')) return ClipboardCheck;
  if (role.includes('REPORT')) return FileText;
  if (role.includes('FINDING') || role.includes('VALIDATOR')) return FileSearch;
  return PROJECT_ROLE_ICON[role] || Bot;
}

function agentRoleNameMeta(member?: Pick<ProjectMember, 'permissions'> | null) {
  const permissions = isPlainRecord(member?.permissions) ? member?.permissions : null;
  const meta = isPlainRecord(permissions?.agentRoleName) ? permissions.agentRoleName : null;
  const displayName = typeof meta?.displayName === 'string' ? meta.displayName.trim() : '';
  if (!displayName) return null;
  return {
    displayName,
    source: typeof meta?.source === 'string' ? meta.source : '',
  };
}

function isFamousAgentName(member?: Pick<ProjectMember, 'permissions'> | null) {
  return agentRoleNameMeta(member)?.source === 'role-famous';
}

function formatAgentDisplayName(member: Pick<ProjectMember, 'permissions' | 'user'> & { userId?: string }) {
  return agentRoleNameMeta(member)?.displayName || member.user.displayName || member.user.email || member.userId || 'Project member';
}

function agentNameClassName(member?: Pick<ProjectMember, 'permissions'> | null) {
  return isFamousAgentName(member)
    ? 'bg-gradient-to-r from-amber-200 via-yellow-400 to-orange-300 bg-clip-text font-semibold text-transparent drop-shadow-[0_0_10px_rgba(251,191,36,0.35)]'
    : 'font-medium';
}

function projectTemplateRolesFromSettings(settings?: Record<string, unknown> | null): ProjectTemplateRoleEntry[] {
  const roles = settings?.projectTemplateRoles;
  if (!Array.isArray(roles)) return [];
  return roles.filter((entry): entry is ProjectTemplateRoleEntry => {
    return Boolean(entry && typeof entry === 'object' && typeof (entry as ProjectTemplateRoleEntry).role === 'string');
  });
}

function projectRolePromptOverridesFromSettings(settings?: Record<string, unknown> | null): Record<string, { initialPrompt?: string }> {
  const overrides = settings?.projectRoleOverrides;
  if (!overrides || typeof overrides !== 'object' || Array.isArray(overrides)) return {};
  return Object.entries(overrides).reduce((acc, [role, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return acc;
    const prompt = (value as { initialPrompt?: unknown }).initialPrompt;
    if (typeof prompt === 'string') {
      acc[role] = { initialPrompt: prompt };
    }
    return acc;
  }, {} as Record<string, { initialPrompt?: string }>);
}

type ProjectRoleAgentDefault = {
  launchMode?: AgentLaunchMode;
  agentType?: string;
  image?: string | null;
  deploymentDays?: number;
  enableSudo?: boolean;
};

function projectRoleAgentDefaultsFromSettings(settings?: Record<string, unknown> | null): Record<string, ProjectRoleAgentDefault> {
  const defaults = settings?.projectRoleAgentDefaults;
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return {};
  return Object.entries(defaults).reduce((acc, [role, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return acc;
    const record = value as Record<string, unknown>;
    const launchMode = typeof record.launchMode === 'string' && ['local-docker', 'local-runner', 'local-codex', 'aws-ecs', 'aws-agentcore'].includes(record.launchMode)
      ? record.launchMode as AgentLaunchMode
      : undefined;
    acc[role] = {
      ...(launchMode ? { launchMode } : {}),
      ...(typeof record.agentType === 'string' && record.agentType.trim() ? { agentType: record.agentType.trim() } : {}),
      ...(typeof record.image === 'string' && record.image.trim() ? { image: record.image.trim() } : {}),
      ...(Number.isFinite(Number(record.deploymentDays)) ? { deploymentDays: Math.max(1, Math.floor(Number(record.deploymentDays))) } : {}),
      ...(typeof record.enableSudo === 'boolean' ? { enableSudo: record.enableSudo } : {}),
    };
    return acc;
  }, {} as Record<string, ProjectRoleAgentDefault>);
}

function contractFromTemplateRole(entry: ProjectTemplateRoleEntry): RoleContract {
  const capabilityBundleRefs = entry.capabilityBundleRefs?.length
    ? entry.capabilityBundleRefs
    : entry.capabilityBundles?.map((bundle) => bundle.ref).filter(Boolean) || [];
  const requiredScopes = Array.from(
    new Set([
      ...(entry.scopes || []),
      ...(entry.capabilityBundles?.flatMap((bundle) => bundle.requiredScopes || []) || []),
    ]),
  );
  const requiredProjectGlobals = Array.from(
    new Set(entry.capabilityBundles?.flatMap((bundle) => bundle.requiredProjectGlobals || []) || []),
  );
  const skillRefsFromCapabilityBundles = entry.capabilityBundles
    ?.flatMap((bundle) => bundle.surfaces || [])
    .filter((ref) => ref.startsWith('skill://') || ref.startsWith('role-skill://') || ref.startsWith('template-role-skill://')) || [];
  const skillRefs = entry.skillBundleRefs?.length
    ? entry.skillBundleRefs
    : entry.skills?.map((skill) => skill.ref).filter(Boolean).length
      ? entry.skills.map((skill) => skill.ref).filter(Boolean)
      : skillRefsFromCapabilityBundles;
  const skills = skillRefs.map((ref) => {
    const known = entry.skills?.find((skill) => skill.ref === ref);
    return {
      ref,
      name: known?.name || ref.replace(/^(skill|role-skill|template-role-skill):\/\//, ''),
      source: known?.source === 'role' || ref.startsWith('role-skill://') || ref.startsWith('template-role-skill://')
        ? 'role' as const
        : 'external' as const,
      description: known?.description || 'Injected into this runtime at launch.',
    };
  });
  return {
    description: entry.description || `${entry.label || formatRoleLabel(entry.role)} project role.`,
    reads: requiredProjectGlobals.length
      ? `Project context and ${requiredProjectGlobals.length} required global${requiredProjectGlobals.length === 1 ? '' : 's'}`
      : 'Project-scoped context',
    writes: requiredScopes.includes('PROJECT_FILE_WRITE')
      ? 'Project files and notes'
      : requiredScopes.some((scope) => scope.includes('WORK_ITEM'))
        ? 'Work item updates'
        : 'Notes',
    trigger: entry.auto === 'OWNER'
      ? 'Project owner authority'
      : entry.auto === 'ON_CREATE'
        ? 'Provisioned on project creation'
        : entry.launchable
          ? 'Launchable from this project template'
          : 'Available in this project template',
    skills,
    capabilityBundleRefs: capabilityBundleRefs.length ? capabilityBundleRefs : skillRefs,
    runtimeCompatibility: entry.runtimeCompatibility || entry.capabilityBundles?.find((bundle) => bundle.runtimeCompatibility)?.runtimeCompatibility || null,
    initialPrompt: entry.initialPrompt || '',
  };
}

const WORKFLOW_STEPS = [
  { key: 'brief', label: 'Brief', icon: Brain },
  { key: 'plan', label: 'Plan', icon: Workflow },
  { key: 'dispatch', label: 'Dispatch', icon: Send },
  { key: 'execute', label: 'Execute', icon: Activity },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
  { key: 'memory', label: 'Memory', icon: ShieldCheck },
];

const AGENT_DEPLOYMENT_PRICE_PER_DAY = 10;
function isAgentcraftProductionHost(hostname: string) {
  const normalizedHostname = hostname.toLowerCase();
  return normalizedHostname === 'agentcraft.work' || normalizedHostname.endsWith('.agentcraft.work');
}

const IS_PRODUCTION_AGENTCRAFT_HOST =
  typeof window !== 'undefined' && isAgentcraftProductionHost(window.location.hostname);
const DEFAULT_AGENT_LAUNCH_MODE: AgentLaunchMode = IS_PRODUCTION_AGENTCRAFT_HOST ? 'local-runner' : 'local-docker';
const DEFAULT_LAUNCH_AGENT_TYPE = 'pi';
const DEFAULT_PROJECT_COORDINATOR_CONFIG: ProjectCoordinatorConfig = {
  enabled: true,
  maxDispatchesPerTick: 3,
  launchMode: 'local-docker',
  agentType: 'pi',
  messageTemplate: '当前有未被分配的 item {{title}}，通过 {{launchTarget}} 拉起角色 {{role}}。',
  lastTickAt: null,
  dispatchRules: [],
};
const CLOUD_AGENT_UNAVAILABLE_NOTICE =
  'Cloud Agent is temporarily unavailable. AWS has not been able to lift the runtime restrictions on my new account, so hosted cloud agents are paused for now. If another cloud provider would like to support this capability, please contact me at nalia0316@gmail.com.';
const DEFAULT_LAUNCH_CONFIG_FORM = {
  name: '',
  apiType: 'openai' as 'openai' | 'claude',
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelName: 'gpt-4o',
};

function isCloudAgentLaunchMode(mode?: AgentLaunchMode | null) {
  return mode === 'aws-ecs' || mode === 'aws-agentcore';
}

function supportsLocalCliLaunch(agentType: string) {
  return ['codex', 'pi'].includes((agentType || '').trim().toLowerCase());
}

function usesLocalCliAuth(mode: AgentLaunchMode, agentType: string) {
  const normalizedAgentType = (agentType || '').trim().toLowerCase();
  return (
    ['codex', 'claude-code'].includes(normalizedAgentType) &&
    (mode === 'local-codex' || ['local-docker', 'local-runner'].includes(mode))
  );
}

function normalizeAvailableLaunchMode(mode: AgentLaunchMode) {
  if (isCloudAgentLaunchMode(mode)) return DEFAULT_AGENT_LAUNCH_MODE;
  return IS_PRODUCTION_AGENTCRAFT_HOST && mode === 'local-docker' ? 'local-runner' : mode;
}

function projectCoordinatorConfigFromSettings(settings?: Record<string, unknown> | null): ProjectCoordinatorConfig {
  const flow = settings?.workItemStatusFlow;
  const flowRecord = flow && typeof flow === 'object' && !Array.isArray(flow)
    ? flow as Record<string, unknown>
    : {};
  const coordinator =
    flowRecord.coordinator &&
    typeof flowRecord.coordinator === 'object' &&
    !Array.isArray(flowRecord.coordinator)
      ? flowRecord.coordinator as Record<string, unknown>
      : settings?.coordinator && typeof settings.coordinator === 'object' && !Array.isArray(settings.coordinator)
        ? settings.coordinator as Record<string, unknown>
        : {};
  const launchMode =
    typeof coordinator.launchMode === 'string' &&
    ['local-docker', 'local-runner', 'local-codex', 'aws-ecs', 'aws-agentcore'].includes(coordinator.launchMode)
      ? coordinator.launchMode as AgentLaunchMode
      : DEFAULT_PROJECT_COORDINATOR_CONFIG.launchMode;
  const maxDispatchesPerTick = Number(coordinator.maxDispatchesPerTick);
  const dispatchRules = Array.isArray(flowRecord.dispatchRules)
    ? flowRecord.dispatchRules.filter((rule): rule is ProjectCoordinatorDispatchRule =>
        Boolean(rule && typeof rule === 'object' && !Array.isArray(rule) && typeof (rule as Record<string, unknown>).role === 'string'),
    )
    : [];
  return {
    enabled: coordinator.enabled !== false,
    maxDispatchesPerTick: Number.isFinite(maxDispatchesPerTick) && maxDispatchesPerTick > 0
      ? Math.floor(maxDispatchesPerTick)
      : DEFAULT_PROJECT_COORDINATOR_CONFIG.maxDispatchesPerTick,
    launchMode,
    agentType: typeof coordinator.agentType === 'string' && coordinator.agentType.trim()
      ? coordinator.agentType.trim()
      : DEFAULT_PROJECT_COORDINATOR_CONFIG.agentType,
    messageTemplate: typeof coordinator.messageTemplate === 'string'
      ? coordinator.messageTemplate
      : DEFAULT_PROJECT_COORDINATOR_CONFIG.messageTemplate,
    lastTickAt: typeof coordinator.lastTickAt === 'string' ? coordinator.lastTickAt : null,
    dispatchRules,
  };
}

function coordinatorRuleStatuses(rule: ProjectCoordinatorDispatchRule) {
  return Array.isArray(rule.statuses) && rule.statuses.length ? rule.statuses.join(', ') : 'claimable statuses';
}

function coordinatorRuleWorkTypes(rule: ProjectCoordinatorDispatchRule) {
  return Array.isArray(rule.workTypes) && rule.workTypes.length ? rule.workTypes.join(', ') : 'all work types';
}

function agentProfileSudoEnabled(profile: Pick<ProjectAgentProfile, 'enableSudo' | 'settings'>) {
  return Boolean(
    profile.enableSudo ||
      (
        profile.settings &&
        typeof profile.settings === 'object' &&
        !Array.isArray(profile.settings) &&
        (profile.settings as Record<string, unknown>).enableSudo
      ),
  );
}

function localRunnerApiBaseUrl() {
  if (IS_PRODUCTION_AGENTCRAFT_HOST) {
    return 'https://api.agentcraft.work/api';
  }
  if (/^https?:\/\//i.test(appEnv.apiBaseUrl)) {
    return appEnv.apiBaseUrl.replace(/\/+$/, '');
  }
  if (typeof window !== 'undefined') {
    return new URL(appEnv.apiBaseUrl, window.location.origin).toString().replace(/\/+$/, '');
  }
  return appEnv.apiBaseUrl.replace(/\/+$/, '');
}

function localRuntimeDomainKey() {
  const fallbackHost = typeof window !== 'undefined' ? window.location.host : 'local';
  let host = fallbackHost;
  try {
    const apiUrl = new URL(localRunnerApiBaseUrl());
    host = isAgentcraftProductionHost(apiUrl.hostname) ? 'agentcraft.work' : apiUrl.host;
  } catch {
    host = fallbackHost;
  }
  return host.toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'local';
}

function localRunnerScriptUrl() {
  if (IS_PRODUCTION_AGENTCRAFT_HOST) {
    return 'https://www.agentcraft.work/agentcraft-local-runner.mjs';
  }
  if (typeof window !== 'undefined') {
    return new URL('/agentcraft-local-runner.mjs', window.location.origin).toString();
  }
  return '/agentcraft-local-runner.mjs';
}

function localAgentScriptUrl() {
  if (IS_PRODUCTION_AGENTCRAFT_HOST) {
    return 'https://www.agentcraft.work/agentcraft-local-agent-runner.mjs';
  }
  if (typeof window !== 'undefined') {
    return new URL('/agentcraft-local-agent-runner.mjs', window.location.origin).toString();
  }
  return '/agentcraft-local-agent-runner.mjs';
}

function localRuntimeArgs(projectId: string | undefined, token: string, memberId?: string) {
  return [
    `--api ${localRunnerApiBaseUrl()}`,
    projectId ? `--project ${projectId}` : '',
    memberId ? `--member ${memberId}` : '',
    `--token ${token}`,
  ].filter(Boolean).join(' ');
}

type LocalRunnerCommandMode = 'powershell' | 'cmd' | 'wsl' | 'mac';

function detectLocalRunnerCommandMode(): LocalRunnerCommandMode {
  if (typeof navigator === 'undefined') return 'mac';
  const nav = navigator as Navigator & { userAgentData?: { platform?: string } };
  const platform = `${nav.userAgentData?.platform || navigator.platform || ''} ${navigator.userAgent || ''}`.toLowerCase();
  if (/mac|iphone|ipad|ipod/.test(platform)) return 'mac';
  if (/win/.test(platform)) return 'powershell';
  if (/linux|x11|cros/.test(platform)) return 'wsl';
  return 'mac';
}

function localRuntimeCommands(projectId: string | undefined, token: string, memberId: string | undefined, mode: 'local-runner' | 'local-codex' = 'local-runner') {
  const args = localRuntimeArgs(projectId, token, memberId);
  const scriptName = mode === 'local-codex' ? 'agentcraft-local-agent-runner.mjs' : 'agentcraft-local-runner.mjs';
  const scriptUrl = mode === 'local-codex' ? localAgentScriptUrl() : localRunnerScriptUrl();
  const domainKey = localRuntimeDomainKey();
  const dataRootName = mode === 'local-codex' ? 'local-agent' : 'runtimes';
  const powershellDataRootName = `AgentCraft\\${domainKey}\\${dataRootName}`;
  const shellDataRootName = `${domainKey}/${dataRootName}`;
  const powershellCommand = `$runnerDir = [System.IO.Path]::GetTempPath(); $runner = Join-Path $runnerDir '${scriptName}'; $dataRootBase = if ($env:LOCALAPPDATA) { $env:LOCALAPPDATA } else { Join-Path $HOME 'AppData\\Local' }; $dataRoot = Join-Path $dataRootBase '${powershellDataRootName}'; Invoke-WebRequest -UseBasicParsing '${scriptUrl}' -OutFile $runner; node $runner ${args} --data-root $dataRoot`;
  const shellRunnerPrefix = `runner_dir="\${TMPDIR:-/tmp}" && mkdir -p "$runner_dir" && runner="$runner_dir/${scriptName}"`;
  return {
    powershell: powershellCommand,
    cmd: `powershell -NoProfile -ExecutionPolicy Bypass -Command "${powershellCommand}"`,
    wsl: `${shellRunnerPrefix} && data_root="$HOME/.agentcraft/${shellDataRootName}" && curl -fsSL '${scriptUrl}' -o "$runner" && node "$runner" ${args} --data-root "$data_root"`,
    mac: `${shellRunnerPrefix} && data_root="$HOME/Library/Application Support/AgentCraft/${shellDataRootName}" && curl -fsSL '${scriptUrl}' -o "$runner" && node "$runner" ${args} --data-root "$data_root"`,
  };
}

const LOCAL_RUNNER_COMMAND_OPTIONS = [
  { id: 'powershell' as const, label: 'Windows PowerShell' },
  { id: 'cmd' as const, label: 'Windows CMD' },
  { id: 'wsl' as const, label: 'Linux / WSL' },
  { id: 'mac' as const, label: 'macOS' },
];

const LAUNCH_AGENT_TYPES = [
  {
    id: 'pi',
    label: 'Pi',
    caption: 'Available now',
    icon: Boxes,
    available: true,
  },
  {
    id: 'hermes-agent',
    label: 'Hermes Agent',
    caption: 'Available now',
    icon: Rocket,
    available: true,
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    caption: 'Coming soon',
    icon: Boxes,
    available: false,
  },
  {
    id: 'mini-swe-agent',
    label: 'Mini SWE Agent',
    caption: 'Coming soon',
    icon: Workflow,
    available: false,
  },
  {
    id: 'codex',
    label: 'Codex',
    caption: 'Available now',
    icon: Workflow,
    available: true,
  },
  {
    id: 'claude-code',
    label: 'Claude Code',
    caption: 'Coming soon',
    icon: Brain,
    available: false,
  },
];

function launchAgentTypeOption(agentType: typeof LAUNCH_AGENT_TYPES[number], launchMode: AgentLaunchMode) {
  if (launchMode === 'local-codex') {
    return {
      available: supportsLocalCliLaunch(agentType.id),
      caption: supportsLocalCliLaunch(agentType.id) ? 'Available now' : 'Coming soon',
    };
  }
  return {
    available: agentType.available,
    caption: agentType.caption,
  };
}

function formatAgentTypeLabel(agentType?: string | null) {
  const normalized = (agentType || 'pi').trim().toLowerCase();
  const known = LAUNCH_AGENT_TYPES.find((item) => item.id === normalized);
  if (known) return known.label;
  return normalized
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ') || 'Pi';
}

function displayLaunchMode(launchMode?: AgentLaunchMode | string | null) {
  return launchMode === 'local-codex' ? 'local-agent' : (launchMode || 'local-docker');
}

function displayLaunchTarget(launchMode?: AgentLaunchMode | string | null, agentType?: string | null) {
  const normalizedAgentType = (agentType || 'pi').trim().toLowerCase().replace(/_/g, '-') || 'pi';
  return `${displayLaunchMode(launchMode)}/${normalizedAgentType}`;
}

type ProjectSectionKey = 'home' | 'events' | 'members' | 'planning' | 'work' | 'knowledge' | 'documents' | 'delivery' | 'settings';
type ProjectSectionParam = ProjectSectionKey | 'resources';
type AgentRuntimePanelKey = 'workspace' | 'skills' | 'scope' | 'runner' | 'polling' | 'prompt' | null;
type WorkItemsView = 'list' | 'new' | 'detail';
type WorkItemDetailTab = 'details' | 'activity' | 'discussion' | 'execution';

const PROJECT_SECTIONS: Array<{
  key: ProjectSectionKey;
  label: string;
  description: string;
  icon: typeof Activity;
}> = [
  { key: 'home', label: 'Home', description: 'Overview boards and signals', icon: Activity },
  { key: 'events', label: 'Event Graph', description: 'Agents, goals, items, and resources', icon: Workflow },
  { key: 'members', label: 'Project Members', description: 'Members, roles, and agents', icon: UserRoundCheck },
  { key: 'planning', label: 'Plan', description: 'Goals and optional feature groups', icon: Sparkles },
  { key: 'work', label: 'Work Items', description: 'Board, assignments, and runs', icon: Layers3 },
  { key: 'knowledge', label: 'Memory', description: 'Reusable project context', icon: Brain },
  { key: 'documents', label: 'Resources', description: 'Shared files and references', icon: FolderOpen },
  { key: 'delivery', label: 'Delivery', description: 'Artifacts and reviews', icon: ClipboardCheck },
  { key: 'settings', label: 'Settings', description: 'Project profile and resources', icon: ShieldCheck },
];
const PROJECT_SECTION_KEYS = new Set<ProjectSectionKey>(PROJECT_SECTIONS.map((item) => item.key));

function normalizeProjectSectionParam(section?: string | null): ProjectSectionKey | null {
  if (!section) return null;
  if (section === 'resources') return 'documents';
  return PROJECT_SECTION_KEYS.has(section as ProjectSectionKey) ? (section as ProjectSectionKey) : null;
}

function projectSectionUrlParam(section: ProjectSectionKey): ProjectSectionParam {
  return section === 'documents' ? 'resources' : section;
}

function formatRuntimeStatusLabel(status?: string | null) {
  return (status || 'UNKNOWN').toLowerCase().replace(/_/g, ' ');
}

function formatBytes(size?: number | null) {
  if (!size || size <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(size) / Math.log(1024)), units.length - 1);
  const value = size / Math.pow(1024, index);
  return `${value.toFixed(value >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatProjectDate(value?: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function collectProjectFilePathsFromValue(value: unknown, paths: Set<string>) {
  if (!value) return;
  if (typeof value === 'string') {
    const path = normalizeProjectFileFolderPath(value);
    if (path && path.includes('/')) paths.add(path);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry) => collectProjectFilePathsFromValue(entry, paths));
    return;
  }
  if (!isRecord(value)) return;
  const directPath = typeof value.path === 'string' ? normalizeProjectFileFolderPath(value.path) : '';
  if (directPath && directPath.includes('/')) paths.add(directPath);
  [
    value.sharedFiles,
    value.outputProjectFiles,
    value.outputPaths,
    value.projectFiles,
    value.files,
    value.deliverables,
    value.artifacts,
  ].forEach((entry) => collectProjectFilePathsFromValue(entry, paths));
}

function workItemOutputProjectFilePaths(item?: ProjectWorkItem | null) {
  const paths = new Set<string>();
  if (!item) return [];
  collectProjectFilePathsFromValue((item as any).outputProjectFiles, paths);
  collectProjectFilePathsFromValue(item.outputContract, paths);
  const inputPacket = isRecord(item.inputPacket) ? item.inputPacket : {};
  collectProjectFilePathsFromValue(inputPacket.outputProjectFiles, paths);
  collectProjectFilePathsFromValue(inputPacket.outputPaths, paths);
  return [...paths];
}

function recordTextValue(value: unknown, keys: string[]) {
  if (!isRecord(value)) return '';
  for (const key of keys) {
    const entry = value[key];
    if (typeof entry === 'string' && entry.trim()) return entry.trim();
  }
  return '';
}

function workItemOutputContractText(item?: ProjectWorkItem | null) {
  const outputContract = (item as any)?.outputContract;
  if (!outputContract) return '';
  if (typeof outputContract === 'string') return outputContract.trim();
  const directText = recordTextValue(outputContract, [
    'conclusion',
    'summary',
    'result',
    'expectedArtifact',
    'expectedOutput',
    'deliverable',
    'handoff',
    'description',
  ]);
  if (directText) return directText;
  try {
    return JSON.stringify(outputContract, null, 2);
  } catch {
    return '';
  }
}

function eventPayloadString(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return typeof value === 'string' && value.trim() ? value.trim() : '';
}

function eventPayloadStringArray(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0) : [];
}

function eventPayloadNumber(payload: Record<string, unknown> | null | undefined, key: string) {
  const value = payload?.[key];
  const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isFinite(parsed) ? parsed : 0;
}

function projectEventMatchesWorkItem(event: ProjectEventItem, workItemId: string) {
  if (!workItemId) return false;
  const payload = event.payload || {};
  if (event.refType === 'WORK_ITEM' && event.refId === workItemId) return true;
  if (eventPayloadString(payload, 'workItemId') === workItemId) return true;
  const nestedWorkItem = isRecord(payload.workItem) ? payload.workItem : null;
  if (typeof nestedWorkItem?.id === 'string' && nestedWorkItem.id === workItemId) return true;
  const affected = isRecord(payload.affected) ? payload.affected : null;
  const affectedWorkItems = Array.isArray(affected?.workItems) ? affected.workItems : [];
  return (
    eventPayloadStringArray(payload, 'affectedWorkItemIds').includes(workItemId) ||
    affectedWorkItems.some((item) => item === workItemId)
  );
}

function projectEventFilePath(event: ProjectEventItem) {
  const payload = event.payload || {};
  return (
    eventPayloadString(payload, 'path') ||
    eventPayloadString(payload, 'filePath') ||
    eventPayloadString(payload, 'folderPath') ||
    (event.refType === 'PROJECT_FILE' || event.refType === 'PROJECT_FOLDER' ? event.refId || '' : '')
  );
}

function projectFileEntryFromEvent(event: ProjectEventItem): ProjectFileEntry | null {
  const payload = event.payload || {};
  const path = projectEventFilePath(event);
  if (!path) return null;
  return {
    path,
    key: eventPayloadString(payload, 'key') || path,
    size: eventPayloadNumber(payload, 'size'),
    lastModified: event.createdAt,
    contentType: eventPayloadString(payload, 'contentType') || undefined,
    source: event.type,
    type: event.type === 'PROJECT_FOLDER_CREATED' ? 'folder' : 'file',
  };
}

function humanizeEventType(type?: string) {
  return String(type || 'EVENT')
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0) + part.slice(1).toLowerCase())
    .join(' ');
}

function formatProjectEventActor(event: ProjectEventItem) {
  const payload = event.payload || {};
  if (event.actor?.displayName || event.actor?.email) return event.actor.displayName || event.actor.email || 'Project member';
  return eventPayloadString(payload, 'source') || eventPayloadString(payload, 'updatedBy') || eventPayloadString(payload, 'createdBy') || 'System';
}

function formatProjectEventSummary(event: ProjectEventItem) {
  const payload = event.payload || {};
  const previousStatus = eventPayloadString(payload, 'previousStatus');
  const status = eventPayloadString(payload, 'status');
  const reason = eventPayloadString(payload, 'reason');
  const source = eventPayloadString(payload, 'source');
  const runStatus = eventPayloadString(payload, 'runStatus');
  const assignmentStatus = eventPayloadString(payload, 'assignmentStatus');
  const reviewStatus = eventPayloadString(payload, 'reviewStatus') || eventPayloadString(payload, 'decision');
  const changedFields = eventPayloadStringArray(payload, 'changedFields');
  const parts = [
    previousStatus && status && previousStatus !== status ? `${previousStatus} -> ${status}` : status,
    assignmentStatus ? `assignment ${assignmentStatus}` : '',
    runStatus ? `run ${runStatus}` : '',
    reviewStatus ? `review ${reviewStatus}` : '',
    reason ? `reason: ${reason}` : '',
    source ? `source: ${source}` : '',
    changedFields.length ? `fields: ${changedFields.join(', ')}` : '',
  ].filter(Boolean);
  return parts.join(' · ') || eventPayloadString(payload, 'summary') || humanizeEventType(event.type);
}

function safeProjectFileName(name: string) {
  return name.trim().replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'attachment';
}

function cleanProjectFolderName(name: string) {
  return name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, ' ').replace(/^\.+$/, '') || 'New folder';
}

function joinProjectFilePath(prefix: string, name: string) {
  const cleanPrefix = prefix.replace(/^\/+|\/+$/g, '');
  const cleanName = name.replace(/^\/+/g, '');
  return [cleanPrefix, cleanName].filter(Boolean).join('/');
}

function projectFileBreadcrumbs(prefix: string) {
  const parts = prefix.replace(/^\/+|\/+$/g, '').split('/').filter(Boolean);
  return parts.map((name, index) => ({
    name,
    path: parts.slice(0, index + 1).join('/'),
  }));
}

type ProjectFileUploadCandidate = {
  file: File;
  relativePath: string;
};

function readDirectoryEntries(reader: any): Promise<any[]> {
  return new Promise((resolve, reject) => {
    const entries: any[] = [];
    const readBatch = () => {
      reader.readEntries(
        (batch: any[]) => {
          if (!batch.length) {
            resolve(entries);
            return;
          }
          entries.push(...batch);
          readBatch();
        },
        reject,
      );
    };
    readBatch();
  });
}

async function collectFileSystemEntryFiles(entry: any, parentPath = ''): Promise<ProjectFileUploadCandidate[]> {
  if (!entry) return [];
  if (entry.isFile) {
    return new Promise((resolve, reject) => {
      entry.file(
        (file: File) => resolve([{ file, relativePath: `${parentPath}${file.name}` }]),
        reject,
      );
    });
  }
  if (entry.isDirectory) {
    const children = await readDirectoryEntries(entry.createReader());
    const nested = await Promise.all(
      children.map((child) => collectFileSystemEntryFiles(child, `${parentPath}${entry.name}/`)),
    );
    return nested.flat();
  }
  return [];
}

async function collectDroppedProjectFiles(dataTransfer: DataTransfer): Promise<ProjectFileUploadCandidate[]> {
  const items = Array.from(dataTransfer.items || []);
  const entryItems = items
    .map((item) => (typeof (item as any).webkitGetAsEntry === 'function' ? (item as any).webkitGetAsEntry() : null))
    .filter(Boolean);

  if (entryItems.length) {
    const nested = await Promise.all(entryItems.map((entry) => collectFileSystemEntryFiles(entry)));
    return nested.flat();
  }

  return Array.from(dataTransfer.files || []).map((file) => ({
    file,
    relativePath: (file as File & { webkitRelativePath?: string }).webkitRelativePath || file.name,
  }));
}

function agentMessageDraftStorageKey(projectId?: string, memberId?: string, conversationId?: string) {
  if (!projectId || !memberId || !conversationId) return '';
  return `agentcraft.projectAgentMessageDraft.v1:${encodeURIComponent(projectId)}:${encodeURIComponent(memberId)}:${encodeURIComponent(conversationId)}`;
}

function readAgentMessageDraft(key: string) {
  if (!key || typeof window === 'undefined') return '';
  try {
    return window.localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

function writeAgentMessageDraft(key: string, value: string) {
  if (!key || typeof window === 'undefined') return;
  try {
    if (value) {
      window.localStorage.setItem(key, value);
    } else {
      window.localStorage.removeItem(key);
    }
  } catch {
    // Draft persistence is a convenience; messaging should keep working if storage is unavailable.
  }
}

function removeAgentMessageDraft(key: string) {
  writeAgentMessageDraft(key, '');
}

const DEFAULT_AGENT_POLLING_CONFIG: ProjectAgentPollingConfig = {
  enabled: false,
  strategy: 'IDLE_ONLY',
  intervalMinutes: 60,
  message: 'keep working',
};

function defaultAgentPollingConfigForRole(role?: string | null): ProjectAgentPollingConfig {
  return {
    ...DEFAULT_AGENT_POLLING_CONFIG,
    enabled: role === 'LEAD_AGENT',
  };
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function normalizeAgentPollingConfig(
  value: unknown,
  defaults: ProjectAgentPollingConfig = DEFAULT_AGENT_POLLING_CONFIG,
): ProjectAgentPollingConfig {
  const record = isPlainRecord(value) ? value : {};
  const fallback = { ...DEFAULT_AGENT_POLLING_CONFIG, ...defaults };
  const interval = Number(record.intervalMinutes ?? fallback.intervalMinutes);
  const message = typeof record.message === 'string' && record.message.trim()
    ? record.message.trim()
    : fallback.message;
  return {
    enabled: record.enabled !== undefined ? Boolean(record.enabled) : Boolean(fallback.enabled),
    strategy: record.strategy === 'FIXED_INTERVAL' || (!record.strategy && fallback.strategy === 'FIXED_INTERVAL') ? 'FIXED_INTERVAL' : 'IDLE_ONLY',
    intervalMinutes: Math.min(24 * 60, Math.max(1, Math.floor(Number.isFinite(interval) ? interval : 60))),
    message,
  };
}

function agentPollingConfigSignature(value: unknown) {
  const config = normalizeAgentPollingConfig(value);
  return [
    config.enabled ? '1' : '0',
    config.strategy,
    String(config.intervalMinutes),
    encodeURIComponent(config.message),
  ].join('|');
}

function projectFilePreviewKind(file?: ProjectFileEntry | null): 'folder' | 'image' | 'pdf' | 'text' | 'download' {
  if (file?.type === 'folder') return 'folder';
  const filePath = file?.path || '';
  if (/\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(filePath)) return 'image';
  if (/\.pdf$/i.test(filePath)) return 'pdf';
  if (/\.(txt|md|markdown|json|ya?ml|csv|tsv|log|xml|html|css|js|jsx|ts|tsx|py|java|go|rs|sql|sh|env)$/i.test(filePath)) {
    return 'text';
  }
  return 'download';
}

function projectFileTextPreviewMode(file?: ProjectFileEntry | null): 'markdown' | 'plain' {
  return /\.(md|markdown)$/i.test(file?.path || '') ? 'markdown' : 'plain';
}

function normalizeProjectFileFolderPath(path?: string | null) {
  return String(path || '').replace(/\\/g, '/').replace(/^\/+|\/+$/g, '');
}

function projectFileDisplayPath(file: ProjectFileEntry, prefix: string) {
  const normalizedPrefix = normalizeProjectFileFolderPath(prefix);
  const normalizedPath = normalizeProjectFileFolderPath(file.path);
  if (!normalizedPrefix) return normalizedPath || file.path;
  const prefixWithSlash = `${normalizedPrefix}/`;
  return normalizedPath.startsWith(prefixWithSlash)
    ? normalizedPath.slice(prefixWithSlash.length)
    : normalizedPath || file.path;
}

function parentProjectFilePrefix(prefix: string) {
  const parts = normalizeProjectFileFolderPath(prefix).split('/').filter(Boolean);
  parts.pop();
  return parts.join('/');
}

function projectFileListItems(response: { folders?: ProjectFileEntry[]; files?: ProjectFileEntry[] }) {
  const folders = (response.folders || []).map((folder) => ({
    ...folder,
    type: 'folder' as const,
    size: folder.size ?? 0,
  }));
  const folderIdentities = new Set(
    folders
      .map((folder) => folder.key || folder.path)
      .filter((value): value is string => Boolean(value)),
  );
  const files = (response.files || []).map((file) => ({
    ...file,
    type: file.type === 'folder' ? ('folder' as const) : ('file' as const),
    size: file.size ?? 0,
  })).filter((file) => {
    if (file.type !== 'folder') return true;
    const identity = file.key || file.path;
    return !identity || !folderIdentities.has(identity);
  });
  return [...folders, ...files];
}

function projectDirectoryFiles(response: { folders?: Array<{ path?: string | null }>; files?: ProjectFileEntry[] }) {
  const renderedFolderPaths = new Set(
    (response.folders || [])
      .map((folder) => normalizeProjectFileFolderPath(folder.path))
      .filter(Boolean),
  );
  return (response.files || []).filter((file) => {
    if (file.type !== 'folder') return true;
    const folderPath = normalizeProjectFileFolderPath(file.path);
    return !folderPath || !renderedFolderPaths.has(folderPath);
  });
}

function artifactResources(artifact: any): ProjectFileEntry[] {
  const metadata = artifact?.metadata && typeof artifact.metadata === 'object' ? artifact.metadata : {};
  const resources = Array.isArray(metadata.resources)
    ? metadata.resources
    : Array.isArray(metadata.projectFiles)
      ? metadata.projectFiles
      : [];
  return resources.filter((item: any) => item?.path).map((item: any) => ({
    path: item.path,
    key: item.key || item.path,
    size: item.size,
    downloadUrl: item.downloadUrl,
  }));
}

function shortRuntimeTime(value?: string | null) {
  if (!value) return 'never';
  return new Date(value).toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function describeRuntimeError(error?: string | null) {
  if (!error) return '';
  const normalized = error.toLowerCase();
  if (normalized.includes('insufficient balance')) {
    return 'The selected model provider rejected this run because the configured account has insufficient balance.';
  }
  if (normalized.includes('invalid api key') || normalized.includes('api key was rejected')) {
    return 'The selected model configuration was rejected by the provider. Check the API key, endpoint, and model access.';
  }
  if (normalized.includes('permission denied') || normalized.includes('403')) {
    return 'An external provider rejected the request. Check permissions, billing, and credential scopes.';
  }
  return error;
}

function parseRuntimeActionSummary(action: {
  kind: 'tool' | 'tool_result' | 'message';
  name: string;
  summary: string;
  status?: 'ok' | 'error' | 'pending';
}) {
  const summary = action.summary || '';
  const lower = summary.toLowerCase();
  const readPathMatch = summary.match(/"path"\s*:\s*"([^"]+)"/i);

  if (action.kind === 'tool') {
    if (action.name === 'read_file') {
      if (readPathMatch?.[1]?.includes('AGENT_WORKSPACE_CONTEXT.json')) {
        return 'Reading project context';
      }
      return readPathMatch?.[1] ? `Reading ${readPathMatch[1]}` : 'Reading a file';
    }
    if (action.name === 'skill_view') {
      return lower.includes('agent-workspace-planner')
        ? 'Loading planner skill instructions'
        : 'Loading skill instructions';
    }
    if (action.name === 'terminal') {
      if (lower.includes('/features')) return 'Creating a feature in the project';
      if (lower.includes('/work-items')) return 'Creating a work item in the project';
      if (lower.includes('/resume')) return 'Resuming the runtime session';
      if (lower.includes('curl')) return 'Calling a workspace API';
      return 'Running a terminal command';
    }
    if (action.name === 'web') {
      return 'Calling a web tool';
    }
  }

  if (action.kind === 'tool_result') {
    if (lower.includes('/features')) return action.status === 'error' ? 'Feature group creation needed another pass' : 'Feature group created';
    if (lower.includes('/work-items')) return action.status === 'error' ? 'Work item creation needed another pass' : 'Work item created';
    if (lower.includes('repeated')) return 'Repeated tool calls completed';
    return action.status === 'error' ? 'Tool call needed another pass' : 'Tool call completed';
  }

  if (action.name === 'assistant') return 'Agent replied';
  return 'Session update';
}

function summarizeRuntimeAction(action: {
  kind: 'tool' | 'tool_result' | 'message';
  name: string;
  summary: string;
  status?: 'ok' | 'error' | 'pending';
}) {
  return parseRuntimeActionSummary(action);
}

function normalizeRuntimeActionsForDisplay<T extends {
  kind: 'tool' | 'tool_result' | 'message';
  name: string;
  summary: string;
  status?: 'ok' | 'error' | 'pending';
}>(actions: T[]): T[] {
  const normalized = actions.map((action) => ({ ...action }));
  const pendingToolIndexes: number[] = [];
  const pendingToolByName = new Map<string, number>();

  normalized.forEach((action, index) => {
    if (action.kind === 'tool') {
      if (action.status === 'pending') {
        pendingToolIndexes.push(index);
        pendingToolByName.set(action.name, index);
      }
      return;
    }
    if (action.kind !== 'tool_result') return;
    const toolIndex = pendingToolByName.get(action.name) ?? pendingToolIndexes[pendingToolIndexes.length - 1];
    if (toolIndex === undefined) return;
    normalized[toolIndex].status = action.status === 'error' ? 'error' : 'ok';
    pendingToolByName.delete(normalized[toolIndex].name);
    const stackIndex = pendingToolIndexes.lastIndexOf(toolIndex);
    if (stackIndex >= 0) pendingToolIndexes.splice(stackIndex, 1);
  });

  return normalized;
}

function extractProjectFileMentionPaths(text: string) {
  const paths = new Set<string>();
  const mentionPattern = /@(?:(project-file):)?([^\s@]+)/g;
  for (const match of text.matchAll(mentionPattern)) {
    const explicitProjectFile = Boolean(match[1]);
    const previousChar = match.index > 0 ? text[match.index - 1] : '';
    if (!explicitProjectFile && previousChar && /\S/.test(previousChar)) continue;
    const rawPath = match[2].trim().replace(/^\/+/, '').replace(/[),;:!?]+$/g, '');
    const isFolderMention = rawPath.endsWith('/');
    let path = rawPath.replace(/\/+$/, '');
    if (path.endsWith('.') && path.slice(0, -1).includes('.')) path = path.slice(0, -1);
    if (!path || path.includes('..') || path.includes('//')) continue;
    if (!explicitProjectFile && !isFolderMention && !path.includes('/')) continue;
    paths.add(path);
  }
  return [...paths];
}

function projectFileMentionMatch(value: string) {
  return value.match(/@([^\s@]*)$/);
}

function replaceTrailingProjectFileMention(value: string, path: string) {
  const mentionPath = path.replace(/^\/+/, '');
  const mention = `@${mentionPath} `;
  return projectFileMentionMatch(value)
    ? value.replace(/@([^\s@]*)$/, mention)
    : `${value}${value && !value.endsWith(' ') ? ' ' : ''}${mention}`;
}

function projectFileEntryName(path: string) {
  return path.replace(/\/+$/, '').split('/').filter(Boolean).pop() || path || 'Shared';
}

function projectFileMentionEntriesFromFiles(files: ProjectFileEntry[]) {
  const folders = new Map<string, ProjectFileMentionEntry>();
  const entries: ProjectFileMentionEntry[] = [];
  for (const file of files) {
    const path = file.path.replace(/^\/+|\/+$/g, '');
    if (!path || path.endsWith('/.folder')) continue;
    const parts = path.split('/').filter(Boolean);
    for (let index = 1; index < parts.length; index += 1) {
      const folderPath = parts.slice(0, index).join('/');
      const existing = folders.get(folderPath) || {
        type: 'folder' as const,
        path: folderPath,
        name: projectFileEntryName(folderPath),
        key: `folder:${folderPath}`,
        size: 0,
      };
      existing.size = (existing.size || 0) + (file.size || 0);
      folders.set(folderPath, existing);
    }
    entries.push({
      type: 'file',
      path,
      name: projectFileEntryName(path),
      key: file.key || path,
      size: file.size,
      lastModified: file.lastModified,
    });
  }
  return [...folders.values(), ...entries];
}

function projectFileMentionEntriesFromFolders(folders: ProjectFolderEntry[]) {
  return folders.map((folder) => ({
    type: 'folder' as const,
    path: folder.path.replace(/^\/+|\/+$/g, ''),
    name: folder.name || projectFileEntryName(folder.path),
    key: folder.key || `folder:${folder.path}`,
    size: folder.size,
    lastModified: folder.lastModified,
  }));
}

function sortProjectFileMentionEntries(entries: ProjectFileMentionEntry[], query: string) {
  const normalizedQuery = query.trim().replace(/^\/+/, '').toLowerCase();
  const scoreEntry = (entry: ProjectFileMentionEntry) => {
    if (!normalizedQuery) return entry.type === 'folder' ? 0 : 10;
    const name = entry.name.toLowerCase();
    const path = entry.path.toLowerCase();
    const typeOffset = entry.type === 'file' ? 0 : 1;
    if (name === normalizedQuery || path === normalizedQuery) return typeOffset;
    if (name.startsWith(normalizedQuery)) return 2 + typeOffset;
    if (path.startsWith(normalizedQuery)) return 4 + typeOffset;
    if (name.includes(normalizedQuery)) return 6 + typeOffset;
    if (path.includes(`/${normalizedQuery}`)) return 8 + typeOffset;
    if (path.includes(normalizedQuery)) return 10 + typeOffset;
    return entry.type === 'file' ? 80 : 90;
  };

  return entries
    .map((entry, index) => ({ entry, index, score: scoreEntry(entry) }))
    .sort((a, b) => a.score - b.score || a.entry.path.localeCompare(b.entry.path) || a.index - b.index)
    .map(({ entry }) => entry);
}

function isImeCompositionKeyEvent(event: React.KeyboardEvent<HTMLElement>, compositionActive = false) {
  const nativeEvent = event.nativeEvent as KeyboardEvent & { keyCode?: number; which?: number };
  return nativeEvent.isComposing || compositionActive || nativeEvent.keyCode === 229 || nativeEvent.which === 229;
}

function tokenizeContextText(...values: Array<string | null | undefined>) {
  const stopWords = new Set(['the', 'and', 'for', 'with', 'from', 'that', 'this', 'into', 'item', 'task', 'goal']);
  return new Set(
    values
      .join(' ')
      .toLowerCase()
      .split(/[^a-z0-9_]+/)
      .filter((token) => token.length >= 4 && !stopWords.has(token))
      .slice(0, 24),
  );
}

function scoreMemoryForWorkItem(memory: any, workItem: ProjectWorkItem) {
  const metadata = memory.metadata && typeof memory.metadata === 'object' ? memory.metadata : {};
  let score = 0;
  if (metadata.workItemId === workItem.id) score += 12;
  if (workItem.goalId && metadata.goalId === workItem.goalId) score += 8;
  if (workItem.featureId && metadata.featureId === workItem.featureId) score += 8;
  if (['CONSTRAINT', 'INTERFACE_CONTRACT', 'DECISION', 'RISK'].includes(memory.memoryType)) score += 2;

  const tokens = tokenizeContextText(workItem.title, workItem.scopeBrief, workItem.acceptanceCriteria);
  const memoryText = `${memory.title || ''} ${memory.summary || ''} ${memory.content || ''}`.toLowerCase();
  tokens.forEach((token) => {
    if (memoryText.includes(token)) score += 1;
  });

  return score;
}

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore((state) => state.token);
  const user = useAuthStore((state) => state.user);
  const isReadOnly = !token;
  const [project, setProject] = useState<any>(null);
  const [workItems, setWorkItems] = useState<ProjectWorkItem[]>([]);
  const [homeWorkItems, setHomeWorkItems] = useState<ProjectWorkItem[]>([]);
  const [homeWorkItemListMeta, setHomeWorkItemListMeta] = useState<ProjectWorkItemListMeta | null>(null);
  const [memories, setMemories] = useState<any[]>([]);
  const [artifacts, setArtifacts] = useState<any[]>([]);
  const [reviews, setReviews] = useState<any[]>([]);
  const [boardSnapshot, setBoardSnapshot] = useState<ProjectBoardData | null>(null);
  const [projectFiles, setProjectFiles] = useState<ProjectFileEntry[]>([]);
  const [projectFolders, setProjectFolders] = useState<ProjectFolderEntry[]>([]);
  const [allProjectFiles, setAllProjectFiles] = useState<ProjectFileEntry[]>([]);
  const [projectFilePrefix, setProjectFilePrefix] = useState('');
  const [projectFileSearch, setProjectFileSearch] = useState('');
  const [loadingProjectFiles, setLoadingProjectFiles] = useState(false);
  const [uploadingProjectFile, setUploadingProjectFile] = useState(false);
  const [projectFileDragActive, setProjectFileDragActive] = useState(false);
  const [newProjectFolderName, setNewProjectFolderName] = useState('');
  const [creatingProjectFolder, setCreatingProjectFolder] = useState(false);
  const [selectedProjectFile, setSelectedProjectFile] = useState<ProjectFileEntry | null>(null);
  const [projectFilePreviewUrl, setProjectFilePreviewUrl] = useState('');
  const [projectFilePreviewText, setProjectFilePreviewText] = useState('');
  const [projectFilePreviewError, setProjectFilePreviewError] = useState('');
  const [loadingProjectFilePreview, setLoadingProjectFilePreview] = useState(false);
  const [workItemProjectFilePreview, setWorkItemProjectFilePreview] = useState<ProjectFileEntry | null>(null);
  const [activityItems, setActivityItems] = useState<ProjectActivityItem[]>([]);
  const [projectEventGraph, setProjectEventGraph] = useState<ProjectEventGraph | null>(null);
  const [selectedEventGraphNodeId, setSelectedEventGraphNodeId] = useState('');
  const [eventGraphMode, setEventGraphMode] = useState<EventGraphMode>('all');
  const [cockpitMembers, setCockpitMembers] = useState<ProjectCockpitMember[]>([]);
  const [agentRuntimes, setAgentRuntimes] = useState<ProjectAgentRuntime[]>([]);
  const [assignmentRuntimeStates, setAssignmentRuntimeStates] = useState<ProjectAssignmentRuntimeState[]>([]);
  const [agentProfiles, setAgentProfiles] = useState<ProjectAgentProfile[]>([]);
  const [agentRuntimeBudget, setAgentRuntimeBudget] = useState<ProjectAgentRuntimeBudget | null>(null);
  const [localRunnerPresences, setLocalRunnerPresences] = useState<ProjectLocalRunnerPresence[]>([]);
  const [agentRuntimeImages, setAgentRuntimeImages] = useState<ProjectAgentRuntimeImage[]>([]);
  const [runningCoordinator, setRunningCoordinator] = useState(false);
  const [coordinatorLogs, setCoordinatorLogs] = useState<string[]>([]);
  const [coordinatorConfigOpen, setCoordinatorConfigOpen] = useState(false);
  const [savingCoordinatorConfig, setSavingCoordinatorConfig] = useState(false);
  const [coordinatorConfigDraft, setCoordinatorConfigDraft] = useState<ProjectCoordinatorConfig>(DEFAULT_PROJECT_COORDINATOR_CONFIG);
  const [coordinatorRulesDraft, setCoordinatorRulesDraft] = useState('[]');
  const [apiConfigs, setApiConfigs] = useState<ApiConfigRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [workItemForm, setWorkItemForm] = useState({
    title: '',
    workType: 'IMPLEMENTATION',
    concurrencyMode: 'SINGLE',
    goalId: '',
    featureId: '',
    description: '',
    scopeBrief: '',
    acceptanceCriteria: '',
    outputContract: '',
  });
  const [activeProjectFileMentionTarget, setActiveProjectFileMentionTarget] = useState<ProjectFileMentionTarget | null>(null);
  const [projectFileMentionQuery, setProjectFileMentionQuery] = useState('');
  const [projectFileMentionResults, setProjectFileMentionResults] = useState<ProjectFileMentionEntry[]>([]);
  const [projectFileMentionActiveIndex, setProjectFileMentionActiveIndex] = useState(0);
  const [loadingProjectFileMentions, setLoadingProjectFileMentions] = useState(false);
  const [expandedHomeGoalItemIds, setExpandedHomeGoalItemIds] = useState<Record<string, boolean>>({});
  const [expandedHomeGoalOutputIds, setExpandedHomeGoalOutputIds] = useState<Record<string, boolean>>({});
  const [expandedHomeFeatureIds, setExpandedHomeFeatureIds] = useState<Record<string, boolean>>({});
  const [goalForm, setGoalForm] = useState({
    title: '',
    description: '',
  });
  const [featureForm, setFeatureForm] = useState({
    title: '',
    goalId: '',
    description: '',
  });
  const [artifactForm, setArtifactForm] = useState({
    artifactType: 'HANDOFF',
    workItemId: '',
    assignmentId: '',
    runId: '',
    title: '',
    content: '',
    url: '',
  });
  const [artifactAttachments, setArtifactAttachments] = useState<File[]>([]);
  const [reviewForm, setReviewForm] = useState({
    workItemId: '',
    artifactId: '',
    reviewerType: 'LEAD_AGENT',
    status: 'APPROVED',
    reviewNote: '',
  });
  const [selectedWorkItemReviewDraft, setSelectedWorkItemReviewDraft] = useState({
    reviewerType: 'HUMAN',
    status: 'APPROVED',
    reviewNote: '',
  });
  const [memoryForm, setMemoryForm] = useState({
    memoryType: 'DECISION',
    title: '',
    content: '',
  });
  const [savingWorkItem, setSavingWorkItem] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [deletingGoalId, setDeletingGoalId] = useState('');
  const [savingFeature, setSavingFeature] = useState(false);
  const [savingArtifact, setSavingArtifact] = useState(false);
  const [savingReview, setSavingReview] = useState(false);
  const [savingMemory, setSavingMemory] = useState(false);
  const [savingProjectSettings, setSavingProjectSettings] = useState(false);
  const [savingProjectTemplate, setSavingProjectTemplate] = useState(false);
  const [projectTemplateSaveMessage, setProjectTemplateSaveMessage] = useState('');
  const [savingResourceWorkItem, setSavingResourceWorkItem] = useState(false);
  const [resourceRequestValues, setResourceRequestValues] = useState<Record<string, string>>({});
  const [savingOwnerActionWorkItemId, setSavingOwnerActionWorkItemId] = useState('');
  const [runningAgentPollingMemberId, setRunningAgentPollingMemberId] = useState('');
  const [creatingLocalRunnerToken, setCreatingLocalRunnerToken] = useState(false);
  const [localRunnerTokenResult, setLocalRunnerTokenResult] = useState<{
    token: string;
    mode: 'local-runner' | 'local-codex';
    scope: 'account' | 'project';
    commands: ReturnType<typeof localRuntimeCommands>;
  } | null>(null);
  const [localRunnerCommandMode, setLocalRunnerCommandMode] = useState<LocalRunnerCommandMode>(() => detectLocalRunnerCommandMode());
  const localRunnerCommandModeLabel =
    LOCAL_RUNNER_COMMAND_OPTIONS.find((option) => option.id === localRunnerCommandMode)?.label || 'this machine';
  const [localRunnerTokenCopied, setLocalRunnerTokenCopied] = useState(false);
  const [projectAction, setProjectAction] = useState('');
  const [projectSettingsForm, setProjectSettingsForm] = useState({
    name: '',
    summary: '',
    brief: '',
    visibility: 'private',
    githubUrl: '',
    budgetAmount: '',
    budgetCurrency: 'AIC',
    maxActiveAgents: String(DEFAULT_PROJECT_MAX_ACTIVE_AGENTS),
    maxActiveGoals: String(DEFAULT_PROJECT_MAX_ACTIVE_GOALS),
    projectGlobals: [] as ProjectGlobalVariable[],
  });
  const [goalGlobalsModalGoal, setGoalGlobalsModalGoal] = useState<ProjectGoalOption | null>(null);
  const [goalGlobalsForm, setGoalGlobalsForm] = useState<ProjectGlobalVariable[]>([]);
  const [savingGoalGlobals, setSavingGoalGlobals] = useState(false);
  const [goalGlobalsSyncResult, setGoalGlobalsSyncResult] = useState<{ updated: number; skipped: string[] } | null>(null);
  const [projectTemplateForm, setProjectTemplateForm] = useState({
    name: '',
    description: '',
  });
  const [memberSearchRole, setMemberSearchRole] = useState('AI_AGENT');
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState<UserSearchResult[]>([]);
  const [searchingMembers, setSearchingMembers] = useState(false);
  const [staffingRole, setStaffingRole] = useState('LEAD_AGENT');
  const [staffingUserId, setStaffingUserId] = useState('');
  const [staffingPermissions, setStaffingPermissions] = useState('');
  const [savingMember, setSavingMember] = useState(false);
  const [removingMemberId, setRemovingMemberId] = useState('');
  const [reconnectingMemberId, setReconnectingMemberId] = useState('');
  const [pendingDismissMember, setPendingDismissMember] = useState<ProjectMember | null>(null);
  const [pendingArchiveProject, setPendingArchiveProject] = useState(false);
  const [pendingDeleteProject, setPendingDeleteProject] = useState(false);
  const [deletingProject, setDeletingProject] = useState(false);
  const [launchingRole, setLaunchingRole] = useState('');
  const [pendingAgentLaunch, setPendingAgentLaunch] = useState<{ role: string; memberId?: string } | null>(null);
  const [launchImage, setLaunchImage] = useState('');
  const [launchLlmConfigId, setLaunchLlmConfigId] = useState('');
  const [launchAgentType, setLaunchAgentType] = useState(DEFAULT_LAUNCH_AGENT_TYPE);
  const [selectedAgentProfileId, setSelectedAgentProfileId] = useState('');
  const [saveAgentProfileName, setSaveAgentProfileName] = useState('');
  const [savingAgentProfile, setSavingAgentProfile] = useState(false);
  const [launchMode, setLaunchMode] = useState<AgentLaunchMode>(DEFAULT_AGENT_LAUNCH_MODE);
  const launchModelApiOptional = usesLocalCliAuth(launchMode, launchAgentType);
  const [launchDeploymentDays, setLaunchDeploymentDays] = useState(1);
  const [launchEnableSudo, setLaunchEnableSudo] = useState(false);
  const [launchLogs, setLaunchLogs] = useState<LaunchLogEntry[]>([]);
  const [launchLogsCollapsed, setLaunchLogsCollapsed] = useState(false);
  const [showNewLaunchConfig, setShowNewLaunchConfig] = useState(false);
  const [savingLaunchConfig, setSavingLaunchConfig] = useState(false);
  const [editingLaunchConfigId, setEditingLaunchConfigId] = useState('');
  const [pendingDeleteLaunchConfig, setPendingDeleteLaunchConfig] = useState<ApiConfigRecord | null>(null);
  const [deletingLaunchConfigId, setDeletingLaunchConfigId] = useState('');
  const [launchConfigForm, setLaunchConfigForm] = useState(DEFAULT_LAUNCH_CONFIG_FORM);

  useEffect(() => {
    if (launchMode !== 'local-codex' || supportsLocalCliLaunch(launchAgentType)) return;
    const preferred =
      agentRuntimeImages.find((image) => image.provider === 'local-codex' && (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === 'codex') ||
      agentRuntimeImages.find((image) => (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === 'codex');
    setLaunchAgentType('codex');
    setLaunchLlmConfigId('');
    setLaunchEnableSudo(false);
    setLaunchImage(preferred?.id || '');
  }, [agentRuntimeImages, launchAgentType, launchMode]);
  const [selectedAgentMemberId, setSelectedAgentMemberId] = useState('');
  const [agentMessage, setAgentMessage] = useState('');
  const [agentAttachments, setAgentAttachments] = useState<AgentMessageAttachment[]>([]);
  const [agentHistoryOpen, setAgentHistoryOpen] = useState(false);
  const [agentHistoryWidth, setAgentHistoryWidth] = useState(184);
  const [leaderChatPinned, setLeaderChatPinned] = useState(false);
  const [selectedAgentConversationId, setSelectedAgentConversationId] = useState('');
  const [editingAgentConversationId, setEditingAgentConversationId] = useState('');
  const [agentConversationTitleDraft, setAgentConversationTitleDraft] = useState('');
  const [savingAgentConversationId, setSavingAgentConversationId] = useState('');
  const [pendingDeleteAgentConversationId, setPendingDeleteAgentConversationId] = useState('');
  const [deletingAgentConversationId, setDeletingAgentConversationId] = useState('');
  const [expandedAgentActivityIds, setExpandedAgentActivityIds] = useState<Record<string, boolean>>({});
  const [expandedAgentMessageIds, setExpandedAgentMessageIds] = useState<Record<string, boolean>>({});
  const [copiedAgentMessageId, setCopiedAgentMessageId] = useState('');
  const [hiddenSteerMessageIds, setHiddenSteerMessageIds] = useState<Record<string, true>>({});
  const [agentRuntimePanel, setAgentRuntimePanel] = useState<AgentRuntimePanelKey>(null);
  const agentMessageTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const previousSelectedAgentConnectionRef = useRef({ memberId: '', isReachable: false });
  const pollingTickInFlightRef = useRef(new Set<string>());
  const agentRuntimesRef = useRef<ProjectAgentRuntime[]>([]);
  const selectedAgentMemberIdRef = useRef('');
  const [agentWorkspaceFiles, setAgentWorkspaceFiles] = useState<Record<string, ProjectAgentRuntimeWorkspaceFile[]>>({});
  const [loadingAgentWorkspaceFiles, setLoadingAgentWorkspaceFiles] = useState(false);
  const [downloadingAgentWorkspaceFile, setDownloadingAgentWorkspaceFile] = useState('');
  const [uploadingAgentAttachment, setUploadingAgentAttachment] = useState(false);
  const [sendingAgentMessage, setSendingAgentMessage] = useState(false);
  const [creatingAgentConversation, setCreatingAgentConversation] = useState(false);
  const [cancellingAgentMessage, setCancellingAgentMessage] = useState(false);
  const [savingAgentPollingMemberId, setSavingAgentPollingMemberId] = useState('');
  const [agentPollingDraft, setAgentPollingDraft] = useState<ProjectAgentPollingConfig>(DEFAULT_AGENT_POLLING_CONFIG);
  const agentPollingDraftSourceRef = useRef({ memberId: '', signature: '' });
  const pollingTickLastAttemptRef = useRef(new Map<string, number>());
  const [savingAgentPromptRole, setSavingAgentPromptRole] = useState('');
  const [refreshingProjectTemplate, setRefreshingProjectTemplate] = useState(false);
  const [agentPromptDraft, setAgentPromptDraft] = useState('');
  const [loadingAgentSkillsRole, setLoadingAgentSkillsRole] = useState('');
  const [savingAgentSkillsRole, setSavingAgentSkillsRole] = useState('');
  const [agentSkillRefsDraft, setAgentSkillRefsDraft] = useState('');
  const [agentSkillDetails, setAgentSkillDetails] = useState<ProjectRoleSkillDetail[]>([]);
  const [selectedAgentSkillRef, setSelectedAgentSkillRef] = useState('');
  const [agentSkillMarkdownDraft, setAgentSkillMarkdownDraft] = useState('');
  const [agentMessageResponse, setAgentMessageResponse] = useState('');
  const agentMessageSendInFlightRef = useRef(new Set<string>());
  const agentMessageComposingRef = useRef(false);
  const agentMessageCompositionEndAtRef = useRef(0);
  const [failedAgentMessages, setFailedAgentMessages] = useState<Record<string, string>>({});
  const [clearedFailedAgentMessages, setClearedFailedAgentMessages] = useState<Record<string, true>>({});
  const [selectedWorkItemId, setSelectedWorkItemId] = useState('');
  const [selectedWorkItemDetail, setSelectedWorkItemDetail] = useState<any>(null);
  const [loadingSelectedWorkItem, setLoadingSelectedWorkItem] = useState(false);
  const [selectedWorkItemEvents, setSelectedWorkItemEvents] = useState<ProjectEventItem[]>([]);
  const [loadingSelectedWorkItemEvents, setLoadingSelectedWorkItemEvents] = useState(false);
  const [workItemComment, setWorkItemComment] = useState('');
  const [workItemCommentAttachments, setWorkItemCommentAttachments] = useState<ProjectWorkItemCommentAttachment[]>([]);
  const [uploadingWorkItemCommentAttachment, setUploadingWorkItemCommentAttachment] = useState(false);
  const [savingWorkItemComment, setSavingWorkItemComment] = useState(false);
  const [updatingWorkItemStatus, setUpdatingWorkItemStatus] = useState(false);
  const [detailAssigneeUserId, setDetailAssigneeUserId] = useState('');
  const [savingDetailAssignment, setSavingDetailAssignment] = useState(false);
  const [assignmentForm, setAssignmentForm] = useState({
    assigneeUserId: '',
    role: 'WORKER_AGENT',
    objective: '',
    packetNotes: '',
  });
  const [runForm, setRunForm] = useState({
    runType: 'EXECUTION',
    assignmentId: '',
    instruction: '',
    resultSummary: '',
  });
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedRunDetail, setSelectedRunDetail] = useState<ProjectRun | null>(null);
  const [loadingSelectedRun, setLoadingSelectedRun] = useState(false);
  const [runUpdateForm, setRunUpdateForm] = useState({
    status: 'RUNNING',
    resultSummary: '',
  });
  const [runLogForm, setRunLogForm] = useState({
    level: 'info',
    message: '',
  });
  const [savingRunUpdate, setSavingRunUpdate] = useState(false);
  const [savingRunLog, setSavingRunLog] = useState(false);
  const [updatingAssignmentId, setUpdatingAssignmentId] = useState('');
  const [savingAssignment, setSavingAssignment] = useState(false);
  const [savingRun, setSavingRun] = useState(false);
  const [activeProjectSection, setActiveProjectSection] = useState<ProjectSectionKey>('home');
  const [expandedRoleInfo, setExpandedRoleInfo] = useState('');
  const [workStatusFilter, setWorkStatusFilter] = useState('ALL');
  const [workGoalFilter, setWorkGoalFilter] = useState('ALL');
  const [workItemSearch, setWorkItemSearch] = useState('');
  const [workItemPage, setWorkItemPage] = useState(1);
  const [workItemPageSize, setWorkItemPageSize] = useState(DEFAULT_WORK_ITEM_PAGE_SIZE);
  const [workItemListMeta, setWorkItemListMeta] = useState<ProjectWorkItemListMeta | null>(null);
  const [loadingWorkItems, setLoadingWorkItems] = useState(false);
  const [workItemsView, setWorkItemsView] = useState<WorkItemsView>('list');
  const [workItemDetailTab, setWorkItemDetailTab] = useState<WorkItemDetailTab>('details');
  const canManageProject = !!user && !!project && (user.id === project.ownerId || user.id === project.leadAgentUserId);
  const canDeleteProject = !!user && !!project && user.id === project.ownerId;
  const canEditProjectGlobals = !!user && !!project && user.id === project.ownerId;
  const canAccessProjectFiles =
    !!user &&
    !!project &&
    (user.id === project.ownerId || ((project as any).members || []).some((member: any) => member.userId === user.id));

  const workItemListQueryParams = (page = workItemPage, limit = workItemPageSize) => ({
    page: String(page),
    limit: String(limit),
    includeClosed: 'true',
    ...(workStatusFilter !== 'ALL' ? { status: workStatusFilter } : {}),
    ...(workGoalFilter !== 'ALL' ? { goalId: workGoalFilter } : {}),
    ...(workItemSearch.trim() ? { search: workItemSearch.trim() } : {}),
  });

  const loadWorkItemsPage = async (page = workItemPage, limit = workItemPageSize) => {
    if (!id) return;
    setLoadingWorkItems(true);
    try {
      const res = await api.projects.workItems.list(id, workItemListQueryParams(page, limit));
      setWorkItems(res.data);
      setWorkItemListMeta(res.meta || null);
      if (res.meta?.page && res.meta.page !== page) {
        setWorkItemPage(res.meta.page);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load work items');
    } finally {
      setLoadingWorkItems(false);
    }
  };

  const loadProject = async () => {
    if (!id) return;
    setLoading(true);
    setError('');
    try {
      const currentProjectFilePrefix = normalizeProjectFileFolderPath(projectFilePrefix);
      const [
        projectDetail,
        workItemsRes,
        homeWorkItemsRes,
        memoryList,
        artifactList,
        reviewList,
        boardData,
        activityRes,
        eventGraphRes,
        cockpitRes,
        runtimeRes,
        runtimeStateRes,
        imageRes,
        profileRes,
        apiConfigRes,
        fileRes,
        allFileRes,
      ] = await Promise.all([
        api.projects.get(id),
        api.projects.workItems.list(id, workItemListQueryParams()),
        api.projects.workItems.list(id, { page: '1', limit: '200', includeClosed: 'true' }),
        api.projects.memories.list(id, { limit: '50' }),
        api.projects.artifacts.list(id, { limit: '50' }),
        api.projects.reviews.list(id, { limit: '50' }),
        api.projects.getBoard(id).catch(() => null),
        api.projects.listActivity(id, { limit: '40' }).catch(() => ({ items: [] })),
        api.projects.getEventGraph(id, { limit: '200' }).catch(() => null),
        token ? api.projects.getCockpit(id).catch(() => null) : Promise.resolve(null),
        token
          ? api.projects.agentRuntimes.list(id).catch(() => ({ budget: null, sessions: [], localRunners: [] }))
          : Promise.resolve({ budget: null, sessions: [], localRunners: [] }),
        token ? api.projects.agentRuntimes.runtimeState(id, { limit: '100' }).catch(() => ({ assignments: [] })) : Promise.resolve({ assignments: [] }),
        token ? api.projects.agentRuntimes.images(id).catch(() => ({ images: [] })) : Promise.resolve({ images: [] }),
        token ? api.projects.agentProfiles.list(id).catch(() => ({ profiles: [] })) : Promise.resolve({ profiles: [] }),
        token ? api.apiConfigs.list().catch(() => []) : Promise.resolve([]),
        token ? api.projects.files.list(id, {
          limit: '100',
          recursive: 'false',
          ...(currentProjectFilePrefix ? { prefix: currentProjectFilePrefix } : {}),
        }).catch(() => ({ folders: [], files: [] })) : Promise.resolve({ folders: [], files: [] }),
        token ? api.projects.files.list(id, { limit: '300', recursive: 'true' }).catch(() => ({ files: [] })) : Promise.resolve({ files: [] }),
      ]);

      setProject(projectDetail);
      setWorkItems(workItemsRes.data);
      setWorkItemListMeta(workItemsRes.meta || null);
      setHomeWorkItems(homeWorkItemsRes.data || []);
      setHomeWorkItemListMeta(homeWorkItemsRes.meta || null);
      setMemories(memoryList);
      setArtifacts(artifactList);
      setReviews(reviewList);
      setBoardSnapshot(boardData);
      setActivityItems(activityRes.items);
      setProjectEventGraph(eventGraphRes);
      setCockpitMembers(cockpitRes?.cockpit || []);
      setAgentRuntimes((current) => mergeAgentRuntimeListForUi(current, runtimeRes.sessions || []));
      setAssignmentRuntimeStates(runtimeStateRes.assignments || []);
      setAgentRuntimeBudget(runtimeRes.budget || null);
      setLocalRunnerPresences(runtimeRes.localRunners || []);
      setAgentRuntimeImages(imageRes.images || []);
      setAgentProfiles(profileRes.profiles || []);
      setApiConfigs(apiConfigRes || []);
      setProjectFiles(projectDirectoryFiles(fileRes));
      setProjectFolders(fileRes.folders || []);
      setAllProjectFiles(allFileRes.files || fileRes.files || []);
    } catch (err: any) {
      setError(err.message || 'Failed to load project');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadProject();
  }, [id]);

  useEffect(() => {
    setWorkItemPage(1);
  }, [workStatusFilter, workGoalFilter, workItemSearch, workItemPageSize]);

  useEffect(() => {
    if (!id) return;
    void loadWorkItemsPage();
  }, [id, workItemPage, workItemPageSize, workStatusFilter, workGoalFilter, workItemSearch]);

  const handleRunProjectCoordinator = async () => {
    if (!id || runningCoordinator) return;
    setRunningCoordinator(true);
    setCoordinatorLogs(['Coordinator is checking project status...']);
    try {
      const result = await api.projects.tickCoordinator(id);
      setCoordinatorLogs(result.logs?.length ? result.logs : ['Coordinator check completed with no new output.']);
      await loadProject();
      if (selectedWorkItemId === reviewForm.workItemId) {
        await loadSelectedWorkItem(reviewForm.workItemId);
      }
    } catch (err: any) {
      const message = err.message || 'Coordinator run failed.';
      setCoordinatorLogs([message]);
      setError(message);
    } finally {
      setRunningCoordinator(false);
    }
  };

  const handleSaveProjectCoordinatorConfig = async () => {
    if (!id || isReadOnly || savingCoordinatorConfig) return;
    setSavingCoordinatorConfig(true);
    setError('');
    try {
      const parsedRules = JSON.parse(coordinatorRulesDraft || '[]');
      if (!Array.isArray(parsedRules)) {
        throw new Error('Coordinator trigger rules must be a JSON array.');
      }
      const result = await api.projects.updateCoordinatorConfig(id, {
        enabled: coordinatorConfigDraft.enabled,
        maxDispatchesPerTick: Math.max(1, Math.floor(Number(coordinatorConfigDraft.maxDispatchesPerTick) || 3)),
        launchMode: coordinatorConfigDraft.launchMode || 'local-docker',
        agentType: (coordinatorConfigDraft.agentType || 'pi').trim(),
        messageTemplate: coordinatorConfigDraft.messageTemplate || '',
        dispatchRules: parsedRules,
      });
      setProject((current: any) => current ? { ...current, settings: result.settings } : current);
      const savedConfig = projectCoordinatorConfigFromSettings(result.settings);
      setCoordinatorConfigDraft(savedConfig);
      setCoordinatorRulesDraft(JSON.stringify(savedConfig.dispatchRules || [], null, 2));
      setCoordinatorLogs(['Coordinator config saved.']);
      await loadProject();
    } catch (err: any) {
      const message = err instanceof SyntaxError
        ? 'Trigger rules must be valid JSON.'
        : err.message || 'Coordinator config save failed.';
      setError(message);
      setCoordinatorLogs([message]);
    } finally {
      setSavingCoordinatorConfig(false);
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = normalizeProjectSectionParam(params.get('section'));
    if (section) {
      setActiveProjectSection(section);
      if (section === 'work') {
        const view = params.get('view');
        const workItemId = params.get('item') || '';
        if (view === 'detail' && workItemId) {
          setSelectedWorkItemId(workItemId);
          setWorkItemsView('detail');
        } else if (view === 'new') {
          setWorkItemsView('new');
        } else {
          setWorkItemsView('list');
        }
      }
      return;
    }
    setActiveProjectSection('home');
  }, [location.search]);

  const agentRuntimePollMs = agentRuntimes.some((runtime) => runtime.session?.status === 'TYPING') ? 1000 : 5000;

  useEffect(() => {
    if (!id || !token) return;
    let cancelled = false;
    let timeout: number | undefined;
    let consecutiveFailures = 0;

    const scheduleNextPoll = (delayMs?: number) => {
      if (cancelled) return;
      if (timeout) window.clearTimeout(timeout);
      const backoffMs = consecutiveFailures
        ? Math.min(60000, agentRuntimePollMs * 2 ** Math.min(consecutiveFailures, 5))
        : agentRuntimePollMs;
      timeout = window.setTimeout(pollAgentRuntimes, delayMs ?? backoffMs);
    };

    const pollAgentRuntimes = () => {
      if (cancelled) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
        scheduleNextPoll(Math.max(agentRuntimePollMs, 15000));
        return;
      }
      api.projects.agentRuntimes
        .list(id)
        .then((res) => {
          consecutiveFailures = 0;
          setAgentRuntimes((current) => mergeAgentRuntimeListForUi(current, res.sessions || []));
          setLocalRunnerPresences(res.localRunners || []);
        })
        .catch(() => {
          consecutiveFailures += 1;
        })
        .finally(() => {
          scheduleNextPoll();
        });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible') return;
      consecutiveFailures = 0;
      scheduleNextPoll(250);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    scheduleNextPoll(agentRuntimePollMs);
    return () => {
      cancelled = true;
      if (timeout) window.clearTimeout(timeout);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [agentRuntimePollMs, id, token]);

  useEffect(() => {
    if (!launchModelApiOptional && !launchLlmConfigId && apiConfigs.length) {
      setLaunchLlmConfigId((apiConfigs.find((config) => config.isActive) || apiConfigs[0]).id);
    }
  }, [apiConfigs, launchLlmConfigId, launchModelApiOptional]);

  const projectCoordinatorConfig = useMemo(
    () => projectCoordinatorConfigFromSettings(project?.settings as Record<string, unknown> | null),
    [project?.settings],
  );

  useEffect(() => {
    if (!project) return;
    setProjectSettingsForm({
      name: project.name || '',
      summary: project.summary || '',
      brief: project.brief || '',
      visibility: project.visibility || 'private',
      githubUrl: project.githubUrl || '',
      budgetAmount: String(project.budgetAmount ?? 0),
      budgetCurrency: project.budgetCurrency || 'AIC',
      maxActiveAgents: String(projectMaxActiveAgentsFromSettings(project.settings as Record<string, unknown> | null)),
      maxActiveGoals: String(projectMaxActiveGoalsFromSettings(project.settings as Record<string, unknown> | null)),
      projectGlobals: Array.isArray(project.projectGlobals)
        ? project.projectGlobals.filter(isProjectScopedProjectGlobal)
        : [],
    });
    setProjectTemplateForm({
      name: `${project.name || 'Project'} template`,
      description: project.summary || project.brief || '',
    });
  }, [project]);

  useEffect(() => {
    setCoordinatorConfigDraft(projectCoordinatorConfig);
    setCoordinatorRulesDraft(JSON.stringify(projectCoordinatorConfig.dispatchRules || [], null, 2));
  }, [
    projectCoordinatorConfig.enabled,
    projectCoordinatorConfig.maxDispatchesPerTick,
    projectCoordinatorConfig.launchMode,
    projectCoordinatorConfig.agentType,
    projectCoordinatorConfig.messageTemplate,
    projectCoordinatorConfig.lastTickAt,
    projectCoordinatorConfig.dispatchRules,
  ]);

  const filteredWorkItems = useMemo(() => {
    if (workItemListMeta) return workItems;
    const normalizedSearch = workItemSearch.trim().toLowerCase();
    const features = (project?.features || []) as ProjectFeatureOption[];
    return workItems.filter((item) => {
      if (workStatusFilter !== 'ALL' && item.status !== workStatusFilter) return false;
      if (workGoalFilter !== 'ALL') {
        const itemGoalId = item.goalId || (item.featureId ? features.find((feature) => feature.id === item.featureId)?.goalId : undefined);
        if (itemGoalId !== workGoalFilter) return false;
      }
      if (!normalizedSearch) return true;
      return [
        item.title,
        item.description,
        item.scopeBrief,
        item.acceptanceCriteria,
        typeof item.outputContract === 'string' ? item.outputContract : JSON.stringify(item.outputContract || ''),
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedSearch));
    });
  }, [project?.features, workGoalFilter, workItemListMeta, workItemSearch, workItems, workStatusFilter]);

  const workStatusCounts = useMemo(() => {
    if (workItemListMeta?.statusCounts) return workItemListMeta.statusCounts;
    if (boardSnapshot?.metrics.workItemStatusCounts && workGoalFilter === 'ALL' && !workItemSearch.trim()) {
      return boardSnapshot.metrics.workItemStatusCounts;
    }
    const normalizedSearch = workItemSearch.trim().toLowerCase();
    const features = (project?.features || []) as ProjectFeatureOption[];
    return workItems.reduce<Record<string, number>>((counts, item) => {
      if (workGoalFilter !== 'ALL') {
        const itemGoalId = item.goalId || (item.featureId ? features.find((feature) => feature.id === item.featureId)?.goalId : undefined);
        if (itemGoalId !== workGoalFilter) return counts;
      }
      if (normalizedSearch) {
        const matchesSearch = [
          item.title,
          item.description,
          item.scopeBrief,
          item.acceptanceCriteria,
          item.workType,
          typeof item.outputContract === 'string' ? item.outputContract : JSON.stringify(item.outputContract || ''),
        ]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedSearch));
        if (!matchesSearch) return counts;
      }
      counts[item.status] = (counts[item.status] || 0) + 1;
      return counts;
    }, {});
  }, [boardSnapshot?.metrics.workItemStatusCounts, project?.features, workGoalFilter, workItemListMeta?.statusCounts, workItemSearch, workItems]);
  const workStatusFilterOptions = useMemo(() => {
    const statuses = new Set([...WORK_ITEM_STATUS_OPTIONS, ...Object.keys(workStatusCounts || {})]);
    return [...statuses].sort((left, right) => {
      const leftIndex = WORK_ITEM_STATUS_OPTIONS.indexOf(left);
      const rightIndex = WORK_ITEM_STATUS_OPTIONS.indexOf(right);
      if (leftIndex !== -1 || rightIndex !== -1) {
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      }
      return left.localeCompare(right);
    });
  }, [workStatusCounts]);

  const projectWorkItemTotal = useMemo(
    () => workItemListMeta?.total ?? boardSnapshot?.metrics.workItems ?? project?.workItemCount ?? workItems.length,
    [boardSnapshot?.metrics.workItems, project?.workItemCount, workItemListMeta?.total, workItems.length],
  );
  const workStatusAllCount = useMemo(() => {
    const countedTotal = Object.values(workStatusCounts || {}).reduce((sum, count) => sum + (Number(count) || 0), 0);
    return countedTotal || projectWorkItemTotal;
  }, [projectWorkItemTotal, workStatusCounts]);
  const homeWorkItemsForUi = useMemo(
    () => (homeWorkItemListMeta || homeWorkItems.length ? homeWorkItems : workItems),
    [homeWorkItemListMeta, homeWorkItems, workItems],
  );
  const projectAllWorkItemTotal = useMemo(
    () => homeWorkItemListMeta?.total ?? homeWorkItemsForUi.length,
    [homeWorkItemListMeta?.total, homeWorkItemsForUi.length],
  );
  const workItemTotalPages = Math.max(1, workItemListMeta?.totalPages || Math.ceil(projectWorkItemTotal / workItemPageSize) || 1);
  const workItemPageStart = projectWorkItemTotal > 0 ? (workItemPage - 1) * workItemPageSize + 1 : 0;
  const workItemPageEnd = Math.min(projectWorkItemTotal, (workItemPage - 1) * workItemPageSize + filteredWorkItems.length);

  const groupedWorkItems = useMemo(() => {
    const order = WORK_ITEM_STATUS_OPTIONS.filter((status) => status !== 'CANCELLED');
    const groups = new Map<string, ProjectWorkItem[]>();
    order.forEach((status) => groups.set(status, []));
    filteredWorkItems.forEach((item) => {
      const bucket = groups.get(item.status) || [];
      bucket.push(item);
      groups.set(item.status, bucket);
    });
    return order.map((status) => ({ status, items: groups.get(status) || [] }));
  }, [filteredWorkItems]);

  const goalById = useMemo(() => {
    const goals = (project?.goals || []) as ProjectGoalOption[];
    return new Map<string, ProjectGoalOption>(goals.map((goal) => [goal.id, goal]));
  }, [project?.goals]);

  const goalGlobalsByGoalId = useMemo(() => {
    const grouped = new Map<string, ProjectGlobalVariable[]>();
    ((project?.projectGlobals || []) as ProjectGlobalVariable[])
      .filter(isGoalScopedProjectGlobal)
      .forEach((global: ProjectGlobalVariable) => {
        const goalId = global.goalId || '';
        grouped.set(goalId, [...(grouped.get(goalId) || []), global]);
      });
    return grouped;
  }, [project?.projectGlobals]);

  const featureById = useMemo(() => {
    const features = (project?.features || []) as ProjectFeatureOption[];
    return new Map<string, ProjectFeatureOption>(features.map((feature) => [feature.id, feature]));
  }, [project?.features]);

  const activeMembers = useMemo(() => {
    const members = ((project?.members || []) as ProjectMember[]).filter((member) => !member.removedAt);
    const byMemberId = new Map(members.map((member) => [member.id, member]));
    agentRuntimes.forEach((runtime) => {
      if (byMemberId.has(runtime.memberId)) return;
      byMemberId.set(runtime.memberId, {
        id: runtime.memberId,
        projectId: id || '',
        userId: runtime.userId,
        role: runtime.role,
        permissions: null,
        joinedAt: runtime.session.launchedAt || runtime.session.updatedAt || new Date(0).toISOString(),
        removedAt: null,
        user: runtime.user || {
          id: runtime.userId,
          email: '',
          displayName: runtime.session.agentDisplayName || runtime.userId,
          role: 'AI_AGENT',
          githubLogin: null,
          avatarUrl: null,
          bio: null,
          createdAt: new Date(0).toISOString(),
        },
      });
    });
    return [...byMemberId.values()];
  }, [agentRuntimes, id, project?.members]);
  const activeAgentCount = useMemo(
    () => agentRuntimes.filter((runtime) => agentRuntimeHasAgentRole(runtime) && !agentRuntimeIsOffline(runtime)).length,
    [agentRuntimes],
  );
  const activeGoalCount = useMemo(
    () =>
      ((project?.goals || []) as ProjectGoalOption[]).filter((goal) =>
        ['IN_PROGRESS', 'BLOCKED'].includes(String(goal.status || '').toUpperCase()),
      ).length,
    [project?.goals],
  );
  const maxActiveAgents = projectSettingsForm.maxActiveAgents || String(DEFAULT_PROJECT_MAX_ACTIVE_AGENTS);
  const maxActiveGoals = projectSettingsForm.maxActiveGoals || String(DEFAULT_PROJECT_MAX_ACTIVE_GOALS);
  const maxActiveAgentsNumber = Number(maxActiveAgents) || DEFAULT_PROJECT_MAX_ACTIVE_AGENTS;
  const maxActiveGoalsNumber = Number(maxActiveGoals) || DEFAULT_PROJECT_MAX_ACTIVE_GOALS;
  const activeAgentCapacityReached = activeAgentCount >= maxActiveAgentsNumber;
  const activeAgentCapacityMessage =
    `Project active agent limit reached (${activeAgentCount}/${maxActiveAgents}). Stop or dismiss a running agent, or increase Max Active Agents before launching another runtime.`;

  useEffect(() => {
    setSelectedEventGraphNodeId('');
  }, [eventGraphMode]);

  const projectEventGraphModeOption =
    EVENT_GRAPH_MODE_OPTIONS.find((option) => option.id === eventGraphMode) || EVENT_GRAPH_MODE_OPTIONS[0];

  const projectEventGraphRawNodeById = useMemo(() => {
    return new Map((projectEventGraph?.nodes || []).map((node) => [node.id, node]));
  }, [projectEventGraph?.nodes]);

  const projectEventGraphTimelineEvents = useMemo(() => {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    return (projectEventGraph?.events || [])
      .filter((event) => {
        const occurredAt = new Date(event.createdAt).getTime();
        if (!Number.isFinite(occurredAt) || occurredAt < cutoff) return false;
        const payload = event.payload || {};
        const previousStatus = eventPayloadString(payload, 'previousStatus');
        const status = eventPayloadString(payload, 'status');
        return (
          EVENT_GRAPH_TIMELINE_EVENT_TYPES.has(event.type) ||
          Boolean(previousStatus && status && previousStatus !== status) ||
          Boolean(eventPayloadString(payload, 'runStatus')) ||
          Boolean(eventPayloadString(payload, 'reviewStatus')) ||
          Boolean(eventPayloadString(payload, 'assignmentStatus'))
        );
      })
      .sort((left, right) => right.seq - left.seq)
      .slice(0, 48);
  }, [projectEventGraph?.events]);

  const visibleProjectEventGraph = useMemo<ProjectEventGraph | null>(() => {
    const graph = projectEventGraph;
    if (!graph) return null;

    const rawNodes = graph.nodes || [];
    const rawEdges = graph.edges || [];
    const selectedNodeIds = new Set<string>();
    const selectedEdges = new Map<string, ProjectEventGraphEdge>();
    const syntheticNodes = new Map<string, ProjectEventGraphNode>();
    const syntheticEdges = new Map<string, ProjectEventGraphEdge>();
    const nodeForId = (nodeId: string) => projectEventGraphRawNodeById.get(nodeId) || syntheticNodes.get(nodeId);
    const hasNode = (nodeId: string) => Boolean(nodeForId(nodeId));
    const addNodeId = (nodeId: string) => {
      if (hasNode(nodeId)) selectedNodeIds.add(nodeId);
    };
    const addEdge = (edge: ProjectEventGraphEdge) => {
      if (!hasNode(edge.source) || !hasNode(edge.target)) return;
      addNodeId(edge.source);
      addNodeId(edge.target);
      selectedEdges.set(edge.id, edge);
    };
    const addSyntheticEdge = (edge: ProjectEventGraphEdge) => {
      if (!hasNode(edge.source) || !hasNode(edge.target)) return;
      addNodeId(edge.source);
      addNodeId(edge.target);
      syntheticEdges.set(edge.id, edge);
    };
    const nodeType = (nodeId: string) => nodeForId(nodeId)?.type || '';
    const isResourceNode = (nodeId: string) => ['RESOURCE', 'FILE', 'FOLDER'].includes(nodeType(nodeId));
    const isReviewNode = (nodeId: string) => ['ARTIFACT', 'REVIEW'].includes(nodeType(nodeId));
    const isActorNode = (nodeId: string) => ['AGENT', 'HUMAN'].includes(nodeType(nodeId));
    const isBlockerNode = (node: ProjectEventGraphNode) => {
      const status = String(node.status || '').toUpperCase();
      return EVENT_GRAPH_BLOCKER_STATUSES.has(status) || status.includes('WAITING') || status.includes('BLOCK');
    };

    if (eventGraphMode === 'all') {
      rawNodes.forEach((node) => addNodeId(node.id));
      rawEdges.forEach(addEdge);
    } else if (eventGraphMode === 'execution') {
      const executionNodeTypes = new Set(['GOAL', 'FEATURE', 'WORK_ITEM', 'RUN', 'ARTIFACT']);
      rawNodes.forEach((node) => {
        if (executionNodeTypes.has(node.type)) addNodeId(node.id);
      });
      rawEdges.forEach((edge) => {
        if (EVENT_GRAPH_EXECUTION_EDGE_TYPES.has(edge.type)) addEdge(edge);
      });
    } else if (eventGraphMode === 'blockers') {
      const blockerNodeIds = new Set(
        rawNodes
          .filter((node) => isBlockerNode(node))
          .map((node) => node.id),
      );
      blockerNodeIds.forEach(addNodeId);
      rawEdges.forEach((edge) => {
        const touchesBlocker = blockerNodeIds.has(edge.source) || blockerNodeIds.has(edge.target);
        if (edge.type === 'COORDINATOR_BLOCKED' || (touchesBlocker && EVENT_GRAPH_BLOCKER_EDGE_TYPES.has(edge.type))) {
          addEdge(edge);
        }
      });
    } else if (eventGraphMode === 'resources') {
      rawEdges.forEach((edge) => {
        const touchesResource = isResourceNode(edge.source) || isResourceNode(edge.target);
        const actorResourceTouch =
          (isActorNode(edge.source) && isResourceNode(edge.target)) ||
          (isActorNode(edge.target) && isResourceNode(edge.source));
        if (touchesResource && (EVENT_GRAPH_RESOURCE_EDGE_TYPES.has(edge.type) || actorResourceTouch)) {
          addEdge(edge);
        }
      });
    } else if (eventGraphMode === 'review') {
      rawEdges.forEach((edge) => {
        const touchesReview = isReviewNode(edge.source) || isReviewNode(edge.target);
        if (touchesReview && EVENT_GRAPH_REVIEW_EDGE_TYPES.has(edge.type)) {
          addEdge(edge);
        }
      });
      rawNodes.forEach((node) => {
        if (node.type === 'ARTIFACT' || node.type === 'REVIEW') addNodeId(node.id);
      });
    } else if (eventGraphMode === 'timeline') {
      projectEventGraphTimelineEvents.forEach((event) => {
        const eventNodeId = `event:${event.id}`;
        const payload = event.payload || {};
        syntheticNodes.set(eventNodeId, {
          id: eventNodeId,
          type: 'EVENT',
          label: humanizeEventType(event.type),
          subtitle: formatProjectEventSummary(event),
          status: `#${event.seq}`,
          meta: {
            eventId: event.id,
            seq: event.seq,
            type: event.type,
            createdAt: event.createdAt,
            summary: formatProjectEventSummary(event),
            previousStatus: eventPayloadString(payload, 'previousStatus'),
            status: eventPayloadString(payload, 'status'),
          },
        });
        rawEdges
          .filter((edge) => edge.eventId === event.id)
          .forEach((edge) => {
            if (!projectEventGraphRawNodeById.has(edge.source) || !projectEventGraphRawNodeById.has(edge.target)) return;
            addSyntheticEdge({
              id: `timeline-actor:${event.id}:${edge.source}`,
              source: edge.source,
              target: eventNodeId,
              type: 'ACTED',
              label: edge.label || humanizeEventType(edge.type),
              eventId: event.id,
              occurredAt: event.createdAt,
              seq: event.seq,
            });
            addSyntheticEdge({
              id: `timeline-target:${edge.id}`,
              source: eventNodeId,
              target: edge.target,
              type: 'EVENT_TARGET',
              label: edge.label || humanizeEventType(edge.type),
              eventId: event.id,
              occurredAt: event.createdAt,
              seq: event.seq,
            });
          });
      });
    }

    const nodes = [
      ...rawNodes.filter((node) => selectedNodeIds.has(node.id)),
      ...[...syntheticNodes.values()].filter((node) => selectedNodeIds.has(node.id)),
    ];
    const edges = [...selectedEdges.values(), ...syntheticEdges.values()];
    return {
      ...graph,
      nodes,
      edges,
    };
  }, [
    eventGraphMode,
    projectEventGraph,
    projectEventGraphRawNodeById,
    projectEventGraphTimelineEvents,
  ]);

  const projectEventGraphLayout = useMemo(() => {
    const graph = visibleProjectEventGraph;
    if (!graph?.nodes?.length) {
      return {
        columns: EVENT_GRAPH_COLUMNS.map((column, columnIndex) => ({ ...column, columnIndex, nodes: [] as ProjectEventGraphNode[] })),
        edges: [] as Array<ProjectEventGraphEdge & { path: string; labelX: number; labelY: number }>,
        nodePositions: new Map<string, { x: number; y: number; width: number; height: number; column: string }>(),
        width: EVENT_GRAPH_COLUMNS.length * 260,
        height: 360,
      };
    }

    const columnForNode = (node: ProjectEventGraphNode) => {
      if (node.type === 'HUMAN' || node.type === 'AGENT') return 'ACTOR';
      if (node.type === 'FILE' || node.type === 'FOLDER') return 'RESOURCE';
      if (node.type === 'EVENT') return 'EVENT';
      return EVENT_GRAPH_COLUMNS.some((column) => column.key === node.type) ? node.type : '';
    };
    const sortNode = (left: ProjectEventGraphNode, right: ProjectEventGraphNode) => {
      const leftSeq = typeof left.meta?.seq === 'number' ? left.meta.seq : 0;
      const rightSeq = typeof right.meta?.seq === 'number' ? right.meta.seq : 0;
      if (['MESSAGE', 'EVENT'].includes(left.type) || ['MESSAGE', 'EVENT'].includes(right.type)) return rightSeq - leftSeq;
      return left.label.localeCompare(right.label);
    };
    const maxByColumn: Record<string, number> = {
      GOAL: 14,
      FEATURE: 14,
      WORK_ITEM: 22,
      ACTOR: 18,
      RUN: 20,
      ARTIFACT: 20,
      REVIEW: 18,
      RESOURCE: 20,
      MESSAGE: 22,
      EVENT: 24,
    };
    const columns = EVENT_GRAPH_COLUMNS
      .map((column) => {
        const nodes = graph.nodes
          .filter((node) => columnForNode(node) === column.key)
          .sort(sortNode)
          .slice(0, maxByColumn[column.key] || 16);
        return { ...column, nodes };
      })
      .filter((column) => column.nodes.length > 0)
      .map((column, columnIndex) => ({ ...column, columnIndex }));
    const nodeWidth = 224;
    const nodeHeight = 86;
    const columnWidth = 264;
    const rowGap = 18;
    const topOffset = 58;
    const leftOffset = 18;
    const nodePositions = new Map<string, { x: number; y: number; width: number; height: number; column: string }>();
    columns.forEach((column) => {
      column.nodes.forEach((node, rowIndex) => {
        nodePositions.set(node.id, {
          x: leftOffset + column.columnIndex * columnWidth,
          y: topOffset + rowIndex * (nodeHeight + rowGap),
          width: nodeWidth,
          height: nodeHeight,
          column: column.key,
        });
      });
    });
    const maxRows = Math.max(1, ...columns.map((column) => column.nodes.length));
    const width = leftOffset * 2 + columns.length * columnWidth;
    const height = topOffset + maxRows * (nodeHeight + rowGap) + 28;
    const edgePriority = (edge: ProjectEventGraphEdge) => {
      if (edge.type === 'HAS_GOAL' || edge.type === 'HAS_FEATURE' || edge.type === 'HAS_WORK_ITEM') return 0;
      if (edge.type === 'CREATED' || edge.type === 'FEATURE_CREATED') return 1;
      if (edge.type === 'AGENT_RUNTIME_LAUNCHED' || edge.type === 'ASSIGNED_TO' || edge.type === 'DISPATCHED') return 2;
      if (edge.type === 'AGENT_RUNTIME_MESSAGE_SENT' || edge.type === 'MESSAGE_CREATED' || edge.type === 'MESSAGE_TARGET') return 3;
      if (
        edge.type === 'USES_RESOURCE' ||
        edge.type === 'PROJECT_GLOBAL_CREATED' ||
        edge.type === 'PROJECT_GLOBAL_WRITTEN' ||
        edge.type === 'PROJECT_GLOBALS_UPDATED' ||
        edge.type === 'PROJECT_FOLDER_CREATED' ||
        edge.type === 'PROJECT_FILE_WRITTEN' ||
        edge.type === 'PROJECT_FILE_UPLOADED'
      ) return 4;
      if (edge.type === 'ACTED' || edge.type === 'EVENT_TARGET') return 5;
      return 6;
    };
    const edges = graph.edges
      .filter((edge) => nodePositions.has(edge.source) && nodePositions.has(edge.target))
      .sort((left, right) => edgePriority(left) - edgePriority(right) || (right.seq || 0) - (left.seq || 0))
      .slice(0, 180)
      .map((edge) => {
        const source = nodePositions.get(edge.source)!;
        const target = nodePositions.get(edge.target)!;
        const forward = source.x <= target.x;
        const x1 = forward ? source.x + source.width : source.x;
        const y1 = source.y + source.height / 2;
        const x2 = forward ? target.x : target.x + target.width;
        const y2 = target.y + target.height / 2;
        const curve = Math.max(54, Math.min(150, Math.abs(x2 - x1) * 0.45));
        const c1 = forward ? x1 + curve : x1 - curve;
        const c2 = forward ? x2 - curve : x2 + curve;
        return {
          ...edge,
          path: `M ${x1} ${y1} C ${c1} ${y1}, ${c2} ${y2}, ${x2} ${y2}`,
          labelX: (x1 + x2) / 2,
          labelY: (y1 + y2) / 2,
        };
      });

    return { columns, edges, nodePositions, width, height };
  }, [visibleProjectEventGraph]);

  const highlightedEventGraphEdgeIds = useMemo(() => {
    if (!selectedEventGraphNodeId) return new Set<string>();
    return new Set(projectEventGraphLayout.edges.filter((edge) => edge.source === selectedEventGraphNodeId).map((edge) => edge.id));
  }, [selectedEventGraphNodeId, projectEventGraphLayout.edges]);

  const highlightedEventGraphTargetIds = useMemo(() => {
    if (!selectedEventGraphNodeId) return new Set<string>();
    return new Set(
      projectEventGraphLayout.edges
        .filter((edge) => edge.source === selectedEventGraphNodeId)
        .map((edge) => edge.target),
    );
  }, [selectedEventGraphNodeId, projectEventGraphLayout.edges]);

  const projectEventGraphNodeById = useMemo(() => {
    return new Map((visibleProjectEventGraph?.nodes || []).map((node) => [node.id, node]));
  }, [visibleProjectEventGraph?.nodes]);

  const eventGraphActorLabel = (node?: ProjectEventGraphNode | null, edge?: ProjectEventGraphEdge) => {
    const nodeMeta = node?.meta || {};
    const edgeMeta = edge?.meta || {};
    if (
      node?.id === `agent:${COORDINATOR_MEMBER_ID}` ||
      nodeMeta.source === 'project-coordinator' ||
      nodeMeta.memberId === COORDINATOR_MEMBER_ID ||
      edgeMeta.launchSource === 'coordinator'
    ) {
      return 'coordinator';
    }
    return node?.label || '';
  };

  const normalizeEventGraphActorLabel = (label: string) =>
    label === '协调者' || label === 'Coordinator' || label === COORDINATOR_MEMBER_ID ? 'coordinator' : label;

  const projectEventGraphAttributionByNodeId = useMemo(() => {
    const relationLabel = (edge: ProjectEventGraphEdge, actorLabel: string) => {
      if (edge.type === 'AGENT_RUNTIME_LAUNCHED') return `Launched by ${actorLabel}`;
      if (edge.type === 'AGENT_RUNTIME_MESSAGE_SENT' || edge.type === 'MESSAGE_CREATED') return `Messaged by ${actorLabel}`;
      if (edge.type === 'CREATED' || edge.type === 'FEATURE_CREATED' || edge.type === 'PROJECT_GLOBAL_CREATED') return `Created by ${actorLabel}`;
      if (edge.type === 'PROJECT_FILE_UPLOADED') return `Uploaded by ${actorLabel}`;
      if (edge.type === 'PROJECT_FOLDER_CREATED') return `Created by ${actorLabel}`;
      if (edge.type === 'PROJECT_FILE_WRITTEN') return `Written by ${actorLabel}`;
      if (edge.type === 'PROJECT_GLOBAL_WRITTEN') return `Written by ${actorLabel}`;
      if (edge.type === 'PROJECT_GLOBALS_UPDATED') return `Updated by ${actorLabel}`;
      return '';
    };
    const relationRank = (edge: ProjectEventGraphEdge) => {
      if (edge.type === 'AGENT_RUNTIME_LAUNCHED') return 0;
      if (edge.type === 'AGENT_RUNTIME_MESSAGE_SENT' || edge.type === 'MESSAGE_CREATED') return 1;
      if (edge.type === 'CREATED' || edge.type === 'FEATURE_CREATED' || edge.type === 'PROJECT_GLOBAL_CREATED') return 0;
      if (edge.type === 'PROJECT_FILE_UPLOADED' || edge.type === 'PROJECT_FOLDER_CREATED' || edge.type === 'PROJECT_FILE_WRITTEN') return 1;
      if (edge.type === 'PROJECT_GLOBAL_WRITTEN') return 1;
      if (edge.type === 'PROJECT_GLOBALS_UPDATED') return 2;
      return 10;
    };
    const next = new Map<string, string>();
    [...(visibleProjectEventGraph?.edges || [])]
      .sort((left, right) => relationRank(left) - relationRank(right) || (right.seq || 0) - (left.seq || 0))
      .forEach((edge) => {
        if (next.has(edge.target)) return;
        const source = projectEventGraphNodeById.get(edge.source);
        const target = projectEventGraphNodeById.get(edge.target);
        if (!source || !target) return;
        if (source.type !== 'AGENT' && source.type !== 'HUMAN') return;
        if (!['AGENT', 'HUMAN', 'GOAL', 'FEATURE', 'WORK_ITEM', 'RESOURCE', 'FILE', 'FOLDER', 'MESSAGE'].includes(target.type)) return;
        const label = relationLabel(edge, eventGraphActorLabel(source, edge));
        if (label) next.set(edge.target, label);
      });
    return next;
  }, [visibleProjectEventGraph?.edges, projectEventGraphNodeById]);

  const projectEventGraphStats = useMemo(() => {
    const nodes = visibleProjectEventGraph?.nodes || [];
    const edges = visibleProjectEventGraph?.edges || [];
    return [
      { label: 'Agents', value: nodes.filter((node) => node.type === 'AGENT' || node.type === 'HUMAN').length },
      { label: 'Goals', value: nodes.filter((node) => node.type === 'GOAL').length },
      { label: 'Items', value: nodes.filter((node) => node.type === 'WORK_ITEM').length },
      { label: 'Runs', value: nodes.filter((node) => node.type === 'RUN').length },
      { label: 'Artifacts', value: nodes.filter((node) => node.type === 'ARTIFACT').length },
      { label: 'Reviews', value: nodes.filter((node) => node.type === 'REVIEW').length },
      { label: 'Resources', value: nodes.filter((node) => ['RESOURCE', 'FILE', 'FOLDER'].includes(node.type)).length },
      { label: 'Changes', value: nodes.filter((node) => node.type === 'EVENT').length },
      { label: 'Relations', value: edges.length },
    ].filter((stat) => stat.value > 0 || stat.label === 'Relations');
  }, [visibleProjectEventGraph]);

  const projectEventGraphMessageNodes = useMemo(() => {
    return (visibleProjectEventGraph?.nodes || [])
      .filter((node) => node.type === 'MESSAGE')
      .sort((left, right) => {
        const leftSeq = typeof left.meta?.seq === 'number' ? left.meta.seq : 0;
        const rightSeq = typeof right.meta?.seq === 'number' ? right.meta.seq : 0;
        return rightSeq - leftSeq;
      });
  }, [visibleProjectEventGraph?.nodes]);

  const projectEventGraphFocusItems = useMemo(() => {
    const graph = visibleProjectEventGraph;
    const nodeMetaString = (node: ProjectEventGraphNode, key: string) => {
      const value = node.meta?.[key];
      return typeof value === 'string' && value.trim() ? value.trim() : '';
    };
    const nodeTime = (node: ProjectEventGraphNode) =>
      nodeMetaString(node, 'updatedAt') || nodeMetaString(node, 'createdAt') || nodeMetaString(node, 'finishedAt') || node.subtitle || '';
    const timeMs = (value?: string | null) => {
      const parsed = value ? new Date(value).getTime() : 0;
      return Number.isFinite(parsed) ? parsed : 0;
    };
    const isBlockerNode = (node: ProjectEventGraphNode) => {
      const status = String(node.status || '').toUpperCase();
      return EVENT_GRAPH_BLOCKER_STATUSES.has(status) || status.includes('WAITING') || status.includes('BLOCK');
    };
    if (eventGraphMode === 'all') {
      if (!graph) return [];
      return graph.edges
        .sort((left, right) => (right.seq || 0) - (left.seq || 0))
        .slice(0, 12)
        .map((edge) => {
          const source = projectEventGraphNodeById.get(edge.source);
          const target = projectEventGraphNodeById.get(edge.target);
          return {
            id: edge.id,
            title: source?.label || edge.source,
            badge: edge.label || edge.type,
            summary: target?.label || edge.target,
            time: edge.occurredAt || '',
            nodeId: target?.id || edge.target,
          };
        });
    }
    if (eventGraphMode === 'timeline') {
      return projectEventGraphTimelineEvents.slice(0, 12).map((event) => ({
        id: event.id,
        title: humanizeEventType(event.type),
        badge: `#${event.seq}`,
        summary: formatProjectEventSummary(event),
        time: event.createdAt,
        nodeId: `event:${event.id}`,
      }));
    }
    if (!graph) return [];
    if (eventGraphMode === 'blockers') {
      return graph.nodes
        .filter(isBlockerNode)
        .sort((left, right) => timeMs(nodeTime(right)) - timeMs(nodeTime(left)))
        .slice(0, 12)
        .map((node) => ({
          id: node.id,
          title: node.label,
          badge: node.status || node.type,
          summary: node.subtitle || node.type,
          time: nodeTime(node),
          nodeId: node.id,
        }));
    }
    if (eventGraphMode === 'resources') {
      return graph.edges
        .filter((edge) => EVENT_GRAPH_RESOURCE_EDGE_TYPES.has(edge.type))
        .sort((left, right) => (right.seq || 0) - (left.seq || 0))
        .slice(0, 12)
        .map((edge) => {
          const source = projectEventGraphNodeById.get(edge.source);
          const target = projectEventGraphNodeById.get(edge.target);
          return {
            id: edge.id,
            title: source?.label || edge.source,
            badge: edge.label || edge.type,
            summary: target?.label || edge.target,
            time: edge.occurredAt || '',
            nodeId: target?.id,
          };
        });
    }
    if (eventGraphMode === 'review') {
      return graph.nodes
        .filter((node) => node.type === 'REVIEW' || node.type === 'ARTIFACT')
        .sort((left, right) => timeMs(nodeTime(right)) - timeMs(nodeTime(left)))
        .slice(0, 12)
        .map((node) => ({
          id: node.id,
          title: node.label,
          badge: node.status || node.type,
          summary: node.subtitle || node.type,
          time: nodeTime(node),
          nodeId: node.id,
        }));
    }
    const executionFocusNodes = graph.nodes.filter((node) => node.type === 'RUN' || node.type === 'ARTIFACT');
    const executionFallbackNodes = executionFocusNodes.length
      ? executionFocusNodes
      : graph.nodes.filter((node) => node.type === 'WORK_ITEM');
    return executionFallbackNodes
      .sort((left, right) => timeMs(nodeTime(right)) - timeMs(nodeTime(left)))
      .slice(0, 12)
      .map((node) => ({
        id: node.id,
        title: node.label,
        badge: node.status || node.type,
        summary: node.subtitle || node.type,
        time: nodeTime(node),
        nodeId: node.id,
      }));
  }, [
    eventGraphMode,
    projectEventGraphNodeById,
    projectEventGraphTimelineEvents,
    visibleProjectEventGraph,
  ]);

  const projectCoordinatorEvents = useMemo(() => {
    return (projectEventGraph?.events || [])
      .filter((event) => {
        const source = typeof event.payload?.source === 'string' ? event.payload.source : '';
        return event.type.startsWith('COORDINATOR_') || source === 'project-coordinator';
      })
      .map((event) => {
        const payload = event.payload || {};
        const message =
          typeof payload.message === 'string' && payload.message.trim()
            ? payload.message.trim()
            : `${event.type}${event.refId ? ` · ${event.refId}` : ''}`;
        return {
          id: event.id,
          seq: event.seq,
          type: event.type,
          message,
          reason: typeof payload.reason === 'string' ? payload.reason : '',
          memberId:
            typeof payload.memberId === 'string'
              ? payload.memberId
              : typeof payload.targetMemberId === 'string'
                ? payload.targetMemberId
                : '',
          role: typeof payload.role === 'string' ? payload.role : '',
          conversationId: typeof payload.conversationId === 'string' ? payload.conversationId : '',
          requestId: typeof payload.requestId === 'string' ? payload.requestId : '',
          assignmentId: typeof payload.assignmentId === 'string' ? payload.assignmentId : '',
          dispatchMode: typeof payload.dispatchMode === 'string' ? payload.dispatchMode : '',
          messageSent: typeof payload.messageSent === 'boolean' ? payload.messageSent : undefined,
          createdAt: event.createdAt,
        };
      })
      .sort((left, right) => right.seq - left.seq);
  }, [projectEventGraph?.events]);

  const visibleCoordinatorLogs = useMemo(() => {
    if (coordinatorLogs.length) return coordinatorLogs;
    return projectCoordinatorEvents.slice(0, 8).map((event) => event.message);
  }, [coordinatorLogs, projectCoordinatorEvents]);

  const hasActiveLeadAgent = useMemo(() => activeMembers.some((member) => member.role === 'LEAD_AGENT'), [activeMembers]);
  const projectDetailTourSteps = useMemo<GuidedTourStep[]>(
    () => [
      PROJECT_DETAIL_TOUR_BASE_STEPS[0],
      hasActiveLeadAgent
        ? {
            selector: '[data-tour="project-lead-agent-card"]',
            title: 'Select the pending lead agent',
            body: 'This project already has a LEAD_AGENT. Its current state is pending launch, so the next step is to select it and start a local runtime.',
            actionLabel: 'Click the Lead Agent card, then launch Local Agent.',
          }
        : {
            selector: '[data-tour="project-create-agent"]',
            title: 'Create the lead agent',
            body: 'If the project has no LEAD_AGENT yet, create one first. The lead agent becomes the coordinator that reads the project goal and decides what work should be delegated.',
            actionLabel: 'Click Create LEAD_AGENT.',
          },
      ...PROJECT_DETAIL_TOUR_BASE_STEPS.slice(1),
    ],
    [hasActiveLeadAgent],
  );

  const projectTemplateRoles = useMemo(
    () => projectTemplateRolesFromSettings(project?.settings as Record<string, unknown> | null),
    [project?.settings],
  );

  const projectRoleContracts = useMemo(() => {
    const contracts = { ...ROLE_CONTRACTS };
    projectTemplateRoles.forEach((entry) => {
      const templateContract = contractFromTemplateRole(entry);
      const existing = contracts[entry.role];
      const hasTemplateSpecificContract = Boolean(
        entry.label ||
          entry.skillBundleRefs?.length ||
          entry.capabilityBundleRefs?.length ||
          entry.capabilityBundles?.length ||
          entry.initialPrompt ||
          entry.polling,
      );
      contracts[entry.role] = existing
        ? {
            ...existing,
            description: entry.description || existing.description,
            reads: hasTemplateSpecificContract ? templateContract.reads : existing.reads,
            writes: hasTemplateSpecificContract ? templateContract.writes : existing.writes,
            trigger: hasTemplateSpecificContract ? templateContract.trigger : existing.trigger,
            skills: templateContract.skills.length ? templateContract.skills : existing.skills,
            capabilityBundleRefs: templateContract.capabilityBundleRefs || existing.capabilityBundleRefs,
            runtimeCompatibility: templateContract.runtimeCompatibility || existing.runtimeCompatibility,
            initialPrompt: templateContract.initialPrompt || existing.initialPrompt || '',
          }
        : templateContract;
    });
    const overrides = projectRolePromptOverridesFromSettings(project?.settings as Record<string, unknown> | null);
    Object.entries(overrides).forEach(([role, override]) => {
      const existing = contracts[role];
      contracts[role] = {
        ...(existing || {
          description: `${formatRoleLabel(role)} project role.`,
          reads: 'Project-scoped context',
          writes: 'Notes',
          trigger: 'Project member role',
          skills: [],
        }),
        initialPrompt: override.initialPrompt || '',
      };
    });
    return contracts;
  }, [project?.settings, projectTemplateRoles]);

  const projectRoleOptions = useMemo(() => {
    const templateOptions = projectTemplateRoles.length
      ? projectTemplateRoles.map((entry) => ({
          value: entry.role,
          label: entry.label || formatRoleLabel(entry.role),
          launchable: entry.role === 'LEAD_AGENT'
            ? !hasActiveLeadAgent
            : entry.role !== 'OWNER' && entry.launchable !== false && (entry.launchable || entry.role.endsWith('_AGENT')),
        }))
      : [
          { value: 'OWNER', label: 'Owner', launchable: false },
          ...PROJECT_MEMBER_ROLE_OPTIONS.map((role) => ({
            value: role.value,
            label: role.label,
            launchable: role.value === 'LEAD_AGENT'
              ? !hasActiveLeadAgent
              : Boolean(ROLE_CONTRACTS[role.value]?.skills.length),
          })),
        ];
    const byRole = new Map(templateOptions.map((entry) => [entry.value, entry]));
    activeMembers.forEach((member) => {
      if (!byRole.has(member.role)) {
        byRole.set(member.role, {
          value: member.role,
          label: formatRoleLabel(member.role),
          launchable: member.role === 'LEAD_AGENT'
            ? !hasActiveLeadAgent
            : member.role !== 'OWNER' && (member.role.includes('_AGENT') || Boolean(projectRoleContracts[member.role]?.skills.length)),
        });
      }
    });
    return [...byRole.values()];
  }, [activeMembers, hasActiveLeadAgent, projectRoleContracts, projectTemplateRoles]);

  const launchableProjectRoleOptions = useMemo(() => {
    const options = projectRoleOptions.filter((role) => role.value !== 'OWNER' && role.launchable);
    if (!pendingAgentLaunch?.role || options.some((role) => role.value === pendingAgentLaunch.role)) {
      return options;
    }
    const selectedRole = projectRoleOptions.find((role) => role.value === pendingAgentLaunch.role);
    return [
      selectedRole || {
        value: pendingAgentLaunch.role,
        label: formatRoleLabel(pendingAgentLaunch.role),
        launchable: true,
      },
      ...options,
    ];
  }, [pendingAgentLaunch?.role, projectRoleOptions]);

  const projectAgentMembers = useMemo(() => {
    return activeMembers.filter((member) => member.user.role === 'AI_AGENT' || member.role.includes('_AGENT'));
  }, [activeMembers]);

  const projectConversationMembers = useMemo(() => {
    const runtimeByMember = new Map(agentRuntimes.map((runtime) => [runtime.memberId, runtime]));
    return activeMembers
      .filter((member) => member.role !== 'OWNER')
      .sort((a, b) => {
        const aRuntime = runtimeByMember.get(a.id);
        const bRuntime = runtimeByMember.get(b.id);
        const aRank = agentConversationSortRank(a, aRuntime);
        const bRank = agentConversationSortRank(b, bRuntime);
        const offlineDelta = aRank.offlineRank - bRank.offlineRank;
        if (offlineDelta) return offlineDelta;
        const roleDelta = aRank.roleRank - bRank.roleRank;
        if (roleDelta) return roleDelta;
        const joinedDelta = aRank.joinedAt.localeCompare(bRank.joinedAt);
        if (joinedDelta) return joinedDelta;
        return aRank.name.localeCompare(bRank.name);
      });
  }, [activeMembers, agentRuntimes]);

  const selectedWorkItemSummary = useMemo(() => {
    return workItems.find((item) => item.id === selectedWorkItemId) || null;
  }, [selectedWorkItemId, workItems]);

  const selectedWorkItemForDetail = useMemo(() => {
    if (selectedWorkItemDetail?.id === selectedWorkItemId) return selectedWorkItemDetail;
    return selectedWorkItemSummary;
  }, [selectedWorkItemDetail, selectedWorkItemId, selectedWorkItemSummary]);

  const resolveWorkItemGoalId = (item?: ProjectWorkItem | null) => {
    if (!item) return undefined;
    return item.goalId || (item.featureId ? featureById.get(item.featureId)?.goalId : undefined);
  };

  const agentTodoLists = useMemo(() => {
    return projectAgentMembers.map((member) => {
      const assignments = workItems
        .flatMap((item) =>
          (item.assignments || [])
            .filter((assignment: any) => assignment.assigneeUserId === member.userId)
            .map((assignment: any) => ({ assignment, workItem: item })),
        )
        .filter(({ assignment }) => ['PROPOSED', 'ACTIVE', 'PAUSED'].includes(assignment.status))
        .sort((a, b) => {
          const order: Record<string, number> = { ACTIVE: 0, PROPOSED: 1, PAUSED: 2 };
          return (order[a.assignment.status] ?? 9) - (order[b.assignment.status] ?? 9);
        });
      return { member, assignments };
    });
  }, [projectAgentMembers, workItems]);

  const activeAssignments = useMemo(
    () => workItems.flatMap((item) => item.assignments || []).filter((assignment: any) => assignment.status === 'ACTIVE'),
    [workItems],
  );
  const activeAssignmentTotal = boardSnapshot?.metrics.assignmentStatusCounts?.ACTIVE ?? activeAssignments.length;

  const ownerResourceWorkItems = useMemo(() => {
    if (!user) return [];
    return workItems
      .filter((item) => {
        const resourceRequest = getWorkItemResourceRequest(item);
        return (
          resourceRequest &&
          item.ownerId === user.id &&
          !['ACCEPTED', 'DONE', 'COMPLETED', 'CANCELLED'].includes(item.status)
        );
      })
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [user, workItems]);

  const ownerActionWorkItems = useMemo(() => {
    if (!user) return [];
    return workItems
      .filter((item) => {
        const ownerAction = getWorkItemOwnerAction(item);
        return (
          ownerAction &&
          item.ownerId === user.id &&
          !['ACCEPTED', 'DONE', 'COMPLETED', 'CANCELLED'].includes(item.status)
        );
      })
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [user, workItems]);

  const ownerNonResourceWorkItems = useMemo(() => {
    if (!user) return [];
    return workItems
      .filter(
        (item) =>
          item.ownerId === user.id &&
          !getWorkItemResourceRequest(item) &&
          !getWorkItemOwnerAction(item) &&
          !['ACCEPTED', 'DONE', 'COMPLETED', 'CANCELLED'].includes(item.status),
      )
      .sort((a, b) => (b.priority || 0) - (a.priority || 0));
  }, [user, workItems]);

  const selectedResourceRequest = useMemo(
    () => getWorkItemResourceRequest(selectedWorkItemForDetail),
    [selectedWorkItemForDetail],
  );

  const selectedOwnerAction = useMemo(
    () => getWorkItemOwnerAction(selectedWorkItemForDetail),
    [selectedWorkItemForDetail],
  );

  const selectedWorkItemGoalId = selectedWorkItemForDetail
    ? resolveWorkItemGoalId(selectedWorkItemForDetail)
    : undefined;
  const selectedWorkItemGoalTitle = selectedWorkItemGoalId
    ? goalById.get(selectedWorkItemGoalId)?.title || 'Linked goal'
    : 'No linked goal';
  const selectedWorkItemFeatureTitle = selectedWorkItemForDetail?.featureId
    ? featureById.get(selectedWorkItemForDetail.featureId)?.title || 'Linked feature'
    : 'No feature';

  const projectFileByPath = useMemo(() => {
    return new Map(allProjectFiles.map((file) => [normalizeProjectFileFolderPath(file.path), file]));
  }, [allProjectFiles]);

  const allWorkItemsById = useMemo(() => {
    const byId = new Map<string, ProjectWorkItem>();
    [...homeWorkItemsForUi, ...workItems].forEach((item) => {
      byId.set(item.id, item);
    });
    return byId;
  }, [homeWorkItemsForUi, workItems]);

  const workItemArtifactCount = useCallback(
    (item?: ProjectWorkItem | null) => {
      if (!item) return 0;
      const countedArtifacts = (item as any)._count?.artifacts;
      if (typeof countedArtifacts === 'number') return countedArtifacts;
      return artifacts.filter((artifact) => artifact.workItemId === item.id).length;
    },
    [artifacts],
  );

  const homeOutputFiles = useMemo(() => {
    const byPath = new Map<string, ProjectFileEntry>();
    homeWorkItemsForUi.forEach((item) => {
      workItemOutputProjectFilePaths(item).forEach((path) => {
        const normalizedPath = normalizeProjectFileFolderPath(path);
        if (!normalizedPath || byPath.has(normalizedPath)) return;
        byPath.set(normalizedPath, projectFileByPath.get(normalizedPath) || {
          path: normalizedPath,
          key: normalizedPath,
          size: 0,
          type: 'file',
        });
      });
    });
    return [...byPath.values()].sort(
      (left, right) =>
        new Date(right.lastModified || 0).getTime() - new Date(left.lastModified || 0).getTime() ||
        left.path.localeCompare(right.path),
    );
  }, [homeWorkItemsForUi, projectFileByPath]);

  const homeGoalSummaries = useMemo(() => {
    const goals = ((project?.goals || []) as ProjectGoalOption[]);
    const fallbackProjectFile = (path: string): ProjectFileEntry => {
      const normalizedPath = normalizeProjectFileFolderPath(path);
      return projectFileByPath.get(normalizedPath) || {
        path: normalizedPath,
        key: normalizedPath,
        size: 0,
        type: 'file',
      };
    };
    const artifactGoalId = (artifact: any) => {
      const metadata = isRecord(artifact?.metadata) ? artifact.metadata : {};
      const metadataGoal = isRecord(metadata.goal) && typeof metadata.goal.id === 'string' ? metadata.goal.id : '';
      const explicitGoalId =
        (typeof artifact?.goalId === 'string' ? artifact.goalId : '') ||
        (typeof metadata.goalId === 'string' ? metadata.goalId : '') ||
        metadataGoal ||
        (typeof artifact?.workItem?.goalId === 'string' ? artifact.workItem.goalId : '');
      if (explicitGoalId) return explicitGoalId;
      const workItemId =
        (typeof artifact?.workItemId === 'string' ? artifact.workItemId : '') ||
        (typeof artifact?.workItem?.id === 'string' ? artifact.workItem.id : '');
      const linkedItem = workItemId ? allWorkItemsById.get(workItemId) : null;
      if (linkedItem) return resolveWorkItemGoalId(linkedItem) || '';
      return goals.length === 1 ? goals[0].id : '';
    };
    return goals.map((goal) => {
      const items = homeWorkItemsForUi.filter((item) => resolveWorkItemGoalId(item) === goal.id);
      const statusCounts = items.reduce<Record<string, number>>((counts, item) => {
        counts[item.status] = (counts[item.status] || 0) + 1;
        return counts;
      }, {});
      const acceptedCount = items.filter((item) => WORK_ITEM_ACCEPTED_STATUSES.has(item.status)).length;
      const activeCount = items.filter((item) => WORK_ITEM_ACTIVE_STATUSES.has(item.status)).length;
      const outputFilesByPath = new Map<string, ProjectFileEntry>();
      items.forEach((item) => {
        workItemOutputProjectFilePaths(item).forEach((path) => {
          const normalizedPath = normalizeProjectFileFolderPath(path);
          if (!normalizedPath || outputFilesByPath.has(normalizedPath)) return;
          outputFilesByPath.set(normalizedPath, projectFileByPath.get(normalizedPath) || {
            path: normalizedPath,
            key: normalizedPath,
            size: 0,
            type: 'file',
          });
        });
      });
      const outputFiles = [...outputFilesByPath.values()].sort(
        (left, right) =>
          new Date(right.lastModified || 0).getTime() - new Date(left.lastModified || 0).getTime() ||
          left.path.localeCompare(right.path),
      );
      const goalArtifacts = artifacts
        .filter((artifact) => artifactGoalId(artifact) === goal.id)
        .sort(
          (left, right) =>
            new Date(right.createdAt || right.updatedAt || 0).getTime() -
            new Date(left.createdAt || left.updatedAt || 0).getTime(),
        );
      const artifactFileByPath = new Map<string, ProjectFileEntry>();
      goalArtifacts.forEach((artifact) => {
        artifactResources(artifact).forEach((file) => {
          const normalizedPath = normalizeProjectFileFolderPath(file.path);
          if (!normalizedPath || artifactFileByPath.has(normalizedPath)) return;
          artifactFileByPath.set(normalizedPath, {
            ...fallbackProjectFile(normalizedPath),
            ...file,
            path: normalizedPath,
            key: file.key || normalizedPath,
            type: 'file',
          });
        });
      });
      const deliveryFilesByPath = new Map<string, ProjectFileEntry>();
      [...outputFiles, ...artifactFileByPath.values()].forEach((file) => {
        const normalizedPath = normalizeProjectFileFolderPath(file.path);
        if (!normalizedPath || deliveryFilesByPath.has(normalizedPath)) return;
        deliveryFilesByPath.set(normalizedPath, {
          ...fallbackProjectFile(normalizedPath),
          ...file,
          path: normalizedPath,
          key: file.key || normalizedPath,
          type: file.type || 'file',
        });
      });
      const deliveryFiles = [...deliveryFilesByPath.values()].sort(
        (left, right) =>
          new Date(right.lastModified || 0).getTime() - new Date(left.lastModified || 0).getTime() ||
          left.path.localeCompare(right.path),
      );
      const needsRevisionItems = items.filter((item) => ['NEEDS_REVISION', 'REJECTED'].includes(item.status));
      const reviewItems = items.filter((item) => item.status === 'IN_REVIEW');
      const readyItems = items.filter((item) => ['READY', 'ASSIGNED'].includes(item.status));
      const ownerItems = items.filter((item) => getWorkItemResourceRequest(item) || getWorkItemOwnerAction(item));
      const artifactCount = goalArtifacts.length || items.reduce((sum, item) => sum + workItemArtifactCount(item), 0);
      const latestArtifact = goalArtifacts[0] || null;
      const latestFile = deliveryFiles[0] || null;
      const nextAction =
        ownerItems.length
          ? `${ownerItems.length} owner input${ownerItems.length === 1 ? '' : 's'} needed`
          : needsRevisionItems.length
            ? `${needsRevisionItems.length} item${needsRevisionItems.length === 1 ? '' : 's'} need rework`
            : reviewItems.length
              ? `${reviewItems.length} item${reviewItems.length === 1 ? '' : 's'} ready for review`
              : latestArtifact || latestFile
                ? 'Review latest result'
                : readyItems.length
                  ? `${readyItems.length} item${readyItems.length === 1 ? '' : 's'} waiting to run`
                  : items.length
                    ? 'Keep execution moving'
                    : 'Add work items';
      return {
        goal,
        items,
        statusCounts,
        acceptedCount,
        activeCount,
        outputFiles,
        deliveryFiles,
        artifacts: goalArtifacts,
        latestArtifact,
        latestFile,
        needsRevisionItems,
        reviewItems,
        ownerItems,
        nextAction,
        artifactCount,
        progress: items.length ? Math.round((acceptedCount / items.length) * 100) : 0,
      };
    });
  }, [allWorkItemsById, artifacts, homeWorkItemsForUi, project?.goals, projectFileByPath, workItemArtifactCount]);

  const selectedRelatedWorkItems = useMemo(() => {
    const item = selectedWorkItemForDetail as any;
    if (!item) return [];
    const dependsOn = Array.isArray(item.dependsOn) ? item.dependsOn.filter(Boolean) : [];
    const explicitRelated = [
      ...(Array.isArray(item.relatedItems) ? item.relatedItems : []),
      ...(Array.isArray(item.dependencyItems) ? item.dependencyItems : []),
    ];
    const byId = new Map<string, any>();
    for (const related of explicitRelated) {
      const relatedId = typeof related?.id === 'string' ? related.id : typeof related?.workItemId === 'string' ? related.workItemId : '';
      if (relatedId && !byId.has(relatedId)) byId.set(relatedId, related);
    }
    for (const summary of workItems) {
      if (dependsOn.includes(summary.id) && !byId.has(summary.id)) byId.set(summary.id, summary);
    }
    const ordered = dependsOn.map((relatedId: string) => byId.get(relatedId) || {
      id: relatedId,
      title: `Work item ${relatedId.slice(0, 8)}`,
      status: 'UNKNOWN',
      workType: 'DEPENDENCY',
    });
    for (const related of explicitRelated) {
      const relatedId = typeof related?.id === 'string' ? related.id : typeof related?.workItemId === 'string' ? related.workItemId : '';
      if (relatedId && !ordered.some((entry: any) => entry.id === relatedId)) ordered.push(related);
    }
    return ordered;
  }, [selectedWorkItemForDetail, workItems]);

  const selectedAcceptedUpstreamByItemId = useMemo(() => {
    const item = selectedWorkItemForDetail as any;
    const entries = Array.isArray(item?.acceptedUpstreamItems) ? item.acceptedUpstreamItems : [];
    return new Map(
      entries
        .map((entry: any) => [entry.workItemId || entry.id, entry])
        .filter(([entryId]: any[]) => typeof entryId === 'string' && entryId.length > 0),
    );
  }, [selectedWorkItemForDetail]);

  const selectedWorkItemAssignments = useMemo(
    () =>
      [...(selectedWorkItemForDetail?.assignments || [])].sort(
        (a: any, b: any) =>
          new Date(b.updatedAt || b.createdAt || 0).getTime() -
          new Date(a.updatedAt || a.createdAt || 0).getTime(),
      ),
    [selectedWorkItemForDetail?.assignments],
  );

  const selectedWorkItemReviews = useMemo(() => {
    const workItemId = selectedWorkItemForDetail?.id;
    if (!workItemId) return [];
    const detailReviews = selectedWorkItemForDetail?.reviews || [];
    const seen = new Set(detailReviews.map((review: any) => review.id).filter(Boolean));
    const merged = [
      ...detailReviews,
      ...reviews.filter((review: any) => review.workItemId === workItemId && !seen.has(review.id)),
    ];
    return merged.sort(
      (a: any, b: any) =>
        new Date(b.createdAt || b.updatedAt || 0).getTime() -
        new Date(a.createdAt || a.updatedAt || 0).getTime(),
    );
  }, [reviews, selectedWorkItemForDetail?.id, selectedWorkItemForDetail?.reviews]);

  const selectedWorkItemArtifacts = useMemo(() => {
    const workItemId = selectedWorkItemForDetail?.id;
    if (!workItemId) return [];
    const detailArtifacts = selectedWorkItemForDetail?.artifacts || [];
    const seen = new Set(detailArtifacts.map((artifact: any) => artifact.id).filter(Boolean));
    return [
      ...detailArtifacts,
      ...artifacts.filter((artifact: any) => artifact.workItemId === workItemId && !seen.has(artifact.id)),
    ].sort(
      (a: any, b: any) =>
        new Date(b.createdAt || b.updatedAt || 0).getTime() -
        new Date(a.createdAt || a.updatedAt || 0).getTime(),
    );
  }, [artifacts, selectedWorkItemForDetail?.artifacts, selectedWorkItemForDetail?.id]);

  const selectedWorkItemRunResults = useMemo(
    () =>
      [...(selectedWorkItemForDetail?.runs || [])]
        .filter((run: any) => typeof run.resultSummary === 'string' && run.resultSummary.trim())
        .sort(
          (a: any, b: any) =>
            new Date(b.finishedAt || b.updatedAt || b.createdAt || 0).getTime() -
            new Date(a.finishedAt || a.updatedAt || a.createdAt || 0).getTime(),
        ),
    [selectedWorkItemForDetail?.runs],
  );

  const selectedWorkItemConclusion = useMemo(() => {
    const approvedReview = selectedWorkItemReviews.find(
      (review: any) => review.status === 'APPROVED' && typeof review.reviewNote === 'string' && review.reviewNote.trim(),
    );
    if (approvedReview) return { label: 'Approved conclusion', text: approvedReview.reviewNote.trim() };

    const latestReview = selectedWorkItemReviews.find(
      (review: any) => typeof review.reviewNote === 'string' && review.reviewNote.trim(),
    );
    if (latestReview) return { label: `${latestReview.status || 'Review'} note`, text: latestReview.reviewNote.trim() };

    const latestRunResult = selectedWorkItemRunResults[0];
    if (latestRunResult) return { label: 'Run result', text: latestRunResult.resultSummary.trim() };

    const handoffArtifact = selectedWorkItemArtifacts.find(
      (artifact: any) => typeof artifact.content === 'string' && artifact.content.trim(),
    );
    if (handoffArtifact) return { label: handoffArtifact.artifactType || 'Artifact note', text: handoffArtifact.content.trim() };

    const outputContractText = workItemOutputContractText(selectedWorkItemForDetail);
    if (outputContractText) return { label: 'Expected output', text: outputContractText };

    if (WORK_ITEM_ACCEPTED_STATUSES.has(selectedWorkItemForDetail?.status || '')) {
      return { label: 'Conclusion', text: 'This item is accepted, but no written conclusion has been recorded yet.' };
    }
    return { label: 'Conclusion', text: 'No conclusion has been recorded yet.' };
  }, [selectedWorkItemArtifacts, selectedWorkItemForDetail, selectedWorkItemReviews, selectedWorkItemRunResults]);

  const selectedWorkItemFileEvents = useMemo(
    () =>
      selectedWorkItemEvents
        .filter((event) => PROJECT_FILE_EVENT_TYPES.includes(event.type) && projectEventFilePath(event))
        .map((event) => {
          const file = projectFileEntryFromEvent(event);
          return {
            id: event.id,
            type: event.type,
            title: humanizeEventType(event.type),
            path: file?.path || projectEventFilePath(event),
            file,
            actor: formatProjectEventActor(event),
            createdAt: event.createdAt,
            seq: event.seq,
          };
        })
        .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()),
    [selectedWorkItemEvents],
  );

  const selectedWorkItemOutputFiles = useMemo(() => {
    const byPath = new Map<string, ProjectFileEntry>();
    const addFile = (file?: ProjectFileEntry | null) => {
      const normalizedPath = normalizeProjectFileFolderPath(file?.path);
      if (!normalizedPath || byPath.has(normalizedPath)) return;
      const indexed = projectFileByPath.get(normalizedPath);
      byPath.set(normalizedPath, {
        ...(file || { path: normalizedPath, key: normalizedPath, size: 0 }),
        ...(indexed || {}),
        path: indexed?.path || normalizedPath,
        key: indexed?.key || file?.key || normalizedPath,
        size: indexed?.size ?? file?.size ?? 0,
        type: indexed?.type || file?.type || 'file',
      });
    };

    workItemOutputProjectFilePaths(selectedWorkItemForDetail).forEach((path) => {
      const normalizedPath = normalizeProjectFileFolderPath(path);
      addFile(projectFileByPath.get(normalizedPath) || {
        path: normalizedPath,
        key: normalizedPath,
        size: 0,
        type: 'file',
      });
    });
    selectedWorkItemFileEvents.forEach((event) => addFile(event.file || {
      path: event.path,
      key: event.path,
      size: 0,
      lastModified: event.createdAt,
      type: 'file',
    }));
    selectedWorkItemArtifacts.forEach((artifact: any) => {
      artifactResources(artifact).forEach(addFile);
    });

    return [...byPath.values()].sort(
      (left, right) =>
        new Date(right.lastModified || 0).getTime() - new Date(left.lastModified || 0).getTime() ||
        left.path.localeCompare(right.path),
    );
  }, [projectFileByPath, selectedWorkItemArtifacts, selectedWorkItemFileEvents, selectedWorkItemForDetail]);

  const selectedWorkItemMemoryHistory = useMemo(() => {
    if (!selectedWorkItemId) return [];
    return memories
      .filter((memory: any) => {
        const metadata = isRecord(memory?.metadata) ? memory.metadata : {};
        if (metadata.workItemId === selectedWorkItemId) return true;
        const affected = isRecord(metadata.affected) ? metadata.affected : {};
        return Array.isArray(affected.workItems) && affected.workItems.includes(selectedWorkItemId);
      })
      .map((memory: any) => ({
        id: `memory:${memory.id}`,
        type: 'MEMORY',
        title: memory.title || 'Project memory',
        summary: memory.summary || memory.content || memory.memoryType || 'Memory linked to this work item',
        actor: memory.createdByUser?.displayName || memory.createdByUser?.email || 'System',
        createdAt: memory.createdAt || memory.updatedAt,
      }));
  }, [memories, selectedWorkItemId]);

  const selectedWorkItemHistory = useMemo(() => {
    const eventEntries = selectedWorkItemEvents.map((event) => ({
      id: event.id,
      type: event.type,
      title: humanizeEventType(event.type),
      summary: formatProjectEventSummary(event),
      actor: formatProjectEventActor(event),
      createdAt: event.createdAt,
      seq: event.seq,
    }));
    return [...eventEntries, ...selectedWorkItemMemoryHistory].sort(
      (a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime(),
    );
  }, [selectedWorkItemEvents, selectedWorkItemMemoryHistory]);

  const handoffArtifacts = useMemo(
    () => artifacts.filter((artifact) => artifact.artifactType === 'HANDOFF'),
    [artifacts],
  );

  const openReviews = useMemo(
    () => reviews.filter((review) => ['PENDING', 'CHANGES_REQUESTED'].includes(review.status)),
    [reviews],
  );

  const totalAssignments = useMemo(
    () =>
      boardSnapshot?.metrics.assignments ??
      homeWorkItemsForUi.reduce((sum, item) => sum + (item._count?.assignments ?? item.assignments?.length ?? 0), 0),
    [boardSnapshot?.metrics.assignments, homeWorkItemsForUi],
  );

  const totalRuns = useMemo(
    () =>
      boardSnapshot?.metrics.runs ??
      homeWorkItemsForUi.reduce((sum, item) => sum + (item._count?.runs ?? item.runs?.length ?? 0), 0),
    [boardSnapshot?.metrics.runs, homeWorkItemsForUi],
  );

  const homeHealthStats = useMemo(
    () => [
      {
        label: 'Assignments',
        value: totalAssignments,
        detail: `${activeAssignments.length} active`,
        icon: UserRoundCheck,
      },
      {
        label: 'Runs',
        value: totalRuns,
        detail: `${boardSnapshot?.metrics.runStatusCounts.RUNNING || 0} running`,
        icon: Rocket,
      },
      {
        label: 'Artifacts',
        value: artifacts.length,
        detail: `${homeOutputFiles.length} shared files`,
        icon: FileText,
      },
      {
        label: 'Reviews',
        value: boardSnapshot?.metrics.reviews ?? reviews.length,
        detail: `${openReviews.length} open`,
        icon: ClipboardCheck,
      },
    ],
    [
      activeAssignments.length,
      artifacts.length,
      boardSnapshot?.metrics.reviews,
      boardSnapshot?.metrics.runStatusCounts.RUNNING,
      homeOutputFiles.length,
      openReviews.length,
      reviews.length,
      totalAssignments,
      totalRuns,
    ],
  );

  const homeDeliveryLanes = useMemo(() => {
    if (boardSnapshot?.lanes?.length) {
      const lanesByStatus = new Map(boardSnapshot.lanes.map((lane: any) => [lane.status, lane]));
      homeWorkItemsForUi.forEach((item) => {
        if (lanesByStatus.has(item.status)) return;
        lanesByStatus.set(item.status, { status: item.status, count: 0, items: [] });
      });
      return [...lanesByStatus.values()].map((lane: any) => {
        const items = homeWorkItemsForUi.filter((item) => item.status === lane.status);
        return {
          ...lane,
          count: items.length || lane.count || 0,
          items: items.length ? items.slice(0, 4) : lane.items || [],
        };
      });
    }
    const groups = new Map<string, ProjectWorkItem[]>();
    WORK_ITEM_STATUS_OPTIONS.forEach((status) => groups.set(status, []));
    homeWorkItemsForUi.forEach((item) => {
      const bucket = groups.get(item.status) || [];
      bucket.push(item);
      groups.set(item.status, bucket);
    });
    return [...groups.entries()].map(([status, items]) => ({
      status,
      count: items.length,
      items: [...items].sort((a, b) => (b.priority || 0) - (a.priority || 0)).slice(0, 4),
    }));
  }, [boardSnapshot?.lanes, homeWorkItemsForUi]);

  const homeRecentRuns = useMemo(() => {
    if (boardSnapshot?.recent.runs?.length) return boardSnapshot.recent.runs.slice(0, 4);
    return workItems
      .flatMap((item) =>
        (item.runs || []).map((run: any) => ({
          ...run,
          workItem: { id: item.id, title: item.title, status: item.status, workType: item.workType },
        })),
      )
      .sort((a: any, b: any) => new Date(b.updatedAt || b.createdAt || 0).getTime() - new Date(a.updatedAt || a.createdAt || 0).getTime())
      .slice(0, 4);
  }, [boardSnapshot?.recent.runs, workItems]);

  const homeRecentArtifacts = useMemo(() => {
    const source = boardSnapshot?.recent.artifacts?.length ? boardSnapshot.recent.artifacts : artifacts;
    return [...source]
      .sort((a: any, b: any) => new Date(b.createdAt || b.updatedAt || 0).getTime() - new Date(a.createdAt || a.updatedAt || 0).getTime())
      .slice(0, 4);
  }, [artifacts, boardSnapshot?.recent.artifacts]);
  const latestDeliveryArtifact = homeRecentArtifacts[0] || null;

  const homeCockpitMembers = useMemo(
    () => (boardSnapshot?.cockpit?.length ? boardSnapshot.cockpit : cockpitMembers).slice(0, 4),
    [boardSnapshot?.cockpit, cockpitMembers],
  );

  const roleCoverage = useMemo(() => {
    return projectRoleOptions.map((roleOption) => ({
      role: roleOption.value,
      label: roleOption.label,
      members: activeMembers.filter((member) => member.role === roleOption.value || (roleOption.value === 'WORKER_AGENT' && member.role === 'AI_AGENT')),
      contract: projectRoleContracts[roleOption.value],
    }));
  }, [activeMembers, projectRoleContracts, projectRoleOptions]);

  const cockpitByMemberId = useMemo(() => {
    return new Map(cockpitMembers.map((member) => [member.memberId, member]));
  }, [cockpitMembers]);

  const runtimeByMemberId = useMemo(() => {
    return new Map(agentRuntimes.map((runtime) => [runtime.memberId, runtime]));
  }, [agentRuntimes]);
  const launchWouldAddActiveAgent = useCallback((memberId?: string) => {
    const runtime = memberId ? runtimeByMemberId.get(memberId) : null;
    return !runtime || agentRuntimeIsOffline(runtime);
  }, [runtimeByMemberId]);

  const assignmentRuntimeStatesByMemberId = useMemo(() => {
    const map = new Map<string, ProjectAssignmentRuntimeState[]>();
    assignmentRuntimeStates.forEach((assignment) => {
      const memberId = assignment.assigneeRuntime?.memberId;
      if (!memberId) return;
      map.set(memberId, [...(map.get(memberId) || []), assignment]);
    });
    return map;
  }, [assignmentRuntimeStates]);

  const staleAssignmentRuntimeStates = useMemo(
    () => assignmentRuntimeStates.filter((assignment) => assignment.health?.stale),
    [assignmentRuntimeStates],
  );

  const runtimesByRole = useMemo(() => {
    const map = new Map<string, ProjectAgentRuntime[]>();
    agentRuntimes.forEach((runtime) => {
      map.set(runtime.role, [...(map.get(runtime.role) || []), runtime]);
    });
    return map;
  }, [agentRuntimes]);

  const selectedAgentRuntime = useMemo(
    () => agentRuntimes.find((runtime) => runtime.memberId === selectedAgentMemberId) || null,
    [agentRuntimes, selectedAgentMemberId],
  );
  const selectedAgentRuntimeStates = useMemo(
    () => assignmentRuntimeStatesByMemberId.get(selectedAgentMemberId) || [],
    [assignmentRuntimeStatesByMemberId, selectedAgentMemberId],
  );
  const selectedCoordinator = selectedAgentMemberId === COORDINATOR_MEMBER_ID;

  const onlineLocalRunnerByProvider = useMemo(() => {
    const map = new Map<'local-runner' | 'local-codex', ProjectLocalRunnerPresence>();
    localRunnerPresences
      .filter((presence) => presence.online)
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
      .forEach((presence) => {
        if (presence.provider === 'local-runner' || presence.provider === 'local-codex') {
          if (!map.has(presence.provider)) map.set(presence.provider, presence);
        }
      });
    return map;
  }, [localRunnerPresences]);

  const selectedAgentMember = useMemo(
    () => activeMembers.find((member) => member.id === selectedAgentMemberId) || null,
    [activeMembers, selectedAgentMemberId],
  );

  const selectedAgentMemberContract = selectedAgentMember ? projectRoleContracts[selectedAgentMember.role] : undefined;
  const selectedAgentEffectivePrompt = selectedAgentRuntime?.session.rolePrompt ?? selectedAgentMemberContract?.initialPrompt ?? '';
  const selectedAgentPromptChanged = agentPromptDraft.trim() !== selectedAgentEffectivePrompt.trim();

  const agentPollingConfigFor = (member?: ProjectMember | null, runtime?: ProjectAgentRuntime | null) => {
    const memberPermissions = isPlainRecord(member?.permissions) ? member?.permissions : null;
    const memberConfig = memberPermissions && isPlainRecord(memberPermissions.agentPollingConfig)
      ? memberPermissions.agentPollingConfig
      : null;
    const runtimeConfig = isPlainRecord(runtime?.session.pollingConfig)
      ? runtime?.session.pollingConfig
      : null;
    const value = memberConfig ||
      (member?.role === 'LEAD_AGENT' && runtimeConfig ? { ...runtimeConfig, enabled: true } : runtimeConfig);
    return normalizeAgentPollingConfig(value, defaultAgentPollingConfigForRole(member?.role));
  };

  const selectedAgentPollingConfig = useMemo(
    () => agentPollingConfigFor(selectedAgentMember, selectedAgentRuntime),
    [selectedAgentMember?.permissions, selectedAgentRuntime?.session.pollingConfig],
  );
  const selectedAgentPollingConfigSignature = useMemo(
    () => agentPollingConfigSignature(selectedAgentPollingConfig),
    [
      selectedAgentPollingConfig.enabled,
      selectedAgentPollingConfig.strategy,
      selectedAgentPollingConfig.intervalMinutes,
      selectedAgentPollingConfig.message,
    ],
  );

  const selectedAgentConversations = useMemo(
    () => normalizeRuntimeConversations(selectedAgentRuntime?.session),
    [selectedAgentRuntime?.session],
  );

  const selectedAgentConversation = useMemo(
    () =>
      selectedAgentConversations.find((conversation) => conversation.id === selectedAgentConversationId) ||
      selectedAgentConversations.find((conversation) => conversation.id === preferredActiveRuntimeConversationId(selectedAgentRuntime?.session)) ||
      selectedAgentConversations[0] ||
      null,
    [
      selectedAgentConversationId,
      selectedAgentConversations,
      selectedAgentRuntime?.session.activeConversationId,
      selectedAgentRuntime?.session.activeRequestConversationId,
      selectedAgentRuntime?.session.status,
    ],
  );

  const selectedAgentDraftKey = useMemo(
    () =>
      agentMessageDraftStorageKey(
        id,
        selectedAgentRuntime?.memberId,
        selectedAgentConversation?.id ||
          selectedAgentRuntime?.session.activeConversationId ||
          selectedAgentConversations[0]?.id ||
          '',
      ),
    [
      id,
      selectedAgentRuntime?.memberId,
      selectedAgentConversation?.id,
      selectedAgentRuntime?.session.activeConversationId,
      selectedAgentConversations,
    ],
  );

  const selectedAgentMessages = useMemo(
    () => {
      const messages = dedupeRuntimeMessagesForUi(selectedAgentConversation?.messageHistory || []);
      const retryTargetByContent = new Map<string, string>();
      const retryOriginalByMessageId = new Map<string, string>();
      const failedUserMessageIds = new Set<string>();
      const clearedUserMessageIds = new Set<string>();
      const hiddenUserMessageIds = new Set<string>();
      const hiddenAssistantMessageIds = new Set<string>();
      let assistantIdsInTurn: string[] = [];
      let turnHasSteer = false;
      const flushAssistantTurn = () => {
        if (turnHasSteer && assistantIdsInTurn.length > 1) {
          assistantIdsInTurn.slice(0, -1).forEach((messageId) => hiddenAssistantMessageIds.add(messageId));
        }
        assistantIdsInTurn = [];
        turnHasSteer = false;
      };
      messages.forEach((message, index) => {
        if (message.role === 'user') {
          if (isRuntimeSteeringMessage(message)) {
            turnHasSteer = true;
          } else {
            flushAssistantTurn();
          }
          const retryTargetId = retryTargetByContent.get(message.content.trim());
          if (retryTargetId && retryTargetId !== message.id) {
            hiddenUserMessageIds.add(message.id);
            retryOriginalByMessageId.set(message.id, retryTargetId);
            clearedUserMessageIds.add(retryTargetId);
          }
          return;
        }
        if (message.role === 'assistant' && message.id) {
          assistantIdsInTurn.push(message.id);
        }
        if (message.role !== 'system' || message.status?.toLowerCase() !== 'error') return;
        const previousUserMessage = [...messages.slice(0, index)].reverse().find((item) => item.role === 'user' && !isRuntimeSteeringMessage(item));
        if (!previousUserMessage) return;
        const failedMessageId = retryOriginalByMessageId.get(previousUserMessage.id) || previousUserMessage.id;
        const failedContent = previousUserMessage.content.trim();
        retryTargetByContent.set(failedContent, failedMessageId);
        if (clearedFailedAgentMessages[failedMessageId]) {
          clearedUserMessageIds.add(failedMessageId);
        } else {
          clearedUserMessageIds.delete(failedMessageId);
          failedUserMessageIds.add(failedMessageId);
        }
      });
      flushAssistantTurn();
      return messages
        .filter(
          (message) =>
            (message.role !== 'system' || message.status?.toLowerCase() !== 'error') &&
            !isRuntimeSteeringMessage(message) &&
            !hiddenAssistantMessageIds.has(message.id) &&
            !hiddenUserMessageIds.has(message.id),
        )
        .map((message) =>
          (failedAgentMessages[message.id] || failedUserMessageIds.has(message.id)) &&
          !clearedUserMessageIds.has(message.id)
            ? {
                ...message,
                status: 'failed',
              }
            : message,
        );
    },
    [clearedFailedAgentMessages, failedAgentMessages, selectedAgentConversation?.messageHistory],
  );
  const selectedAgentSteerMessages = useMemo(
    () => {
      const messages = dedupeRuntimeMessagesForUi(selectedAgentConversation?.messageHistory || []);
      const latestUserIndex = messages
        .map((message) => message.role === 'user' && !isRuntimeSteeringMessage(message))
        .lastIndexOf(true);
      return messages
        .slice(Math.max(0, latestUserIndex + 1))
        .filter((message) => isRuntimeSteeringMessage(message) && !hiddenSteerMessageIds[message.id]);
    },
    [hiddenSteerMessageIds, selectedAgentConversation?.messageHistory],
  );
  const selectedAgentActivity = useMemo(() => {
    const presenceMessage = selectedAgentRuntime?.presence?.statusMessage;
    return (
      selectedAgentRuntime?.session.currentActivity ||
      (typeof presenceMessage === 'string' ? presenceMessage : '') ||
      'Idle'
    );
  }, [selectedAgentRuntime?.presence, selectedAgentRuntime?.session.currentActivity]);
  const selectedAgentIsTyping = Boolean(
    selectedAgentRuntime?.session.status === 'TYPING' &&
      selectedAgentConversation &&
      (selectedAgentRuntime.session.activeRequestConversationId
        ? selectedAgentRuntime.session.activeRequestConversationId === selectedAgentConversation.id
        : selectedAgentRuntime.session.activeConversationId === selectedAgentConversation.id) &&
      (selectedAgentRuntime.session.activeRequestId ||
        selectedAgentMessages.some((message) => message.role === 'assistant' && message.status === 'TYPING')),
  );
  const selectedAgentTypingLines = useMemo(() => {
    if (!selectedAgentIsTyping) return [];
    const activity = selectedAgentActivity.trim();
    if (!activity || /^streaming response/i.test(activity)) return [];
    if (/^reading context and responding to:/i.test(activity)) return [];
    if (/^reconnecting\.\.\./i.test(activity)) return [activity, 'Thinking'];
    return [activity];
  }, [selectedAgentActivity, selectedAgentIsTyping]);
  const selectedAgentNeedsLocalRunner = Boolean(
    (selectedAgentRuntime?.session.provider === 'local-runner' &&
      selectedAgentRuntime.session.status === 'WAITING_LOCAL_RUNNER') ||
      (selectedAgentRuntime?.session.provider === 'local-codex' &&
        selectedAgentRuntime.session.status === 'WAITING_LOCAL_CODEX'),
  );
  const selectedAgentLocalRunnerMode =
    selectedAgentRuntime?.session.provider === 'local-codex'
      ? 'local-codex'
      : selectedAgentRuntime?.session.provider === 'local-runner'
        ? 'local-runner'
        : null;
  const selectedProjectRunnerPresence = selectedAgentLocalRunnerMode
    ? onlineLocalRunnerByProvider.get(selectedAgentLocalRunnerMode) || null
    : null;

  const agentActionLabel = (actions: NonNullable<ProjectAgentRuntimeSession['recentActions']>) => {
    const names = normalizeRuntimeActionsForDisplay(actions)
      .filter((action) => action.kind !== 'message')
      .map((action) => summarizeRuntimeAction(action))
      .filter(Boolean);
    const uniqueNames = [...new Set(names)];
    return uniqueNames.length ? uniqueNames.slice(0, 4).join(', ') : 'tools / thinking';
  };

  const handleCopyAgentMessage = async (message: AgentRuntimeMessage) => {
    try {
      await navigator.clipboard.writeText(message.content || '');
      setCopiedAgentMessageId(message.id);
      window.setTimeout(() => {
        setCopiedAgentMessageId((current) => (current === message.id ? '' : current));
      }, 1400);
    } catch (err: any) {
      setError(err.message || 'Failed to copy message');
    }
  };

  const renderAgentActivity = (
    actions: NonNullable<ProjectAgentRuntimeSession['recentActions']>,
    groupId: string,
  ) => {
    if (!actions.length) return null;
    const displayActions = normalizeRuntimeActionsForDisplay(actions);
    const expanded = Boolean(expandedAgentActivityIds[groupId]);
    return (
      <div className="flex justify-start">
        <div className="w-[82%] max-w-[82%] min-w-0 rounded-lg bg-muted/30 px-3 py-2 text-xs text-muted-foreground shadow-sm">
          <button
            type="button"
            className="flex min-h-8 w-full items-center gap-2 text-left transition-colors hover:text-foreground"
            aria-expanded={expanded}
            onClick={() =>
              setExpandedAgentActivityIds((current) => ({
                ...current,
                [groupId]: !current[groupId],
              }))
            }
          >
            <ChevronRight
              className={`h-3.5 w-3.5 shrink-0 transition-transform ${
                expanded ? 'rotate-90' : ''
              }`}
            />
            <span className="shrink-0 font-semibold">Activity</span>
            <span className="min-w-0 flex-1 truncate">{agentActionLabel(displayActions)}</span>
            <span className="shrink-0 rounded-full bg-background/70 px-2 py-0.5 text-[11px]">{displayActions.length}</span>
          </button>
          {expanded && (
            <div className="mt-2 space-y-3 pl-5">
              {displayActions.map((action, index) => {
                const actionId = `${groupId}:action:${index}`;
                const actionExpanded = Boolean(expandedAgentActivityIds[actionId]);
                const actionLong = shouldCollapseRuntimeText(action.summary || '', AGENT_ACTION_COLLAPSE_CHARS);
                const actionSummary = actionExpanded
                  ? action.summary
                  : collapseRuntimeText(action.summary || '', AGENT_ACTION_COLLAPSE_CHARS);
                return (
                  <div key={`${action.kind}-${action.name}-${index}`} className="min-w-0 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                        {summarizeRuntimeAction(action)}
                      </span>
                      <Badge
                        variant={
                          action.status === 'error'
                            ? 'destructive'
                            : 'secondary'
                        }
                        className={
                          action.status === 'pending'
                            ? 'shrink-0 border-border/50 bg-muted/70 text-muted-foreground'
                            : 'shrink-0'
                        }
                      >
                        {action.status || action.kind}
                      </Badge>
                    </div>
                    {action.summary && (
                      <pre className="max-w-full whitespace-pre-wrap break-all font-mono text-[11px] leading-5 text-muted-foreground">
                        {actionSummary}
                      </pre>
                    )}
                    {actionLong && (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                        onClick={() =>
                          setExpandedAgentActivityIds((current) => ({
                            ...current,
                            [actionId]: !current[actionId],
                          }))
                        }
                      >
                        {actionExpanded ? 'Show less' : 'Show more'}
                        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${actionExpanded ? 'rotate-180' : ''}`} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderAgentMessage = (
    message: AgentRuntimeMessage,
    options: { compact?: boolean; confirmationChoices?: AgentConfirmationChoice[] } = {},
  ) => {
    const isUser = message.role === 'user';
    const isFailed = isUser && message.status === 'failed';
    const isSteering = isUser && String(message.status || '').toUpperCase() === 'STEERING';
    const isSystemError = message.role === 'system' && ['ERROR', 'WARNING'].includes(String(message.status || '').toUpperCase());
    const failedMessage = failedAgentMessages[message.id];
    const messageLong = shouldCollapseRuntimeText(message.content || '');
    const messageExpanded = Boolean(expandedAgentMessageIds[message.id]);
    const displayContent = messageExpanded ? message.content : collapseRuntimeText(message.content || '');
    const copied = copiedAgentMessageId === message.id;
    const roleLabel = isUser ? 'You' : message.role === 'assistant' ? 'Agent' : 'System';

    return (
      <div key={message.id} className={`flex gap-2 ${options.compact ? 'items-center' : 'items-start'} ${isUser ? 'justify-end' : 'justify-start'}`}>
        {isFailed && (
          <button
            type="button"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            title={failedMessage || 'Retry message'}
            disabled={sendingAgentMessage || !selectedAgentCanMessage}
            onClick={() => handleRetryAgentMessage(message)}
          >
            <AlertTriangle className="h-4 w-4" />
          </button>
        )}
        <div
          className={`${options.compact ? 'min-w-0 flex-1 rounded-md px-3 py-2' : 'max-w-[82%] rounded-lg px-4 py-3 shadow-sm'} text-sm leading-6 ${
            isUser
              ? 'bg-primary/15 text-foreground'
              : message.role === 'assistant'
                ? 'bg-muted/40 text-foreground'
                : isSystemError
                  ? 'border border-destructive/30 bg-destructive/10 text-destructive'
                  : 'bg-muted/20 text-muted-foreground'
          }`}
        >
          <div className="mb-1 flex items-center justify-between gap-3 text-[11px] uppercase text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              {isSystemError && <AlertTriangle className="h-3.5 w-3.5" />}
              {roleLabel}
              {isSteering && <span className="rounded-sm bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary">steer</span>}
            </span>
            <span className="flex items-center gap-2">
              <span>{new Date(message.createdAt).toLocaleTimeString()}</span>
              <button
                type="button"
                className="inline-flex h-6 w-6 items-center justify-center rounded-md transition-colors hover:bg-background/70 hover:text-foreground"
                title={copied ? 'Copied' : 'Copy message'}
                onClick={() => void handleCopyAgentMessage(message)}
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </span>
          </div>
          <div className="whitespace-pre-wrap break-words">{displayContent}</div>
          {messageLong && (
            <button
              type="button"
              className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
              onClick={() =>
                setExpandedAgentMessageIds((current) => ({
                  ...current,
                  [message.id]: !current[message.id],
                }))
              }
            >
              {messageExpanded ? 'Show less' : 'Show more'}
              <ChevronDown className={`h-4 w-4 transition-transform ${messageExpanded ? 'rotate-180' : ''}`} />
            </button>
          )}
          {!isUser && options.confirmationChoices?.length ? (
            <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
              {options.confirmationChoices.map((choice) => (
                <Button
                  key={choice.value}
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-auto min-h-8 max-w-full whitespace-normal rounded-md px-3 py-1.5 text-left text-xs leading-5"
                  disabled={sendingAgentMessage || !selectedAgentCanMessage}
                  onClick={() => handleAgentQuickReply(choice.value)}
                >
                  {choice.label}
                </Button>
              ))}
            </div>
          ) : null}
        </div>
      </div>
    );
  };

  const selectedAgentErrorDetail = useMemo(
    () => describeRuntimeError(selectedAgentRuntime?.session.lastError),
    [selectedAgentRuntime?.session.lastError],
  );

  const selectedAgentSkillSummaries = useMemo(() => {
    const selectedRole = selectedAgentRuntime?.role || selectedAgentMember?.role || '';
    const contractSkills = projectRoleContracts[selectedRole]?.skills || [];
    const byRef = new Map(contractSkills.map((skill) => [skill.ref, skill]));
    const skillRefs = selectedAgentRuntime?.session.skillBundleRefs?.length
      ? selectedAgentRuntime.session.skillBundleRefs
      : contractSkills.map((skill) => skill.ref);
    return skillRefs.map((ref) => {
      const known = byRef.get(ref);
      return {
        ref,
        name: known?.name || ref.replace(/^(skill|role-skill):\/\//, ''),
        source: known?.source || (ref.startsWith('role-skill://') ? 'role' : 'external'),
        description: known?.description || 'Attached to this project role.',
      };
    });
  }, [
    projectRoleContracts,
    selectedAgentMember?.role,
    selectedAgentRuntime?.role,
    selectedAgentRuntime?.session.skillBundleRefs,
  ]);

  const selectedAgentCapabilityRefs = useMemo(() => {
    const roleContract = projectRoleContracts[selectedAgentRuntime?.role || ''];
    return selectedAgentRuntime?.session.capabilityBundleRefs?.length
      ? selectedAgentRuntime.session.capabilityBundleRefs
      : roleContract?.capabilityBundleRefs || selectedAgentRuntime?.session.skillBundleRefs || [];
  }, [
    projectRoleContracts,
    selectedAgentRuntime?.role,
    selectedAgentRuntime?.session.capabilityBundleRefs,
    selectedAgentRuntime?.session.skillBundleRefs,
  ]);

  const agentConversationSessions = useMemo(() => {
    return selectedAgentConversations
      .map((conversation) => ({
        conversation,
        title: conversation.title || runtimeConversationTitle(conversation.messageHistory || [], 'New conversation'),
        messageCount: (conversation.messageHistory || []).filter((message) => message.role !== 'system').length,
        updatedAt: conversation.updatedAt,
      }))
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
  }, [selectedAgentConversations]);

  const launchDeploymentCost = useMemo(
    () => (launchMode === 'aws-ecs' ? Math.max(1, launchDeploymentDays) * AGENT_DEPLOYMENT_PRICE_PER_DAY : 0),
    [launchDeploymentDays, launchMode],
  );
  const launchImageOptions = useMemo(() => {
    const agentTypeImages = agentRuntimeImages.filter(
      (image) => (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === launchAgentType,
    );
    const matching = agentTypeImages.filter((image) => image.provider === launchMode);
    if (matching.length) return matching;
    if (launchMode === 'local-runner' || launchMode === 'local-codex') {
      return agentTypeImages.filter((image) => image.provider === 'local-docker');
    }
    return isCloudAgentLaunchMode(launchMode) ? [] : agentTypeImages;
  }, [agentRuntimeImages, launchAgentType, launchMode]);
  const launchProfilesForRole = useMemo(
    () => agentProfiles.filter((profile) => !pendingAgentLaunch?.role || profile.role === pendingAgentLaunch.role),
    [agentProfiles, pendingAgentLaunch?.role],
  );
  const selectedLaunchProfile = useMemo(
    () => agentProfiles.find((profile) => profile.id === selectedAgentProfileId) || null,
    [agentProfiles, selectedAgentProfileId],
  );
  const selectedLaunchProfileCloudUnavailable = isCloudAgentLaunchMode(selectedLaunchProfile?.launchMode);
  const selectedLaunchApiConfig = useMemo(
    () => apiConfigs.find((config) => config.id === launchLlmConfigId) || null,
    [apiConfigs, launchLlmConfigId],
  );
  const runtimeHasActiveRequest = (runtime?: ProjectAgentRuntime | null) =>
    runtime?.session.status === 'TYPING';
  const runtimeCanAcceptSteer = (runtime?: ProjectAgentRuntime | null) => {
    if (!runtime) return false;
    if (runtime.session.provider !== 'local-docker') return false;
    if ((runtime.session.agentType || '').toLowerCase() !== 'pi') return false;
    if (runtime.session.piBackend !== 'rpc') return false;
    if (!runtimeHasActiveRequest(runtime)) return false;
    const activeConversationId = runtime.session.activeRequestConversationId || runtime.session.activeConversationId || null;
    const selectedConversationId =
      selectedAgentConversation?.id ||
      runtime.session.activeConversationId ||
      normalizeRuntimeConversations(runtime.session)[0]?.id ||
      null;
    return Boolean(activeConversationId && selectedConversationId === activeConversationId);
  };
  const runtimeIsReachable = (runtime?: ProjectAgentRuntime | null) => {
    const session = runtime?.session;
    if (!runtime || !session) return false;
    const status = String(session.status || '').toUpperCase();
    if (status === 'STOPPED' || status === 'ERROR') return false;
    if (session.dockerStatus?.running === false || session.apiHealth?.ok === false) return false;
    if (session.dockerStatus?.running === true && session.apiHealth?.ok === true) return true;
    if (session.apiHealth?.ok === true && session.dockerStatus?.running !== false) return true;
    if (session.provider === 'local-docker') {
      return Boolean(session.apiBaseUrl && status !== 'STARTING');
    }
    return false;
  };

  const projectAgentChatMembers = useMemo(() => {
    return activeMembers
      .map((member) => {
        const runtime = runtimeByMemberId.get(member.id);
        const hasAgentRole = member.user.role === 'AI_AGENT' || member.role.includes('_AGENT') || Boolean(runtime);
        const isReachable = runtimeIsReachable(runtime);
        const isOffline = agentRuntimeIsOffline(runtime);
        const isOnline = Boolean(isReachable && runtime && runtime.session.status !== 'STOPPED');
        const isWorking = runtimeHasActiveRequest(runtime);
        const canSteer = runtimeCanAcceptSteer(runtime);
        return {
          member,
          runtime,
          hasAgentRole,
          isOffline,
          isOnline,
          canMessage: isReachable && runtime?.session.status !== 'STOPPED' && (!isWorking || canSteer) && !isReadOnly,
        };
      })
      .filter((item) => item.hasAgentRole)
      .sort((a, b) => {
        const aRank = agentConversationSortRank(a.member, a.runtime);
        const bRank = agentConversationSortRank(b.member, b.runtime);
        const offlineDelta = aRank.offlineRank - bRank.offlineRank;
        if (offlineDelta) return offlineDelta;
        const roleDelta = aRank.roleRank - bRank.roleRank;
        if (roleDelta) return roleDelta;
        const joinedDelta = aRank.joinedAt.localeCompare(bRank.joinedAt);
        if (joinedDelta) return joinedDelta;
        return aRank.name.localeCompare(bRank.name);
      });
  }, [activeMembers, isReadOnly, runtimeByMemberId, selectedAgentConversation?.id]);

  const leaderAgentMember = useMemo(
    () =>
      projectAgentChatMembers.find(({ member }) => member.role === 'LEAD_AGENT')?.member ||
      activeMembers.find((member) => member.role === 'LEAD_AGENT') ||
      null,
    [activeMembers, projectAgentChatMembers],
  );
  const leaderAgentRuntime = leaderAgentMember ? runtimeByMemberId.get(leaderAgentMember.id) || null : null;
  const leaderAgentIsSelected = Boolean(leaderAgentMember && selectedAgentMemberId === leaderAgentMember.id);

  const selectedAgentIsReachable = runtimeIsReachable(selectedAgentRuntime);
  const selectedAgentHasActiveRequest = runtimeHasActiveRequest(selectedAgentRuntime);
  const selectedAgentCanSteer = selectedAgentIsTyping && runtimeCanAcceptSteer(selectedAgentRuntime);
  const selectedAgentCanMessage = Boolean(
    selectedAgentIsReachable &&
      selectedAgentRuntime?.session.status !== 'STOPPED' &&
      (!selectedAgentHasActiveRequest || selectedAgentCanSteer) &&
      !isReadOnly,
  );
  const selectedAgentCanCreateConversation = Boolean(
    selectedAgentIsReachable &&
      selectedAgentRuntime?.session.status !== 'STOPPED' &&
      !isReadOnly,
  );
  const selectedAgentCanReconnect = Boolean(
    selectedAgentRuntime &&
      ['local-docker', 'local-runner', 'local-codex'].includes(selectedAgentRuntime.session.provider) &&
      !selectedAgentIsReachable &&
      selectedAgentRuntime.session.status !== 'TYPING' &&
      !isReadOnly,
  );
  const leaderAgentCanReconnect = Boolean(
    leaderAgentRuntime &&
      canReconnectAgentRuntime(leaderAgentRuntime) &&
      !runtimeIsReachable(leaderAgentRuntime) &&
      leaderAgentRuntime.session.status !== 'TYPING' &&
      !isReadOnly,
  );
  const selectedAgentMessagePlaceholder = selectedAgentIsTyping
    ? selectedAgentCanSteer
      ? 'Steer this response...'
      : 'Agent is responding...'
    : selectedAgentCanMessage
      ? 'Message this agent'
      : 'This agent is offline or unavailable';
  const selectedAgentHasSteerDraft = Boolean(selectedAgentCanSteer && (agentMessage.trim() || agentAttachments.length > 0));
  const selectedAgentWorkspaceFiles = selectedAgentRuntime
    ? agentWorkspaceFiles[selectedAgentRuntime.memberId] || []
    : [];
  const lastSelectedAgentMessage = selectedAgentMessages[selectedAgentMessages.length - 1];
  const selectedAgentMessageScrollKey = useMemo(
    () =>
      selectedAgentMessages
        .map((message) => `${message.id}:${message.role}:${message.content.length}`)
        .join('|'),
    [selectedAgentMessages],
  );

  useEffect(() => {
    setExpandedAgentActivityIds({});
  }, [selectedAgentRuntime?.memberId]);

  useEffect(() => {
    const memberId = selectedAgentRuntime?.memberId || '';
    const previous = previousSelectedAgentConnectionRef.current;
    const wasReachable = previous.memberId === memberId && previous.isReachable;

    if (memberId && agentRuntimePanel === 'runner' && selectedAgentIsReachable && !wasReachable) {
      setAgentRuntimePanel(null);
    }

    previousSelectedAgentConnectionRef.current = {
      memberId,
      isReachable: selectedAgentIsReachable,
    };
  }, [agentRuntimePanel, selectedAgentIsReachable, selectedAgentRuntime?.memberId]);

  useEffect(() => {
    const nextConversationId =
      selectedAgentConversations.find((conversation) => conversation.id === selectedAgentConversationId)?.id ||
      preferredActiveRuntimeConversationId(selectedAgentRuntime?.session) ||
      selectedAgentConversations[0]?.id ||
      '';
    if (nextConversationId !== selectedAgentConversationId) {
      setSelectedAgentConversationId(nextConversationId);
    }
  }, [
    selectedAgentConversationId,
    selectedAgentConversations,
    selectedAgentRuntime?.memberId,
    selectedAgentRuntime?.session.activeConversationId,
    selectedAgentRuntime?.session.activeRequestConversationId,
    selectedAgentRuntime?.session.status,
  ]);

  useEffect(() => {
    setAgentMessage(readAgentMessageDraft(selectedAgentDraftKey));
  }, [selectedAgentDraftKey]);

  useEffect(() => {
    if (agentRuntimePanel === 'polling' && selectedAgentMemberId) {
      const source = agentPollingDraftSourceRef.current;
      const draftSignature = agentPollingConfigSignature(agentPollingDraft);
      const hasLocalEdits =
        source.memberId === selectedAgentMemberId &&
        Boolean(source.signature) &&
        draftSignature !== source.signature;
      const shouldHydrateDraft =
        source.memberId !== selectedAgentMemberId ||
        (!hasLocalEdits && source.signature !== selectedAgentPollingConfigSignature);
      if (!shouldHydrateDraft) return;
      setAgentPollingDraft(selectedAgentPollingConfig);
      agentPollingDraftSourceRef.current = {
        memberId: selectedAgentMemberId,
        signature: selectedAgentPollingConfigSignature,
      };
    }
  }, [
    agentRuntimePanel,
    selectedAgentMemberId,
    selectedAgentPollingConfig,
    selectedAgentPollingConfigSignature,
    agentPollingDraft,
  ]);

  useEffect(() => {
    if (agentRuntimePanel === 'prompt') {
      setAgentPromptDraft(selectedAgentEffectivePrompt);
    }
  }, [agentRuntimePanel, selectedAgentMemberId, selectedAgentEffectivePrompt]);

  useEffect(() => {
    if (agentRuntimePanel !== 'skills' || !id || !selectedAgentMember) return;
    const role = selectedAgentMember.role;
    const contractRefs = projectRoleContracts[role]?.skills?.map((skill) => skill.ref) || [];
    setAgentSkillRefsDraft((selectedAgentRuntime?.session.skillBundleRefs?.length
      ? selectedAgentRuntime.session.skillBundleRefs
      : contractRefs
    ).join('\n'));
    setLoadingAgentSkillsRole(role);
    api.projects.roles.getSkills(id, role)
      .then((result) => {
        setAgentSkillRefsDraft((result.roleConfig.skillBundleRefs || []).join('\n'));
        setAgentSkillDetails(result.skills || []);
        const nextRef =
          (selectedAgentSkillRef && (result.skills || []).some((skill) => skill.ref === selectedAgentSkillRef)
            ? selectedAgentSkillRef
            : result.skills?.[0]?.ref) || '';
        setSelectedAgentSkillRef(nextRef);
        setAgentSkillMarkdownDraft((result.skills || []).find((skill) => skill.ref === nextRef)?.content || '');
      })
      .catch((err: any) => {
        setError(err.message || 'Failed to load role skills');
      })
      .finally(() => setLoadingAgentSkillsRole(''));
  }, [
    agentRuntimePanel,
    id,
    projectRoleContracts,
    selectedAgentMemberId,
    selectedAgentMember?.role,
    selectedAgentRuntime?.session.skillBundleRefs,
  ]);

  useEffect(() => {
    window.requestAnimationFrame(() => {
      document.querySelectorAll<HTMLElement>('[data-agent-message-list="true"]').forEach((element) => {
        element.scrollTop = element.scrollHeight;
      });
    });
  }, [
    selectedAgentMemberId,
    selectedAgentConversation?.id,
    selectedAgentMessageScrollKey,
    lastSelectedAgentMessage?.id,
    selectedAgentIsTyping,
    sendingAgentMessage,
  ]);

  const aiAgentUserIds = useMemo(() => {
    return new Set(
      activeMembers
        .filter((member) => member.user.role === 'AI_AGENT' || member.role.includes('_AGENT'))
        .map((member) => member.userId),
    );
  }, [activeMembers]);

  const isAgentGeneratedWorkItem = (item: ProjectWorkItem) => {
    const inputPacket = item.inputPacket as Record<string, unknown> | null | undefined;
    const linkedFeature = item.featureId ? featureById.get(item.featureId) : null;
    const featureSpec =
      linkedFeature && typeof linkedFeature === 'object' && linkedFeature
        ? ((linkedFeature as any).spec as Record<string, unknown> | undefined)
        : undefined;
    return Boolean(
      aiAgentUserIds.has(item.createdById || '') ||
        inputPacket?.source === 'agent-runtime' ||
        inputPacket?.source === 'hermes-agent-smoke' ||
        featureSpec?.source === 'agent-runtime' ||
        featureSpec?.source === 'hermes-agent-smoke',
    );
  };

  const isAgentGeneratedFeature = (feature: ProjectFeatureOption | null | undefined) => {
    const spec = feature?.spec as Record<string, unknown> | null | undefined;
    return Boolean(spec?.source === 'agent-runtime' || spec?.source === 'hermes-agent-smoke');
  };

  const openAssignmentsForItem = (item?: ProjectWorkItem | null) =>
    (item?.assignments || []).filter((assignment: any) => OPEN_ASSIGNMENT_STATUSES.includes(assignment.status));

  const activeAgentsForItem = (item?: ProjectWorkItem | null) =>
    (item?.assignments || []).filter((assignment: any) => assignment.status === 'ACTIVE');

  const formatAssigneeName = (assignment: any) =>
    assignment?.assigneeUser?.displayName || assignment?.assigneeUser?.email || 'Unassigned agent';

  const formatAssignedByName = (assignment: any) =>
    assignment?.assignedByUser?.displayName || assignment?.assignedByUser?.email || 'System';

  const formatAssignmentStatusLabel = (status?: string | null) => {
    if (status === 'ACTIVE') return 'Working';
    if (status === 'COMPLETED') return 'Completed';
    if (status === 'FAILED') return 'Failed';
    if (status === 'PROPOSED') return 'Proposed';
    if (status === 'PAUSED') return 'Paused';
    return status || 'Assignment';
  };

  const formatReviewActor = (review: any) =>
    review?.reviewerUser?.displayName || review?.reviewerUser?.email || review?.reviewerType || 'Reviewer';

  const formatMemberName = (member: ProjectMember) => formatAgentDisplayName(member);

  const formatWorkItemOwnerName = (item?: ProjectWorkItem | null) => {
    if (!item?.ownerId) return '';
    if (item.ownerId === user?.id) return 'Owner (you)';
    return item.owner?.displayName || item.owner?.email || (item.ownerId === project?.ownerId ? 'Project owner' : 'Owner');
  };

  const handleAgentMessageChange = (value: string) => {
    setAgentMessage(value);
    writeAgentMessageDraft(selectedAgentDraftKey, value);
    updateProjectFileMentionState('agentMessage', value);
  };

  const clearSelectedAgentMessageDraft = (draftKey = selectedAgentDraftKey) => {
    setAgentMessage('');
    removeAgentMessageDraft(draftKey);
  };

  const handleSelectAgentRuntime = (memberId: string) => {
    setSelectedAgentMemberId(memberId);
    setSelectedAgentConversationId('');
    setAgentMessageResponse('');
    setAgentAttachments([]);
    setAgentRuntimePanel(null);
    setCoordinatorConfigOpen(false);
  };

  const handleOpenLeaderChat = () => {
    if (!leaderAgentMember) return;
    if (selectedAgentMemberId !== leaderAgentMember.id) {
      handleSelectAgentRuntime(leaderAgentMember.id);
    }
  };

  const handleSelectAgentConversation = (conversationId: string) => {
    setSelectedAgentConversationId(conversationId);
    setAgentMessageResponse('');
    setAgentAttachments([]);
    setPendingDeleteAgentConversationId('');
    setEditingAgentConversationId('');
  };

  const handleAgentHistoryResizeStart = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    setAgentHistoryOpen(true);
    const startX = event.clientX;
    const startWidth = agentHistoryOpen ? agentHistoryWidth : 184;
    const handleMove = (moveEvent: MouseEvent) => {
      const nextWidth = Math.min(300, Math.max(156, startWidth + moveEvent.clientX - startX));
      setAgentHistoryWidth(nextWidth);
    };
    const handleUp = () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
  };

  const handleStartRenameAgentConversation = (conversation: ProjectAgentRuntimeConversation, title: string) => {
    if (isReadOnly) return;
    setEditingAgentConversationId(conversation.id);
    setAgentConversationTitleDraft(title);
    setPendingDeleteAgentConversationId('');
  };

  const handleSaveAgentConversationTitle = async (conversationId: string) => {
    if (!id || !selectedAgentRuntime || savingAgentConversationId) return;
    const title = agentConversationTitleDraft.trim();
    if (!title) {
      setEditingAgentConversationId('');
      return;
    }
    setSavingAgentConversationId(conversationId);
    setError('');
    try {
      const result = await api.projects.agentRuntimes.updateConversation(
        id,
        selectedAgentRuntime.memberId,
        conversationId,
        { title },
      );
      updateAgentRuntimeSession(result.memberId, result.role, result.session);
      setEditingAgentConversationId('');
      setAgentConversationTitleDraft('');
    } catch (err: any) {
      setError(err.message || 'Failed to rename conversation');
    } finally {
      setSavingAgentConversationId('');
    }
  };

  const handleDeleteAgentConversation = async (conversationId: string) => {
    if (!id || !selectedAgentRuntime || deletingAgentConversationId) return;
    setDeletingAgentConversationId(conversationId);
    setError('');
    try {
      const result = await api.projects.agentRuntimes.deleteConversation(id, selectedAgentRuntime.memberId, conversationId);
      updateAgentRuntimeSession(result.memberId, result.role, result.session);
      const conversations = normalizeRuntimeConversations(result.session);
      setSelectedAgentConversationId(result.session.activeConversationId || conversations[0]?.id || '');
      setPendingDeleteAgentConversationId('');
      setEditingAgentConversationId('');
    } catch (err: any) {
      setError(err.message || 'Failed to delete conversation');
    } finally {
      setDeletingAgentConversationId('');
    }
  };

  const handleCreateAgentConversation = async () => {
    if (!id || !selectedAgentRuntime || creatingAgentConversation || !selectedAgentCanCreateConversation) return;
    const memberId = selectedAgentRuntime.memberId;
    setCreatingAgentConversation(true);
    setAgentMessageResponse('Starting new conversation...');
    setError('');
    try {
      const result = await api.projects.agentRuntimes.createConversation(id, memberId);
      updateAgentRuntimeSession(result.memberId, result.role, result.session);
      setSelectedAgentConversationId(result.conversation.id);
      setAgentMessage('');
      setAgentAttachments([]);
      setAgentMessageResponse(result.response || 'New conversation started.');
    } catch (err: any) {
      setAgentMessageResponse(err.message || 'Failed to start new conversation');
      setError(err.message || 'Failed to start new conversation');
    } finally {
      setCreatingAgentConversation(false);
    }
  };

  const applyAgentPollingResult = (
    memberId: string,
    config?: ProjectAgentPollingConfig,
    session?: ProjectAgentRuntimeSession | null,
  ) => {
    if (config) {
      setProject((current: any) => {
        if (!current?.members) return current;
        return {
          ...current,
          members: current.members.map((member: ProjectMember) => {
            if (member.id !== memberId) return member;
            const permissions = isPlainRecord(member.permissions) ? member.permissions : {};
            return {
              ...member,
              permissions: {
                ...permissions,
                agentPollingConfig: config,
              },
            };
          }),
        };
      });
    }
    if (session) {
      updateAgentRuntimeSession(memberId, undefined, session);
    }
  };

  const saveAgentPollingConfig = async (
    memberId: string,
    config: ProjectAgentPollingConfig,
    options: { quiet?: boolean } = {},
  ) => {
    if (!id || savingAgentPollingMemberId) return null;
    setSavingAgentPollingMemberId(memberId);
    if (!options.quiet) {
      setAgentMessageResponse('Saving polling config...');
    }
    setError('');
    try {
      const result = await api.projects.members.updatePolling(id, memberId, config);
      applyAgentPollingResult(result.memberId, result.config, result.session);
      const savedConfig = normalizeAgentPollingConfig(result.config);
      agentPollingDraftSourceRef.current = {
        memberId: result.memberId,
        signature: agentPollingConfigSignature(savedConfig),
      };
      setAgentPollingDraft(savedConfig);
      if (!options.quiet) {
        setAgentMessageResponse(result.response || 'Polling config saved.');
      }
      return result;
    } catch (err: any) {
      const message = err.message || 'Failed to save polling config';
      if (!options.quiet) {
        setAgentMessageResponse(message);
      }
      setError(message);
      return null;
    } finally {
      setSavingAgentPollingMemberId('');
    }
  };

  const handleToggleAgentPolling = async (member: ProjectMember, runtime?: ProjectAgentRuntime | null) => {
    if (isReadOnly || savingAgentPollingMemberId === member.id) return;
    const current = agentPollingConfigFor(member, runtime);
    await saveAgentPollingConfig(member.id, { ...current, enabled: !current.enabled });
  };

  const handleSaveAgentPollingDraft = async () => {
    if (!selectedAgentMember) return;
    await saveAgentPollingConfig(selectedAgentMember.id, agentPollingDraft);
  };

  const handleRunAgentPollingNow = async (
    targetMember: ProjectMember | null = selectedAgentMember || null,
    targetRuntime: ProjectAgentRuntime | null = selectedAgentRuntime || null,
  ) => {
    if (!id || !targetMember || runningAgentPollingMemberId || isReadOnly) return;
    const memberId = targetMember.id;
    setRunningAgentPollingMemberId(memberId);
    setAgentMessageResponse('Running polling now...');
    setError('');
    try {
      const usingSelectedAgent = selectedAgentMember?.id === memberId;
      let config = usingSelectedAgent
        ? selectedAgentPollingConfig
        : agentPollingConfigFor(targetMember, targetRuntime);
      const draftSignature = usingSelectedAgent ? agentPollingConfigSignature(agentPollingDraft) : '';
      const savedSignature = usingSelectedAgent ? agentPollingConfigSignature(selectedAgentPollingConfig) : '';
      const shouldSaveSelectedDraft = usingSelectedAgent && draftSignature !== savedSignature;
      if (shouldSaveSelectedDraft) {
        const saved = await saveAgentPollingConfig(memberId, agentPollingDraft, { quiet: true });
        if (saved?.config) {
          config = normalizeAgentPollingConfig(saved.config);
        }
      }
      if (!config.message.trim()) {
        throw new Error('Polling message is required before running now.');
      }
      let result = await api.projects.agentRuntimes.tickPolling(id, memberId, { force: true, summary: true });
      let reconnectedBeforePolling = false;
      if (!result.triggered && isRuntimeNotReachableReason(result.reason) && canReconnectAgentRuntime(targetRuntime)) {
        setAgentMessageResponse('Runtime was stale; reconnecting before polling...');
        setReconnectingMemberId(memberId);
        try {
          const reconnectResult = await api.projects.agentRuntimes.reconnect(id, memberId);
          updateAgentRuntimeSession(reconnectResult.memberId, reconnectResult.role, reconnectResult.session);
          reconnectedBeforePolling = true;
          await new Promise<void>((resolve) => window.setTimeout(resolve, 2500));
          result = await api.projects.agentRuntimes.tickPolling(id, memberId, { force: true, summary: true });
        } finally {
          setReconnectingMemberId('');
        }
      }
      applyAgentPollingResult(result.memberId, result.config, result.session || null);
      setAgentMessageResponse(
        result.triggered
          ? reconnectedBeforePolling
            ? 'Runtime reconnected and polling run started.'
            : 'Polling run started.'
          : reconnectedBeforePolling
            ? (result.reason || 'Runtime reconnected, but polling did not start yet.')
            : (result.reason || 'Polling did not start.'),
      );
      await loadProject();
    } catch (err: any) {
      const message = err.message || 'Failed to run polling now';
      setAgentMessageResponse(message);
      setError(message);
    } finally {
      setRunningAgentPollingMemberId('');
    }
  };

  const handleRefreshProjectTemplate = async () => {
    if (!id || isReadOnly || refreshingProjectTemplate) return;
    setRefreshingProjectTemplate(true);
    setAgentMessageResponse('Refreshing project template roles...');
    setError('');
    try {
      const result = await api.projects.refreshTemplate(id, { applyToRunning: true });
      setProject((current: any) => current ? { ...current, settings: result.settings } : current);
      setAgentMessageResponse(
        `Template roles refreshed for ${result.refreshedRoles.length} role${result.refreshedRoles.length === 1 ? '' : 's'}.`,
      );
      await loadProject();
    } catch (err: any) {
      const message = err.message || 'Failed to refresh project template';
      setError(message);
      setAgentMessageResponse(message);
    } finally {
      setRefreshingProjectTemplate(false);
    }
  };

  const handleSaveAgentPromptDraft = async (reset = false) => {
    if (!id || !selectedAgentMember || isReadOnly || savingAgentPromptRole) return;
    const role = selectedAgentMember.role;
    setSavingAgentPromptRole(role);
    setError('');
    try {
      const result = await api.projects.roles.updatePrompt(id, role, {
        initialPrompt: reset ? null : agentPromptDraft,
        reset,
        applyToRunning: true,
      });
      setProject((current: any) => current ? { ...current, settings: result.settings } : current);
      setAgentRuntimes((current) =>
        current.map((runtime) => {
          if (runtime.role !== role || !result.updatedRuntimeMemberIds.includes(runtime.memberId)) return runtime;
          return {
            ...runtime,
            session: {
              ...runtime.session,
              rolePrompt: result.roleConfig.initialPrompt || null,
              updatedAt: new Date().toISOString(),
            },
          };
        }),
      );
      setAgentPromptDraft(result.roleConfig.initialPrompt || '');
      setAgentMessageResponse(reset ? 'Role prompt reset.' : 'Role prompt saved.');
      await loadProject();
    } catch (err: any) {
      const message = err.message || 'Failed to save role prompt';
      setError(message);
      setAgentMessageResponse(message);
    } finally {
      setSavingAgentPromptRole('');
    }
  };

  const handleSelectAgentSkill = (ref: string) => {
    setSelectedAgentSkillRef(ref);
    setAgentSkillMarkdownDraft(agentSkillDetails.find((skill) => skill.ref === ref)?.content || '');
  };

  const handleSaveAgentSkillsDraft = async (reset = false) => {
    if (!id || !selectedAgentMember || isReadOnly || savingAgentSkillsRole) return;
    const role = selectedAgentMember.role;
    const skillBundleRefs = agentSkillRefsDraft
      .split(/\r?\n|,/)
      .map((ref) => ref.trim())
      .filter(Boolean);
    setSavingAgentSkillsRole(role);
    setError('');
    try {
      const result = await api.projects.roles.updateSkills(id, role, {
        skillBundleRefs,
        skillMarkdownByRef: !reset && selectedAgentSkillRef ? { [selectedAgentSkillRef]: agentSkillMarkdownDraft } : undefined,
        reset,
        applyToRunning: true,
      });
      setProject((current: any) => current ? { ...current, settings: result.settings } : current);
      setAgentRuntimes((current) =>
        current.map((runtime) => {
          if (runtime.role !== role || !result.updatedRuntimeMemberIds.includes(runtime.memberId)) return runtime;
          return {
            ...runtime,
            session: {
              ...runtime.session,
              skillBundleRefs: result.roleConfig.skillBundleRefs || [],
              capabilityBundleRefs: result.roleConfig.capabilityBundleRefs || runtime.session.capabilityBundleRefs,
              updatedAt: new Date().toISOString(),
            },
          };
        }),
      );
      setAgentSkillRefsDraft((result.roleConfig.skillBundleRefs || []).join('\n'));
      setAgentSkillDetails(result.skills || []);
      const nextRef = reset ? result.skills?.[0]?.ref || '' : selectedAgentSkillRef || result.skills?.[0]?.ref || '';
      setSelectedAgentSkillRef(nextRef);
      setAgentSkillMarkdownDraft((result.skills || []).find((skill) => skill.ref === nextRef)?.content || '');
      setAgentMessageResponse(reset ? 'Role skills reset.' : 'Role skills saved.');
      await loadProject();
    } catch (err: any) {
      const message = err.message || 'Failed to save role skills';
      setError(message);
      setAgentMessageResponse(message);
    } finally {
      setSavingAgentSkillsRole('');
    }
  };

  const loadAgentWorkspaceFiles = async (memberId: string) => {
    if (!id || !memberId) return;
    setLoadingAgentWorkspaceFiles(true);
    try {
      const result = await api.projects.agentRuntimes.workspaceFiles(id, memberId, { maxDepth: '6' });
      setAgentWorkspaceFiles((current) => ({
        ...current,
        [memberId]: result.files || [],
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load agent workspace files');
    } finally {
      setLoadingAgentWorkspaceFiles(false);
    }
  };

  const handleDownloadAgentWorkspaceFile = async (memberId: string, filePath: string) => {
    if (!id || !memberId || !filePath) return;
    setDownloadingAgentWorkspaceFile(filePath);
    try {
      const result = await api.projects.agentRuntimes.downloadWorkspaceFile(id, memberId, filePath);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || filePath.split('/').pop() || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download workspace file');
    } finally {
      setDownloadingAgentWorkspaceFile('');
    }
  };

  useEffect(() => {
    if (agentRuntimePanel !== 'workspace' || !selectedAgentRuntime || isReadOnly) return;
    void loadAgentWorkspaceFiles(selectedAgentRuntime.memberId);
  }, [agentRuntimePanel, selectedAgentRuntime?.memberId, isReadOnly]);

  const handleAgentAttachmentChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setUploadingAgentAttachment(true);
    setAgentMessageResponse(`Uploading ${files.length} file${files.length > 1 ? 's' : ''}...`);
    try {
      const uploaded: AgentMessageAttachment[] = [];
      for (const file of files) {
        const result = await api.files.upload(file);
        uploaded.push({
          name: file.name,
          size: file.size,
          url: result.url,
          key: result.key,
        });
      }
      setAgentAttachments((current) => [...current, ...uploaded]);
      setAgentMessageResponse(`${uploaded.length} attachment${uploaded.length > 1 ? 's' : ''} ready.`);
    } catch (err: any) {
      setAgentMessageResponse(err.message || 'Attachment upload failed');
      setError(err.message || 'Attachment upload failed');
    } finally {
      setUploadingAgentAttachment(false);
    }
  };

  const removeAgentAttachment = (key: string) => {
    setAgentAttachments((current) => current.filter((attachment) => attachment.key !== key));
  };

  const refreshProjectFileIndex = async () => {
    if (!id || !canAccessProjectFiles) return;
    const res = await api.projects.files.list(id, { limit: '300', recursive: 'true' });
    setAllProjectFiles(res.files || []);
  };

  const loadProjectFiles = async (query = projectFileSearch, prefix = projectFilePrefix) => {
    if (!id || !canAccessProjectFiles) return;
    const search = query.trim();
    const normalizedPrefix = normalizeProjectFileFolderPath(prefix);
    setLoadingProjectFiles(true);
    setError('');
    try {
      const res = await api.projects.files.list(id, {
        limit: search ? '300' : '100',
        ...(normalizedPrefix ? { prefix: normalizedPrefix } : {}),
        recursive: search ? 'true' : 'false',
        ...(search ? { q: search } : {}),
      });
      setProjectFolders(search ? [] : res.folders || []);
      const items = res.files || [];
      const visibleFiles = projectDirectoryFiles({ folders: search ? [] : res.folders || [], files: items });
      setProjectFiles(visibleFiles);
      setSelectedProjectFile((current) => {
        if (!current) return null;
        return visibleFiles.find((file) => file.key === current.key) || null;
      });
    } catch (err: any) {
      setError(err.message || 'Failed to load project resources');
    } finally {
      setLoadingProjectFiles(false);
    }
  };

  const uploadProjectFileCandidates = async (candidates: ProjectFileUploadCandidate[]) => {
    if (!id || !candidates.length || !canAccessProjectFiles) return;
    setUploadingProjectFile(true);
    setError('');
    try {
      for (const candidate of candidates) {
        await api.projects.files.upload(
          id,
          candidate.file,
          joinProjectFilePath(projectFilePrefix, candidate.relativePath || candidate.file.name),
        );
      }
      await loadProjectFiles('', projectFilePrefix);
      await refreshProjectFileIndex();
      setProjectFileSearch('');
    } catch (err: any) {
      setError(err.message || 'Project file upload failed');
    } finally {
      setUploadingProjectFile(false);
    }
  };

  const handleProjectFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!id || !files.length || !canAccessProjectFiles) return;
    await uploadProjectFileCandidates(files.map((file) => ({ file, relativePath: file.name })));
  };

  const handleProjectFileDrop = async (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    setProjectFileDragActive(false);
    if (!id || !canAccessProjectFiles || uploadingProjectFile) return;
    const candidates = await collectDroppedProjectFiles(event.dataTransfer);
    await uploadProjectFileCandidates(candidates);
  };

  const handleProjectFileDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (!uploadingProjectFile) setProjectFileDragActive(true);
  };

  const handleProjectFileDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setProjectFileDragActive(false);
  };

  const navigateProjectFiles = async (prefix: string) => {
    const normalized = prefix.replace(/^\/+|\/+$/g, '');
    setProjectFilePrefix(normalized);
    setProjectFileSearch('');
    setSelectedProjectFile(null);
    await loadProjectFiles('', normalized);
  };

  const handleCreateProjectFolder = async () => {
    if (!id || !newProjectFolderName.trim() || !canAccessProjectFiles) return;
    const folderPath = joinProjectFilePath(projectFilePrefix, cleanProjectFolderName(newProjectFolderName));
    setCreatingProjectFolder(true);
    setError('');
    try {
      await api.projects.files.createFolder(id, folderPath);
      setNewProjectFolderName('');
      await loadProjectFiles('', projectFilePrefix);
    } catch (err: any) {
      setError(err.message || 'Failed to create folder');
    } finally {
      setCreatingProjectFolder(false);
    }
  };

  const handleDeleteProjectFolder = async (folder: ProjectFolderEntry) => {
    if (!id) return;
    if (!window.confirm(`Delete folder "${folder.path}" and all files inside it?`)) return;
    setError('');
    try {
      await api.projects.files.delete(id, folder.path, true);
      await loadProjectFiles('', projectFilePrefix);
      await refreshProjectFileIndex();
    } catch (err: any) {
      setError(err.message || 'Failed to delete folder');
    }
  };

  const handleDeleteProjectFile = async (file: ProjectFileEntry) => {
    if (!id) return;
    if (!window.confirm(`Delete "${file.path}"?`)) return;
    setError('');
    try {
      await api.projects.files.delete(id, file.path);
      setSelectedProjectFile((current) => (current?.key === file.key ? null : current));
      await loadProjectFiles(projectFileSearch, projectFilePrefix);
      await refreshProjectFileIndex();
    } catch (err: any) {
      setError(err.message || 'Failed to delete project file');
    }
  };

  const handleDownloadProjectFile = async (filePath: string) => {
    if (!id) return;
    try {
      const result = await api.projects.files.download(id, filePath);
      const url = URL.createObjectURL(result.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = result.filename || filePath.split('/').pop() || 'download';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      setError(err.message || 'Failed to download project file');
    }
  };

  const loadProjectFilePreview = async (file: ProjectFileEntry) => {
    if (!id) return;
    setProjectFilePreviewUrl('');
    setProjectFilePreviewText('');
    setProjectFilePreviewError('');
    setLoadingProjectFilePreview(true);
    try {
      const kind = projectFilePreviewKind(file);
      if (kind === 'text') {
        const preview = await api.projects.files.read(id, file.path, 'text');
        setProjectFilePreviewText(preview.content || '');
      } else if (kind === 'image' || kind === 'pdf') {
        const result = await api.projects.files.downloadUrl(id, file.path);
        setProjectFilePreviewUrl(result.url);
      }
    } catch (err: any) {
      const message = err.message || 'Failed to preview project file';
      setProjectFilePreviewError(message);
      setError(message);
    } finally {
      setLoadingProjectFilePreview(false);
    }
  };

  const handleSelectProjectFile = async (file: ProjectFileEntry) => {
    if (!id) return;
    setProjectFilePreviewError('');
    setError('');
    if (file.type === 'folder') {
      const nextPrefix = normalizeProjectFileFolderPath(file.path);
      setProjectFilePrefix(nextPrefix);
      setSelectedProjectFile(null);
      setLoadingProjectFilePreview(false);
      await loadProjectFiles(projectFileSearch, nextPrefix);
      return;
    }
    setSelectedProjectFile(file);
    await loadProjectFilePreview(file);
  };

  const handleOpenWorkItemProjectFilePreview = async (file: ProjectFileEntry) => {
    if (!id || !canAccessProjectFiles || file.type === 'folder') return;
    const normalizedPath = normalizeProjectFileFolderPath(file.path);
    const indexedFile = allProjectFiles.find((entry) => normalizeProjectFileFolderPath(entry.path) === normalizedPath);
    const previewFile: ProjectFileEntry = {
      ...file,
      ...(indexedFile || {}),
      path: indexedFile?.path || file.path,
      key: indexedFile?.key || file.key || file.path,
      size: indexedFile?.size ?? file.size ?? 0,
      type: indexedFile?.type || file.type || 'file',
    };
    setWorkItemProjectFilePreview(previewFile);
    setSelectedProjectFile(previewFile);
    setError('');
    await loadProjectFilePreview(previewFile);
  };

  const handleOpenProjectFileInResources = async (file: ProjectFileEntry) => {
    if (!id || !canAccessProjectFiles || file.type === 'folder') return;
    const normalizedPath = normalizeProjectFileFolderPath(file.path);
    const indexedFile = allProjectFiles.find((entry) => normalizeProjectFileFolderPath(entry.path) === normalizedPath);
    const previewFile: ProjectFileEntry = {
      ...file,
      ...(indexedFile || {}),
      path: indexedFile?.path || normalizedPath || file.path,
      key: indexedFile?.key || file.key || normalizedPath || file.path,
      size: indexedFile?.size ?? file.size ?? 0,
      type: indexedFile?.type || file.type || 'file',
    };
    const nextPrefix = parentProjectFilePrefix(previewFile.path);
    setWorkItemProjectFilePreview(null);
    setActiveProjectSection('documents');
    setProjectFilePrefix(nextPrefix);
    setProjectFileSearch('');
    setSelectedProjectFile(previewFile);
    setProjectFilePreviewError('');
    setError('');
    const params = new URLSearchParams(location.search);
    params.set('section', projectSectionUrlParam('documents'));
    params.delete('view');
    params.delete('item');
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
    await loadProjectFiles('', nextPrefix);
    await loadProjectFilePreview(previewFile);
  };

  const buildAgentMessagePayload = (text: string, attachments: AgentMessageAttachment[]) => {
    if (!attachments.length) return text;
    const attachmentLines = attachments.map((attachment) => `- ${attachment.name}: ${attachment.url}`);
    const attachmentBlock = `Attached files:\n${attachmentLines.join('\n')}`;
    return text ? `${text}\n\n${attachmentBlock}` : `I've attached ${attachments.length} file(s):\n${attachmentLines.join('\n')}`;
  };

  const collaborationRisks = useMemo(() => {
    const risks: Array<{ title: string; detail: string; level: 'warning' | 'destructive' | 'secondary' }> = [];
    const resourceRequests = ownerResourceWorkItems;
    const ownerActions = ownerActionWorkItems;
    const unassignedReady = workItems.filter(
      (item) =>
        ['READY', 'DRAFT'].includes(item.status) &&
        !(item.assignments || []).length &&
        !item.ownerId &&
        !getWorkItemResourceRequest(item) &&
        !getWorkItemOwnerAction(item),
    );
    const blocked = workItems.filter((item) => ['NEEDS_REVISION', 'REJECTED'].includes(item.status));
    const runningWithoutArtifact = workItems.filter(
      (item) => ['IN_PROGRESS', 'IN_REVIEW'].includes(item.status) && !(item._count?.artifacts || 0),
    );
    const openQuestions = memories.filter((memory) => ['RISK', 'OPEN_QUESTION'].includes(memory.memoryType));

    if (resourceRequests.length) {
      risks.push({
        title: `${resourceRequests.length} owner resource${resourceRequests.length > 1 ? 's' : ''} need values`,
        detail: 'Fill these first so current and future agent runtimes receive the required project globals.',
        level: 'warning',
      });
    }
    if (ownerActions.length) {
      risks.push({
        title: `${ownerActions.length} owner action${ownerActions.length > 1 ? 's' : ''} need confirmation`,
        detail: 'Complete these manual or approval steps so dependent agent work can continue.',
        level: 'warning',
      });
    }
    if (unassignedReady.length) {
      risks.push({
        title: `${unassignedReady.length} work item${unassignedReady.length > 1 ? 's' : ''} need dispatch`,
        detail: 'Lead or planner should attach an assignee and task packet.',
        level: 'warning',
      });
    }
    if (blocked.length) {
      risks.push({
        title: `${blocked.length} item${blocked.length > 1 ? 's' : ''} need rework`,
        detail: 'Reviewer feedback or CI failure should create a fresh packet.',
        level: 'destructive',
      });
    }
    if (runningWithoutArtifact.length) {
      risks.push({
        title: `${runningWithoutArtifact.length} active item${runningWithoutArtifact.length > 1 ? 's' : ''} lack handoff evidence`,
        detail: 'Workers should attach artifacts, PR links, or run summaries.',
        level: 'secondary',
      });
    }
    if (openQuestions.length) {
      risks.push({
        title: `${openQuestions.length} project memory note${openQuestions.length > 1 ? 's' : ''} flagged as risk/question`,
        detail: 'Owner or lead should resolve these before broad dispatch.',
        level: 'warning',
      });
    }
    return risks;
  }, [ownerActionWorkItems, ownerResourceWorkItems, workItems, memories]);

  const contextLayers = useMemo(() => {
    const packetCount = activeAssignments.filter((assignment: any) => assignment.contextPacket).length;
    return [
      {
        label: 'L1 Brief',
        value: project?.brief || project?.summary ? 'Ready' : 'Missing',
        detail: project?.brief || project?.summary || 'Add a concise project brief before dispatch.',
        icon: Brain,
      },
      {
        label: 'L2 Shared Memory',
        value: `${memories.length}`,
        detail: memories.length ? 'Reusable facts, decisions, constraints, and risks.' : 'No durable memory has been written yet.',
        icon: ShieldCheck,
      },
      {
        label: 'L3 Task Packets',
        value: `${packetCount}/${activeAssignments.length || 0}`,
        detail: activeAssignments.length ? 'Active assignments should carry scoped packets.' : 'Dispatch a member to create the first packet.',
        icon: Inbox,
      },
      {
        label: 'L4 Handoffs',
        value: `${handoffArtifacts.length}`,
        detail: handoffArtifacts.length ? 'Delivery evidence is available for review.' : 'Workers have not submitted handoff artifacts yet.',
        icon: GitPullRequest,
      },
    ];
  }, [activeAssignments, handoffArtifacts.length, memories.length, project?.brief, project?.summary]);

  const workflowProgress = useMemo(() => {
    const hasPlan = (project?.goals?.length || 0) > 0 || homeWorkItemsForUi.length > 0;
    const hasDispatch = activeAssignments.length > 0 || homeWorkItemsForUi.some((item) => (item._count?.assignments || 0) > 0);
    const hasExecution = homeWorkItemsForUi.some((item) => (item._count?.runs || 0) > 0 || WORK_ITEM_ACCEPTED_STATUSES.has(item.status));
    const hasReview = reviews.length > 0;
    const hasMemory = memories.length > 0;
    return WORKFLOW_STEPS.map((step) => ({
      ...step,
      done:
        step.key === 'brief'
          ? Boolean(project?.brief || project?.summary)
          : step.key === 'plan'
            ? hasPlan
            : step.key === 'dispatch'
              ? hasDispatch
              : step.key === 'execute'
                ? hasExecution
                : step.key === 'review'
                  ? hasReview
                  : hasMemory,
    }));
  }, [activeAssignments.length, homeWorkItemsForUi, memories.length, project?.brief, project?.goals?.length, project?.summary, reviews.length]);

  const selectedTaskPacketPreview = useMemo(() => {
    if (!selectedWorkItemDetail) return null;
    const relevantMemory = memories
      .map((memory) => ({ memory, score: scoreMemoryForWorkItem(memory, selectedWorkItemDetail) }))
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5)
      .map(({ memory }) => ({
        id: memory.id,
        type: memory.memoryType,
        title: memory.title || memory.summary || memory.content?.slice(0, 80),
      }));
    return {
      packetVersion: 1,
      generatedAt: new Date().toISOString(),
      visibilityScope: 'ASSIGNMENT',
      state: 'ACTIVE',
      objective: assignmentForm.objective || selectedWorkItemDetail.scopeBrief || selectedWorkItemDetail.title,
      workItem: {
        id: selectedWorkItemDetail.id,
        title: selectedWorkItemDetail.title,
        workType: selectedWorkItemDetail.workType,
        concurrencyMode: selectedWorkItemDetail.concurrencyMode || 'SINGLE',
      },
      acceptanceCriteria: selectedWorkItemDetail.acceptanceCriteria || null,
      memoryRefs: relevantMemory,
      outputContract: selectedWorkItemDetail.outputContract || {
        expectedArtifact: 'HANDOFF',
        requiresReview: true,
      },
      notes: assignmentForm.packetNotes || undefined,
    };
  }, [assignmentForm.objective, assignmentForm.packetNotes, memories, selectedWorkItemDetail]);

  const localProjectFileMentionEntries = useMemo(() => {
    const byKey = new Map<string, ProjectFileMentionEntry>();
    for (const entry of [
      ...projectFileMentionEntriesFromFolders(projectFolders),
      ...projectFileMentionEntriesFromFiles(allProjectFiles),
    ]) {
      const key = `${entry.type}:${entry.path}`;
      if (!entry.path || byKey.has(key)) continue;
      byKey.set(key, entry);
    }
    return [...byKey.values()].sort((a, b) => {
      if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
      return a.path.localeCompare(b.path);
    });
  }, [allProjectFiles, projectFolders]);

  const projectFileMentionTargetValue = (target: ProjectFileMentionTarget) => {
    if (target === 'agentMessage') return agentMessage;
    if (target === 'workItemComment') return workItemComment;
    return workItemForm[target] || '';
  };

  const updateProjectFileMentionState = (target: ProjectFileMentionTarget, value: string) => {
    const match = projectFileMentionMatch(value);
    if (!match) {
      if (activeProjectFileMentionTarget === target) {
        setActiveProjectFileMentionTarget(null);
        setProjectFileMentionQuery('');
      }
      return;
    }
    setActiveProjectFileMentionTarget(target);
    const nextQuery = match[1] || '';
    const normalizedQuery = nextQuery.trim().toLowerCase();
    setProjectFileMentionQuery(nextQuery);
    setProjectFileMentionActiveIndex(0);
    setProjectFileMentionResults(
      sortProjectFileMentionEntries(
        localProjectFileMentionEntries.filter((entry) =>
          !normalizedQuery || entry.path.toLowerCase().includes(normalizedQuery) || entry.name.toLowerCase().includes(normalizedQuery),
        ),
        normalizedQuery,
      ).slice(0, 8),
    );
  };

  const handleWorkItemFormTextChange = (field: WorkItemMentionField, value: string) => {
    setWorkItemForm((prev) => ({ ...prev, [field]: value }));
    updateProjectFileMentionState(field, value);
  };

  const handleWorkItemCommentChange = (value: string) => {
    setWorkItemComment(value);
    updateProjectFileMentionState('workItemComment', value);
  };

  useEffect(() => {
    if (!id || !canAccessProjectFiles || !activeProjectFileMentionTarget) {
      setProjectFileMentionResults([]);
      setLoadingProjectFileMentions(false);
      return;
    }

    const query = projectFileMentionQuery.trim().toLowerCase();
    const localMatches = sortProjectFileMentionEntries(
      localProjectFileMentionEntries.filter((entry) => !query || entry.path.toLowerCase().includes(query) || entry.name.toLowerCase().includes(query)),
      query,
    ).slice(0, 8);
    setProjectFileMentionResults(localMatches);

    setLoadingProjectFileMentions(true);
    let cancelled = false;
    const timeout = window.setTimeout(() => {
      api.projects.files
        .list(
          id,
          query
            ? { limit: '30', recursive: 'true', q: query }
            : { limit: '30', recursive: 'false' },
        )
        .then((res) => {
          if (cancelled) return;
          const remoteEntries = [
            ...projectFileMentionEntriesFromFolders(res.folders || []),
            ...projectFileMentionEntriesFromFiles(res.files || []),
          ];
          const byKey = new Map<string, ProjectFileMentionEntry>();
          for (const entry of [...remoteEntries, ...localMatches]) {
            const key = `${entry.type}:${entry.path}`;
            if (!entry.path || byKey.has(key)) continue;
            byKey.set(key, entry);
          }
          setProjectFileMentionResults(sortProjectFileMentionEntries([...byKey.values()], query).slice(0, 10));
        })
        .catch(() => {
          if (cancelled) return;
          setProjectFileMentionResults(localMatches);
        })
        .finally(() => {
          if (!cancelled) setLoadingProjectFileMentions(false);
        });
    }, 150);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    activeProjectFileMentionTarget,
    canAccessProjectFiles,
    id,
    localProjectFileMentionEntries,
    projectFileMentionQuery,
  ]);

  useEffect(() => {
    setProjectFileMentionActiveIndex(0);
  }, [activeProjectFileMentionTarget, projectFileMentionQuery]);

  useEffect(() => {
    setProjectFileMentionActiveIndex((current) => {
      if (!projectFileMentionResults.length) return 0;
      return Math.min(current, projectFileMentionResults.length - 1);
    });
  }, [projectFileMentionResults.length]);

  const linkedWorkItemProjectFiles = useMemo(() => {
    const paths = new Set<string>();
    (['description', 'scopeBrief', 'acceptanceCriteria', 'outputContract'] as WorkItemMentionField[]).forEach((field) => {
      extractProjectFileMentionPaths(workItemForm[field]).forEach((path) => paths.add(path));
    });
    return [...paths];
  }, [workItemForm.acceptanceCriteria, workItemForm.description, workItemForm.outputContract, workItemForm.scopeBrief]);

  const setProjectFileMentionTargetValue = (target: ProjectFileMentionTarget, value: string) => {
    if (target === 'agentMessage') {
      handleAgentMessageChange(value);
      return;
    }
    if (target === 'workItemComment') {
      setWorkItemComment(value);
      return;
    }
    setWorkItemForm((prev) => ({ ...prev, [target]: value }));
  };

  const insertProjectFileMention = (target: ProjectFileMentionTarget, entry: ProjectFileMentionEntry) => {
    const current = projectFileMentionTargetValue(target);
    const path = entry.type === 'folder' ? `${entry.path.replace(/\/+$/, '')}/` : entry.path;
    setProjectFileMentionTargetValue(target, replaceTrailingProjectFileMention(current, path));
    setActiveProjectFileMentionTarget(null);
    setProjectFileMentionQuery('');
    setProjectFileMentionActiveIndex(0);
  };

  const handleProjectFileMentionKeyDown = (
    target: ProjectFileMentionTarget,
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (activeProjectFileMentionTarget !== target || isImeCompositionKeyEvent(event)) return false;
    if (event.key === 'Escape') {
      event.preventDefault();
      setActiveProjectFileMentionTarget(null);
      setProjectFileMentionQuery('');
      setProjectFileMentionActiveIndex(0);
      return true;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      if (!projectFileMentionResults.length) return true;
      setProjectFileMentionActiveIndex((current) => {
        const direction = event.key === 'ArrowDown' ? 1 : -1;
        return (current + direction + projectFileMentionResults.length) % projectFileMentionResults.length;
      });
      return true;
    }
    if (event.key !== 'Enter' && event.key !== 'Tab') return false;
    event.preventDefault();
    const selectedEntry = projectFileMentionResults[projectFileMentionActiveIndex] || projectFileMentionResults[0];
    if (selectedEntry) insertProjectFileMention(target, selectedEntry);
    return true;
  };

  const closeProjectFileMentionMenu = (target: ProjectFileMentionTarget) => {
    window.setTimeout(() => {
      setActiveProjectFileMentionTarget((current) => (current === target ? null : current));
      setProjectFileMentionActiveIndex(0);
    }, 120);
  };

  const renderProjectFileMentionMenu = (target: ProjectFileMentionTarget) => {
    if (activeProjectFileMentionTarget !== target || !canAccessProjectFiles) return null;
    return (
      <div className="isolate absolute bottom-full left-0 z-[100] mb-2 w-full overflow-hidden rounded-lg border border-border bg-card text-card-foreground opacity-100 shadow-2xl">
        <div className="border-b bg-card px-3 py-2 text-xs uppercase tracking-wide text-muted-foreground">Project shared files</div>
        <div className="max-h-64 overflow-y-auto p-1.5" role="listbox">
          {projectFileMentionResults.length ? (
            projectFileMentionResults.map((entry, index) => {
              const isActive = index === projectFileMentionActiveIndex;
              return (
                <button
                  key={`${entry.type}:${entry.path}`}
                  type="button"
                  role="option"
                  aria-selected={isActive}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                    isActive ? 'bg-muted text-foreground' : 'hover:bg-muted'
                  }`}
                  onMouseEnter={() => setProjectFileMentionActiveIndex(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => insertProjectFileMention(target, entry)}
                >
                  {entry.type === 'folder' ? (
                    <FolderOpen className="h-4 w-4 shrink-0 text-primary" />
                  ) : (
                    <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{entry.name}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.type === 'folder' ? `${entry.path}/` : `${entry.path}${entry.size ? ` · ${formatBytes(entry.size)}` : ''}`}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="px-3 py-4 text-sm text-muted-foreground">
              {loadingProjectFileMentions ? 'Searching...' : 'No matching project files.'}
            </div>
          )}
        </div>
      </div>
    );
  };

  const handleCreateWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingWorkItem(true);
    setError('');
    try {
      const mentionedProjectFiles = linkedWorkItemProjectFiles.map((path) => ({
        path,
        mention: `@${path}`,
        source: 'work-item-form',
      }));
      await api.projects.workItems.create(id, {
        title: workItemForm.title,
        workType: workItemForm.workType,
        concurrencyMode: workItemForm.concurrencyMode as any,
        goalId: workItemForm.goalId || undefined,
        featureId: workItemForm.featureId || undefined,
        description: workItemForm.description || undefined,
        scopeBrief: workItemForm.scopeBrief || undefined,
        acceptanceCriteria: workItemForm.acceptanceCriteria || undefined,
        inputPacket: mentionedProjectFiles.length ? { projectFiles: mentionedProjectFiles } : undefined,
        outputContract: workItemForm.outputContract.trim()
          ? {
              expectedArtifact: workItemForm.outputContract.trim(),
              handoffRequired: true,
            }
          : undefined,
      });
      setWorkItemForm({
        title: '',
        workType: 'IMPLEMENTATION',
        concurrencyMode: 'SINGLE',
        goalId: '',
        featureId: '',
        description: '',
        scopeBrief: '',
        acceptanceCriteria: '',
        outputContract: '',
      });
      setActiveProjectFileMentionTarget(null);
      setProjectFileMentionQuery('');
      openWorkItemsList();
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to create work item');
    } finally {
      setSavingWorkItem(false);
    }
  };

  const handleProjectStatus = async (action: 'activate' | 'pause' | 'archive') => {
    if (!id) return;
    if (action === 'archive' && !pendingArchiveProject) {
      setPendingArchiveProject(true);
      return;
    }
    setPendingArchiveProject(false);
    setProjectAction(action);
    setError('');
    try {
      if (action === 'activate') {
        await api.projects.activate(id);
      } else if (action === 'pause') {
        await api.projects.pause(id);
      } else {
        await api.projects.archive(id);
      }
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to update project status');
    } finally {
      setProjectAction('');
    }
  };

  const handleConfirmDeleteProject = async () => {
    if (!id || deletingProject) return;
    setDeletingProject(true);
    setError('');
    try {
      await api.projects.delete(id, 'delete');
      setPendingDeleteProject(false);
      navigate('/projects');
    } catch (err: any) {
      setError(err.message || 'Failed to delete project');
    } finally {
      setDeletingProject(false);
    }
  };

  const handleUpdateProjectSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingProjectSettings(true);
    setError('');
    try {
      await api.projects.update(id, {
        name: projectSettingsForm.name,
        summary: projectSettingsForm.summary || undefined,
        brief: projectSettingsForm.brief || undefined,
        visibility: projectSettingsForm.visibility,
        githubUrl: projectSettingsForm.githubUrl || undefined,
        budgetAmount: projectSettingsForm.budgetAmount.trim() ? Number(projectSettingsForm.budgetAmount) : 0,
        budgetCurrency: projectSettingsForm.budgetCurrency || 'AIC',
        settings: {
          maxActiveAgents: projectSettingsForm.maxActiveAgents.trim()
            ? Number(projectSettingsForm.maxActiveAgents)
            : DEFAULT_PROJECT_MAX_ACTIVE_AGENTS,
          maxActiveGoals: projectSettingsForm.maxActiveGoals.trim()
            ? Number(projectSettingsForm.maxActiveGoals)
            : DEFAULT_PROJECT_MAX_ACTIVE_GOALS,
          ...(canEditProjectGlobals
            ? {
                projectGlobals: projectSettingsForm.projectGlobals
                  .filter((global) => global.key?.trim())
                  .map((global) => ({
                    key: global.key.trim(),
                    label: global.label?.trim() || global.key.trim(),
                    description: global.description?.trim() || undefined,
                    value: global.value || '',
                    isSecret: Boolean(global.isSecret),
                    required: global.required !== false,
                    createTaskOnMissing: global.createTaskOnMissing !== false,
                    category: global.category?.trim() || undefined,
                    scope: 'project',
                    goalId: null,
                  })),
              }
            : {}),
        },
      });
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to update project settings');
    } finally {
      setSavingProjectSettings(false);
    }
  };

  const handleSaveProjectTemplate = async () => {
    if (!id || savingProjectTemplate) return;
    setSavingProjectTemplate(true);
    setProjectTemplateSaveMessage('');
    setError('');
    try {
      const result = await api.projects.saveTemplate(id, {
        name: projectTemplateForm.name.trim() || `${project?.name || 'Project'} template`,
        description: projectTemplateForm.description.trim() || undefined,
      });
      setProjectTemplateSaveMessage(`Saved "${result.template.label}" to your personal templates.`);
    } catch (err: any) {
      setError(err.message || 'Failed to save project template');
    } finally {
      setSavingProjectTemplate(false);
    }
  };

  const handleCreateLocalRunnerCommand = async (memberId?: string, mode: 'local-runner' | 'local-codex' = 'local-runner') => {
    if (!id || !canManageProject) return;
    setCreatingLocalRunnerToken(true);
    setLocalRunnerTokenCopied(false);
    setError('');
    try {
      const useProjectScope = Boolean(memberId);
      const result = mode === 'local-codex'
        ? useProjectScope
          ? await api.projects.agentRuntimes.createCodexToken(id, { name: 'Local Agent' })
          : await api.projects.agentRuntimes.createAccountCodexToken({ name: 'Local Agent runner device' })
        : useProjectScope
          ? await api.projects.agentRuntimes.createRunnerToken(id, { name: 'Local runner' })
          : await api.projects.agentRuntimes.createAccountRunnerToken({ name: 'Local Docker runner device' });
      const commands = localRuntimeCommands(useProjectScope ? id : undefined, result.token, memberId, mode);
      const commandMode = detectLocalRunnerCommandMode();
      setLocalRunnerCommandMode(commandMode);
      setLocalRunnerTokenResult({ token: result.token, mode, scope: useProjectScope ? 'project' : 'account', commands });
      setAgentRuntimePanel('runner');
      try {
        await navigator.clipboard.writeText(commands[commandMode]);
        setLocalRunnerTokenCopied(true);
      } catch {
        setLocalRunnerTokenCopied(false);
      }
    } catch (err: any) {
      setError(err.message || `Failed to create ${mode === 'local-codex' ? 'local agent' : 'local runner'} token`);
    } finally {
      setCreatingLocalRunnerToken(false);
    }
  };

  const handleCreateLocalRunnerToken = () => handleCreateLocalRunnerCommand();

  const handleCopyLocalRunnerCommand = async (commandMode = localRunnerCommandMode) => {
    if (!localRunnerTokenResult) return;
    try {
      await navigator.clipboard.writeText(localRunnerTokenResult.commands[commandMode]);
      setLocalRunnerTokenCopied(true);
    } catch (err: any) {
      setError(err.message || 'Failed to copy local runner command');
    }
  };

  const handleSelectLocalRunnerCommandMode = async (commandMode: LocalRunnerCommandMode) => {
    setLocalRunnerCommandMode(commandMode);
    setLocalRunnerTokenCopied(false);
    if (!localRunnerTokenResult) return;
    try {
      await navigator.clipboard.writeText(localRunnerTokenResult.commands[commandMode]);
      setLocalRunnerTokenCopied(true);
    } catch {
      setLocalRunnerTokenCopied(false);
    }
  };

  const handleAddProjectGlobal = () => {
    setProjectSettingsForm((prev) => ({
      ...prev,
      projectGlobals: [
        ...(prev.projectGlobals || []),
        {
          key: '',
          label: '',
          description: '',
          value: '',
          isSecret: true,
          required: true,
          createTaskOnMissing: true,
          category: 'credential',
          configured: false,
        },
      ],
    }));
  };

  const handleProjectGlobalChange = (index: number, field: keyof ProjectGlobalVariable, value: any) => {
    setProjectSettingsForm((prev) => ({
      ...prev,
      projectGlobals: (prev.projectGlobals || []).map((global, currentIndex) =>
        currentIndex === index ? { ...global, [field]: value } : global,
      ),
    }));
  };

  const handleRemoveProjectGlobal = (index: number) => {
    setProjectSettingsForm((prev) => ({
      ...prev,
      projectGlobals: (prev.projectGlobals || []).filter((_, currentIndex) => currentIndex !== index),
    }));
  };

  const handleOpenGoalGlobals = async (goal: ProjectGoalOption) => {
    setGoalGlobalsModalGoal(goal);
    setGoalGlobalsSyncResult(null);
    const existing = goalGlobalsByGoalId.get(goal.id) || [];
    setGoalGlobalsForm(existing.map((global) => ({ ...global, scope: 'goal', goalId: goal.id })));
    if (!id) return;
    try {
      const result = await api.projects.goals.globals.list(id, goal.id);
      setGoalGlobalsForm((result.globals || []).map((global) => ({ ...global, scope: 'goal', goalId: goal.id })));
    } catch {
      // Keep the already-loaded project detail copy if the focused endpoint is unavailable.
    }
  };

  const handleAddGoalGlobal = () => {
    if (!goalGlobalsModalGoal) return;
    setGoalGlobalsForm((prev) => [
      ...prev,
      {
        key: '',
        label: '',
        description: '',
        value: '',
        isSecret: true,
        required: true,
        createTaskOnMissing: false,
        category: 'credential',
        scope: 'goal',
        goalId: goalGlobalsModalGoal.id,
        configured: false,
      },
    ]);
  };

  const handleGoalGlobalChange = (index: number, field: keyof ProjectGlobalVariable, value: any) => {
    setGoalGlobalsForm((prev) =>
      prev.map((global, currentIndex) =>
        currentIndex === index ? { ...global, [field]: value } : global,
      ),
    );
  };

  const handleRemoveGoalGlobal = (index: number) => {
    setGoalGlobalsForm((prev) => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const handleSaveGoalGlobals = async (syncRuntimes = false) => {
    if (!id || !goalGlobalsModalGoal || savingGoalGlobals) return;
    setSavingGoalGlobals(true);
    setError('');
    setGoalGlobalsSyncResult(null);
    try {
      const result = await api.projects.goals.globals.update(id, goalGlobalsModalGoal.id, {
        syncRuntimes,
        globals: goalGlobalsForm
          .filter((global) => global.key?.trim())
          .map((global) => ({
            key: global.key.trim(),
            label: global.label?.trim() || global.key.trim(),
            description: global.description?.trim() || undefined,
            value: global.value || '',
            isSecret: Boolean(global.isSecret),
            required: global.required !== false,
            createTaskOnMissing: global.createTaskOnMissing !== false,
            category: global.category?.trim() || undefined,
            scope: 'goal',
            goalId: goalGlobalsModalGoal.id,
          })),
      });
      setGoalGlobalsForm((result.globals || []).map((global) => ({ ...global, scope: 'goal', goalId: goalGlobalsModalGoal.id })));
      setGoalGlobalsSyncResult(result.sync || null);
      if (result.projectGlobals) {
        setProject((current: any) => current ? { ...current, projectGlobals: result.projectGlobals } : current);
      } else {
        await loadProject();
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update goal variables');
    } finally {
      setSavingGoalGlobals(false);
    }
  };

  const openProjectSection = (section: ProjectSectionKey) => {
    setActiveProjectSection(section);
    const params = new URLSearchParams(location.search);
    if (section === 'work') {
      setWorkItemsView('list');
      params.set('section', projectSectionUrlParam(section));
      params.delete('view');
      params.delete('item');
    } else {
      params.set('section', projectSectionUrlParam(section));
      params.delete('view');
      params.delete('item');
    }
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  };

  const handleOpenWorkItemFromHome = (workItemId: string) => {
    setSelectedWorkItemId(workItemId);
    const params = new URLSearchParams(location.search);
    params.set('section', 'work');
    params.set('view', 'detail');
    params.set('item', workItemId);
    setActiveProjectSection('work');
    setWorkItemsView('detail');
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  };

  const handleOpenGoalWorkItems = (goalId: string, status = 'ALL') => {
    setWorkGoalFilter(goalId);
    setWorkStatusFilter(status);
    setWorkItemSearch('');
    setWorkItemsView('list');
    openProjectSection('work');
  };

  const handleReviewArtifactFromHome = (artifact: any) => {
    const workItemId =
      (typeof artifact?.workItemId === 'string' ? artifact.workItemId : '') ||
      (typeof artifact?.workItem?.id === 'string' ? artifact.workItem.id : '');
    setReviewForm((prev) => ({
      ...prev,
      workItemId,
      artifactId: artifact?.id || '',
      reviewerType: 'HUMAN',
      status: 'APPROVED',
    }));
    openProjectSection('delivery');
  };

  const handleHomeWorkItemPanelClick = (event: React.MouseEvent<HTMLElement>, workItemId: string) => {
    if (event.defaultPrevented) return;
    const target = event.target;
    if (!(target instanceof Element)) return;
    const interactiveTarget = target.closest(
      'a, button, input, select, textarea, label, summary, [role="button"], [role="link"], [contenteditable="true"]',
    );
    const selection = typeof window === 'undefined' ? '' : window.getSelection()?.toString() || '';
    if (interactiveTarget || selection) return;

    handleOpenWorkItemFromHome(workItemId);
  };

  const openWorkItemDetail = (workItemId: string) => {
    setSelectedWorkItemId(workItemId);
    const params = new URLSearchParams(location.search);
    params.set('section', 'work');
    params.set('view', 'detail');
    params.set('item', workItemId);
    setActiveProjectSection('work');
    setWorkItemsView('detail');
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  };

  const openWorkItemsList = () => {
    const params = new URLSearchParams(location.search);
    params.set('section', 'work');
    params.delete('view');
    params.delete('item');
    setActiveProjectSection('work');
    setWorkItemsView('list');
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  };

  const openNewWorkItemForm = () => {
    const params = new URLSearchParams(location.search);
    params.set('section', 'work');
    params.set('view', 'new');
    params.delete('item');
    setActiveProjectSection('work');
    setWorkItemsView('new');
    navigate({ pathname: location.pathname, search: `?${params.toString()}` });
  };

  const eventGraphMetaString = (node: ProjectEventGraphNode, key: string) => {
    const value = node.meta?.[key];
    return typeof value === 'string' && value.trim() ? value.trim() : '';
  };

  const eventGraphMetaNumber = (node: ProjectEventGraphNode, key: string) => {
    const value = node.meta?.[key];
    const parsed = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
    return Number.isFinite(parsed) ? parsed : 0;
  };

  const eventGraphNodeAttribution = (node: ProjectEventGraphNode) => {
    const createdBy = eventGraphMetaString(node, 'createdByLabel');
    if (createdBy) return `Created by ${normalizeEventGraphActorLabel(createdBy)}`;
    const updatedBy = eventGraphMetaString(node, 'updatedByLabel');
    if (!updatedBy) return '';
    const actorLabel = normalizeEventGraphActorLabel(updatedBy);
    const action = eventGraphMetaString(node, 'updatedByAction');
    if (action === 'PROJECT_GLOBAL_CREATED') return `Created by ${actorLabel}`;
    if (action === 'PROJECT_GLOBAL_WRITTEN') return `Written by ${actorLabel}`;
    if (action === 'PROJECT_FILE_UPLOADED') return `Uploaded by ${actorLabel}`;
    if (action === 'PROJECT_FOLDER_CREATED') return `Created by ${actorLabel}`;
    if (action === 'PROJECT_FILE_WRITTEN') return `Written by ${actorLabel}`;
    return `Updated by ${actorLabel}`;
  };

  const eventGraphNodeDisplayAttribution = (node: ProjectEventGraphNode) => {
    const relationAttribution = projectEventGraphAttributionByNodeId.get(node.id) || '';
    if (/\bby coordinator$/.test(relationAttribution)) return relationAttribution;
    return eventGraphNodeAttribution(node) || relationAttribution || '';
  };

  const isProjectEventGraphNodeClickable = (node: ProjectEventGraphNode) => {
    if (node.type === 'AGENT' || node.type === 'HUMAN') return Boolean(eventGraphMetaString(node, 'memberId') || node.id.startsWith('agent:'));
    if (node.type === 'MESSAGE') return Boolean(eventGraphMetaString(node, 'senderMemberId') || eventGraphMetaString(node, 'targetMemberId'));
    if (node.type === 'WORK_ITEM') return Boolean(eventGraphMetaString(node, 'workItemId') || node.id.startsWith('work-item:'));
    if (node.type === 'RUN') return Boolean(eventGraphMetaString(node, 'runId') || node.id.startsWith('run:'));
    if (node.type === 'ARTIFACT') return Boolean(eventGraphMetaString(node, 'artifactId') || eventGraphMetaString(node, 'workItemId'));
    if (node.type === 'REVIEW') return Boolean(eventGraphMetaString(node, 'reviewId') || eventGraphMetaString(node, 'workItemId'));
    if (node.type === 'FILE' || node.type === 'FOLDER') return canAccessProjectFiles && Boolean(eventGraphMetaString(node, 'path') || node.subtitle);
    if (node.type === 'RESOURCE') return canManageProject;
    if (node.type === 'GOAL' || node.type === 'FEATURE') return true;
    return false;
  };

  const handleProjectEventGraphNodeClick = async (node: ProjectEventGraphNode) => {
    if (!isProjectEventGraphNodeClickable(node)) return;
    if (node.type === 'MESSAGE') {
      const memberId = eventGraphMetaString(node, 'senderMemberId') || eventGraphMetaString(node, 'targetMemberId');
      if (memberId) {
        handleSelectAgentRuntime(memberId);
        const conversationId = eventGraphMetaString(node, 'conversationId');
        if (conversationId) setSelectedAgentConversationId(conversationId);
        setAgentHistoryOpen(true);
        openProjectSection('members');
      }
      return;
    }
    if (node.type === 'RUN') {
      const workItemId = eventGraphMetaString(node, 'workItemId');
      const runId = eventGraphMetaString(node, 'runId') || node.id.replace(/^run:/, '');
      if (workItemId) {
        setSelectedWorkItemId(workItemId);
        setWorkItemsView('detail');
        openProjectSection('work');
        await loadSelectedWorkItem(workItemId);
      } else {
        openProjectSection('work');
      }
      if (runId) {
        setSelectedRunId(runId);
        await loadSelectedRun(runId);
      }
      return;
    }
    if (node.type === 'ARTIFACT' || node.type === 'REVIEW') {
      const workItemId = eventGraphMetaString(node, 'workItemId');
      if (workItemId) {
        setSelectedWorkItemId(workItemId);
        setWorkItemsView('detail');
        openProjectSection('work');
        await loadSelectedWorkItem(workItemId);
      } else {
        openProjectSection('delivery');
      }
      return;
    }
    if (node.type === 'AGENT' || node.type === 'HUMAN') {
      const memberId = eventGraphMetaString(node, 'memberId') || node.id.replace(/^agent:/, '');
      if (memberId) {
        handleSelectAgentRuntime(memberId);
        openProjectSection('members');
      }
      return;
    }
    if (node.type === 'WORK_ITEM') {
      const workItemId = eventGraphMetaString(node, 'workItemId') || node.id.replace(/^work-item:/, '');
      if (workItemId) handleOpenWorkItemFromHome(workItemId);
      return;
    }
    if (node.type === 'FILE' || node.type === 'FOLDER') {
      const path = eventGraphMetaString(node, 'path') || node.subtitle || '';
      if (!path || !canAccessProjectFiles) return;
      openProjectSection('documents');
      if (node.type === 'FOLDER') {
        await navigateProjectFiles(path);
        return;
      }
      const prefix = parentProjectFilePrefix(path);
      setProjectFilePrefix(prefix);
      setProjectFileSearch('');
      await loadProjectFiles('', prefix);
      await handleSelectProjectFile({
        path,
        key: eventGraphMetaString(node, 'key') || path,
        size: eventGraphMetaNumber(node, 'size'),
        contentType: eventGraphMetaString(node, 'contentType') || undefined,
        source: node.status || undefined,
        type: 'file',
      });
      return;
    }
    if (node.type === 'RESOURCE') {
      const goalId = eventGraphMetaString(node, 'goalId');
      if (eventGraphMetaString(node, 'scope') === 'goal' && goalId) {
        openProjectSection('planning');
        const goal = goalById.get(goalId);
        if (goal && canEditProjectGlobals) {
          window.setTimeout(() => {
            void handleOpenGoalGlobals(goal);
          }, 80);
        }
        return;
      }
      openProjectSection('settings');
      window.setTimeout(() => {
        document.querySelector<HTMLElement>('[data-project-global-resources="true"]')?.scrollIntoView({ block: 'start', behavior: 'smooth' });
      }, 80);
      return;
    }
    if (node.type === 'GOAL') {
      openProjectSection('planning');
      return;
    }
    if (node.type === 'FEATURE') {
      openProjectSection('planning');
    }
  };

  const saveResourceWorkItemValue = async (
    workItem: ProjectWorkItem,
    resourceRequest: ProjectResourceRequest,
    value: string,
  ) => {
    if (!id) return;
    const trimmedValue = value.trim();
    if (!trimmedValue) {
      setError(`Value is required for ${resourceRequest.label}.`);
      return;
    }

    const inputPacket =
      workItem.inputPacket &&
      typeof workItem.inputPacket === 'object' &&
      !Array.isArray(workItem.inputPacket)
        ? workItem.inputPacket
        : {};
    setSavingResourceWorkItem(true);
    setError('');
    try {
      await api.projects.workItems.update(id, workItem.id, {
        status: 'ACCEPTED',
        inputPacket: {
          ...inputPacket,
          resourceRequest: {
            ...resourceRequest,
            value: trimmedValue,
          },
        },
      });
      setResourceRequestValues((prev) => {
        const next = { ...prev };
        delete next[workItem.id];
        return next;
      });
      await loadProject();
      if (selectedWorkItemForDetail?.id === workItem.id) {
        await loadSelectedWorkItem(workItem.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to save project resource');
    } finally {
      setSavingResourceWorkItem(false);
    }
  };

  const handleCompleteResourceWorkItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedWorkItemForDetail || !selectedResourceRequest) return;
    const value =
      resourceRequestValues[selectedWorkItemForDetail.id] ??
      selectedResourceRequest.value ??
      '';
    await saveResourceWorkItemValue(selectedWorkItemForDetail, selectedResourceRequest, value);
  };

  const handleInlineResourceWorkItemSubmit = async (
    e: React.FormEvent,
    workItem: ProjectWorkItem,
    resourceRequest: ProjectResourceRequest,
  ) => {
    e.preventDefault();
    const value = resourceRequestValues[workItem.id] ?? resourceRequest.value ?? '';
    await saveResourceWorkItemValue(workItem, resourceRequest, value);
  };

  const handleCompleteOwnerActionWorkItem = async (
    workItem: ProjectWorkItem,
    ownerAction: ProjectOwnerAction,
    choice?: ProjectOwnerActionChoice,
  ) => {
    if (!id || savingOwnerActionWorkItemId) return;
    const inputPacket =
      workItem.inputPacket &&
      typeof workItem.inputPacket === 'object' &&
      !Array.isArray(workItem.inputPacket)
        ? workItem.inputPacket
        : {};
    const existingAction =
      inputPacket.ownerAction &&
      typeof inputPacket.ownerAction === 'object' &&
      !Array.isArray(inputPacket.ownerAction)
        ? (inputPacket.ownerAction as Record<string, unknown>)
        : {};
    setSavingOwnerActionWorkItemId(workItem.id);
    setError('');
    try {
      await api.projects.workItems.update(id, workItem.id, {
        status: 'ACCEPTED',
        inputPacket: {
          ...inputPacket,
          ownerAction: {
            ...existingAction,
            key: ownerAction.key,
            label: ownerAction.label,
            completedAt: new Date().toISOString(),
            completedBy: user?.id ?? null,
            ...(choice ? { decision: { id: choice.id, label: choice.label } } : {}),
          },
        },
      });
      await loadProject();
      if (selectedWorkItemForDetail?.id === workItem.id) {
        await loadSelectedWorkItem(workItem.id);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to complete owner action');
    } finally {
      setSavingOwnerActionWorkItemId('');
    }
  };

  const handleCreateGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    const title = goalForm.title.trim();
    if (!title) return;
    setSavingGoal(true);
    setError('');
    try {
      await api.projects.goals.create(id, {
        title,
        description: goalForm.description.trim() || undefined,
      });
      setGoalForm({ title: '', description: '' });
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to create goal');
    } finally {
      setSavingGoal(false);
    }
  };

  const handleDeleteGoal = async (goal: ProjectGoalOption) => {
    if (!id || !canManageProject || deletingGoalId) return;
    const confirmed = window.confirm(
      `Delete goal "${goal.title}"?\n\nLinked unfinished work will be cancelled, and linked work items will be detached from this goal.`,
    );
    if (!confirmed) return;
    setDeletingGoalId(goal.id);
    setError('');
    try {
      await api.projects.goals.delete(id, goal.id, {
        confirmation: 'delete',
        cascade: true,
      });
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to delete goal');
    } finally {
      setDeletingGoalId('');
    }
  };

  const handleCreateFeature = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingFeature(true);
    setError('');
    try {
      await api.projects.features.create(id, {
        title: featureForm.title,
        goalId: featureForm.goalId || undefined,
        description: featureForm.description || undefined,
      });
      setFeatureForm({ title: '', goalId: '', description: '' });
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to create feature');
    } finally {
      setSavingFeature(false);
    }
  };

  const handleArtifactAttachmentChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    setArtifactAttachments((current) => [...current, ...files]);
  };

  const removeArtifactAttachment = (index: number) => {
    setArtifactAttachments((current) => current.filter((_, itemIndex) => itemIndex !== index));
  };

  const handleCreateArtifact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingArtifact(true);
    setError('');
    try {
      await api.projects.artifacts.create(id, {
        artifactType: artifactForm.artifactType,
        workItemId: artifactForm.workItemId || undefined,
        assignmentId: artifactForm.assignmentId || undefined,
        runId: artifactForm.runId || undefined,
        title: artifactForm.title || undefined,
        content: artifactForm.content || undefined,
        url: artifactForm.url || undefined,
        attachments: artifactAttachments.length ? artifactAttachments : undefined,
      });
      setArtifactForm({
        artifactType: 'HANDOFF',
        workItemId: '',
        assignmentId: '',
        runId: '',
        title: '',
        content: '',
        url: '',
      });
      setArtifactAttachments([]);
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to create artifact');
    } finally {
      setSavingArtifact(false);
    }
  };

  const handleCreateReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingReview(true);
    setError('');
    try {
      const reviewedWorkItemId = reviewForm.workItemId;
      await api.projects.reviews.create(id, {
        workItemId: reviewedWorkItemId,
        artifactId: reviewForm.artifactId || undefined,
        reviewerType: reviewForm.reviewerType,
        status: reviewForm.status,
        reviewNote: reviewForm.reviewNote || undefined,
      });
      setReviewForm({
        workItemId: '',
        artifactId: '',
        reviewerType: 'LEAD_AGENT',
        status: 'APPROVED',
        reviewNote: '',
      });
      await loadProject();
      if (selectedWorkItemId === reviewedWorkItemId) {
        await loadSelectedWorkItem(reviewedWorkItemId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to create review');
    } finally {
      setSavingReview(false);
    }
  };

  const handleCreateSelectedWorkItemReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedWorkItemForDetail) return;
    setSavingReview(true);
    setError('');
    try {
      await api.projects.reviews.create(id, {
        workItemId: selectedWorkItemForDetail.id,
        reviewerType: selectedWorkItemReviewDraft.reviewerType,
        status: selectedWorkItemReviewDraft.status,
        reviewNote: selectedWorkItemReviewDraft.reviewNote || undefined,
      });
      setSelectedWorkItemReviewDraft({
        reviewerType: 'HUMAN',
        status: 'APPROVED',
        reviewNote: '',
      });
      await loadProject();
      await loadSelectedWorkItem(selectedWorkItemForDetail.id);
    } catch (err: any) {
      setError(err.message || 'Failed to create review');
    } finally {
      setSavingReview(false);
    }
  };

  const handleCreateMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setSavingMemory(true);
    setError('');
    try {
      await api.projects.memories.create(id, {
        memoryType: memoryForm.memoryType,
        title: memoryForm.title || undefined,
        content: memoryForm.content,
      });
      setMemoryForm({
        memoryType: 'DECISION',
        title: '',
        content: '',
      });
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to create memory');
    } finally {
      setSavingMemory(false);
    }
  };

  const handleSearchMembers = async () => {
    if (isReadOnly) return;
    setSearchingMembers(true);
    setError('');
    try {
      const results = await api.users.search({
        role: memberSearchRole,
        q: memberSearchQuery.trim(),
        limit: '12',
      });
      setMemberSearchResults(results);
    } catch (err: any) {
      setError(err.message || 'Failed to search users');
    } finally {
      setSearchingMembers(false);
    }
  };

  const handleAddMember = async (userId?: string) => {
    if (!id) return;
    const targetUserId = userId || staffingUserId;
    if (!targetUserId) return;
    setSavingMember(true);
    setStaffingUserId(targetUserId);
    setError('');
    try {
      await api.projects.members.add(id, {
        userId: targetUserId,
        role: staffingRole,
        permissions: staffingPermissions.trim()
          ? { note: staffingPermissions.trim() }
          : undefined,
      });
      setStaffingUserId('');
      setStaffingPermissions('');
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to add project member');
    } finally {
      setSavingMember(false);
    }
  };

  const handleRemoveMember = async (memberId: string) => {
    if (!id) return;
    setRemovingMemberId(memberId);
    setError('');
    try {
      await api.projects.members.remove(id, memberId);
      if (selectedAgentMemberId === memberId) {
        setSelectedAgentMemberId('');
        setSelectedAgentConversationId('');
      }
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to remove project member');
    } finally {
      setRemovingMemberId('');
    }
  };

  const handleOpenDismissMember = (member: ProjectMember) => {
    if (isReadOnly || member.role === 'OWNER') return;
    setPendingDismissMember(member);
  };

  const handleConfirmDismissMember = async () => {
    if (!pendingDismissMember || removingMemberId === pendingDismissMember.id) return;
    const memberId = pendingDismissMember.id;
    await handleRemoveMember(memberId);
    setPendingDismissMember(null);
  };

  const handleOpenLaunchAgentRuntime = (role: string, memberId?: string, mode: AgentLaunchMode = DEFAULT_AGENT_LAUNCH_MODE) => {
    if (isReadOnly) return;
    if (activeAgentCapacityReached && launchWouldAddActiveAgent(memberId)) {
      setError(activeAgentCapacityMessage);
      return;
    }
    const defaults = projectRoleAgentDefaultsFromSettings(project?.settings || null)[role] || {};
    const defaultMode = defaults.launchMode || mode;
    const requestedMode = normalizeAvailableLaunchMode(defaultMode);
    const defaultAgentType = defaults.agentType || DEFAULT_LAUNCH_AGENT_TYPE;
    const requestedAgentType = requestedMode === 'local-codex'
      ? supportsLocalCliLaunch(defaultAgentType) ? defaultAgentType : 'codex'
      : defaultAgentType;
    const activeConfig = apiConfigs.find((config) => config.isActive) || apiConfigs[0];
    setPendingAgentLaunch({ role, memberId });
    const preferredImage =
      agentRuntimeImages.find((image) => image.provider === requestedMode && (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === requestedAgentType) ||
      agentRuntimeImages.find((image) => image.provider === requestedMode) ||
      agentRuntimeImages[0];
    setLaunchImage(defaults.image || preferredImage?.id || '');
    setLaunchLlmConfigId(usesLocalCliAuth(requestedMode, requestedAgentType) ? '' : activeConfig?.id || '');
    setLaunchAgentType(requestedAgentType);
    setLaunchMode(requestedMode);
    setLaunchDeploymentDays(defaults.deploymentDays || 1);
    setLaunchEnableSudo(Boolean(defaults.enableSudo));
    setSelectedAgentProfileId('');
    setSaveAgentProfileName('');
    setLaunchLogs([]);
    setLaunchLogsCollapsed(false);
    setShowNewLaunchConfig(!activeConfig);
    setEditingLaunchConfigId('');
    setPendingDeleteLaunchConfig(null);
    setLaunchConfigForm(DEFAULT_LAUNCH_CONFIG_FORM);
  };

  const appendLaunchLog = (level: LaunchLogEntry['level'], message: string) => {
    setLaunchLogs((logs) => [
      ...logs,
      {
        at: new Date().toLocaleTimeString(),
        level,
        message,
      },
    ]);
  };

  const handleSaveLaunchConfig = async () => {
    if (
      !launchConfigForm.name.trim() ||
      !launchConfigForm.apiUrl.trim() ||
      !launchConfigForm.apiKey.trim() ||
      !launchConfigForm.modelName.trim()
    ) {
      throw new Error('Please complete the LLM configuration');
    }
    setSavingLaunchConfig(true);
    try {
      const payload = {
        name: launchConfigForm.name.trim(),
        apiType: launchConfigForm.apiType,
        apiUrl: launchConfigForm.apiUrl.trim(),
        apiKey: launchConfigForm.apiKey.trim(),
        modelName: launchConfigForm.modelName.trim(),
      };
      const saved = editingLaunchConfigId
        ? await api.apiConfigs.update(editingLaunchConfigId, payload)
        : await api.apiConfigs.create(payload);
      const configs = await api.apiConfigs.list().catch(() => [saved]);
      setApiConfigs(configs);
      setLaunchLlmConfigId(saved.id);
      setShowNewLaunchConfig(false);
      setEditingLaunchConfigId('');
      return saved.id;
    } finally {
      setSavingLaunchConfig(false);
    }
  };

  const handleSaveLaunchConfigFromForm = async () => {
    setError('');
    try {
      await handleSaveLaunchConfig();
    } catch (err: any) {
      setError(err.message || 'Failed to save model API configuration');
    }
  };

  const handleOpenNewLaunchConfig = () => {
    setEditingLaunchConfigId('');
    setPendingDeleteLaunchConfig(null);
    setLaunchConfigForm(DEFAULT_LAUNCH_CONFIG_FORM);
    setShowNewLaunchConfig((value) => !value);
  };

  const handleEditLaunchConfig = async () => {
    if (!launchLlmConfigId) return;
    setPendingDeleteLaunchConfig(null);
    setError('');
    try {
      const detail = await api.apiConfigs.get(launchLlmConfigId);
      setEditingLaunchConfigId(detail.id);
      setLaunchConfigForm({
        name: detail.name,
        apiType: detail.apiType,
        apiUrl: detail.apiUrl,
        apiKey: detail.apiKey,
        modelName: detail.modelName,
      });
      setShowNewLaunchConfig(true);
    } catch (err: any) {
      setError(err.message || 'Failed to load model API configuration');
    }
  };

  const handleConfirmDeleteLaunchConfig = async () => {
    if (!pendingDeleteLaunchConfig || deletingLaunchConfigId) return;
    const configId = pendingDeleteLaunchConfig.id;
    setDeletingLaunchConfigId(configId);
    setError('');
    try {
      await api.apiConfigs.delete(configId);
      const configs = await api.apiConfigs.list().catch(() =>
        apiConfigs.filter((config) => config.id !== configId),
      );
      const nextConfig = configs.find((config) => config.isActive) || configs[0];
      setApiConfigs(configs);
      if (launchLlmConfigId === configId) {
        setLaunchLlmConfigId(nextConfig?.id || '');
      }
      if (editingLaunchConfigId === configId) {
        setEditingLaunchConfigId('');
        setShowNewLaunchConfig(configs.length === 0);
        setLaunchConfigForm(DEFAULT_LAUNCH_CONFIG_FORM);
      }
      setPendingDeleteLaunchConfig(null);
    } catch (err: any) {
      setError(err.message || 'Failed to delete model API configuration');
    } finally {
      setDeletingLaunchConfigId('');
    }
  };

  const handleApplyAgentProfile = (profileId: string) => {
    const profile = agentProfiles.find((item) => item.id === profileId);
    setSelectedAgentProfileId(profileId);
    if (!profile) return;
    const nextMode = normalizeAvailableLaunchMode(profile.launchMode);
    const profileAgentType = profile.agentType || DEFAULT_LAUNCH_AGENT_TYPE;
    const nextAgentType = nextMode === 'local-codex'
      ? supportsLocalCliLaunch(profileAgentType) ? profileAgentType : 'codex'
      : profileAgentType;
    setPendingAgentLaunch((current) =>
      current
        ? {
            role: profile.role,
            memberId: current.memberId && current.role === profile.role ? current.memberId : undefined,
          }
        : current,
    );
    setLaunchMode(nextMode);
    setLaunchAgentType(nextAgentType);
    setLaunchImage(profile.image || '');
    setLaunchLlmConfigId(usesLocalCliAuth(nextMode, nextAgentType) ? '' : profile.llmConfigId || launchLlmConfigId);
    setLaunchDeploymentDays(Math.max(1, profile.deploymentDays || 1));
    setLaunchEnableSudo(agentProfileSudoEnabled(profile));
    setSaveAgentProfileName('');
  };

  const handleSaveAgentProfile = async (llmConfigId?: string) => {
    if (!id || !pendingAgentLaunch || !saveAgentProfileName.trim()) return null;
    setSavingAgentProfile(true);
    try {
      const result = await api.projects.agentProfiles.create(id, {
        name: saveAgentProfileName.trim(),
        role: pendingAgentLaunch.role,
        launchMode,
        agentType: launchAgentType,
        image: launchImage || undefined,
        model: llmConfigId ? apiConfigs.find((config) => config.id === llmConfigId)?.modelName : undefined,
        llmConfigId: llmConfigId || undefined,
        deploymentDays: Math.max(1, launchDeploymentDays),
        enableSudo: launchEnableSudo,
      });
      setAgentProfiles((profiles) => [result.profile, ...profiles.filter((profile) => profile.id !== result.profile.id)]);
      setSelectedAgentProfileId(result.profile.id);
      setSaveAgentProfileName('');
      appendLaunchLog('success', `Saved agent profile: ${result.profile.name}.`);
      return result.profile;
    } finally {
      setSavingAgentProfile(false);
    }
  };

  const handleLaunchAgentProfile = async (profile: ProjectAgentProfile, memberId?: string) => {
    if (!id || isReadOnly) return;
    if (activeAgentCapacityReached && launchWouldAddActiveAgent(memberId)) {
      setError(activeAgentCapacityMessage);
      return;
    }
    if (isCloudAgentLaunchMode(profile.launchMode)) {
      setError(CLOUD_AGENT_UNAVAILABLE_NOTICE);
      return;
    }
    setLaunchingRole(profile.role);
    setError('');
    try {
      const launched = await api.projects.agentProfiles.launch(id, profile.id, {
        memberId,
        llmConfigId: profile.llmConfigId || launchLlmConfigId || undefined,
        deploymentDays: profile.deploymentDays,
        enableSudo: agentProfileSudoEnabled(profile),
      });
      setSelectedAgentMemberId(launched.memberId);
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to launch saved agent');
    } finally {
      setLaunchingRole('');
    }
  };

  const handleConfirmLaunchAgentRuntime = async () => {
    if (!id || isReadOnly || !pendingAgentLaunch) return;
    if (activeAgentCapacityReached && launchWouldAddActiveAgent(pendingAgentLaunch.memberId)) {
      appendLaunchLog('error', activeAgentCapacityMessage);
      setError(activeAgentCapacityMessage);
      return;
    }
    if (isCloudAgentLaunchMode(launchMode)) {
      appendLaunchLog('error', CLOUD_AGENT_UNAVAILABLE_NOTICE);
      setError(CLOUD_AGENT_UNAVAILABLE_NOTICE);
      return;
    }
    const role = pendingAgentLaunch.role;
    if (!id || isReadOnly) return;
    setLaunchingRole(role);
    setError('');
    setLaunchLogsCollapsed(false);
    setLaunchLogs([]);
    try {
      appendLaunchLog('info', `Preparing ${role} launch request.`);
      const llmConfigId = showNewLaunchConfig
        ? await handleSaveLaunchConfig()
        : launchLlmConfigId || undefined;
      appendLaunchLog(
        'success',
        llmConfigId
          ? `Model API config selected: ${llmConfigId}.`
          : 'No platform Model API config selected; local CLI auth will be used.',
      );
      if (saveAgentProfileName.trim()) {
        await handleSaveAgentProfile(llmConfigId);
      }
      appendLaunchLog(
        'info',
        `Launch mode: ${
          isCloudAgentLaunchMode(launchMode)
            ? 'cloud agent'
            : launchMode === 'local-codex'
              ? 'local agent on this device'
            : launchMode === 'local-runner'
              ? 'local runner on this device'
              : 'local Docker agent on the API host'
        }.`,
      );
      appendLaunchLog('info', `Agent type: ${launchAgentType}. Image: ${launchImage || launchImageOptions[0]?.id || 'default'}.`);
      if (launchEnableSudo && (launchMode === 'local-docker' || launchMode === 'local-runner')) {
        appendLaunchLog('info', 'Passwordless sudo is enabled for this local runtime.');
      }
      appendLaunchLog(
        'info',
        isCloudAgentLaunchMode(launchMode)
          ? CLOUD_AGENT_UNAVAILABLE_NOTICE
          : launchMode === 'local-codex'
            ? 'Deployment cost: 0 AIC. Local Agent uses your own local CLI runner.'
            : 'Deployment cost: 0 AIC. Local modes use your own Docker capacity.',
      );
      appendLaunchLog('info', 'Requesting runtime from API server.');
      const launched = await api.projects.agentRuntimes.launch(id, {
        role: pendingAgentLaunch.role,
        memberId: pendingAgentLaunch.memberId,
        llmConfigId,
        image: launchImage || (!isCloudAgentLaunchMode(launchMode) ? launchImageOptions[0]?.id : undefined),
        agentType: launchAgentType,
        launchMode,
        deploymentDays: Math.max(1, launchDeploymentDays),
        enableSudo: launchEnableSudo,
      });
      const queuedLocalRunnerMode = launchMode === 'local-runner' || launchMode === 'local-codex' ? launchMode : null;
      const projectRunnerOnline = queuedLocalRunnerMode ? onlineLocalRunnerByProvider.get(queuedLocalRunnerMode) : null;
      appendLaunchLog(
        'success',
        launchMode === 'local-runner'
          ? projectRunnerOnline
            ? `Local Docker job queued for member ${launched.memberId}. The online local runner will claim it automatically.`
            : `Local Docker job queued for member ${launched.memberId}. Start the local runner to claim pending local Docker agents.`
          : launchMode === 'local-codex'
            ? projectRunnerOnline
              ? `Local Agent job queued for member ${launched.memberId}. The online local runner will claim it automatically.`
              : `Local Agent job queued for member ${launched.memberId}. Start the local runner to claim pending local agents.`
          : `Runtime created for member ${launched.memberId}.`,
      );
      setSelectedAgentMemberId(launched.memberId);
      setPendingAgentLaunch(null);
      if (queuedLocalRunnerMode) {
        setAgentRuntimePanel('runner');
        if (projectRunnerOnline) {
          setLocalRunnerTokenResult(null);
          setLocalRunnerTokenCopied(false);
        } else {
          await handleCreateLocalRunnerCommand(undefined, queuedLocalRunnerMode);
        }
      }
      await loadProject();
    } catch (err: any) {
      const message = err.message || 'Failed to launch agent runtime';
      appendLaunchLog('error', message);
      setError(message);
    } finally {
      setLaunchingRole('');
    }
  };

  const updateAgentRuntimeSession = (memberId: string, role: string | undefined, session: ProjectAgentRuntimeSession) => {
    setAgentRuntimes((current) =>
      current.map((runtime) =>
        runtime.memberId === memberId
          ? {
              ...runtime,
              role: role || runtime.role,
              session: mergeAgentRuntimeSessionForUi(runtime.session, session),
            }
          : runtime,
      ),
    );
  };

  const handleReconnectAgentRuntime = async (runtime: ProjectAgentRuntime) => {
    if (!id || isReadOnly || reconnectingMemberId === runtime.memberId) return;
    setReconnectingMemberId(runtime.memberId);
    setError('');
    try {
      const result = await api.projects.agentRuntimes.reconnect(id, runtime.memberId);
      updateAgentRuntimeSession(result.memberId, result.role, result.session);
      setSelectedAgentMemberId(result.memberId);
      const runnerMode =
        result.session.provider === 'local-codex'
          ? 'local-codex'
          : result.session.provider === 'local-runner'
            ? 'local-runner'
            : null;
      if (runnerMode) {
        setAgentRuntimePanel('runner');
        if (onlineLocalRunnerByProvider.get(runnerMode)) {
          setLocalRunnerTokenResult(null);
          setLocalRunnerTokenCopied(false);
        } else {
          await handleCreateLocalRunnerCommand(undefined, runnerMode);
        }
      }
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to reconnect agent runtime');
    } finally {
      setReconnectingMemberId('');
    }
  };

  useEffect(() => {
    if (!id || !token || !selectedAgentRuntime?.memberId) return;
    const controller = new AbortController();
    const memberId = selectedAgentRuntime.memberId;
    api.projects.agentRuntimes
      .streamEvents(
        id,
        memberId,
        (event: ProjectAgentRuntimeStreamEvent) => {
          if (event.type === 'heartbeat' || !event.session) return;
          const eventSession = event.session;
          setAgentRuntimes((current) =>
            current.map((runtime) =>
              runtime.memberId === event.memberId
                ? {
                    ...runtime,
                    role: event.role || runtime.role,
                    session: mergeAgentRuntimeSessionForUi(runtime.session, eventSession),
                  }
                : runtime,
            ),
          );
          if (event.type === 'progress') {
            setAgentMessageResponse(event.message || eventSession.currentActivity || 'Agent is still working...');
          } else if (event.type === 'session' && (event.message || eventSession.currentActivity)) {
            setAgentMessageResponse(event.message || eventSession.currentActivity || '');
          } else if (event.type === 'complete') {
            setAgentMessageResponse('Response complete.');
          } else if (event.type === 'error' || event.type === 'cancelled') {
            setAgentMessageResponse(event.message || 'Agent response stopped.');
          }
        },
        controller.signal,
      )
      .catch((err: any) => {
        if (controller.signal.aborted) return;
        console.debug('Agent runtime stream closed', err?.message || err);
      });

    return () => {
      controller.abort();
    };
  }, [id, selectedAgentRuntime?.memberId, token]);

  useEffect(() => {
    agentRuntimesRef.current = agentRuntimes;
  }, [agentRuntimes]);

  useEffect(() => {
    selectedAgentMemberIdRef.current = selectedAgentMemberId;
  }, [selectedAgentMemberId]);

  useEffect(() => {
    if (!id || !token || isReadOnly) return;
    const pollEnabledRuntimes = () => {
      const now = Date.now();
      agentRuntimesRef.current.forEach((runtime) => {
        const config = normalizeAgentPollingConfig(runtime.session.pollingConfig);
        if (!config.enabled || runtime.session.status === 'TYPING') return;
        const nextRunAt = runtime.session.pollingState?.nextRunAt
          ? new Date(runtime.session.pollingState.nextRunAt).getTime()
          : 0;
        if (Number.isFinite(nextRunAt) && nextRunAt > now) return;
        if (pollingTickInFlightRef.current.has(runtime.memberId)) return;
        const lastAttemptAt = pollingTickLastAttemptRef.current.get(runtime.memberId) || 0;
        if (lastAttemptAt && now - lastAttemptAt < 20_000) return;
        pollingTickLastAttemptRef.current.set(runtime.memberId, now);
        pollingTickInFlightRef.current.add(runtime.memberId);
        api.projects.agentRuntimes
          .tickPolling(id, runtime.memberId)
          .then((result) => {
            if (result.config || result.session) {
              applyAgentPollingResult(result.memberId, result.config, result.session);
            }
            if (result.triggered && result.conversation && result.memberId === selectedAgentMemberIdRef.current) {
              setSelectedAgentConversationId(result.conversation.id);
              setAgentMessageResponse(result.response || 'Polling message delivered in a new session.');
            }
          })
          .catch((err: any) => {
            console.debug('Agent polling tick skipped', err?.message || err);
          })
          .finally(() => {
            pollingTickInFlightRef.current.delete(runtime.memberId);
          });
      });
    };
    pollEnabledRuntimes();
    const timer = window.setInterval(pollEnabledRuntimes, 30000);
    return () => window.clearInterval(timer);
  }, [id, isReadOnly, token]);

  const updateAgentMessageStatus = (memberId: string, messageId: string, status: string) => {
    setAgentRuntimes((current) =>
      current.map((runtime) =>
        runtime.memberId === memberId
          ? (() => {
              const conversationId =
                selectedAgentConversation?.id ||
                runtime.session.activeConversationId ||
                normalizeRuntimeConversations(runtime.session)[0]?.id ||
                '';
              const conversation =
                normalizeRuntimeConversations(runtime.session).find((item) => item.id === conversationId) ||
                normalizeRuntimeConversations(runtime.session)[0];
              const nextMessages = (conversation?.messageHistory || []).map((message) =>
                message.id === messageId
                  ? {
                      ...message,
                      status,
                    }
                  : message,
              );
              return {
                ...runtime,
                session: applyConversationMessages(runtime.session, conversationId, nextMessages),
              };
            })()
          : runtime,
      ),
    );
  };

  const findLatestUserMessageId = (session: ProjectAgentRuntimeSession, content: string, fallbackId: string) => {
    return (
      [...(session.messageHistory || [])]
        .reverse()
        .find((message) => message.role === 'user' && message.content.trim() === content)?.id || fallbackId
    );
  };

  const getMessageDeliveryError = (result: {
    accepted?: boolean;
    session: ProjectAgentRuntimeSession;
    response?: string;
  }) => {
    if (result.accepted === false) return result.response || result.session.lastError || 'Message delivery failed';
    if (result.session.status === 'ERROR') return result.session.lastError || result.response || 'Message delivery failed';
    return '';
  };

  const handleSendAgentMessage = async (
    e?: React.FormEvent | React.KeyboardEvent<HTMLTextAreaElement>,
    retryMessage?: AgentRuntimeMessage,
    quickReply?: string,
  ) => {
    e?.preventDefault();
    const draftMessage = (retryMessage?.content || quickReply || agentMessage).trim();
    const attachmentsForTurn = retryMessage || quickReply ? [] : agentAttachments;
    const outboundMessage = buildAgentMessagePayload(draftMessage, attachmentsForTurn).trim();
    if (!id || !selectedAgentRuntime || !outboundMessage || !selectedAgentCanMessage) return;
    if (agentMessageSendInFlightRef.current.has(selectedAgentRuntime.memberId)) return;
    const sendAsSteer = !retryMessage && selectedAgentCanSteer;
    const sentAt = new Date().toISOString();
    const optimisticMessageId = retryMessage?.id || `local-${sentAt}`;
    const memberId = selectedAgentRuntime.memberId;
    const conversationId =
      selectedAgentConversation?.id ||
      selectedAgentRuntime.session.activeConversationId ||
      normalizeRuntimeConversations(selectedAgentRuntime.session)[0]?.id ||
      '';
    const draftKey = selectedAgentDraftKey;
    agentMessageSendInFlightRef.current.add(memberId);
    setSendingAgentMessage(true);
    if (!retryMessage && !quickReply) {
      clearSelectedAgentMessageDraft(draftKey);
      setAgentAttachments([]);
    }
    setAgentMessageResponse(sendAsSteer ? 'Queueing steering message...' : 'Sending message...');
    setError('');
    setFailedAgentMessages((current) => {
      if (!current[optimisticMessageId]) return current;
      const next = { ...current };
      delete next[optimisticMessageId];
      return next;
    });
    if (retryMessage) {
      setClearedFailedAgentMessages((current) => ({
        ...current,
        [retryMessage.id]: true,
      }));
    }
    setAgentRuntimes((current) =>
      current.map((runtime) =>
        runtime.memberId === memberId
          ? (() => {
              const conversation =
                normalizeRuntimeConversations(runtime.session).find((item) => item.id === conversationId) ||
                normalizeRuntimeConversations(runtime.session)[0];
              const currentMessages = conversation?.messageHistory || [];
              const nextMessages = retryMessage
                ? currentMessages.map((message) =>
                    message.id === retryMessage.id
                      ? {
                          ...message,
                          status: 'sending',
                        }
                      : message,
                  )
                : [
                    ...currentMessages,
                    {
                      id: optimisticMessageId,
                      role: 'user' as const,
                      content: outboundMessage,
                      createdAt: sentAt,
                      status: sendAsSteer ? 'STEERING' : 'sending',
                    },
                  ];
              return {
                ...runtime,
                session: {
                  ...applyConversationMessages(runtime.session, conversationId, nextMessages),
                  lastMessageAt: sentAt,
                },
              };
            })()
          : runtime,
      ),
    );
    try {
      const result = await api.projects.agentRuntimes.sendMessage(id, memberId, {
        message: outboundMessage,
        conversationId,
        ...(sendAsSteer ? { delivery: 'steer' as const } : {}),
      });
      updateAgentRuntimeSession(result.memberId, result.role, result.session);
      const deliveryError = getMessageDeliveryError(result);
      if (deliveryError) {
        const failedMessageId = retryMessage?.id || findLatestUserMessageId(result.session, outboundMessage, optimisticMessageId);
        setClearedFailedAgentMessages((current) => {
          if (!current[failedMessageId]) return current;
          const next = { ...current };
          delete next[failedMessageId];
          return next;
        });
        setFailedAgentMessages((current) => ({
          ...current,
          [failedMessageId]: deliveryError,
        }));
        updateAgentMessageStatus(memberId, failedMessageId, 'failed');
        setAgentMessageResponse('Message delivery failed. Click the red alert beside the message to retry.');
        return;
      }
      if (retryMessage) {
        setFailedAgentMessages((current) => {
          if (!current[retryMessage.id]) return current;
          const next = { ...current };
          delete next[retryMessage.id];
          return next;
        });
      }
      setAgentMessageResponse(result.response || (sendAsSteer ? 'Steering message queued.' : 'Message delivered. Agent is working in the background.'));
      api.projects.agentRuntimes
        .list(id)
        .then((res) => setAgentRuntimes((current) => mergeAgentRuntimeListForUi(current, res.sessions || [])))
        .catch(() => {});
    } catch (err: any) {
      const message = err.message || 'Failed to message agent';
      setAgentRuntimes((current) =>
        current.map((runtime) =>
          runtime.memberId === memberId
            ? (() => {
                const conversation =
                  normalizeRuntimeConversations(runtime.session).find((item) => item.id === conversationId) ||
                  normalizeRuntimeConversations(runtime.session)[0];
                const failedId = retryMessage?.id || optimisticMessageId;
                const nextMessages = (conversation?.messageHistory || []).map((item) =>
                  item.id === failedId
                    ? {
                        ...item,
                        status: 'failed',
                      }
                    : item,
                );
                return {
                  ...runtime,
                  session: applyConversationMessages(runtime.session, conversationId, nextMessages),
                };
              })()
            : runtime,
        ),
      );
      setFailedAgentMessages((current) => ({
        ...current,
        [optimisticMessageId]: message,
      }));
      setClearedFailedAgentMessages((current) => {
        if (!current[optimisticMessageId]) return current;
        const next = { ...current };
        delete next[optimisticMessageId];
        return next;
      });
      setAgentMessageResponse('Message delivery failed. Click the red alert beside the message to retry.');
      setError(message);
    } finally {
      agentMessageSendInFlightRef.current.delete(memberId);
      setSendingAgentMessage(false);
    }
  };

  const isAgentMessageImeConfirmKey = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isImeCompositionKeyEvent(e, agentMessageComposingRef.current)) return true;
    if (e.key !== 'Enter') return false;
    return Date.now() - agentMessageCompositionEndAtRef.current < 120;
  };

  const handleAgentMessageCompositionStart = () => {
    agentMessageComposingRef.current = true;
  };

  const handleAgentMessageCompositionEnd = () => {
    agentMessageComposingRef.current = false;
    agentMessageCompositionEndAtRef.current = Date.now();
  };

  const handleAgentMessageKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (isAgentMessageImeConfirmKey(e)) return;
    if (handleProjectFileMentionKeyDown('agentMessage', e)) return;
    if (e.key !== 'Enter' || e.shiftKey) return;
    e.preventDefault();
    if (sendingAgentMessage || (!agentMessage.trim() && !agentAttachments.length) || !selectedAgentCanMessage) return;
    void handleSendAgentMessage(e);
  };

  const handleRetryAgentMessage = (message: AgentRuntimeMessage) => {
    if (sendingAgentMessage || !selectedAgentCanMessage) return;
    void handleSendAgentMessage(undefined, message);
  };

  const hideSteerMessage = (messageId: string) => {
    setHiddenSteerMessageIds((current) => ({ ...current, [messageId]: true }));
  };

  const handleSteerMessageAgain = (message: AgentRuntimeMessage) => {
    if (sendingAgentMessage || !selectedAgentCanMessage) return;
    hideSteerMessage(message.id);
    void handleSendAgentMessage(undefined, undefined, message.content);
  };

  const handleEditSteerMessage = (message: AgentRuntimeMessage) => {
    hideSteerMessage(message.id);
    setAgentAttachments([]);
    handleAgentMessageChange(message.content || '');
    window.setTimeout(() => {
      agentMessageTextareaRef.current?.focus();
    }, 0);
  };

  const handleAgentQuickReply = (reply: string) => {
    if (sendingAgentMessage || !selectedAgentCanMessage) return;
    void handleSendAgentMessage(undefined, undefined, reply);
  };

  const handleCancelAgentMessage = async () => {
    if (!id || !selectedAgentRuntime || cancellingAgentMessage) return;
    const memberId = selectedAgentRuntime.memberId;
    setCancellingAgentMessage(true);
    setAgentMessageResponse('Cancelling current agent response...');
    try {
      const result = await api.projects.agentRuntimes.cancelMessage(id, memberId, { summary: true });
      updateAgentRuntimeSession(result.memberId, result.role, result.session);
      setAgentMessageResponse(result.response || 'Agent response cancelled.');
      api.projects.agentRuntimes
        .list(id)
        .then((res) => setAgentRuntimes((current) => mergeAgentRuntimeListForUi(current, res.sessions || [])))
        .catch(() => {});
    } catch (err: any) {
      setAgentMessageResponse(err.message || 'Failed to cancel agent response');
      setError(err.message || 'Failed to cancel agent response');
    } finally {
      setCancellingAgentMessage(false);
    }
  };

  const loadSelectedWorkItem = async (workItemId: string) => {
    if (!id || !workItemId) {
      setSelectedWorkItemDetail(null);
      setSelectedWorkItemEvents([]);
      return;
    }
    setLoadingSelectedWorkItem(true);
    setLoadingSelectedWorkItemEvents(true);
    setError('');
    try {
      const [detail, eventsRes, commentsRes, reviewsRes] = await Promise.all([
        api.projects.workItems.get(id, workItemId),
        api.projects.listEvents(id, { limit: '100', workItemId }).catch(() => ({ events: [] as ProjectEventItem[] })),
        api.projects.workItems.comments.list(id, workItemId).catch(() => null),
        api.projects.reviews.list(id, { limit: '50', workItemId }).catch(() => null),
      ]);
      const comments = Array.isArray(commentsRes) ? commentsRes : detail.comments || [];
      const detailReviews = Array.isArray(reviewsRes) ? reviewsRes : detail.reviews || [];
      setSelectedWorkItemDetail({
        ...detail,
        comments,
        reviews: detailReviews,
        _count: {
          ...detail._count,
          comments: comments.length || detail._count?.comments || 0,
          reviews: detailReviews.length || detail._count?.reviews || 0,
        },
      });
      setSelectedWorkItemEvents((eventsRes.events || []).filter((event) => projectEventMatchesWorkItem(event, workItemId)));
      setSelectedRunId(detail.runs?.[0]?.id || '');
      setArtifactForm((prev) => ({
        ...prev,
        workItemId,
        assignmentId: detail.assignments?.[0]?.id || '',
        runId: detail.runs?.[0]?.id || '',
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load work item detail');
    } finally {
      setLoadingSelectedWorkItem(false);
      setLoadingSelectedWorkItemEvents(false);
    }
  };

  const handleUploadWorkItemCommentAttachments = async (files: FileList | null) => {
    if (!id || !selectedWorkItemId || !files?.length) return;
    setUploadingWorkItemCommentAttachment(true);
    setError('');
    try {
      const uploaded: ProjectWorkItemCommentAttachment[] = [];
      for (const file of Array.from(files)) {
        const result = await api.files.upload(file);
        uploaded.push({
          key: result.key || `work-items/${selectedWorkItemId}/comments/${Date.now()}-${safeProjectFileName(file.name)}`,
          url: result.url,
          name: file.name,
          size: file.size,
        });
      }
      setWorkItemCommentAttachments((current) => [...current, ...uploaded]);
    } catch (err: any) {
      setError(err.message || 'Failed to upload comment attachment');
    } finally {
      setUploadingWorkItemCommentAttachment(false);
    }
  };

  const removeWorkItemCommentAttachment = (key?: string) => {
    setWorkItemCommentAttachments((current) => current.filter((attachment) => (attachment.key || attachment.path) !== key));
  };

  const handleCreateWorkItemComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedWorkItemId || (!workItemComment.trim() && !workItemCommentAttachments.length)) return;
    setSavingWorkItemComment(true);
    setError('');
    try {
      await api.projects.workItems.comments.create(id, selectedWorkItemId, {
        content: workItemComment.trim() || `Attached ${workItemCommentAttachments.length} file(s).`,
        attachments: workItemCommentAttachments,
      });
      setWorkItemComment('');
      setWorkItemCommentAttachments([]);
      await loadSelectedWorkItem(selectedWorkItemId);
      await loadProject();
    } catch (err: any) {
      setError(err.message || 'Failed to add work item comment');
    } finally {
      setSavingWorkItemComment(false);
    }
  };

  const handleUpdateWorkItemStatus = async (status: string) => {
    if (!id || !selectedWorkItemId || !status || selectedWorkItemForDetail?.status === status) return;
    setUpdatingWorkItemStatus(true);
    setError('');
    try {
      await api.projects.workItems.update(id, selectedWorkItemId, { status });
      await loadProject();
      await loadSelectedWorkItem(selectedWorkItemId);
    } catch (err: any) {
      setError(err.message || 'Failed to update work item status');
    } finally {
      setUpdatingWorkItemStatus(false);
    }
  };

  const handleAssignDetailMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedWorkItemId || !detailAssigneeUserId) return;
    const member = activeMembers.find((item) => item.userId === detailAssigneeUserId);
    if (!member) return;
    setSavingDetailAssignment(true);
    setError('');
    try {
      await api.projects.workItems.assign(id, selectedWorkItemId, {
        assigneeUserId: member.userId,
        role: member.role,
        objective: selectedWorkItemForDetail?.scopeBrief || selectedWorkItemForDetail?.title || undefined,
      });
      setDetailAssigneeUserId('');
      await loadProject();
      await loadSelectedWorkItem(selectedWorkItemId);
    } catch (err: any) {
      setError(err.message || 'Failed to assign work item');
    } finally {
      setSavingDetailAssignment(false);
    }
  };

  const handleCreateAssignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedWorkItemId) return;
    setSavingAssignment(true);
    setError('');
    try {
      await api.projects.workItems.assign(id, selectedWorkItemId, {
        assigneeUserId: assignmentForm.assigneeUserId,
        role: assignmentForm.role,
        objective: assignmentForm.objective || undefined,
        contextPacket: selectedTaskPacketPreview || undefined,
      });
      setAssignmentForm({
        assigneeUserId: '',
        role: 'WORKER_AGENT',
        objective: '',
        packetNotes: '',
      });
      await loadProject();
      await loadSelectedWorkItem(selectedWorkItemId);
    } catch (err: any) {
      setError(err.message || 'Failed to create assignment');
    } finally {
      setSavingAssignment(false);
    }
  };

  const handleCreateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedWorkItemId) return;
    setSavingRun(true);
    setError('');
    try {
      await api.projects.runs.create(id, {
        runType: runForm.runType,
        workItemId: selectedWorkItemId,
        assignmentId: runForm.assignmentId || undefined,
        instruction: runForm.instruction || undefined,
        resultSummary: runForm.resultSummary || undefined,
      });
      setRunForm({
        runType: 'EXECUTION',
        assignmentId: '',
        instruction: '',
        resultSummary: '',
      });
      await loadSelectedWorkItem(selectedWorkItemId);
    } catch (err: any) {
      setError(err.message || 'Failed to create run');
    } finally {
      setSavingRun(false);
    }
  };

  const loadSelectedRun = async (runId: string) => {
    if (!id || !runId) {
      setSelectedRunDetail(null);
      return;
    }
    setLoadingSelectedRun(true);
    setError('');
    try {
      const detail = await api.projects.runs.get(id, runId);
      setSelectedRunDetail(detail);
      setRunUpdateForm({
        status: detail.status || 'RUNNING',
        resultSummary: detail.resultSummary || '',
      });
      setArtifactForm((prev) => ({
        ...prev,
        runId,
        assignmentId: detail.assignmentId || prev.assignmentId,
      }));
    } catch (err: any) {
      setError(err.message || 'Failed to load run detail');
    } finally {
      setLoadingSelectedRun(false);
    }
  };

  const handleUpdateAssignmentStatus = async (assignmentId: string, status: string) => {
    if (!id || !selectedWorkItemId) return;
    setUpdatingAssignmentId(assignmentId);
    setError('');
    try {
      await api.projects.workItems.updateAssignment(id, selectedWorkItemId, assignmentId, { status });
      await loadProject();
      await loadSelectedWorkItem(selectedWorkItemId);
    } catch (err: any) {
      setError(err.message || 'Failed to update assignment');
    } finally {
      setUpdatingAssignmentId('');
    }
  };

  const handleUpdateRun = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedRunId) return;
    setSavingRunUpdate(true);
    setError('');
    try {
      await api.projects.runs.update(id, selectedRunId, {
        status: runUpdateForm.status,
        resultSummary: runUpdateForm.resultSummary || undefined,
      });
      await loadSelectedRun(selectedRunId);
      if (selectedWorkItemId) {
        await loadSelectedWorkItem(selectedWorkItemId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to update run');
    } finally {
      setSavingRunUpdate(false);
    }
  };

  const handleCreateRunLog = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !selectedRunId) return;
    setSavingRunLog(true);
    setError('');
    try {
      await api.projects.runs.createLog(id, selectedRunId, {
        level: runLogForm.level,
        message: runLogForm.message,
      });
      setRunLogForm({
        level: 'info',
        message: '',
      });
      await loadSelectedRun(selectedRunId);
    } catch (err: any) {
      setError(err.message || 'Failed to create run log');
    } finally {
      setSavingRunLog(false);
    }
  };

  useEffect(() => {
    const requestedWorkItemId = new URLSearchParams(location.search).get('item') || '';
    if (workItems.length === 0) {
      if (!requestedWorkItemId) {
        setSelectedWorkItemId('');
        setSelectedWorkItemDetail(null);
      }
      return;
    }

    if (requestedWorkItemId && selectedWorkItemId !== requestedWorkItemId) {
      setSelectedWorkItemId(requestedWorkItemId);
      return;
    }

    const stillExists = workItems.some((item) => item.id === selectedWorkItemId);
    if (!selectedWorkItemId || !stillExists) {
      if (requestedWorkItemId) return;
      setSelectedWorkItemId(workItems[0].id);
    }
  }, [location.search, selectedWorkItemId, workItems]);

  useEffect(() => {
    if (selectedWorkItemId) {
      loadSelectedWorkItem(selectedWorkItemId);
    }
    setWorkItemComment('');
    setWorkItemCommentAttachments([]);
    setDetailAssigneeUserId('');
    setWorkItemDetailTab('details');
  }, [selectedWorkItemId, id]);

  useEffect(() => {
    if (selectedRunId) {
      loadSelectedRun(selectedRunId);
    } else {
      setSelectedRunDetail(null);
    }
  }, [selectedRunId, id]);

  useEffect(() => {
    if (!isReadOnly) {
      handleSearchMembers();
    }
  }, [isReadOnly]);

  useEffect(() => {
    if (activeProjectSection !== 'members' || selectedAgentMemberId || !projectAgentChatMembers.length) return;
    const firstAvailable = projectAgentChatMembers.find((item) => item.canMessage || item.runtime) || projectAgentChatMembers[0];
    setSelectedAgentMemberId(firstAvailable.member.id);
  }, [activeProjectSection, projectAgentChatMembers, selectedAgentMemberId]);

  useEffect(() => {
    if (activeProjectSection !== 'documents' || !canAccessProjectFiles || !id) return;
    void loadProjectFiles(projectFileSearch, projectFilePrefix);
    void refreshProjectFileIndex();
  }, [activeProjectSection, canAccessProjectFiles, id]);

  useEffect(() => {
    if (activeProjectSection === 'documents' && canAccessProjectFiles && !selectedProjectFile && projectFiles.length) {
      const firstFile = projectFiles.find((file) => file.type !== 'folder');
      if (firstFile) {
        handleSelectProjectFile(firstFile);
      }
    }
  }, [activeProjectSection, canAccessProjectFiles, projectFiles, selectedProjectFile]);

  const handleProjectTourStepChange = useCallback((_: GuidedTourStep, index: number) => {
    if (index > 0) {
      setActiveProjectSection('members');
    }
  }, []);
  const pendingAgentLaunchCapacityBlocked = pendingAgentLaunch
    ? activeAgentCapacityReached && launchWouldAddActiveAgent(pendingAgentLaunch.memberId)
    : false;

  const renderProjectOutputButton = (file: ProjectFileEntry, className = '') => (
    <Button
      key={file.path}
      type="button"
      size="sm"
      variant="outline"
      className={`min-w-0 justify-start gap-2 ${className}`}
      disabled={!canAccessProjectFiles || file.type === 'folder'}
      onClick={() => handleOpenWorkItemProjectFilePreview(file)}
    >
      <FileText className="h-4 w-4 shrink-0" />
      <span className="truncate">{file.path}</span>
    </Button>
  );

  const renderGoalOutcomeCard = (summary: (typeof homeGoalSummaries)[number]) => {
    const {
      goal,
      items,
      progress,
      artifactCount,
      deliveryFiles,
      latestArtifact,
      latestFile,
      needsRevisionItems,
      reviewItems,
      ownerItems,
      nextAction,
    } = summary;
    const visibleFiles = deliveryFiles.slice(0, 3);
    const attentionCount = ownerItems.length + needsRevisionItems.length;
    const latestArtifactWorkItemId =
      (typeof latestArtifact?.workItemId === 'string' ? latestArtifact.workItemId : '') ||
      (typeof latestArtifact?.workItem?.id === 'string' ? latestArtifact.workItem.id : '');
    const latestArtifactWorkItem = latestArtifactWorkItemId ? allWorkItemsById.get(latestArtifactWorkItemId) : null;
    const outcomeTone = attentionCount ? 'border-amber-400/50 bg-amber-50/60' : latestArtifact || latestFile ? 'border-emerald-300/60 bg-emerald-50/60' : 'border-border bg-background';

    return (
      <div key={goal.id} className={`rounded-lg border p-4 ${outcomeTone}`}>
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={attentionCount ? 'warning' : latestArtifact || latestFile ? 'success' : 'secondary'}>
                Goal Outcome
              </Badge>
              <Badge variant="outline">{goal.status || 'OPEN'}</Badge>
              <Badge variant="outline">{artifactCount} artifacts</Badge>
              <Badge variant="outline">{deliveryFiles.length} files</Badge>
            </div>
            <h2 className="whitespace-pre-wrap break-words text-lg font-semibold leading-6">{goal.title}</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              {nextAction}
            </p>
          </div>
          <div className="w-full shrink-0 xl:w-64">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Accepted work</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-background/80">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => handleOpenGoalWorkItems(goal.id)}>
                <Layers3 className="mr-2 h-4 w-4" />
                Items
              </Button>
              {attentionCount ? (
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => handleOpenGoalWorkItems(goal.id, ownerItems.length ? 'READY' : 'NEEDS_REVISION')}
                >
                  <AlertTriangle className="mr-2 h-4 w-4" />
                  Attention
                </Button>
              ) : null}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.85fr)]">
          <div className="rounded-md border bg-background/80 px-3 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">Latest Result</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {latestArtifact
                    ? `${latestArtifact.artifactType || 'ARTIFACT'}${latestArtifact.createdAt ? ` · ${formatProjectDate(latestArtifact.createdAt)}` : ''}`
                    : latestFile
                      ? 'Project file'
                      : 'No result yet'}
                </p>
              </div>
              {latestArtifact ? <Badge variant="outline">{latestArtifact.artifactType}</Badge> : null}
            </div>

            {latestArtifact || latestFile ? (
              <div className="space-y-3">
                {latestArtifact ? (
                  <div className="space-y-2">
                    <p className="line-clamp-2 text-sm font-medium">{latestArtifact.title || latestArtifact.artifactType}</p>
                    {latestArtifactWorkItem ? (
                      <p className="truncate text-xs text-muted-foreground">From: {latestArtifactWorkItem.title}</p>
                    ) : null}
                    {latestArtifact.content ? (
                      <p className="line-clamp-3 text-sm leading-6 text-muted-foreground">{latestArtifact.content}</p>
                    ) : null}
                  </div>
                ) : null}
                {latestFile ? (
                  <div className="rounded-md border bg-muted/10 px-3 py-2">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-primary" />
                      <span className="truncate text-sm font-medium">{latestFile.path}</span>
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {latestFile.size ? formatBytes(latestFile.size) : 'Project file'}
                      {latestFile.lastModified ? ` · ${formatProjectDate(latestFile.lastModified)}` : ''}
                    </p>
                  </div>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  {latestFile ? (
                    <>
                      <Button type="button" size="sm" onClick={() => handleOpenWorkItemProjectFilePreview(latestFile)}>
                        <FileSearch className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleOpenProjectFileInResources(latestFile)}>
                        <FolderOpen className="mr-2 h-4 w-4" />
                        Resources
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleDownloadProjectFile(latestFile.path)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download
                      </Button>
                    </>
                  ) : null}
                  {latestArtifact ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => handleReviewArtifactFromHome(latestArtifact)}>
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      Review
                    </Button>
                  ) : null}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                Agents have not attached a result to this goal yet.
              </div>
            )}
          </div>

          <div className="rounded-md border bg-background/80 px-3 py-3">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Key Files</p>
              <Badge variant="outline">{deliveryFiles.length}</Badge>
            </div>
            {visibleFiles.length ? (
              <div className="space-y-2">
                {visibleFiles.map((file) => (
                  <div key={file.path} className="flex min-w-0 items-center justify-between gap-2 rounded-md border bg-muted/10 px-3 py-2">
                    <button
                      type="button"
                      className="min-w-0 flex-1 truncate text-left text-sm font-medium hover:text-primary"
                      onClick={() => handleOpenProjectFileInResources(file)}
                    >
                      {file.path}
                    </button>
                    <Button type="button" size="icon" variant="ghost" className="h-8 w-8 shrink-0" onClick={() => handleOpenWorkItemProjectFilePreview(file)}>
                      <FileSearch className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
                {deliveryFiles.length > visibleFiles.length ? (
                  <Button type="button" size="sm" variant="ghost" className="px-1" onClick={() => handleOpenGoalWorkItems(goal.id)}>
                    +{deliveryFiles.length - visibleFiles.length} more files in linked items
                  </Button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No goal-scoped files are linked yet.
              </div>
            )}

            {attentionCount || reviewItems.length ? (
              <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
                {ownerItems.length ? <Badge variant="warning">{ownerItems.length} owner inputs</Badge> : null}
                {needsRevisionItems.length ? <Badge variant="destructive">{needsRevisionItems.length} rework</Badge> : null}
                {reviewItems.length ? <Badge variant="warning">{reviewItems.length} in review</Badge> : null}
              </div>
            ) : (
              <div className="mt-3 border-t pt-3 text-xs text-muted-foreground">
                {items.length ? 'No urgent blockers surfaced for this goal.' : 'Create work items to start producing results.'}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderGoalProgressCard = (
    summary: (typeof homeGoalSummaries)[number],
    options: { compact?: boolean } = {},
  ) => {
    const { goal, items, statusCounts, acceptedCount, activeCount, outputFiles, artifactCount, progress } = summary;
    const goalGlobals = goalGlobalsByGoalId.get(goal.id) || [];
    const orderedStatuses = Object.entries(statusCounts)
      .filter(([, count]) => count > 0)
      .sort(([left], [right]) => {
        const leftIndex = WORK_ITEM_STATUS_OPTIONS.indexOf(left);
        const rightIndex = WORK_ITEM_STATUS_OPTIONS.indexOf(right);
        return (leftIndex === -1 ? 99 : leftIndex) - (rightIndex === -1 ? 99 : rightIndex);
      });
    const orderedItems = [...items].sort((left, right) => {
      const leftActive = WORK_ITEM_ACTIVE_STATUSES.has(left.status) ? 0 : 1;
      const rightActive = WORK_ITEM_ACTIVE_STATUSES.has(right.status) ? 0 : 1;
      return leftActive - rightActive || new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime();
    });
    const visibleItemCount = options.compact ? 4 : 6;
    const visibleOutputCount = options.compact ? 3 : 5;
    const itemsExpanded = Boolean(expandedHomeGoalItemIds[goal.id]);
    const outputsExpanded = Boolean(expandedHomeGoalOutputIds[goal.id]);
    const visibleItems = itemsExpanded ? orderedItems : orderedItems.slice(0, visibleItemCount);
    const visibleOutputFiles = outputsExpanded ? outputFiles : outputFiles.slice(0, visibleOutputCount);
    const goalDescription = typeof (goal as any).description === 'string' ? (goal as any).description : '';

    return (
      <div key={goal.id} className="rounded-lg border bg-background p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant={goal.status === 'DONE' ? 'success' : goal.status === 'BLOCKED' ? 'destructive' : 'secondary'}>
                {goal.status}
              </Badge>
              <Badge variant="outline">{acceptedCount}/{items.length} accepted</Badge>
              <Badge variant="outline">{artifactCount} artifacts</Badge>
              {activeCount ? <Badge variant="warning">{activeCount} active</Badge> : null}
              {goalGlobals.length ? <Badge variant="secondary">{goalGlobals.length} vars</Badge> : null}
            </div>
            <h3 className="whitespace-pre-wrap break-words text-base font-semibold leading-6">{goal.title}</h3>
            {goalDescription ? (
              <p className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{goalDescription}</p>
            ) : null}
          </div>
          <div className="w-full shrink-0 lg:w-52">
            <div className="mb-2 flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress</span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(260px,0.9fr)]">
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {orderedStatuses.length ? (
                orderedStatuses.map(([status, count]) => (
                  <Badge key={status} variant={WORK_ITEM_STATUS_VARIANT[status] || 'secondary'}>
                    {status} {count}
                  </Badge>
                ))
              ) : (
                <Badge variant="secondary">No items</Badge>
              )}
            </div>
            {orderedItems.length ? (
              <div className="space-y-2">
                {visibleItems.map((item) => {
                  const outputCount = workItemOutputProjectFilePaths(item).length;
                  const artifactCount = workItemArtifactCount(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-md border bg-muted/10 px-3 py-2 text-left transition-colors hover:border-primary/50"
                      onClick={() => handleOpenWorkItemFromHome(item.id)}
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="min-w-0 flex-1 truncate text-sm font-medium">{item.title}</p>
                        <Badge variant={WORK_ITEM_STATUS_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                        <span>{item.workType}</span>
                        <span>{item._count?.assignments || item.assignments?.length || 0} assignments</span>
                        <span>{artifactCount} artifacts</span>
                        <span>{outputCount} shared files</span>
                      </div>
                    </button>
                  );
                })}
                {orderedItems.length > visibleItemCount ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-expanded={itemsExpanded}
                    onClick={() => setExpandedHomeGoalItemIds((current) => ({ ...current, [goal.id]: !itemsExpanded }))}
                  >
                    {itemsExpanded ? 'Show fewer linked items' : `+${orderedItems.length - visibleItemCount} more linked items`}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${itemsExpanded ? 'rotate-180' : ''}`} />
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No work items are linked to this goal yet.
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-medium">Shared Files</p>
              <Badge variant="outline">{outputFiles.length}</Badge>
            </div>
            {outputFiles.length ? (
              <div className="space-y-2">
                {visibleOutputFiles.map((file) => renderProjectOutputButton(file, 'w-full'))}
                {outputFiles.length > visibleOutputCount ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1 rounded px-1 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    aria-expanded={outputsExpanded}
                    onClick={() => setExpandedHomeGoalOutputIds((current) => ({ ...current, [goal.id]: !outputsExpanded }))}
                  >
                    {outputsExpanded ? 'Show fewer output files' : `+${outputFiles.length - visibleOutputCount} more output files`}
                    <ChevronDown className={`h-3.5 w-3.5 transition-transform ${outputsExpanded ? 'rotate-180' : ''}`} />
                  </button>
                ) : null}
              </div>
            ) : (
              <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                No shared output files are linked yet.
              </div>
            )}
            {canManageProject ? (
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setWorkItemForm((prev) => ({ ...prev, goalId: goal.id, featureId: '' }));
                    openNewWorkItemForm();
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Work Item
                </Button>
                {canEditProjectGlobals ? (
                  <Button type="button" size="sm" variant="outline" onClick={() => handleOpenGoalGlobals(goal)}>
                    <KeyRound className="mr-2 h-4 w-4" />
                    Variables
                  </Button>
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="gap-2 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  disabled={deletingGoalId === goal.id}
                  onClick={() => handleDeleteGoal(goal)}
                >
                  <Trash2 className="h-4 w-4" />
                  {deletingGoalId === goal.id ? 'Deleting...' : 'Delete'}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="project-docs-surface min-h-screen bg-[#f8fafc] text-slate-950">
        <div className="container py-8">
          <p className="text-muted-foreground">Loading project...</p>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="project-docs-surface min-h-screen bg-[#f8fafc] text-slate-950">
        <div className="container py-8">
          <div className="mb-4">
            <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-4 w-4" />
              Back to projects
            </Link>
          </div>
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground">
              {error || 'Project not found.'}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="project-docs-surface min-h-screen bg-[#f8fafc] text-slate-950">
      <div className="container py-8">
      <GuidedTour
        steps={projectDetailTourSteps}
        storageKey="agentcraft.projectDetail.tour.v1"
        startLabel="Project guide"
        autoStart={false}
        onStepChange={handleProjectTourStepChange}
      />
      <div className="mb-6">
        <Link to="/projects" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
          Back to projects
        </Link>
      </div>

      {pendingDeleteProject && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
          <form
            className="w-full max-w-md rounded-lg border bg-card shadow-2xl"
            onSubmit={(event) => {
              event.preventDefault();
              void handleConfirmDeleteProject();
            }}
          >
            <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
              <div className="space-y-1">
                <h3 className="font-medium">Delete Project</h3>
                <p className="text-sm text-muted-foreground">
                  This hides the project from the app. The backend keeps the record for now.
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setPendingDeleteProject(false);
                }}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4 px-5 py-5">
              <div className="rounded-lg border bg-muted/10 px-3 py-3">
                <p className="font-medium">{project.name}</p>
                <p className="mt-1 truncate text-sm text-muted-foreground">
                  {project.summary || project.brief || project.slug}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-3 border-t px-5 py-4">
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setPendingDeleteProject(false);
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={deletingProject}
                autoFocus
              >
                {deletingProject ? 'Deleting...' : 'Delete Project'}
              </Button>
            </div>
          </form>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[260px_minmax(0,1fr)]">
        <aside className="xl:sticky xl:top-24 xl:self-start">
          <div className="rounded-lg border bg-card p-2">
            <div className="px-3 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Project Menu</p>
              <p className="mt-1 line-clamp-2 text-sm font-medium">{project.name}</p>
            </div>
            <nav className="space-y-1">
              {PROJECT_SECTIONS.map((section) => {
                const SectionIcon = section.icon;
                const isActive = activeProjectSection === section.key;
                return (
                  <button
                    key={section.key}
                    type="button"
                    data-tour={section.key === 'members' ? 'project-members-nav' : undefined}
                    className={`flex w-full items-start gap-3 rounded-md px-3 py-3 text-left transition-colors ${
                      isActive ? 'bg-primary/10 text-foreground' : 'text-muted-foreground hover:bg-muted/40 hover:text-foreground'
                    }`}
                    onClick={() => openProjectSection(section.key)}
                  >
                    <SectionIcon className={`mt-0.5 h-4 w-4 shrink-0 ${isActive ? 'text-primary' : ''}`} />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium">{section.label}</span>
                      <span className="block text-xs leading-5">{section.description}</span>
                    </span>
                  </button>
                );
              })}
            </nav>
          </div>
        </aside>

        <div className="space-y-8">
      <div className="space-y-6">
        {activeProjectSection === 'home' && (
        <Card className="border-border/70">
          <CardHeader className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Project Workspace</Badge>
                  <Badge variant="secondary">{project.status}</Badge>
                  <Badge variant="outline">{project.visibility}</Badge>
                </div>
                <CardTitle className="text-3xl tracking-tight">{project.name}</CardTitle>
                <p className="max-w-3xl text-sm leading-6 text-muted-foreground">
                  {project.summary || project.brief || 'No project summary yet.'}
                </p>
                {project.githubUrl && (
                  <p className="text-sm">
                    <a
                      href={project.githubUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary hover:underline"
                    >
                      {project.githubUrl}
                    </a>
                  </p>
                )}
              </div>
              <div className="space-y-3">
                <div className="flex flex-wrap justify-end gap-2">
                  {canManageProject && (
                    <>
                      <Button
                        size="sm"
                        variant={project.status === 'ACTIVE' ? 'default' : 'outline'}
                        disabled={projectAction === 'activate' || project.status === 'ACTIVE'}
                        onClick={() => handleProjectStatus('activate')}
                      >
                        {projectAction === 'activate' ? 'Activating...' : 'Activate'}
                      </Button>
                      <Button
                        size="sm"
                        variant={project.status === 'PAUSED' ? 'secondary' : 'outline'}
                        disabled={projectAction === 'pause' || project.status === 'PAUSED'}
                        onClick={() => handleProjectStatus('pause')}
                      >
                        {projectAction === 'pause' ? 'Pausing...' : 'Pause'}
                      </Button>
                      <Button
                        size="sm"
                        variant={pendingArchiveProject ? 'destructive' : 'outline'}
                        disabled={projectAction === 'archive' || project.status === 'ARCHIVED'}
                        onClick={() => handleProjectStatus('archive')}
                      >
                        {projectAction === 'archive'
                          ? 'Archiving...'
                          : pendingArchiveProject
                            ? 'Confirm Archive'
                            : 'Archive'}
                      </Button>
                    </>
                  )}
                  {canDeleteProject && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      disabled={deletingProject}
                      onClick={() => {
                        setPendingArchiveProject(false);
                        setPendingDeleteProject(true);
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                      Delete
                    </Button>
                  )}
                </div>
                <div className="grid min-w-[220px] gap-3 sm:grid-cols-2">
                  <div className="rounded-lg border bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Goals</p>
                    <p className="mt-2 text-2xl font-semibold">{project.goals?.length || 0}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Feature Groups</p>
                    <p className="mt-2 text-2xl font-semibold">{project.features?.length || 0}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Work Items</p>
                    <p className="mt-2 text-2xl font-semibold">{projectAllWorkItemTotal}</p>
                  </div>
                  <div className="rounded-lg border bg-muted/20 px-4 py-3">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Memories</p>
                    <p className="mt-2 text-2xl font-semibold">{memories.length}</p>
                  </div>
                </div>
              </div>
	            </div>
	          </CardHeader>
	          <CardContent className="space-y-6">
	            <div className="rounded-lg border bg-muted/10 p-4">
	              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
	                <div className="space-y-1">
	                  <div className="flex items-center gap-2">
	                    <Sparkles className="h-4 w-4 text-primary" />
	                    <h2 className="font-semibold">Goal Outcomes</h2>
	                  </div>
	                  <p className="text-sm text-muted-foreground">
	                    Latest results, files, and review actions stay grouped under the goal that produced them.
	                  </p>
	                </div>
	                <Badge variant="outline">{homeGoalSummaries.length} goals</Badge>
	              </div>
	              <div className="space-y-4">
	                {homeGoalSummaries.length ? (
	                  homeGoalSummaries.map((summary) => renderGoalOutcomeCard(summary))
	                ) : (
	                  <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No goals yet.</p>
	                )}
	              </div>
	            </div>

	            <form
	              onSubmit={handleUpdateProjectSettings}
	              className="rounded-lg border bg-muted/10 p-4"
	            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Settings2 className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold">Capacity</h2>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Active agents and active goals currently running in this project.
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge variant={activeAgentCapacityReached ? 'warning' : 'secondary'}>
                    Agents {activeAgentCount}/{maxActiveAgents}
                  </Badge>
                  <Badge variant={activeGoalCount >= maxActiveGoalsNumber ? 'warning' : 'secondary'}>
                    Goals {activeGoalCount}/{maxActiveGoals}
                  </Badge>
                </div>
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Active Agents</label>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    type="number"
                    min="1"
                    max={PROJECT_MAX_ACTIVE_AGENTS_CAP}
                    step="1"
                    value={projectSettingsForm.maxActiveAgents}
                    disabled={!canManageProject || savingProjectSettings}
                    onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, maxActiveAgents: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Max Active Goals</label>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    type="number"
                    min="1"
                    max={PROJECT_MAX_ACTIVE_GOALS_CAP}
                    step="1"
                    value={projectSettingsForm.maxActiveGoals}
                    disabled={!canManageProject || savingProjectSettings}
                    onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, maxActiveGoals: e.target.value }))}
                  />
                </div>
                <Button
                  type="submit"
                  variant="secondary"
                  disabled={!canManageProject || savingProjectSettings}
                >
                  {savingProjectSettings ? 'Saving...' : 'Save Limits'}
                </Button>
              </div>
            </form>

            {(ownerResourceWorkItems.length || ownerActionWorkItems.length || ownerNonResourceWorkItems.length) ? (
              <div className="rounded-lg border border-primary/30 bg-primary/5 p-4">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <ClipboardCheck className="h-4 w-4 text-primary" />
                      <h2 className="font-semibold">Owner Action Items</h2>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      Resource requests and owner confirmations are shown first because agents need these before they can continue.
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant={ownerResourceWorkItems.length ? 'warning' : 'secondary'}>
                      {ownerResourceWorkItems.length} resources
                    </Badge>
                    <Badge variant={ownerActionWorkItems.length ? 'warning' : 'secondary'}>
                      {ownerActionWorkItems.length} actions
                    </Badge>
                  </div>
                </div>
                <div className="space-y-3">
                  {ownerResourceWorkItems.map((item) => {
                    const resourceRequest = getWorkItemResourceRequest(item);
                    if (!resourceRequest) return null;
                    return (
                      <form
                        key={item.id}
                        className="cursor-pointer rounded-md border bg-background px-3 py-3 transition-colors hover:border-primary/50"
                        onClick={(event) => handleHomeWorkItemPanelClick(event, item.id)}
                        onSubmit={(e) => handleInlineResourceWorkItemSubmit(e, item, resourceRequest)}
                      >
                        <div className="grid gap-3 lg:grid-cols-[minmax(180px,260px)_1fr_auto] lg:items-end">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="break-all font-mono text-sm font-semibold">{resourceRequest.key}</p>
                              <Badge variant="outline">{resourceRequest.isSecret ? 'secret' : 'plain'}</Badge>
                            </div>
                            <ExpandableLineClampText
                              text={resourceRequest.description || item.description || `Fill ${resourceRequest.label} to create a project global.`}
                              className="text-xs text-muted-foreground"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs font-medium text-muted-foreground" htmlFor={`resource-request-${item.id}`}>
                              {resourceRequest.label}
                            </label>
                            <input
                              id={`resource-request-${item.id}`}
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                              type={resourceRequest.isSecret ? 'password' : 'text'}
                              value={resourceRequestValues[item.id] ?? resourceRequest.value ?? ''}
                              onChange={(e) =>
                                setResourceRequestValues((prev) => ({
                                  ...prev,
                                  [item.id]: e.target.value,
                                }))
                              }
                              placeholder={resourceRequest.isSecret ? 'Enter secret value' : 'Enter value'}
                              disabled={!canEditProjectGlobals || savingResourceWorkItem}
                            />
                          </div>
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Badge variant={WORK_ITEM_STATUS_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
                            <Button
                              type="submit"
                              size="sm"
                              disabled={
                                !canEditProjectGlobals ||
                                savingResourceWorkItem ||
                                !(resourceRequestValues[item.id] ?? resourceRequest.value ?? '').trim()
                              }
                            >
                              {savingResourceWorkItem ? 'Saving...' : 'Submit'}
                            </Button>
                          </div>
                        </div>
                      </form>
                    );
                  })}
                  {ownerActionWorkItems.map((item) => {
                    const ownerAction = getWorkItemOwnerAction(item);
                    if (!ownerAction) return null;
                    const isSavingThisAction = savingOwnerActionWorkItemId === item.id;
                    const detail = ownerAction.prompt || ownerAction.description || item.description || 'Confirm this owner step has been completed.';
                    return (
                      <div
                        key={item.id}
                        className="cursor-pointer rounded-md border bg-background px-3 py-3 transition-colors hover:border-primary/50"
                        onClick={(event) => handleHomeWorkItemPanelClick(event, item.id)}
                      >
                        <div className="grid gap-3 lg:grid-cols-[minmax(180px,260px)_1fr_auto] lg:items-center">
                          <div className="min-w-0 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="break-all font-mono text-sm font-semibold">{ownerAction.key}</p>
                              {ownerAction.type ? <Badge variant="outline">{ownerAction.type}</Badge> : null}
                            </div>
                            <ExpandableLineClampText
                              text={detail}
                              className="text-xs text-muted-foreground"
                            />
                          </div>
                          <div className="min-w-0 space-y-1">
                            <p className="text-sm font-medium">{ownerAction.label}</p>
                            {ownerAction.category ? (
                              <p className="text-xs text-muted-foreground">{ownerAction.category}</p>
                            ) : null}
                          </div>
                          <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                            <Badge variant={WORK_ITEM_STATUS_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
                            {ownerAction.choices.length ? (
                              ownerAction.choices.map((choice) => (
                                <Button
                                  key={choice.id}
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  className="whitespace-normal text-left"
                                  disabled={isReadOnly || isSavingThisAction}
                                  onClick={() => handleCompleteOwnerActionWorkItem(item, ownerAction, choice)}
                                >
                                  {isSavingThisAction ? 'Saving...' : choice.label}
                                </Button>
                              ))
                            ) : (
                              <Button
                                type="button"
                                size="sm"
                                disabled={isReadOnly || isSavingThisAction}
                                onClick={() => handleCompleteOwnerActionWorkItem(item, ownerAction)}
                              >
                                {isSavingThisAction ? 'Saving...' : 'Confirm done'}
                              </Button>
                            )}
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              onClick={() => handleOpenWorkItemFromHome(item.id)}
                            >
                              Open
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  {ownerNonResourceWorkItems.slice(0, 4).map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      className="w-full rounded-md border bg-background px-3 py-3 text-left transition-colors hover:border-primary/50"
                      onClick={() => handleOpenWorkItemFromHome(item.id)}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="font-medium leading-5">{item.title}</p>
                          {item.description ? (
                            <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{item.description}</p>
                          ) : null}
                        </div>
                        <Badge variant={WORK_ITEM_STATUS_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {homeHealthStats.map((stat) => {
                const StatIcon = stat.icon;
                return (
                  <div key={stat.label} className="rounded-lg border bg-muted/10 px-4 py-3">
                    <div className="flex items-center justify-between gap-3 text-muted-foreground">
                      <p className="text-xs uppercase tracking-wide">{stat.label}</p>
                      <StatIcon className="h-4 w-4" />
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{stat.value}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stat.detail}</p>
                  </div>
                );
              })}
            </div>

            {canManageProject ? (
              <form
                onSubmit={handleCreateGoal}
                className="rounded-lg border border-primary/40 bg-primary/5 p-4 shadow-sm shadow-primary/10"
              >
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="h-5 w-5 text-primary" />
                    <h2 className="text-lg font-semibold">New Goal</h2>
                  </div>
                  <Badge variant="default">Primary action</Badge>
                </div>
                <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-start">
                  <textarea
                    className="min-h-[96px] w-full rounded-md border border-primary/40 bg-background px-4 py-3 text-base leading-6 shadow-sm outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
                    value={goalForm.title}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, title: e.target.value }))}
                    placeholder="Describe the next project outcome"
                    aria-label="New goal title"
                    required
                  />
                  <Button
                    type="submit"
                    className="h-12 gap-2 px-5 text-base lg:mt-0"
                    disabled={savingGoal || !goalForm.title.trim()}
                  >
                    <Plus className="h-4 w-4" />
                    {savingGoal ? 'Creating...' : 'Create Goal'}
                  </Button>
                </div>
              </form>
            ) : null}

	            <div className="rounded-lg border bg-muted/10 p-4">
	              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
	                <div className="flex items-center gap-2">
	                  <Sparkles className="h-4 w-4 text-primary" />
	                  <h2 className="font-semibold">Work Breakdown</h2>
	                </div>
	                <Badge variant="outline">{projectAllWorkItemTotal} work items</Badge>
	              </div>
              <div className="space-y-4">
                {homeGoalSummaries.length ? (
                  homeGoalSummaries.map((summary) => renderGoalProgressCard(summary))
                ) : (
                  <p className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">No goals yet.</p>
                )}
              </div>
            </div>

            {project.features?.length ? (
              <div className="rounded-lg border bg-muted/10 p-4">
                <div className="mb-3 flex items-center gap-2">
                  <Layers3 className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Feature Groups</h2>
                </div>
                <div className="space-y-2">
                  {project.features?.length ? (
                    project.features.map((feature: any) => {
                      const isExpanded = !!expandedHomeFeatureIds[feature.id];
                      return (
                        <div key={feature.id} className="rounded-md border px-3 py-2">
                          <button
                            type="button"
                            className="flex w-full items-center justify-between gap-3 text-left"
                            onClick={() => setExpandedHomeFeatureIds((prev) => ({ ...prev, [feature.id]: !prev[feature.id] }))}
                          >
                            <p className="min-w-0 truncate font-medium">{feature.title}</p>
                            {isExpanded ? (
                              <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                            )}
                          </button>
                          {isExpanded ? (
                            <div className="mt-3 border-t pt-3">
                              <div className="mb-2 flex flex-wrap gap-2">
                                <Badge variant="outline">{feature.status}</Badge>
                                {isAgentGeneratedFeature(feature) ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Bot className="h-3 w-3" />
                                    Agent Generated
                                  </Badge>
                                ) : null}
                              </div>
                              {feature.goalId && (
                                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                                  Goal: {goalById.get(feature.goalId)?.title || 'Linked goal'}
                                </p>
                              )}
                              {feature.description && (
                                <p className="mt-1 text-sm text-muted-foreground">{feature.description}</p>
                              )}
                              {canManageProject && (
                                <div className="mt-3">
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    onClick={() => {
                                      setWorkItemForm((prev) => ({
                                        ...prev,
                                        goalId: feature.goalId || '',
                                        featureId: feature.id,
                                      }));
                                      openNewWorkItemForm();
                                    }}
                                  >
                                    Add Work Item
                                  </Button>
                                </div>
                              )}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  ) : (
                    <p className="text-sm text-muted-foreground">No feature groups yet.</p>
                  )}
                </div>
              </div>
            ) : null}

            <div className="rounded-lg border bg-muted/10 p-4">
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Route className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Collaboration Flow</h2>
                </div>
                <Badge variant={collaborationRisks.length ? 'warning' : 'success'}>
                  {collaborationRisks.length ? `${collaborationRisks.length} attention items` : 'Ready'}
                </Badge>
              </div>
              <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
                {workflowProgress.map((step) => {
                  const StepIcon = step.icon;
                  return (
                    <div
                      key={step.key}
                      className={`rounded-md border px-3 py-3 ${step.done ? 'bg-primary/5' : 'bg-background'}`}
                    >
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <StepIcon className={`h-4 w-4 ${step.done ? 'text-primary' : 'text-muted-foreground'}`} />
                        <Badge variant={step.done ? 'success' : 'secondary'}>{step.done ? 'Done' : 'Open'}</Badge>
                      </div>
                      <p className="text-sm font-medium">{step.label}</p>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
              <div className="rounded-lg border bg-muted/10 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Workflow className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold">Work Progress</h2>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => openProjectSection('work')}
                  >
                    Open Work Items
                  </Button>
                </div>
                {homeDeliveryLanes.some((lane) => lane.count > 0) ? (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {homeDeliveryLanes
                      .filter((lane) => lane.count > 0)
                      .slice(0, 6)
                      .map((lane) => (
                        <div key={lane.status} className="rounded-md border bg-background px-3 py-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <Badge variant={PROJECT_SIGNAL_STATUS_VARIANT[lane.status] || 'secondary'}>
                              {lane.status}
                            </Badge>
                            <span className="text-xs text-muted-foreground">{lane.count} items</span>
                          </div>
                          <div className="space-y-2">
                            {lane.items.slice(0, 3).map((item: any) => (
                              <button
                                key={item.id}
                                type="button"
                                className="w-full rounded-md border bg-muted/10 px-3 py-2 text-left transition-colors hover:border-primary/50"
                                onClick={() => handleOpenWorkItemFromHome(item.id)}
                              >
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{item.title}</p>
                                    <p className="mt-1 text-xs uppercase tracking-wide text-muted-foreground">
                                      {item.workType}
                                    </p>
                                  </div>
                                  <span className="shrink-0 text-xs text-muted-foreground">P{item.priority}</span>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {item._count?.assignments || 0} assigned · {item._count?.runs || 0} runs · {item._count?.artifacts || 0} artifacts
                                </p>
                              </button>
	                            ))}
	                          </div>
	                        </div>
	                      ))}
                  </div>
                ) : (
                  <div className="rounded-md border bg-background px-3 py-4 text-sm text-muted-foreground">
                    No work items have been created yet.
                  </div>
                )}
              </div>

              <div className="space-y-4">
                <div className="rounded-lg border bg-muted/10 p-4">
                  <div className="mb-4 flex items-center gap-2">
                    <Activity className="h-4 w-4 text-primary" />
                    <h2 className="font-semibold">Recent Delivery</h2>
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Runs</p>
                        <Badge variant="outline">{homeRecentRuns.length}</Badge>
                      </div>
                      {homeRecentRuns.length ? (
                        homeRecentRuns.map((run: any) => (
                          <div key={run.id} className="rounded-md border bg-background px-3 py-2">
                            <div className="flex items-center justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{run.runType}</p>
                                <p className="mt-1 truncate text-xs text-muted-foreground">
                                  {run.workItem?.title || 'Unlinked work item'}
                                </p>
                              </div>
                              <Badge variant={PROJECT_SIGNAL_STATUS_VARIANT[run.status] || 'secondary'}>{run.status}</Badge>
                            </div>
                            <p className="mt-2 text-xs text-muted-foreground">{formatProjectDate(run.updatedAt || run.createdAt)}</p>
                          </div>
                        ))
                      ) : (
                        <p className="rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
                          No runs recorded yet.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Artifacts</p>
                        <Badge variant="outline">{homeRecentArtifacts.length}</Badge>
                      </div>
                      {homeRecentArtifacts.length ? (
                        <div className="space-y-2">
                          {homeRecentArtifacts.map((artifact: any) => (
                            <button
                              key={artifact.id}
                              type="button"
                              className="w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50"
                              onClick={() => openProjectSection('delivery')}
                            >
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{artifact.title || artifact.artifactType}</p>
                                  <p className="mt-1 truncate text-xs text-muted-foreground">
                                    {artifact.workItem?.title ||
                                      workItems.find((item) => item.id === artifact.workItemId)?.title ||
                                      'Project-level artifact'}
                                  </p>
                                </div>
                                <Badge variant="outline" className="shrink-0">{artifact.artifactType}</Badge>
                              </div>
                            </button>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
                          No artifacts yet.
                        </p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="text-sm font-medium">Shared Files</p>
                        <Badge variant="outline">{homeOutputFiles.length}</Badge>
                      </div>
                      {homeOutputFiles.length ? (
                        <div className="space-y-2">
                          {homeOutputFiles.slice(0, 5).map((file) => (
                            <div key={file.path} className="rounded-md border bg-background px-3 py-2">
                              <div className="flex min-w-0 items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{file.path}</p>
                                  <p className="mt-1 text-xs text-muted-foreground">
                                    {file.size ? formatBytes(file.size) : 'Project file'}{file.lastModified ? ` · ${formatProjectDate(file.lastModified)}` : ''}
                                  </p>
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="ghost"
                                  className="shrink-0"
                                  disabled={!canAccessProjectFiles}
                                  onClick={() => handleOpenWorkItemProjectFilePreview(file)}
                                >
                                  Open
                                </Button>
                              </div>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
                          No shared output files yet.
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {homeCockpitMembers.length ? (
                  <div className="rounded-lg border bg-muted/10 p-4">
                    <div className="mb-4 flex items-center gap-2">
                      <UserRoundCheck className="h-4 w-4 text-primary" />
                      <h2 className="font-semibold">Agent Cockpit</h2>
                    </div>
                    <div className="space-y-3">
	                      {homeCockpitMembers.map((member) => {
	                        const RoleIcon = roleIconForRole(member.role);
	                        return (
	                        <div key={member.memberId} className="rounded-md border bg-background px-3 py-3">
	                          <div className="flex flex-wrap items-start justify-between gap-3">
	                            <div className="min-w-0">
	                              <div className="flex min-w-0 items-center gap-2">
	                                <RoleIcon className="h-4 w-4 shrink-0 text-primary" />
	                                <p className={`truncate text-sm ${agentNameClassName(member)}`}>{formatAgentDisplayName(member)}</p>
	                              </div>
	                              <p className="mt-1 text-xs text-muted-foreground">{formatRoleLabel(member.role)}</p>
	                            </div>
                            <div className="flex shrink-0 gap-2">
                              <Badge variant="outline">{member.metrics.activeAssignments} active</Badge>
                              <Badge variant="secondary">{member.metrics.runs} runs</Badge>
                            </div>
                          </div>
                          {member.focusWorkItems.length ? (
                            <div className="mt-3 space-y-2">
                              {member.focusWorkItems.slice(0, 2).map((item) => (
                                <button
                                  key={item.id}
                                  type="button"
                                  className="flex w-full items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2 text-left hover:border-primary/50"
                                  onClick={() => handleOpenWorkItemFromHome(item.id)}
                                >
                                  <span className="min-w-0 truncate text-sm">{item.title}</span>
                                  <Badge variant={PROJECT_SIGNAL_STATUS_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
                                </button>
                              ))}
                            </div>
                          ) : null}
	                        </div>
	                        );
	                      })}
                    </div>
                  </div>
                ) : null}
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-lg border bg-muted/10 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <Inbox className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Context Layers</h2>
                </div>
                <div className="space-y-3">
                  {contextLayers.map((layer) => {
                    const LayerIcon = layer.icon;
                    return (
                      <div key={layer.label} className="rounded-md border bg-background px-3 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex min-w-0 gap-3">
                            <LayerIcon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0">
                              <p className="font-medium">{layer.label}</p>
                              <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{layer.detail}</p>
                            </div>
                          </div>
	                          <Badge variant="outline">{layer.value}</Badge>
	                        </div>
	                      </div>
	                    );
	                  })}
                </div>
              </div>

              <div className="rounded-lg border bg-muted/10 p-4">
                <div className="mb-4 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  <h2 className="font-semibold">Next Attention</h2>
                </div>
                <div className="space-y-3">
                  {collaborationRisks.length ? (
                    collaborationRisks.map((risk) => (
                      <div key={risk.title} className="rounded-md border bg-background px-3 py-3">
                        <div className="mb-2 flex items-center justify-between gap-2">
                          <p className="font-medium">{risk.title}</p>
                          <Badge variant={risk.level}>{risk.level === 'destructive' ? 'High' : 'Watch'}</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">{risk.detail}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-md border bg-background px-3 py-3 text-sm text-muted-foreground">
                      No obvious collaboration blockers in the current project state.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
        )}

        <div className="space-y-6">
          {error && (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          {isReadOnly && (
            <div className="rounded-md border border-primary/20 bg-primary/5 px-3 py-3 text-sm text-muted-foreground">
              <p className="font-medium text-foreground">Public read-only view</p>
              <p className="mt-1">
                You can inspect this public project without logging in. Sign in to manage members, create work items,
                submit artifacts, or run assignments.
              </p>
              <div className="mt-3">
                <Button asChild size="sm">
                  <Link to="/login">Login to edit</Link>
                </Button>
              </div>
            </div>
          )}

          {activeProjectSection === 'settings' && canManageProject && (
            <Card>
              <CardHeader>
                <CardTitle className="text-xl">Project Settings</CardTitle>
              </CardHeader>
              <form onSubmit={handleUpdateProjectSettings}>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Project Name</label>
                    <input
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={projectSettingsForm.name}
                      onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, name: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Summary</label>
                    <input
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={projectSettingsForm.summary}
                      onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, summary: e.target.value }))}
                      placeholder="Short explanation of the project"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Brief</label>
                    <textarea
                      className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={projectSettingsForm.brief}
                      onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, brief: e.target.value }))}
                    />
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Visibility</label>
                      <select
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={projectSettingsForm.visibility}
                        onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, visibility: e.target.value }))}
                      >
                        <option value="private">Private</option>
                        <option value="public">Public</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">GitHub URL</label>
                      <input
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        type="url"
                        value={projectSettingsForm.githubUrl}
                        onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, githubUrl: e.target.value }))}
                        placeholder="https://github.com/owner/repo"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 md:grid-cols-[1fr_160px]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Project AICoin Budget</label>
                      <input
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        type="number"
                        min="0"
                        step="1"
                        value={projectSettingsForm.budgetAmount}
                        onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, budgetAmount: e.target.value }))}
                        placeholder="30"
                      />
                      <p className="text-xs text-muted-foreground">
                        Cloud Agent launches are paused. Local Docker and local runner agents do not consume AIC.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Currency</label>
                      <input
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={projectSettingsForm.budgetCurrency}
                        onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, budgetCurrency: e.target.value.toUpperCase() }))}
                        placeholder="AIC"
                      />
                    </div>
                  </div>
                  <div className="grid gap-4 lg:grid-cols-[1fr_1fr_180px]">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Active Agents</label>
                      <input
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        type="number"
                        min="1"
                        max={PROJECT_MAX_ACTIVE_AGENTS_CAP}
                        step="1"
                        value={projectSettingsForm.maxActiveAgents}
                        onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, maxActiveAgents: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current active agents: {activeAgentCount}. Plan maximum: {PROJECT_MAX_ACTIVE_AGENTS_CAP}.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Max Active Goals</label>
                      <input
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        type="number"
                        min="1"
                        max={PROJECT_MAX_ACTIVE_GOALS_CAP}
                        step="1"
                        value={projectSettingsForm.maxActiveGoals}
                        onChange={(e) => setProjectSettingsForm((prev) => ({ ...prev, maxActiveGoals: e.target.value }))}
                      />
                      <p className="text-xs text-muted-foreground">
                        Current active goals: {activeGoalCount}. Plan maximum: {PROJECT_MAX_ACTIVE_GOALS_CAP}.
                      </p>
                    </div>
                    <div className="flex items-end">
                      <Badge
                        className="whitespace-normal text-center leading-5"
                        variant={
                          activeAgentCapacityReached || activeGoalCount >= maxActiveGoalsNumber
                            ? 'warning'
                            : 'secondary'
                        }
                      >
                        {activeAgentCount}/{maxActiveAgents} agents / {activeGoalCount}/{maxActiveGoals} goals
                      </Badge>
                    </div>
                  </div>
                  <div className="space-y-4 rounded-lg border px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">Personal Project Template</p>
                        <p className="text-sm text-muted-foreground">
                          Save reusable project configuration, role prompts, role skills, folders, globals, and role agent defaults.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={handleSaveProjectTemplate}
                        disabled={!canManageProject || savingProjectTemplate}
                      >
                        <Save className="mr-2 h-4 w-4" />
                        {savingProjectTemplate ? 'Saving...' : 'Save template'}
                      </Button>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Template Name</label>
                        <input
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={projectTemplateForm.name}
                          onChange={(e) => setProjectTemplateForm((prev) => ({ ...prev, name: e.target.value }))}
                          disabled={!canManageProject || savingProjectTemplate}
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Description</label>
                        <input
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={projectTemplateForm.description}
                          onChange={(e) => setProjectTemplateForm((prev) => ({ ...prev, description: e.target.value }))}
                          disabled={!canManageProject || savingProjectTemplate}
                        />
                      </div>
                    </div>
                    {projectTemplateSaveMessage ? (
                      <p className="text-sm text-emerald-500">{projectTemplateSaveMessage}</p>
                    ) : null}
                  </div>
                  <div className="space-y-4 rounded-lg border px-4 py-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <Route className="h-4 w-4 text-primary" />
		                        <p className="font-medium">Local Runner Device</p>
                        </div>
                        <p className="text-sm text-muted-foreground">
		                          Create an account-scoped command for the Docker runner or local agent runner.
		                          One runner process on this computer can claim queued local jobs across your manageable projects.
                        </p>
                      </div>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={handleCreateLocalRunnerToken}
                        disabled={creatingLocalRunnerToken}
                      >
                        <KeyRound className="mr-2 h-4 w-4" />
                        {creatingLocalRunnerToken ? 'Creating...' : 'Create Token'}
                      </Button>
                    </div>
                    {localRunnerTokenResult ? (
                      <div className="space-y-3">
                        <div className="rounded-md border bg-background px-3 py-3">
                          <div className="mb-2 flex items-center justify-between gap-3">
                            <p className="text-sm font-medium">Runner command</p>
                            <Button type="button" size="sm" variant="ghost" onClick={() => void handleCopyLocalRunnerCommand()}>
                              <ClipboardCheck className="mr-2 h-4 w-4" />
                              {localRunnerTokenCopied ? 'Copied' : 'Copy'}
                            </Button>
                          </div>
                          <div className="mb-3 flex flex-wrap gap-2">
                            {LOCAL_RUNNER_COMMAND_OPTIONS.map((option) => (
                              <button
                                key={option.id}
                                type="button"
                                className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                                  localRunnerCommandMode === option.id
                                    ? 'border-primary bg-primary/10 text-foreground'
                                    : 'border-border text-muted-foreground hover:border-primary/50'
                                }`}
                                onClick={() => void handleSelectLocalRunnerCommandMode(option.id)}
                              >
                                {option.label}
                              </button>
                            ))}
                          </div>
                          <p className="mb-3 text-[11px] text-muted-foreground">
                            Selected for this browser: {localRunnerCommandModeLabel}.
                          </p>
                          <pre className="max-h-40 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 px-3 py-2 font-mono text-xs">
                            {localRunnerTokenResult.commands[localRunnerCommandMode]}
                          </pre>
                        </div>
                        <div className="rounded-md border bg-muted/10 px-3 py-3 text-xs leading-5 text-muted-foreground">
                          <p className="font-medium text-foreground">Before running</p>
                          {localRunnerTokenResult.mode === 'local-codex' ? (
                            <p>Install Node.js 22.19+. Codex jobs use Codex CLI from PATH; Pi jobs auto-install the Pi npm package if `pi` is not already available.</p>
                          ) : (
                            <p>Install Node.js 18+ and start Docker Desktop.</p>
                          )}
                          <p>No repo checkout is required. The command downloads the runner script from AgentCraft.</p>
                          {localRunnerTokenResult.mode === 'local-codex' ? (
                            <p>No local agent directory is required. Edit `--codex-bin` or `--pi-bin` only when the CLI lives outside PATH.</p>
                          ) : (
                            <p>The Hermes Docker image for this runtime must be available locally or pullable by Docker.</p>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          This device token is shown once. Create a new one if you lose it.
                        </p>
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        No runner command generated in this browser session.
                      </div>
                    )}
                  </div>
                  <div className="space-y-4 rounded-lg border px-4 py-4" data-project-global-resources="true">
                    <div className="flex items-start justify-between gap-3">
                      <div className="space-y-1">
                        <p className="font-medium">Project Global Resources</p>
                        <p className="text-sm text-muted-foreground">
                          Save reusable values such as `github_token`, deployment endpoints, or other human-world resources.
                          Missing required values can open an Owner task automatically, and saving the value later will close that task.
                        </p>
                      </div>
                      {canEditProjectGlobals ? (
                        <Button type="button" size="sm" variant="outline" onClick={handleAddProjectGlobal}>
                          <Plus className="mr-2 h-4 w-4" />
                          Add Resource
                        </Button>
                      ) : null}
                    </div>

                    {(projectSettingsForm.projectGlobals || []).length ? (
                      <div className="space-y-4">
                        {(projectSettingsForm.projectGlobals || []).map((global, index) => (
                          <div key={`${global.key || 'global'}-${index}`} className="rounded-lg border px-3 py-3">
                            <div className="grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Key</label>
                                <input
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={global.key || ''}
                                  onChange={(e) => handleProjectGlobalChange(index, 'key', e.target.value)}
                                  placeholder="github_token"
                                  disabled={!canEditProjectGlobals}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Label</label>
                                <input
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={global.label || ''}
                                  onChange={(e) => handleProjectGlobalChange(index, 'label', e.target.value)}
                                  placeholder="GitHub Token"
                                  disabled={!canEditProjectGlobals}
                                />
                              </div>
                            </div>
                            <div className="mt-4 grid gap-4 md:grid-cols-2">
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Category</label>
                                <input
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  value={global.category || ''}
                                  onChange={(e) => handleProjectGlobalChange(index, 'category', e.target.value)}
                                  placeholder="credential"
                                  disabled={!canEditProjectGlobals}
                                />
                              </div>
                              <div className="space-y-2">
                                <label className="text-sm font-medium">Value</label>
                                <input
                                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                  type={global.isSecret ? 'password' : 'text'}
                                  value={global.value || ''}
                                  onChange={(e) => handleProjectGlobalChange(index, 'value', e.target.value)}
                                  placeholder={global.isSecret ? 'Stored securely for project runtimes' : 'Value'}
                                  disabled={!canEditProjectGlobals}
                                />
                              </div>
                            </div>
                            <div className="mt-4 space-y-2">
                              <label className="text-sm font-medium">Description</label>
                              <textarea
                                className="min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={global.description || ''}
                                onChange={(e) => handleProjectGlobalChange(index, 'description', e.target.value)}
                                placeholder="What this resource unlocks for the project or agent"
                                disabled={!canEditProjectGlobals}
                              />
                            </div>
                            <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={global.isSecret !== false}
                                  onChange={(e) => handleProjectGlobalChange(index, 'isSecret', e.target.checked)}
                                  disabled={!canEditProjectGlobals}
                                />
                                Secret
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={global.required !== false}
                                  onChange={(e) => handleProjectGlobalChange(index, 'required', e.target.checked)}
                                  disabled={!canEditProjectGlobals}
                                />
                                Required
                              </label>
                              <label className="inline-flex items-center gap-2">
                                <input
                                  type="checkbox"
                                  checked={global.createTaskOnMissing !== false}
                                  onChange={(e) => handleProjectGlobalChange(index, 'createTaskOnMissing', e.target.checked)}
                                  disabled={!canEditProjectGlobals}
                                />
                                Create Owner task when missing
                              </label>
                              <Badge variant={global.configured || global.value ? 'success' : 'secondary'}>
                                {global.configured || global.value ? 'configured' : 'missing'}
                              </Badge>
                              {canEditProjectGlobals ? (
                                <Button type="button" size="sm" variant="ghost" onClick={() => handleRemoveProjectGlobal(index)}>
                                  Remove
                                </Button>
                              ) : null}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="rounded-md border border-dashed px-3 py-4 text-sm text-muted-foreground">
                        No project global resources yet.
                      </div>
                    )}
                  </div>
                  <Button type="submit" className="w-full" disabled={savingProjectSettings}>
                    {savingProjectSettings ? 'Saving...' : 'Save Project Settings'}
                  </Button>
                </CardContent>
              </form>
            </Card>
          )}

          {activeProjectSection === 'settings' && !canManageProject && (
            <Card>
              <CardContent className="py-10 text-sm text-muted-foreground">
                Project settings are available to the project owner or lead agent.
              </CardContent>
            </Card>
          )}

          {activeProjectSection === 'members' && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Sparkles className="h-5 w-5" />
                Team Panel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4 border-b pb-6">
                <div className="space-y-1">
                  <h3 className="font-medium">Agent Conversations</h3>
                  <p className="text-sm text-muted-foreground">
                    Select a project member instance to open its chat, launch runtime, or create another role instance.
                  </p>
                </div>
                <div className="grid gap-3 xl:grid-cols-[276px_minmax(0,1fr)]">
                  <div className="h-[720px] space-y-1.5 overflow-y-auto pr-1">
                    <div
                      role="button"
                      tabIndex={0}
                      className={`w-full rounded-lg border px-2.5 py-2.5 text-left transition-colors ${
                        selectedCoordinator ? 'border-primary/70 bg-primary/10' : 'hover:border-primary/50 hover:bg-muted/20'
                      }`}
                      onClick={() => {
                        setSelectedAgentMemberId(COORDINATOR_MEMBER_ID);
                        setSelectedAgentConversationId('');
                        setAgentRuntimePanel(null);
                        setCoordinatorConfigOpen(false);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedAgentMemberId(COORDINATOR_MEMBER_ID);
                          setSelectedAgentConversationId('');
                          setAgentRuntimePanel(null);
                          setCoordinatorConfigOpen(false);
                        }
                      }}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 space-y-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Workflow className="h-4 w-4 shrink-0 text-primary" />
                            <p className="truncate text-sm font-semibold text-foreground">Coordinator</p>
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            <Badge variant="outline">COORDINATOR</Badge>
                            <Badge variant={projectCoordinatorConfig.enabled ? 'success' : 'secondary'}>
                              {projectCoordinatorConfig.enabled ? 'triggered' : 'paused'}
                            </Badge>
                            <Badge variant="outline">{projectCoordinatorConfig.agentType || 'pi'}</Badge>
                          </div>
                          <p className="truncate text-xs text-muted-foreground">
                            {projectCoordinatorConfig.launchMode || 'local-docker'} · {(projectCoordinatorConfig.dispatchRules || []).length} trigger rule(s)
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50"
                            title="Run coordinator"
                            disabled={!canManageProject || runningCoordinator}
                            onClick={(event) => {
                              event.stopPropagation();
                              setSelectedAgentMemberId(COORDINATOR_MEMBER_ID);
                              setCoordinatorConfigOpen(false);
                              void handleRunProjectCoordinator();
                            }}
                          >
                            <RefreshCw className={`h-3.5 w-3.5 ${runningCoordinator ? 'animate-spin' : ''}`} />
                          </button>
                        </div>
                      </div>
                    </div>
	                    {projectConversationMembers.length ? (
	                      projectConversationMembers.map((member) => {
	                        const runtime = runtimeByMemberId.get(member.id);
	                        const cockpit = cockpitByMemberId.get(member.id);
	                        const selected = selectedAgentMemberId === member.id;
	                        const canLaunch = member.role !== 'OWNER' && member.role.includes('_AGENT');
	                        const RoleIcon = roleIconForRole(member.role);
	                        const memberRuntimeStates = assignmentRuntimeStatesByMemberId.get(member.id) || [];
	                        const memberOpenAssignments = memberRuntimeStates.filter((assignment) =>
	                          ['PROPOSED', 'ACTIVE', 'PAUSED'].includes(String(assignment.status || '').toUpperCase()),
	                        );
		                        const memberStaleAssignments = memberRuntimeStates.filter((assignment) => assignment.health?.stale);
		                        const memberPollingConfig = agentPollingConfigFor(member, runtime);
                            const runtimeStatus = agentRuntimeStatus(runtime);
                            const isTyping = runtimeStatus === 'TYPING';
                            const isOffline = agentRuntimeIsOffline(runtime);
                            const memberCardClassName = `w-full rounded-lg border px-2.5 py-2.5 text-left transition-colors ${
                              isTyping
                                ? 'border-emerald-300/80 bg-emerald-50/70 shadow-[0_0_0_1px_rgba(16,185,129,0.18),0_0_24px_rgba(16,185,129,0.16)] animate-pulse hover:border-emerald-400 dark:border-emerald-500/50 dark:bg-emerald-950/20'
                                : selected
                                  ? isOffline
                                    ? 'border-primary/50 bg-slate-50/90 text-slate-500 hover:bg-slate-100/80 dark:bg-slate-800/35 dark:text-slate-400'
                                    : 'border-primary/70 bg-primary/10'
                                  : isOffline
                                    ? 'border-slate-200 bg-slate-50/70 text-slate-500 hover:bg-slate-100/80 dark:border-slate-700/60 dark:bg-slate-800/30 dark:text-slate-400'
                                    : 'hover:border-primary/50 hover:bg-muted/20'
                            }`;
                            const memberNameClassName = isOffline ? 'font-medium text-slate-500 dark:text-slate-400' : agentNameClassName(member);
                            const memberIconClassName = isOffline
                              ? 'text-slate-400 dark:text-slate-500'
                              : isTyping
                                ? 'text-emerald-500'
                                : 'text-primary';
		                        return (
                          <div
                            key={member.id}
                            role="button"
                            tabIndex={0}
                            data-tour={member.role === 'LEAD_AGENT' ? 'project-lead-agent-card' : undefined}
                            className={memberCardClassName}
                            onClick={() => handleSelectAgentRuntime(member.id)}
                            onKeyDown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                handleSelectAgentRuntime(member.id);
                              }
                            }}
                          >
                            <div className="flex items-start justify-between gap-2">
		                              <div className="min-w-0 space-y-2">
		                                <div className="flex min-w-0 items-center gap-2">
		                                  <RoleIcon className={`h-4 w-4 shrink-0 ${memberIconClassName}`} />
		                                  <p className={`truncate text-sm ${memberNameClassName}`}>
		                                    {formatAgentDisplayName(member)}
		                                  </p>
		                                </div>
	                                <div className="flex flex-wrap gap-1.5">
	                                  <Badge variant="outline">{formatRoleLabel(member.role)}</Badge>
                                  <Badge variant={runtime ? AGENT_RUNTIME_STATUS_VARIANT[runtime.session.status] || 'secondary' : 'secondary'}>
                                    {runtime ? formatRuntimeStatusLabel(runtime.session.status) : 'pending launch'}
                                  </Badge>
                                </div>
                                <p className="truncate text-xs text-muted-foreground">{member.user.email}</p>
                                {cockpit?.metrics.activeAssignments ? (
                                  <p className="text-xs text-muted-foreground">{cockpit.metrics.activeAssignments} active assignment(s)</p>
                                ) : null}
                                {memberOpenAssignments.length || memberStaleAssignments.length ? (
                                  <div className="flex flex-wrap gap-1.5">
                                    {memberOpenAssignments.length ? (
                                      <Badge variant="secondary">{memberOpenAssignments.length} open</Badge>
                                    ) : null}
                                    {memberStaleAssignments.length ? (
                                      <Badge variant="destructive">{memberStaleAssignments.length} stale</Badge>
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {runtime ? (
                                  <>
                                    {member.role === 'LEAD_AGENT' ? (
                                      <button
                                        type="button"
                                        className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground disabled:opacity-50"
                                        title={memberPollingConfig.message.trim() ? 'Run polling now' : 'Configure a polling message before running now'}
                                        disabled={
                                          isReadOnly ||
                                          !memberPollingConfig.message.trim() ||
                                          runningAgentPollingMemberId === member.id ||
                                          savingAgentPollingMemberId === member.id
                                        }
                                        onClick={(event) => {
                                          event.stopPropagation();
                                          void handleRunAgentPollingNow(member, runtime);
                                        }}
                                      >
                                        <RefreshCw className={`h-3.5 w-3.5 ${runningAgentPollingMemberId === member.id ? 'animate-spin' : ''}`} />
                                      </button>
                                    ) : null}
                                    <button
                                      type="button"
                                      className={`relative h-6 w-10 rounded-full border transition-colors ${
                                        memberPollingConfig.enabled
                                          ? 'border-primary bg-primary/25'
                                          : 'border-border bg-muted/30'
                                      }`}
                                      title={memberPollingConfig.enabled ? 'Disable timed polling' : 'Enable timed polling'}
                                      disabled={isReadOnly || savingAgentPollingMemberId === member.id}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        void handleToggleAgentPolling(member, runtime);
                                      }}
                                    >
                                      <span
                                        className={`absolute left-0 top-1 h-4 w-4 rounded-full bg-foreground transition-transform ${
                                          memberPollingConfig.enabled ? 'translate-x-5' : 'translate-x-1'
                                        }`}
                                      />
                                    </button>
                                    <button
                                      type="button"
                                      className="flex h-7 w-7 items-center justify-center rounded-md border text-muted-foreground transition-colors hover:border-primary/60 hover:text-foreground"
                                      title="Configure timed polling"
                                      disabled={isReadOnly}
                                      onClick={(event) => {
                                        event.stopPropagation();
                                        handleSelectAgentRuntime(member.id);
                                        setAgentRuntimePanel('polling');
                                      }}
                                    >
                                      <Settings2 className="h-3.5 w-3.5" />
                                    </button>
                                  </>
                                ) : canLaunch ? (
                                  <span className="rounded-md border px-2 py-1 text-xs text-muted-foreground">Launch</span>
                                ) : null}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    ) : (
                      <div className="rounded-lg border border-dashed px-4 py-5 text-sm">
                        <p className="font-medium">No agent members yet.</p>
                        <p className="mt-1 leading-6 text-muted-foreground">
                          Start by creating a LEAD_AGENT so the project has a coordinator.
                        </p>
                      </div>
                    )}
                    <button
                      type="button"
                      data-tour="project-create-agent"
                      className="w-full rounded-lg border border-dashed bg-muted/10 px-3 py-3 text-left transition-colors hover:border-primary/60 hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isReadOnly || activeAgentCapacityReached}
                      title={activeAgentCapacityReached ? activeAgentCapacityMessage : undefined}
                      onClick={() => handleOpenLaunchAgentRuntime(hasActiveLeadAgent ? 'WORKER_AGENT' : 'LEAD_AGENT')}
                    >
                      <div className="flex items-start gap-3">
                        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-secondary">
                          <Plus className="h-4 w-4 text-primary" />
                        </span>
                        <span className="min-w-0 space-y-1">
                          <span className="block text-sm font-medium">
                            {hasActiveLeadAgent ? 'Add project member' : 'Create LEAD_AGENT'}
                          </span>
                          <span className="block text-xs leading-5 text-muted-foreground">
                            {hasActiveLeadAgent
                              ? 'Create another role instance with its own runtime and conversation.'
                              : 'Start with a lead agent so the project has a coordinator.'}
                          </span>
                        </span>
                      </div>
                    </button>
                  </div>
                  <div className="hidden h-[720px] space-y-2 overflow-y-auto pr-1">
	                  {roleCoverage.map(({ role, label, members, contract }) => {
	                    const roleRuntimes = runtimesByRole.get(role) || [];
	                    const launchable = !isReadOnly && role !== 'OWNER';
	                    const roleLaunchCapacityBlocked = activeAgentCapacityReached && launchWouldAddActiveAgent(members[0]?.id);
	                    const selectedRoleMember = members.find((member) => member.id === selectedAgentMemberId);
	                    const firstSelectableMemberId = roleRuntimes[0]?.memberId || members[0]?.id;
	                    const isSelectedRole = Boolean(selectedRoleMember);
	                    const canSelectRole = Boolean(firstSelectableMemberId);
	                    const RoleIcon = roleIconForRole(role);
	                    return (
                    <div
                      key={role}
                      className={`rounded-lg border px-3 py-3 ${
                        isSelectedRole
                          ? 'border-primary/70 bg-primary/5'
                          : ''
                      } ${canSelectRole ? 'cursor-pointer transition-colors hover:border-primary/60 hover:bg-muted/20' : ''}`}
                      onClick={() => firstSelectableMemberId && handleSelectAgentRuntime(firstSelectableMemberId)}
                    >
	                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
	                        <div className="flex items-center gap-2">
	                          <RoleIcon className="h-4 w-4 text-primary" />
	                          <p className="text-sm font-medium">{label}</p>
                          {contract && (
                            <Button
                              size="icon"
                              variant="ghost"
                              className="h-6 w-6"
                              title="Role description and skills"
                              onClick={(event) => {
                                event.stopPropagation();
                                setExpandedRoleInfo((current) => (current === role ? '' : role));
                              }}
                            >
                              <Info className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          {roleRuntimes[0]?.session?.status && (
                            <Badge variant={AGENT_RUNTIME_STATUS_VARIANT[roleRuntimes[0].session.status] || 'secondary'}>
                              {roleRuntimes[0].session.status.toLowerCase().replace('_', ' ')}
                            </Badge>
                          )}
                          <Badge variant={members.length ? 'success' : 'secondary'}>
                            {members.length ? `${members.length} staffed` : 'open'}
                          </Badge>
                          {launchable && (
                            <>
                              {!IS_PRODUCTION_AGENTCRAFT_HOST && (
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8"
                                  title={roleLaunchCapacityBlocked ? activeAgentCapacityMessage : members.length ? 'Launch local Docker agent' : 'Assign and launch local Docker agent'}
                                  disabled={launchingRole === role || roleLaunchCapacityBlocked}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenLaunchAgentRuntime(role, members[0]?.id, 'local-docker');
                                  }}
                                >
                                  <Rocket className="h-4 w-4" />
                                </Button>
                              )}
                              {IS_PRODUCTION_AGENTCRAFT_HOST && (
                                <Button
                                  size="icon"
                                  variant="secondary"
                                  className="h-8 w-8"
                                  title={roleLaunchCapacityBlocked ? activeAgentCapacityMessage : members.length ? 'Queue local runner agent' : 'Assign and queue local runner agent'}
                                  disabled={launchingRole === role || roleLaunchCapacityBlocked}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleOpenLaunchAgentRuntime(role, members[0]?.id, 'local-runner');
                                  }}
                                >
                                  <Route className="h-4 w-4" />
                                </Button>
                              )}
                              <Button
                                size="icon"
                                variant="secondary"
                                className="h-8 w-8"
                                title={roleLaunchCapacityBlocked ? activeAgentCapacityMessage : members.length ? 'Queue local agent' : 'Assign and queue local agent'}
                                disabled={launchingRole === role || roleLaunchCapacityBlocked}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleOpenLaunchAgentRuntime(role, members[0]?.id, 'local-codex');
                                }}
                              >
                                <Brain className="h-4 w-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                title="Cloud Agent is temporarily unavailable"
                                disabled
                                onClick={(event) => {
                                  event.stopPropagation();
                                }}
                              >
                                <Cloud className="h-4 w-4" />
                              </Button>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="space-y-1 text-xs text-muted-foreground">
                        <p>
                          <span className="font-medium text-foreground">Reads:</span> {contract?.reads}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Writes:</span> {contract?.writes}
                        </p>
                        <p>
                          <span className="font-medium text-foreground">Trigger:</span> {contract?.trigger}
                        </p>
                      </div>
                      {contract && expandedRoleInfo === role && (
                        <div className="mt-3 space-y-3 rounded-md border bg-muted/10 p-3 text-xs" onClick={(event) => event.stopPropagation()}>
                          <p className="leading-5 text-muted-foreground">{contract.description}</p>
                          <div className="space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="font-medium text-foreground">Skills</p>
                              <Badge variant="outline">{contract.skills.length}</Badge>
                            </div>
                            {contract.skills.length ? (
                              <div className="space-y-2">
                                {contract.skills.map((skill) => (
                                  <div key={skill.ref} className="rounded-md border bg-background px-2.5 py-2">
                                    <div className="flex flex-wrap items-center gap-2">
                                      <span className="font-medium text-foreground">{skill.name}</span>
                                      <Badge variant={skill.source === 'role' ? 'default' : 'outline'}>
                                        {skill.source === 'role' ? 'role local' : 'external'}
                                      </Badge>
                                    </div>
                                    <p className="mt-1 leading-5 text-muted-foreground">{skill.description}</p>
                                    <p className="mt-1 break-all font-mono text-[11px] text-muted-foreground">{skill.ref}</p>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground">No runtime skills configured for this role.</p>
                            )}
                          </div>
                        </div>
                      )}
                      {members.length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {members.map((member) => {
                            const cockpit = cockpitByMemberId.get(member.id);
                            const runtime = runtimeByMemberId.get(member.id);
                            return (
                              <Badge
                                key={member.id}
                                variant={runtime ? 'default' : 'outline'}
                                className="cursor-pointer"
                                title={runtime ? 'Open agent detail' : 'Select member and launch runtime'}
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleSelectAgentRuntime(member.id);
                                }}
	                              >
	                                {formatAgentDisplayName(member) +
	                                  (cockpit?.metrics.activeAssignments ? ` · ${cockpit.metrics.activeAssignments} active` : '')}
	                              </Badge>
                            );
                          })}
                        </div>
	                      )}
	                    </div>
	                    );
	                  })}
                  </div>

                  <div className="h-[720px] overflow-hidden rounded-lg border bg-background">
                    <div className="flex h-full min-h-0 flex-col">
                      {selectedCoordinator ? (
                        <div className="flex min-h-0 flex-1 flex-col">
                          <div className="border-b px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
                                <div className="flex flex-wrap items-center gap-2">
                                  <p className="truncate text-lg font-semibold text-foreground">Coordinator</p>
                                  <Badge variant={projectCoordinatorConfig.enabled ? 'success' : 'secondary'}>
                                    {projectCoordinatorConfig.enabled ? 'enabled' : 'disabled'}
                                  </Badge>
                                  <Badge variant="outline">{projectCoordinatorConfig.launchMode || 'local-docker'}</Badge>
                                  <Badge variant="outline">{projectCoordinatorConfig.agentType || 'pi'}</Badge>
                                </div>
                                <p className="truncate text-xs text-muted-foreground">
                                  System coordinator · triggered by item status rules
                                  {projectCoordinatorConfig.lastTickAt ? ` · last trigger ${formatProjectDate(projectCoordinatorConfig.lastTickAt)}` : ''}
                                </p>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={coordinatorConfigOpen ? 'secondary' : 'outline'}
                                  aria-pressed={coordinatorConfigOpen}
                                  onClick={() => setCoordinatorConfigOpen((open) => !open)}
                                >
                                  <Settings2 className="mr-2 h-4 w-4" />
                                  Config
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  disabled={!canManageProject || runningCoordinator}
                                  onClick={() => void handleRunProjectCoordinator()}
                                >
                                  <RefreshCw className={`mr-2 h-4 w-4 ${runningCoordinator ? 'animate-spin' : ''}`} />
                                  {runningCoordinator ? 'Running...' : 'Run trigger now'}
                                </Button>
                              </div>
                            </div>
                          </div>

                          <div className={`grid min-h-0 flex-1 ${coordinatorConfigOpen ? 'lg:grid-cols-[minmax(0,1fr)_340px]' : ''}`}>
                            <div className="min-h-0 overflow-y-auto px-4 py-4">
                              <div className="space-y-4">
                                <div className="rounded-lg bg-muted/10 px-4 py-3">
                                  <div className="mb-3 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                      <Workflow className="h-4 w-4 text-primary" />
                                      Main work log
                                    </div>
                                    <Badge variant="outline">{projectCoordinatorEvents.length}</Badge>
                                  </div>
                                  {projectCoordinatorEvents.length ? (
                                    <div className="space-y-3">
                                      {projectCoordinatorEvents.slice(0, 18).map((coordinatorEvent) => (
                                        <div key={coordinatorEvent.id} className="rounded-md bg-background/80 px-3 py-2 text-sm">
                                          <div className="flex flex-wrap items-center justify-between gap-2">
                                            <span className="font-medium text-foreground">{coordinatorEvent.message}</span>
                                            <Badge variant="outline">#{coordinatorEvent.seq}</Badge>
                                          </div>
                                          <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                                            <span>{formatProjectDate(coordinatorEvent.createdAt)}</span>
                                            <span>{coordinatorEvent.type}</span>
                                            {coordinatorEvent.dispatchMode ? <span>{coordinatorEvent.dispatchMode}</span> : null}
                                            {coordinatorEvent.reason ? <span>{coordinatorEvent.reason}</span> : null}
                                            {coordinatorEvent.conversationId ? <span>conversation {coordinatorEvent.conversationId}</span> : null}
                                          </div>
                                          {coordinatorEvent.memberId && coordinatorEvent.conversationId ? (
                                            <Button
                                              type="button"
                                              size="sm"
                                              variant="ghost"
                                              className="mt-2 h-7 px-2 text-xs"
                                              onClick={() => {
                                                setSelectedAgentMemberId(coordinatorEvent.memberId);
                                                setSelectedAgentConversationId(coordinatorEvent.conversationId);
                                                setAgentHistoryOpen(true);
                                                setAgentRuntimePanel(null);
                                                setCoordinatorConfigOpen(false);
                                              }}
                                            >
                                              <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
                                              Open agent conversation
                                            </Button>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  ) : visibleCoordinatorLogs.length ? (
                                    <div className="space-y-2 font-mono text-xs leading-5 text-muted-foreground">
                                      {visibleCoordinatorLogs.map((line, index) => (
                                        <p key={`${line}-${index}`}>{line}</p>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="rounded-md bg-background/70 px-3 py-8 text-center text-sm text-muted-foreground">
                                      No coordinator logs yet.
                                    </div>
                                  )}
                                </div>
                                <div className="rounded-lg bg-muted/10 px-4 py-3">
                                  <div className="mb-3 flex items-center gap-2 text-sm font-medium">
                                    <Workflow className="h-4 w-4 text-primary" />
                                    Event graph coverage
                                  </div>
                                  <div className="grid gap-2 sm:grid-cols-3">
                                    <div className="rounded-md bg-background/80 px-3 py-2">
                                      <p className="text-xs text-muted-foreground">Coordinator events</p>
                                      <p className="text-lg font-semibold">{projectCoordinatorEvents.length}</p>
                                    </div>
                                    <div className="rounded-md bg-background/80 px-3 py-2">
                                      <p className="text-xs text-muted-foreground">Dispatches</p>
                                      <p className="text-lg font-semibold">
                                        {projectCoordinatorEvents.filter((event) => event.type === 'COORDINATOR_DISPATCHED_ITEM').length}
                                      </p>
                                    </div>
                                    <div className="rounded-md bg-background/80 px-3 py-2">
                                      <p className="text-xs text-muted-foreground">Blocks</p>
                                      <p className="text-lg font-semibold">
                                        {projectCoordinatorEvents.filter((event) => event.type === 'COORDINATOR_BLOCKED').length}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                <div className="rounded-lg bg-muted/10 px-4 py-3">
                                  <div className="mb-3 flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 text-sm font-medium">
                                      <Route className="h-4 w-4 text-primary" />
                                      Trigger rules
                                    </div>
                                    <Badge variant="outline">{(projectCoordinatorConfig.dispatchRules || []).length}</Badge>
                                  </div>
                                  {(projectCoordinatorConfig.dispatchRules || []).length ? (
                                    <div className="space-y-2">
                                      {(projectCoordinatorConfig.dispatchRules || []).map((rule, index) => (
                                        <div key={`${rule.role}-${index}`} className="rounded-md bg-background/80 px-3 py-2 text-sm">
                                          <div className="flex flex-wrap items-center gap-2">
                                            <Badge variant="outline">{coordinatorRuleStatuses(rule)}</Badge>
                                            <Badge variant="secondary">{coordinatorRuleWorkTypes(rule)}</Badge>
                                            <span className="font-medium text-foreground">{rule.role}</span>
                                          </div>
                                          <p className="mt-1 text-xs text-muted-foreground">
                                            {displayLaunchTarget(
                                              rule.launchMode || projectCoordinatorConfig.launchMode || 'local-docker',
                                              rule.agentType || projectCoordinatorConfig.agentType || 'pi',
                                            )}
                                            {rule.minAgents ? ` · min ${rule.minAgents}` : ''}
                                            {rule.maxAgents ? ` · max ${rule.maxAgents}` : ''}
                                            {rule.forceLaunchNew === false ? ' · reusable runtime' : ' · new runtime'}
                                          </p>
                                          {rule.objective ? (
                                            <p className="mt-1 text-xs leading-5 text-muted-foreground">{rule.objective}</p>
                                          ) : null}
                                        </div>
                                      ))}
                                    </div>
                                  ) : (
                                    <div className="rounded-md bg-background/70 px-3 py-8 text-center text-sm text-muted-foreground">
                                      No explicit trigger rules. The coordinator will fall back to claimable items and WORKER_AGENT.
                                    </div>
                                  )}
                                </div>
                              </div>
                            </div>

                            {coordinatorConfigOpen ? (
                            <aside className="min-h-0 overflow-y-auto bg-muted/10 px-3 py-3">
                              <div className="space-y-3 rounded-md bg-background/80 p-3 text-xs">
                                <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                                  <span className="flex items-center gap-2">
                                    <Settings2 className="h-4 w-4 text-primary" />
                                    Coordinator Config
                                  </span>
                                </div>
                                <label className="flex items-center justify-between gap-3 rounded-md bg-muted/10 px-3 py-2">
                                  <span>
                                    <span className="block font-medium text-foreground">Enabled</span>
                                    <span className="block text-[11px] text-muted-foreground">Runs after item status changes match a trigger rule.</span>
                                  </span>
                                  <input
                                    type="checkbox"
                                    className="h-4 w-4"
                                    checked={coordinatorConfigDraft.enabled}
                                    disabled={!canManageProject || savingCoordinatorConfig}
                                    onChange={(event) =>
                                      setCoordinatorConfigDraft((current) => ({ ...current, enabled: event.target.checked }))
                                    }
                                  />
                                </label>
                                <label className="space-y-1.5">
                                  <span className="font-medium text-foreground">Max dispatches per trigger</span>
                                  <input
                                    type="number"
                                    min={1}
                                    max={20}
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={coordinatorConfigDraft.maxDispatchesPerTick}
                                    disabled={!canManageProject || savingCoordinatorConfig}
                                    onChange={(event) =>
                                      setCoordinatorConfigDraft((current) => ({
                                        ...current,
                                        maxDispatchesPerTick: Math.max(1, Number(event.target.value) || 1),
                                      }))
                                    }
                                  />
                                </label>
                                <label className="space-y-1.5">
                                  <span className="font-medium text-foreground">Launch mode</span>
                                  <select
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={coordinatorConfigDraft.launchMode || 'local-docker'}
                                    disabled={!canManageProject || savingCoordinatorConfig}
                                    onChange={(event) =>
                                      setCoordinatorConfigDraft((current) => ({
                                        ...current,
                                        launchMode: event.target.value as AgentLaunchMode,
                                      }))
                                    }
                                  >
                                    <option value="local-docker">local docker agent</option>
                                    <option value="local-runner">local runner agent</option>
                                    <option value="local-codex">local agent</option>
                                    <option value="aws-ecs">cloud agent</option>
                                    <option value="aws-agentcore">agentcore</option>
                                  </select>
                                </label>
                                <label className="space-y-1.5">
                                  <span className="font-medium text-foreground">Agent type</span>
                                  <input
                                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                                    value={coordinatorConfigDraft.agentType || 'pi'}
                                    disabled={!canManageProject || savingCoordinatorConfig}
                                    onChange={(event) =>
                                      setCoordinatorConfigDraft((current) => ({ ...current, agentType: event.target.value }))
                                    }
                                  />
                                </label>
                                <label className="space-y-1.5">
                                  <span className="font-medium text-foreground">Assignment message template</span>
                                  <textarea
                                    className="min-h-[132px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5"
                                    value={coordinatorConfigDraft.messageTemplate || ''}
                                    disabled={!canManageProject || savingCoordinatorConfig}
                                    onChange={(event) =>
                                      setCoordinatorConfigDraft((current) => ({ ...current, messageTemplate: event.target.value }))
                                    }
                                  />
                                </label>
                                <div className="rounded-md bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                                  Variables: {'{{title}}'}, {'{{workType}}'}, {'{{status}}'}, {'{{role}}'}, {'{{launchMode}}'}, {'{{launchModeRaw}}'}, {'{{agentType}}'}, {'{{launchTarget}}'}, {'{{goalTitle}}'}.
                                </div>
                                <label className="space-y-1.5">
                                  <span className="font-medium text-foreground">Trigger rules JSON</span>
                                  <textarea
                                    className="min-h-[220px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5"
                                    value={coordinatorRulesDraft}
                                    disabled={!canManageProject || savingCoordinatorConfig}
                                    onChange={(event) => setCoordinatorRulesDraft(event.target.value)}
                                  />
                                </label>
                                <div className="rounded-md bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                                  Each rule can set statuses, workTypes, role, launchMode, agentType, minAgents, maxAgents, objective, and message.
                                </div>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="secondary"
                                  className="w-full"
                                  disabled={!canManageProject || savingCoordinatorConfig}
                                  onClick={() => void handleSaveProjectCoordinatorConfig()}
                                >
                                  <Save className="mr-2 h-4 w-4" />
                                  {savingCoordinatorConfig ? 'Saving...' : 'Save coordinator'}
                                </Button>
                              </div>
                            </aside>
                            ) : null}
                          </div>
                        </div>
                      ) : selectedAgentRuntime ? (
                        <>
                          <div className="border-b px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
	                                <div className="flex flex-wrap items-center gap-2">
	                                  <p className={`truncate ${agentNameClassName(selectedAgentMember)}`}>
	                                    {selectedAgentMember ? formatAgentDisplayName(selectedAgentMember) : selectedAgentRuntime.user.displayName || selectedAgentRuntime.user.email}
	                                  </p>
	                                  <Badge variant="outline">{formatRoleLabel(selectedAgentRuntime.role)}</Badge>
                                  <Badge
                                    variant="outline"
                                    className="max-w-[160px] truncate border-primary/40 text-primary"
                                    title={`Agent type: ${formatAgentTypeLabel(selectedAgentRuntime.session.agentType)}${
                                      selectedAgentRuntime.session.image ? `\nImage: ${selectedAgentRuntime.session.image}` : ''
                                    }`}
                                  >
                                    {formatAgentTypeLabel(selectedAgentRuntime.session.agentType)}
                                  </Badge>
                                </div>
                                {(selectedAgentRuntime.session.llm?.modelName || selectedAgentRuntime.session.image) && (
                                  <p className="truncate text-xs text-muted-foreground">
                                    {selectedAgentRuntime.session.llm?.modelName || selectedAgentRuntime.session.image}
                                  </p>
                                )}
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {selectedAgentMember && (
                                  <div className="flex items-center gap-1 rounded-md border bg-muted/10 px-1.5 py-1">
                                    <button
                                      type="button"
                                      className={`relative h-7 w-12 rounded-full border transition-colors ${
                                        selectedAgentPollingConfig.enabled
                                          ? 'border-primary bg-primary/25'
                                          : 'border-border bg-muted/30'
                                      }`}
                                      title={selectedAgentPollingConfig.enabled ? 'Disable timed polling' : 'Enable timed polling'}
                                      disabled={isReadOnly || savingAgentPollingMemberId === selectedAgentMember.id}
                                      onClick={() => void handleToggleAgentPolling(selectedAgentMember, selectedAgentRuntime)}
                                    >
                                      <span
                                        className={`absolute left-0 top-1 h-5 w-5 rounded-full bg-foreground transition-transform ${
                                          selectedAgentPollingConfig.enabled ? 'translate-x-5' : 'translate-x-1'
                                        }`}
                                      />
                                    </button>
                                    <Button
                                      type="button"
                                      size="icon"
                                      variant={agentRuntimePanel === 'polling' ? 'secondary' : 'ghost'}
                                      className="h-7 w-7"
                                      title="Configure timed polling"
                                      onClick={() => setAgentRuntimePanel((panel) => (panel === 'polling' ? null : 'polling'))}
                                      disabled={isReadOnly}
                                    >
                                      <Settings2 className="h-3.5 w-3.5" />
                                    </Button>
                                  </div>
                                )}
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={agentRuntimePanel === 'workspace' ? 'secondary' : 'outline'}
                                  onClick={() => setAgentRuntimePanel((panel) => (panel === 'workspace' ? null : 'workspace'))}
                                >
                                  <FolderOpen className="mr-2 h-4 w-4" />
                                  Workspace
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={agentRuntimePanel === 'skills' ? 'secondary' : 'outline'}
                                  onClick={() => setAgentRuntimePanel((panel) => (panel === 'skills' ? null : 'skills'))}
                                >
                                  <Settings2 className="mr-2 h-4 w-4" />
                                  Skills
                                </Button>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant={agentRuntimePanel === 'scope' ? 'secondary' : 'outline'}
                                  onClick={() => setAgentRuntimePanel((panel) => (panel === 'scope' ? null : 'scope'))}
                                >
                                  <ShieldCheck className="mr-2 h-4 w-4" />
                                  Scope
                                </Button>
                                {selectedAgentMember && selectedAgentMember.role !== 'OWNER' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={agentRuntimePanel === 'prompt' ? 'secondary' : 'outline'}
                                    onClick={() => setAgentRuntimePanel((panel) => (panel === 'prompt' ? null : 'prompt'))}
                                    disabled={isReadOnly}
                                  >
                                    <FileText className="mr-2 h-4 w-4" />
                                    Prompt
                                  </Button>
                                )}
                                {project?.settings?.projectTemplateId && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    disabled={isReadOnly || refreshingProjectTemplate}
                                    onClick={() => void handleRefreshProjectTemplate()}
                                    title="Refresh saved template role prompts and apply them to current runtimes"
                                  >
                                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshingProjectTemplate ? 'animate-spin' : ''}`} />
                                    {refreshingProjectTemplate ? 'Refreshing...' : 'Refresh template'}
                                  </Button>
                                )}
                                {(selectedAgentRuntime.session.provider === 'local-runner' || selectedAgentRuntime.session.provider === 'local-codex') && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant={agentRuntimePanel === 'runner' ? 'secondary' : 'outline'}
                                    onClick={() => setAgentRuntimePanel((panel) => (panel === 'runner' ? null : 'runner'))}
                                  >
                                    <ClipboardCheck className="mr-2 h-4 w-4" />
                                    Command
                                  </Button>
                                )}
                                {selectedAgentMember?.role === 'LEAD_AGENT' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={
                                      isReadOnly ||
                                      runningAgentPollingMemberId === selectedAgentMember.id ||
                                      savingAgentPollingMemberId === selectedAgentMember.id ||
                                      !selectedAgentPollingConfig.message.trim()
                                    }
                                    onClick={() => void handleRunAgentPollingNow()}
                                    title="Force the selected lead agent to run its polling tick now"
                                  >
                                    <RefreshCw className={`mr-2 h-4 w-4 ${runningAgentPollingMemberId === selectedAgentMember.id ? 'animate-spin' : ''}`} />
                                    {runningAgentPollingMemberId === selectedAgentMember.id ? 'Running...' : 'Run polling now'}
                                  </Button>
                                )}
                                {selectedAgentCanReconnect && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="secondary"
                                    disabled={reconnectingMemberId === selectedAgentRuntime.memberId}
                                    onClick={() => void handleReconnectAgentRuntime(selectedAgentRuntime)}
                                  >
                                    <RefreshCw className={`mr-2 h-4 w-4 ${reconnectingMemberId === selectedAgentRuntime.memberId ? 'animate-spin' : ''}`} />
                                    {reconnectingMemberId === selectedAgentRuntime.memberId ? 'Reconnecting...' : 'Reconnect'}
                                  </Button>
                                )}
                                {selectedAgentMember && selectedAgentMember.role !== 'OWNER' && (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive"
                                    disabled={isReadOnly || removingMemberId === selectedAgentMember.id}
                                    onClick={() => handleOpenDismissMember(selectedAgentMember)}
                                  >
                                    {removingMemberId === selectedAgentMember.id ? 'Dismissing...' : 'Dismiss'}
                                  </Button>
                                )}
                              </div>
                            </div>
                            {selectedAgentErrorDetail && (
                              <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                                <div className="flex items-start gap-2">
                                  <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                  <div>
                                    <p className="font-medium">Runtime error</p>
                                    <p className="mt-0.5 break-words">{selectedAgentErrorDetail}</p>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>

                          <div
                            className="grid min-h-0 flex-1"
                            style={{
                              gridTemplateColumns: `${agentHistoryOpen ? `${agentHistoryWidth}px` : '44px'} minmax(0, 1fr) ${agentRuntimePanel ? (agentRuntimePanel === 'runner' || agentRuntimePanel === 'prompt' ? '420px' : agentRuntimePanel === 'polling' ? '320px' : '260px') : '0px'}`,
                            }}
                          >
                            <aside className="relative min-h-0 overflow-hidden border-r bg-muted/10">
                              <div className="flex h-full min-h-0 flex-col">
                                <button
                                  type="button"
                                  className={`flex items-center border-b px-3 py-3 text-left transition-colors hover:bg-muted/30 ${
                                    agentHistoryOpen ? 'justify-between' : 'justify-center'
                                  }`}
                                  title={agentHistoryOpen ? 'Collapse sessions' : 'Expand sessions'}
                                  onClick={() => setAgentHistoryOpen((open) => !open)}
                                >
                                  <span className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                  <History className="h-4 w-4" />
                                      {agentHistoryOpen && 'Sessions'}
                                  </span>
                                  {agentHistoryOpen && <Badge variant="outline">{agentConversationSessions.length}</Badge>}
                                </button>
                                {agentHistoryOpen ? (
                                  <div className="flex min-h-0 flex-1 flex-col">
                                    <div className="min-h-0 flex-1 overflow-y-auto py-2 pl-3 pr-2">
                                      {agentConversationSessions.length ? (
                                        agentConversationSessions.map(({ conversation, title, messageCount, updatedAt }) => {
                                          const isSelected = conversation.id === selectedAgentConversation?.id;
                                          const isEditing = editingAgentConversationId === conversation.id;
                                          const pendingDelete = pendingDeleteAgentConversationId === conversation.id;
                                          const deleteDisabled =
                                            deletingAgentConversationId === conversation.id ||
                                            (selectedAgentRuntime.session.status === 'TYPING' &&
                                              selectedAgentRuntime.session.activeRequestConversationId === conversation.id);
                                          return (
                                            <div
                                              key={conversation.id}
                                              className={`group relative rounded-md px-2 py-2.5 transition-colors ${
                                                isSelected ? 'bg-primary/10 text-foreground' : 'hover:bg-muted/50'
                                              }`}
                                            >
                                              {isEditing ? (
                                                <input
                                                  className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm"
                                                  value={agentConversationTitleDraft}
                                                  autoFocus
                                                  disabled={savingAgentConversationId === conversation.id}
                                                  onChange={(e) => setAgentConversationTitleDraft(e.target.value)}
                                                  onBlur={() => void handleSaveAgentConversationTitle(conversation.id)}
                                                  onKeyDown={(e) => {
                                                    if (e.key === 'Enter') {
                                                      e.preventDefault();
                                                      void handleSaveAgentConversationTitle(conversation.id);
                                                    }
                                                    if (e.key === 'Escape') {
                                                      setEditingAgentConversationId('');
                                                      setAgentConversationTitleDraft('');
                                                    }
                                                  }}
                                                />
                                              ) : (
                                                <div className="flex items-start gap-2">
                                                  <button
                                                    type="button"
                                                    className="min-w-0 flex-1 text-left"
                                                    title={title}
                                                    onClick={() => handleSelectAgentConversation(conversation.id)}
                                                    onDoubleClick={() => handleStartRenameAgentConversation(conversation, title)}
                                                  >
                                                    <span className="block truncate text-sm font-medium">{title}</span>
                                                  </button>
                                                  {!isReadOnly ? (
                                                    pendingDelete ? (
                                                      <button
                                                        type="button"
                                                        className="shrink-0 rounded-full bg-destructive/15 px-2 py-0.5 text-xs font-medium text-destructive hover:bg-destructive/25 disabled:opacity-50"
                                                        disabled={deleteDisabled}
                                                        onClick={() => void handleDeleteAgentConversation(conversation.id)}
                                                      >
                                                        {deletingAgentConversationId === conversation.id ? 'Deleting' : 'Confirm'}
                                                      </button>
                                                    ) : (
                                                      <button
                                                        type="button"
                                                        className="shrink-0 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100 focus:opacity-100 disabled:opacity-30"
                                                        title="Delete conversation"
                                                        disabled={deleteDisabled}
                                                        onClick={(e) => {
                                                          e.stopPropagation();
                                                          setPendingDeleteAgentConversationId(conversation.id);
                                                          setEditingAgentConversationId('');
                                                        }}
                                                      >
                                                        <Trash2 className="h-3.5 w-3.5" />
                                                      </button>
                                                    )
                                                  ) : null}
                                                </div>
                                              )}
                                              <span className="mt-1 flex items-center justify-between gap-2 text-[11px] text-muted-foreground">
	                                                <span className="truncate">{formatRoleLabel(selectedAgentRuntime.role)}</span>
                                                <span>{messageCount} msg</span>
                                              </span>
                                              <span className="mt-1 block truncate text-[11px] text-muted-foreground">
                                                {shortRuntimeTime(updatedAt)}
                                              </span>
                                            </div>
                                          );
                                        })
                                      ) : (
                                        <p className="px-3 py-6 text-sm text-muted-foreground">No sessions yet.</p>
                                      )}
                                    </div>
                                    <div className="border-t p-2">
                                      <Button
                                        type="button"
                                        variant="outline"
                                        size="sm"
                                        className="w-full justify-start"
                                        disabled={!selectedAgentCanCreateConversation || creatingAgentConversation}
                                        onClick={handleCreateAgentConversation}
                                      >
                                        <Plus className="mr-2 h-4 w-4" />
                                        {creatingAgentConversation ? 'Starting...' : 'New chat'}
                                      </Button>
                                    </div>
                                  </div>
                                ) : (
                                  <div className="flex min-h-0 flex-1 flex-col items-center py-2">
                                    <div className="flex min-h-0 flex-1 flex-col items-center gap-2 overflow-y-auto px-1">
                                    {agentConversationSessions.map(({ conversation, title }, index) => {
                                      const isSelected = conversation.id === selectedAgentConversation?.id;
                                      return (
                                        <button
                                          key={conversation.id}
                                          type="button"
                                          className={`h-8 w-8 rounded-md text-xs font-semibold transition-colors ${
                                            isSelected ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:bg-muted/40'
                                          }`}
                                          title={title}
                                          onClick={() => handleSelectAgentConversation(conversation.id)}
                                        >
                                          {index + 1}
                                        </button>
                                      );
                                    })}
                                    </div>
                                    <button
                                      type="button"
                                      className="mt-2 flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted/40 disabled:opacity-50"
                                      title={
                                        selectedAgentIsTyping
                                          ? 'Start a new chat while the current response continues'
                                          : 'New chat'
                                      }
                                      disabled={!selectedAgentCanCreateConversation || creatingAgentConversation}
                                      onClick={handleCreateAgentConversation}
                                    >
                                      <Plus className="h-4 w-4" />
                                    </button>
                                  </div>
                                )}
                              </div>
                              <div
                                className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent transition-colors hover:bg-primary/40"
                                title="Resize sessions"
                                onMouseDown={handleAgentHistoryResizeStart}
                              />
                            </aside>

                            <div className="min-h-0 overflow-y-auto px-4 py-4" data-agent-message-list="true">
                            <div className="space-y-4">
                              {selectedAgentMessages.length ? (
                                selectedAgentMessages.map((message) => {
                                  if (message.role === 'tool') {
                                    return (
	                                      <div key={message.id}>
	                                        {renderAgentActivity(message.actions || [], message.id)}
	                                      </div>
	                                    );
	                                  }
                                  const confirmationChoices = deriveAgentConfirmationChoices(message);
                                  return renderAgentMessage(message, { confirmationChoices });
                                })
                              ) : (
                                <div className="flex h-full min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                                  No messages yet.
                                </div>
                              )}
                              {selectedAgentIsTyping && (
                                <div className="flex justify-start">
                                  <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-6 shadow-sm">
                                    {selectedAgentTypingLines.length > 0 && (
                                      <div className="mb-2 space-y-1 text-xs leading-5 text-muted-foreground">
                                        {selectedAgentTypingLines.map((line) => (
                                          <div key={line}>{line}</div>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70" />
                                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
                                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                            </div>

                            <aside className="min-h-0 overflow-hidden border-l bg-muted/10">
                              <div className="min-h-0 h-full overflow-y-auto px-3 py-3 text-xs">
                                {agentRuntimePanel === 'polling' && (
                                  <div className="space-y-3 rounded-md border bg-background/80 p-3">
                                    <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                                      <span className="flex items-center gap-2">
                                        <Radar className="h-4 w-4 text-primary" />
                                        Timed Polling
                                      </span>
                                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <label className="flex items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2">
                                      <span className="space-y-0.5">
                                        <span className="block font-medium text-foreground">Enabled</span>
                                        <span className="block text-[11px] text-muted-foreground">Starts a fresh session when due.</span>
                                      </span>
                                      <input
                                        type="checkbox"
                                        className="h-4 w-4"
                                        checked={agentPollingDraft.enabled}
                                        onChange={(event) =>
                                          setAgentPollingDraft((current) => ({
                                            ...current,
                                            enabled: event.target.checked,
                                          }))
                                        }
                                      />
                                    </label>
                                    <div className="space-y-1.5">
                                      <label className="font-medium text-foreground">Strategy</label>
                                      <select
                                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                                        value={agentPollingDraft.strategy}
                                        onChange={(event) =>
                                          setAgentPollingDraft((current) => ({
                                            ...current,
                                            strategy: event.target.value === 'FIXED_INTERVAL' ? 'FIXED_INTERVAL' : 'IDLE_ONLY',
                                          }))
                                        }
                                      >
                                        <option value="IDLE_ONLY">When runtime is idle</option>
                                        <option value="FIXED_INTERVAL">Fixed interval</option>
                                      </select>
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="font-medium text-foreground">Interval minutes</label>
                                      <input
                                        type="number"
                                        min={1}
                                        max={1440}
                                        className="h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                                        value={agentPollingDraft.intervalMinutes}
                                        onChange={(event) =>
                                          setAgentPollingDraft((current) => ({
                                            ...current,
                                            intervalMinutes: Math.min(1440, Math.max(1, Number(event.target.value) || 1)),
                                          }))
                                        }
                                      />
                                    </div>
                                    <div className="space-y-1.5">
                                      <label className="font-medium text-foreground">Polling message</label>
                                      <textarea
                                        className="min-h-[96px] w-full rounded-md border border-input bg-background px-2 py-2 text-xs leading-5"
                                        value={agentPollingDraft.message}
                                        onChange={(event) =>
                                          setAgentPollingDraft((current) => ({
                                            ...current,
                                            message: event.target.value,
                                          }))
                                        }
                                        placeholder="keep working"
                                      />
                                    </div>
                                    <div className="rounded-md border bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                                      <p>Next run: {selectedAgentRuntime.session.pollingState?.nextRunAt ? formatProjectDate(selectedAgentRuntime.session.pollingState.nextRunAt) : 'after save'}</p>
                                      {selectedAgentRuntime.session.pollingState?.lastRunAt && (
                                        <p>Last run: {formatProjectDate(selectedAgentRuntime.session.pollingState.lastRunAt)}</p>
                                      )}
                                      {selectedAgentRuntime.session.pollingState?.lastCompletedAt && (
                                        <p>Last completed: {formatProjectDate(selectedAgentRuntime.session.pollingState.lastCompletedAt)}</p>
                                      )}
                                      {selectedAgentRuntime.session.pollingState?.lastError && (
                                        <p className="text-destructive">Last skip: {selectedAgentRuntime.session.pollingState.lastError}</p>
                                      )}
                                    </div>
                                    <div className="rounded-md border bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                                      <div className="mb-1 flex items-center justify-between gap-2">
                                        <span className="font-medium text-foreground">Runtime health</span>
                                        {selectedAgentRuntimeStates.some((assignment) => assignment.health?.stale) ? (
                                          <Badge variant="destructive">stale</Badge>
                                        ) : (
                                          <Badge variant="secondary">checked</Badge>
                                        )}
                                      </div>
                                      <p>
                                        Assignments: {selectedAgentRuntimeStates.length}
                                        {staleAssignmentRuntimeStates.length ? ` · ${staleAssignmentRuntimeStates.length} stale in project` : ''}
                                      </p>
                                      {selectedAgentRuntimeStates.slice(0, 3).map((assignment) => (
                                        <p key={assignment.id} className={assignment.health?.stale ? 'text-destructive' : ''}>
                                          {assignment.workItem?.title || assignment.workItemId}: {assignment.status}
                                          {assignment.health?.staleReasons?.length ? ` · ${assignment.health.staleReasons.join(', ')}` : ''}
                                        </p>
                                      ))}
                                    </div>
                                    <Button
                                      type="button"
                                      size="sm"
                                      variant="secondary"
                                      className="w-full justify-center"
                                      disabled={
                                        !selectedAgentMember ||
                                        savingAgentPollingMemberId === selectedAgentMember.id ||
                                        !agentPollingDraft.message.trim()
                                      }
                                      onClick={handleSaveAgentPollingDraft}
                                    >
                                      <Settings2 className="mr-2 h-4 w-4" />
                                      {savingAgentPollingMemberId === selectedAgentMember?.id ? 'Saving...' : 'Save polling config'}
                                    </Button>
                                    <Button
                                      type="button"
                                      size="sm"
                                      className="w-full justify-center"
                                      disabled={
                                        !selectedAgentMember ||
                                        runningAgentPollingMemberId === selectedAgentMember.id ||
                                        savingAgentPollingMemberId === selectedAgentMember.id ||
                                        !agentPollingDraft.message.trim()
                                      }
                                      onClick={() => void handleRunAgentPollingNow()}
                                    >
                                      <RefreshCw className={`mr-2 h-4 w-4 ${runningAgentPollingMemberId === selectedAgentMember?.id ? 'animate-spin' : ''}`} />
                                      {runningAgentPollingMemberId === selectedAgentMember?.id ? 'Running...' : 'Run polling now'}
                                    </Button>
                                  </div>
                                )}

                                {agentRuntimePanel === 'prompt' && selectedAgentMember && (
                                  <div className="space-y-3 rounded-md border bg-background/80 p-3">
                                    <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                                      <span className="flex items-center gap-2">
                                        <FileText className="h-4 w-4 text-primary" />
                                        System Prompt
                                      </span>
                                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
	                                      <Badge variant="outline">{formatRoleLabel(selectedAgentMember.role)}</Badge>
                                      <Badge variant="secondary">{selectedAgentRuntime.session.provider}</Badge>
                                      <Badge variant="secondary">{selectedAgentRuntime.session.agentType || 'pi'}</Badge>
                                    </div>
                                    <textarea
                                      className="min-h-[360px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground"
                                      value={agentPromptDraft}
                                      onChange={(event) => setAgentPromptDraft(event.target.value)}
                                      placeholder="Project-level role system prompt"
                                      disabled={isReadOnly || savingAgentPromptRole === selectedAgentMember.role}
                                    />
                                    <div className="rounded-md border bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                                      <p>Saved on this project role. Future launches and this runtime's next turn use the new prompt.</p>
                                      {selectedAgentRuntime.session.status === 'TYPING' && (
                                        <p className="text-amber-700">The active streaming turn keeps its current prompt.</p>
                                      )}
                                    </div>
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="flex flex-wrap items-center gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          disabled={isReadOnly || savingAgentPromptRole === selectedAgentMember.role}
                                          onClick={() => void handleSaveAgentPromptDraft(true)}
                                        >
                                          Reset
                                        </Button>
                                        {project?.settings?.projectTemplateId && (
                                          <Button
                                            type="button"
                                            size="sm"
                                            variant="outline"
                                            disabled={isReadOnly || refreshingProjectTemplate}
                                            onClick={() => void handleRefreshProjectTemplate()}
                                          >
                                            <RefreshCw className={`mr-2 h-4 w-4 ${refreshingProjectTemplate ? 'animate-spin' : ''}`} />
                                            {refreshingProjectTemplate ? 'Refreshing...' : 'Refresh template'}
                                          </Button>
                                        )}
                                      </div>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="secondary"
                                        disabled={
                                          isReadOnly ||
                                          savingAgentPromptRole === selectedAgentMember.role ||
                                          (!selectedAgentPromptChanged && agentPromptDraft === selectedAgentEffectivePrompt)
                                        }
                                        onClick={() => void handleSaveAgentPromptDraft(false)}
                                      >
                                        <FileText className="mr-2 h-4 w-4" />
                                        {savingAgentPromptRole === selectedAgentMember.role ? 'Saving...' : 'Save prompt'}
                                      </Button>
                                    </div>
                                  </div>
                                )}

                                {agentRuntimePanel === 'workspace' && (
                                  <div className="space-y-2 rounded-md border bg-background/80 p-3">
                                    <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                                      <span className="flex items-center gap-2">
                                        <FolderOpen className="h-4 w-4 text-primary" />
                                        Workspace
                                      </span>
                                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <div className="space-y-1 text-muted-foreground">
                                      <p className="break-all">workspace: {selectedAgentRuntime.session.repoWorkspaceDir || '/opt/data/workspace'}</p>
                                      <p className="break-all">data: {selectedAgentRuntime.session.dataDir}</p>
                                    </div>
                                    <div className="flex items-center justify-between gap-2 border-t pt-2">
                                      <span className="text-[11px] font-medium text-muted-foreground">
                                        Generated files
                                      </span>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant="ghost"
                                        className="h-7 px-2 text-xs"
                                        onClick={() => selectedAgentRuntime && void loadAgentWorkspaceFiles(selectedAgentRuntime.memberId)}
                                        disabled={loadingAgentWorkspaceFiles || !selectedAgentRuntime}
                                      >
                                        {loadingAgentWorkspaceFiles ? 'Refreshing' : 'Refresh'}
                                      </Button>
                                    </div>
                                    <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                                      {loadingAgentWorkspaceFiles && !selectedAgentWorkspaceFiles.length ? (
                                        <p className="py-2 text-muted-foreground">Loading workspace files...</p>
                                      ) : selectedAgentWorkspaceFiles.length ? (
                                        selectedAgentWorkspaceFiles.map((file) => (
                                          <div key={file.path} className="flex items-center gap-2 rounded-md border bg-muted/20 px-2 py-1.5">
                                            <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                                            <div className="min-w-0 flex-1">
                                              <p className="truncate font-medium text-foreground" title={file.path}>{file.name}</p>
                                              <p className="truncate text-[10px] text-muted-foreground" title={file.path}>
                                                {file.path} · {formatBytes(file.size)}
                                              </p>
                                            </div>
                                            <Button
                                              type="button"
                                              size="icon"
                                              variant="ghost"
                                              className="h-7 w-7 shrink-0"
                                              title="Download"
                                              onClick={() => void handleDownloadAgentWorkspaceFile(selectedAgentRuntime.memberId, file.path)}
                                              disabled={downloadingAgentWorkspaceFile === file.path}
                                            >
                                              <Download className="h-3.5 w-3.5" />
                                            </Button>
                                          </div>
                                        ))
                                      ) : (
                                        <p className="py-2 text-muted-foreground">No generated files found in this runtime workspace yet.</p>
                                      )}
                                    </div>
                                  </div>
                                )}

                                {agentRuntimePanel === 'skills' && (
                                  <div className="space-y-2 rounded-md border bg-background/80 p-3">
                                    <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                                      <span className="flex items-center gap-2">
                                        <Settings2 className="h-4 w-4 text-primary" />
                                        Skill Config
                                      </span>
                                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <div className="space-y-2">
                                      <div className="rounded-md border bg-muted/20 px-2.5 py-2">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="font-medium text-foreground">Capability Bundles</span>
                                          <Badge variant="outline">{selectedAgentCapabilityRefs.length}</Badge>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-1.5">
                                          {selectedAgentCapabilityRefs.map((ref) => (
                                            <Badge key={ref} variant="secondary" className="max-w-full break-all font-mono text-[10px]">
                                              {ref}
                                            </Badge>
                                          ))}
                                        </div>
                                      </div>
                                      {selectedAgentRuntime.session.runtimeFeatureSupport && (
                                        <div className="rounded-md border bg-muted/20 px-2.5 py-2">
                                          <p className="font-medium text-foreground">
                                            {selectedAgentRuntime.session.runtimeFeatureSupport.agentType} support
                                          </p>
                                          <p className="mt-1 leading-5 text-muted-foreground">
                                            Active: {selectedAgentRuntime.session.runtimeFeatureSupport.supportedFeatures.join(', ') || 'none'}
                                          </p>
                                          {selectedAgentRuntime.session.runtimeFeatureSupport.unsupportedFeatures.length ? (
                                            <p className="mt-1 leading-5 text-muted-foreground">
                                              Not loaded: {selectedAgentRuntime.session.runtimeFeatureSupport.unsupportedFeatures.join(', ')}
                                            </p>
                                          ) : null}
                                          {selectedAgentRuntime.session.runtimeFeatureSupport.notes.length ? (
                                            <p className="mt-1 leading-5 text-muted-foreground">
                                              {selectedAgentRuntime.session.runtimeFeatureSupport.notes.join(' ')}
                                            </p>
                                          ) : null}
                                        </div>
                                      )}
                                      {selectedAgentRuntime.session.runtimeCapabilityWarnings?.length ? (
                                        <div className="rounded-md border border-amber-200 bg-amber-50 px-2.5 py-2 text-amber-900">
                                          {selectedAgentRuntime.session.runtimeCapabilityWarnings.join(' ')}
                                        </div>
                                      ) : null}
                                      <div className="space-y-1.5">
                                        <div className="flex items-center justify-between gap-2">
                                          <span className="text-[11px] font-medium text-muted-foreground">Bundle refs</span>
                                          <Badge variant="outline">{agentSkillRefsDraft.split(/\r?\n|,/).filter((ref) => ref.trim()).length}</Badge>
                                        </div>
                                        <textarea
                                          className="min-h-24 w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-[11px] leading-5 text-foreground"
                                          value={agentSkillRefsDraft}
                                          onChange={(event) => setAgentSkillRefsDraft(event.target.value)}
                                          disabled={isReadOnly || savingAgentSkillsRole === selectedAgentMember?.role}
                                          placeholder="skill://agent-workspace"
                                        />
                                      </div>
                                      <div className="grid gap-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                                        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                                          {loadingAgentSkillsRole === selectedAgentMember?.role ? (
                                            <p className="py-2 text-muted-foreground">Loading role skills...</p>
                                          ) : agentSkillDetails.length ? (
                                            agentSkillDetails.map((skill) => (
                                              <button
                                                key={skill.ref}
                                                type="button"
                                                className={`w-full rounded-md border px-2.5 py-2 text-left transition ${
                                                  selectedAgentSkillRef === skill.ref ? 'border-primary bg-primary/10' : 'bg-muted/20 hover:bg-muted/40'
                                                }`}
                                                onClick={() => handleSelectAgentSkill(skill.ref)}
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="truncate font-medium text-foreground">{skill.name}</span>
                                                  <Badge variant={skill.overridden ? 'default' : 'outline'}>
                                                    {skill.overridden ? 'project' : 'base'}
                                                  </Badge>
                                                </div>
                                                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{skill.ref}</p>
                                              </button>
                                            ))
                                          ) : selectedAgentSkillSummaries.length ? (
                                            selectedAgentSkillSummaries.map((skill) => (
                                              <button
                                                key={skill.ref}
                                                type="button"
                                                className="w-full rounded-md border bg-muted/20 px-2.5 py-2 text-left"
                                                onClick={() => setSelectedAgentSkillRef(skill.ref)}
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="truncate font-medium text-foreground">{skill.name}</span>
                                                  <Badge variant={skill.source === 'role' || skill.source === 'project' ? 'default' : 'outline'}>
                                                    {skill.source}
                                                  </Badge>
                                                </div>
                                                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{skill.ref}</p>
                                              </button>
                                            ))
                                          ) : (
                                            <p className="text-muted-foreground">No skills attached to this runtime.</p>
                                          )}
                                        </div>
                                        <div className="space-y-1.5">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="truncate text-[11px] font-medium text-muted-foreground">
                                              {selectedAgentSkillRef || 'SKILL.md'}
                                            </span>
                                            {agentSkillDetails.find((skill) => skill.ref === selectedAgentSkillRef)?.storagePath && (
                                              <Badge variant="secondary" className="max-w-[45%] truncate font-mono text-[10px]">
                                                {agentSkillDetails.find((skill) => skill.ref === selectedAgentSkillRef)?.storagePath}
                                              </Badge>
                                            )}
                                          </div>
                                          <textarea
                                            className="min-h-[300px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground"
                                            value={agentSkillMarkdownDraft}
                                            onChange={(event) => setAgentSkillMarkdownDraft(event.target.value)}
                                            disabled={isReadOnly || !selectedAgentSkillRef || savingAgentSkillsRole === selectedAgentMember?.role}
                                            placeholder="Select a skill to edit its SKILL.md"
                                          />
                                        </div>
                                      </div>
                                      <div className="rounded-md border bg-muted/10 px-3 py-2 text-[11px] leading-5 text-muted-foreground">
                                        <p>Saved as a project role skill bundle in shared project storage. Running CLI and AgentCore turns receive it in the next request; Docker and local runner sessions also get refreshed skill files.</p>
                                      </div>
                                      <div className="flex flex-wrap items-center justify-between gap-2">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          disabled={isReadOnly || savingAgentSkillsRole === selectedAgentMember?.role}
                                          onClick={() => void handleSaveAgentSkillsDraft(true)}
                                        >
                                          Reset
                                        </Button>
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="secondary"
                                          disabled={isReadOnly || savingAgentSkillsRole === selectedAgentMember?.role || !agentSkillRefsDraft.trim()}
                                          onClick={() => void handleSaveAgentSkillsDraft(false)}
                                        >
                                          <Settings2 className="mr-2 h-4 w-4" />
                                          {savingAgentSkillsRole === selectedAgentMember?.role ? 'Saving...' : 'Save skills'}
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                )}

                                {agentRuntimePanel === 'scope' && (
                                  <div className="space-y-2 rounded-md border bg-background/80 p-3">
                                    <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                                      <span className="flex items-center gap-2">
                                        <ShieldCheck className="h-4 w-4 text-primary" />
                                        Runtime Scope
                                      </span>
                                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
                                        <X className="h-3.5 w-3.5" />
                                      </Button>
                                    </div>
                                    <div className="flex flex-wrap gap-1.5">
                                      {(selectedAgentRuntime.session.scopes || []).map((scope) => (
                                        <Badge key={scope} variant="outline">{scope}</Badge>
                                      ))}
                                    </div>
                                  </div>
                                )}

                                {agentRuntimePanel === 'runner' && (
                                  <div className="space-y-3 rounded-md border bg-background/80 p-3">
                                    <div className="flex items-center justify-between gap-2 font-medium text-foreground">
                                      <span className="flex items-center gap-2">
                                        <ClipboardCheck className="h-4 w-4 text-primary" />
                                        Local Runner Command
                                      </span>
                                      <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
	                                        <X className="h-3.5 w-3.5" />
	                                      </Button>
	                                    </div>
	                                    {selectedProjectRunnerPresence ? (
	                                      <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs leading-5 text-emerald-100">
	                                        <p className="font-medium text-emerald-50">
	                                          {selectedProjectRunnerPresence.scope === 'account' ? 'Account runner online' : 'Project runner online'}
	                                        </p>
	                                        <p>
	                                          {selectedProjectRunnerPresence.name} is connected. New local agents of this type will be claimed automatically.
	                                        </p>
	                                        <p className="text-[11px] text-emerald-100/70">
	                                          Last seen {formatProjectDate(selectedProjectRunnerPresence.lastSeenAt)}
	                                          {selectedProjectRunnerPresence.platform ? ` on ${selectedProjectRunnerPresence.platform}` : ''}.
	                                        </p>
	                                      </div>
	                                    ) : null}
	                                    <div className="rounded-md border bg-muted/10 px-3 py-2 text-xs leading-5 text-muted-foreground">
	                                      <p className="font-medium text-foreground">Before running</p>
                                      <p>
                                        {selectedAgentRuntime.session.provider === 'local-codex'
                                          ? 'Install Node.js 22.19+. Codex jobs use Codex CLI from PATH; Pi jobs auto-install the Pi npm package if `pi` is not already available.'
                                          : 'Install Node.js 18+ and start Docker Desktop.'}
                                      </p>
	                                      <p>No repo checkout is required. The command downloads the runner script from AgentCraft.</p>
	                                      <p>A single account runner claims and supervises pending local agents of the same runner type across your manageable projects.</p>
                                      <p>
                                        {selectedAgentRuntime.session.provider === 'local-codex'
                                          ? 'No local agent directory is required. Edit `--codex-bin` or `--pi-bin` only when the CLI lives outside PATH.'
                                          : 'For local Docker agents, the selected image must be available locally or pullable by Docker.'}
                                      </p>
                                    </div>
                                    <Button
	                                      type="button"
	                                      size="sm"
	                                      variant={selectedProjectRunnerPresence ? 'outline' : 'secondary'}
                                      data-tour="project-copy-command"
	                                      className="w-full justify-center"
	                                      onClick={() => handleCreateLocalRunnerCommand(
	                                        undefined,
                                        selectedAgentRuntime.session.provider === 'local-codex' ? 'local-codex' : 'local-runner',
                                      )}
	                                      disabled={creatingLocalRunnerToken}
	                                    >
	                                      <ClipboardCheck className="mr-2 h-4 w-4" />
	                                      {creatingLocalRunnerToken
	                                        ? 'Creating...'
	                                        : selectedProjectRunnerPresence
	                                          ? 'Copy another device runner command'
	                                          : localRunnerTokenCopied
	                                            ? 'Copied'
	                                            : 'Copy device runner command'}
	                                    </Button>
	                                    {localRunnerTokenResult && (!selectedAgentLocalRunnerMode || localRunnerTokenResult.mode === selectedAgentLocalRunnerMode) ? (
	                                      <div className="space-y-3">
                                        <div className="flex flex-wrap gap-2">
                                          {LOCAL_RUNNER_COMMAND_OPTIONS.map((option) => (
                                            <button
                                              key={option.id}
                                              type="button"
                                              className={`rounded-md border px-2.5 py-1 text-xs transition-colors ${
                                                localRunnerCommandMode === option.id
                                                  ? 'border-primary bg-primary/10 text-foreground'
                                                  : 'border-border bg-background/60 text-muted-foreground hover:border-primary/50'
                                              }`}
                                              onClick={() => void handleSelectLocalRunnerCommandMode(option.id)}
                                            >
                                              {option.label}
                                            </button>
                                          ))}
                                        </div>
                                        <p className="text-[11px] text-muted-foreground">
                                          Selected for this browser: {localRunnerCommandModeLabel}.
                                        </p>
                                        <pre className="max-h-72 overflow-x-auto whitespace-pre-wrap break-words rounded-md bg-muted/30 px-3 py-2 font-mono text-xs text-foreground">
                                          {localRunnerTokenResult.commands[localRunnerCommandMode]}
                                        </pre>
                                        <p className="text-[11px] leading-5 text-muted-foreground">
	                                          This device token is shown once. Create a new command if you lose it.
                                        </p>
                                      </div>
                                    ) : (
                                      <div className="rounded-md border border-dashed px-3 py-4 text-xs text-muted-foreground">
                                        Copy command creates an account runner token and fills this panel immediately.
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </aside>
                          </div>

                          <div className="border-t bg-card px-4 py-4">
                            {selectedAgentCanSteer && selectedAgentSteerMessages.length > 0 && (
                              <div className="mb-2 space-y-1.5">
                                {selectedAgentSteerMessages.map((message) => (
                                  <div
                                    key={message.id}
                                    className="flex flex-wrap items-center justify-between gap-3 rounded-md border bg-muted/10 px-3 py-2 text-sm text-muted-foreground"
                                  >
                                    <span className="inline-flex min-w-0 items-center gap-2">
                                      <CornerDownRight className="h-4 w-4 shrink-0" />
                                      <span className="truncate">{message.content}</span>
                                    </span>
                                    <span className="inline-flex shrink-0 items-center gap-1">
                                      <button
                                        type="button"
                                        className="inline-flex h-7 items-center gap-1 rounded-md px-2 font-medium transition-colors hover:bg-background/70 hover:text-foreground disabled:opacity-50"
                                        title="Send this steer again"
                                        disabled={sendingAgentMessage || !selectedAgentCanMessage}
                                        onClick={() => handleSteerMessageAgain(message)}
                                      >
                                        <CornerDownRight className="h-4 w-4" />
                                        Steer
                                      </button>
                                      <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-background/70 hover:text-foreground"
                                        title="Edit this steer"
                                        onClick={() => handleEditSteerMessage(message)}
                                      >
                                        <Pencil className="h-3.5 w-3.5" />
                                      </button>
                                      <button
                                        type="button"
                                        className="inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-destructive/10 hover:text-destructive"
                                        title="Delete this steer"
                                        onClick={() => hideSteerMessage(message.id)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}
                            <form
                              onSubmit={handleSendAgentMessage}
                              className={`space-y-2 ${selectedAgentCanSteer ? 'rounded-2xl border bg-background/95 p-3 shadow-lg shadow-background/20' : ''}`}
                            >
                              {agentAttachments.length > 0 && (
                                <div className="flex flex-wrap gap-2">
                                  {agentAttachments.map((attachment) => (
                                    <span
                                      key={attachment.key}
                                      className="inline-flex max-w-full items-center gap-2 rounded-md border bg-muted/20 px-2.5 py-1 text-xs"
                                    >
                                      <Paperclip className="h-3.5 w-3.5 text-primary" />
                                      <span className="max-w-[220px] truncate">{attachment.name}</span>
                                      <span className="text-muted-foreground">{formatBytes(attachment.size)}</span>
                                      <button
                                        type="button"
                                        className="text-muted-foreground hover:text-destructive"
                                        title="Remove attachment"
                                        onClick={() => removeAgentAttachment(attachment.key)}
                                      >
                                        <Trash2 className="h-3.5 w-3.5" />
                                      </button>
                                    </span>
                                  ))}
                                </div>
                              )}
                              <div className="relative">
                                {renderProjectFileMentionMenu('agentMessage')}
                                <textarea
                                  ref={agentMessageTextareaRef}
                                  data-tour="project-agent-message"
                                  className={
                                    selectedAgentCanSteer
                                      ? 'min-h-[68px] w-full resize-none rounded-xl border-0 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground/55 focus-visible:outline-none'
                                      : 'min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm'
                                  }
                                  value={agentMessage}
                                  onFocus={() => updateProjectFileMentionState('agentMessage', agentMessage)}
                                  onBlur={() => closeProjectFileMentionMenu('agentMessage')}
                                  onChange={(e) => handleAgentMessageChange(e.target.value)}
                                  onCompositionStart={handleAgentMessageCompositionStart}
                                  onCompositionEnd={handleAgentMessageCompositionEnd}
                                  onKeyDown={handleAgentMessageKeyDown}
                                  placeholder={
                                    selectedAgentCanSteer ? 'Ask for follow-up changes' : selectedAgentMessagePlaceholder
                                  }
                                  disabled={!selectedAgentCanMessage}
                                />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <div className="flex min-w-0 flex-wrap items-center gap-3">
                                  <label
                                    className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-xs transition-colors hover:bg-muted/40 ${
                                      !selectedAgentCanMessage || uploadingAgentAttachment ? 'pointer-events-none opacity-50' : ''
                                    }`}
                                    title="Upload attachment"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                    {uploadingAgentAttachment ? 'Uploading...' : 'Attach'}
                                    <input
                                      type="file"
                                      multiple
                                      className="hidden"
                                      disabled={!selectedAgentCanMessage || uploadingAgentAttachment}
                                      onChange={handleAgentAttachmentChange}
                                    />
                                  </label>
                                  <p className={`text-xs text-muted-foreground ${selectedAgentCanSteer ? 'sr-only' : ''}`}>
                                    {agentMessageResponse || 'Replies may arrive after the agent finishes the current turn.'}
                                  </p>
                                </div>
                                <div className="ml-auto flex items-center gap-2">
                                  {selectedAgentCanSteer ? (
                                    selectedAgentHasSteerDraft ? (
                                      <Button
                                        type="submit"
                                        variant="secondary"
                                        size="icon"
                                        data-tour="project-send-agent-message"
                                        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                                        disabled={
                                          sendingAgentMessage ||
                                          uploadingAgentAttachment ||
                                          !selectedAgentCanMessage
                                        }
                                        title={sendingAgentMessage ? 'Sending steer...' : 'Send steer'}
                                      >
                                        <ArrowUp className="h-4 w-4" />
                                      </Button>
                                    ) : (
                                      <Button
                                        type="button"
                                        variant="secondary"
                                        size="icon"
                                        className="rounded-full bg-foreground text-background hover:bg-foreground/90"
                                        disabled={cancellingAgentMessage}
                                        title={cancellingAgentMessage ? 'Cancelling...' : 'Stop response'}
                                        onClick={handleCancelAgentMessage}
                                      >
                                        <Square className="h-3.5 w-3.5 fill-current" />
                                      </Button>
                                    )
                                  ) : (
                                    <>
                                      {selectedAgentIsTyping && (
                                        <Button
                                          type="button"
                                          variant="outline"
                                          disabled={cancellingAgentMessage}
                                          onClick={handleCancelAgentMessage}
                                        >
                                          <X className="mr-2 h-4 w-4" />
                                          {cancellingAgentMessage ? 'Cancelling...' : 'Stop'}
                                        </Button>
                                      )}
                                    <Button
                                      type="submit"
                                      variant="secondary"
                                      data-tour="project-send-agent-message"
                                      disabled={
                                        sendingAgentMessage ||
                                        uploadingAgentAttachment ||
                                        (!agentMessage.trim() && !agentAttachments.length) ||
                                        !selectedAgentCanMessage
                                      }
                                    >
                                      <MessageSquare className="mr-2 h-4 w-4" />
                                      {sendingAgentMessage ? 'Sending...' : 'Send'}
                                    </Button>
                                    </>
                                  )}
                                </div>
                              </div>
                            </form>
                          </div>
                        </>
                      ) : selectedAgentMember ? (
                        <div className="flex flex-1 flex-col">
                          <div className="border-b px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
	                                <div className="flex flex-wrap items-center gap-2">
	                                  <p className={`truncate ${agentNameClassName(selectedAgentMember)}`}>
	                                    {formatAgentDisplayName(selectedAgentMember)}
	                                  </p>
	                                  <Badge variant="secondary">pending launch</Badge>
	                                  <Badge variant="outline">{formatRoleLabel(selectedAgentMember.role)}</Badge>
	                                </div>
                                <p className="truncate text-xs text-muted-foreground">{selectedAgentMember.user.email}</p>
                              </div>
                              <div className="flex flex-wrap items-center justify-end gap-2">
                                {selectedAgentMember.role.includes('_AGENT') && (
                                  <Button
                                    variant="secondary"
                                    disabled={isReadOnly || (activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id))}
                                    title={
                                      activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id)
                                        ? activeAgentCapacityMessage
                                        : undefined
                                    }
                                    onClick={() => handleOpenLaunchAgentRuntime(selectedAgentMember.role, selectedAgentMember.id)}
                                  >
                                    <Rocket className="mr-2 h-4 w-4" />
                                    Launch Runtime
                                  </Button>
                                )}
                                {selectedAgentMember.role !== 'OWNER' && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    className="text-destructive hover:text-destructive"
                                    disabled={isReadOnly || removingMemberId === selectedAgentMember.id}
                                    onClick={() => handleOpenDismissMember(selectedAgentMember)}
                                  >
                                    {removingMemberId === selectedAgentMember.id ? 'Dismissing...' : 'Dismiss'}
                                  </Button>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="flex flex-1 items-center justify-center px-6">
                            <div className="max-w-xl space-y-4 text-center">
                              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg border bg-muted/20">
                                <Rocket className="h-5 w-5 text-primary" />
                              </div>
                              <div className="space-y-2">
                                <p className="text-sm font-medium">This agent member is staffed, but no runtime is running yet.</p>
                                <p className="text-sm leading-6 text-muted-foreground">
                                  Launch a runtime before opening the chat. The launch flow will attach the selected LLM config,
                                  agent type, role prompt, and role skills for this project member.
                                </p>
                              </div>
                              {selectedAgentMemberContract && (
                                <div className="rounded-lg border bg-muted/10 p-4 text-left text-xs">
                                  <p className="font-medium text-foreground">{selectedAgentMemberContract.description}</p>
                                  <div className="mt-3 flex flex-wrap gap-2">
                                    {selectedAgentMemberContract.skills.map((skill) => (
                                      <Badge key={skill.ref} variant={skill.source === 'role' ? 'default' : 'outline'}>
                                        {skill.name}
                                      </Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {selectedAgentMember.role !== 'OWNER' && (
                                <div className="space-y-3 rounded-lg border bg-muted/10 p-4 text-left">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="space-y-1">
                                      <p className="text-sm font-medium text-foreground">Role prompt and skills</p>
                                      <p className="text-xs text-muted-foreground">Reviewing role configuration does not consume AICoin.</p>
                                    </div>
                                    <div className="flex flex-wrap gap-2">
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={agentRuntimePanel === 'prompt' ? 'secondary' : 'outline'}
                                        onClick={() => setAgentRuntimePanel((panel) => (panel === 'prompt' ? null : 'prompt'))}
                                      >
                                        <FileText className="mr-2 h-4 w-4" />
                                        Prompt
                                      </Button>
                                      <Button
                                        type="button"
                                        size="sm"
                                        variant={agentRuntimePanel === 'skills' ? 'secondary' : 'outline'}
                                        onClick={() => setAgentRuntimePanel((panel) => (panel === 'skills' ? null : 'skills'))}
                                      >
                                        <Settings2 className="mr-2 h-4 w-4" />
                                        Skills
                                      </Button>
                                    </div>
                                  </div>

                                  {agentRuntimePanel === 'prompt' && (
                                    <div className="space-y-2 rounded-md border bg-background/80 p-3">
                                      <div className="flex items-center justify-between gap-2 text-sm font-medium">
                                        <span className="flex items-center gap-2">
                                          <FileText className="h-4 w-4 text-primary" />
	                                          {formatRoleLabel(selectedAgentMember.role)} prompt
                                        </span>
                                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                      <textarea
                                        className="min-h-[220px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground"
                                        value={agentPromptDraft || selectedAgentEffectivePrompt}
                                        readOnly
                                        placeholder="No role prompt override configured yet."
                                      />
                                    </div>
                                  )}

                                  {agentRuntimePanel === 'skills' && (
                                    <div className="space-y-2 rounded-md border bg-background/80 p-3">
                                      <div className="flex items-center justify-between gap-2 text-sm font-medium">
                                        <span className="flex items-center gap-2">
                                          <Settings2 className="h-4 w-4 text-primary" />
	                                          {formatRoleLabel(selectedAgentMember.role)} skills
                                        </span>
                                        <Button type="button" size="icon" variant="ghost" className="h-6 w-6" onClick={() => setAgentRuntimePanel(null)}>
                                          <X className="h-3.5 w-3.5" />
                                        </Button>
                                      </div>
                                      <div className="grid gap-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                                        <div className="max-h-72 space-y-1 overflow-y-auto pr-1">
                                          {loadingAgentSkillsRole === selectedAgentMember.role ? (
                                            <p className="py-2 text-xs text-muted-foreground">Loading role skills...</p>
                                          ) : agentSkillDetails.length ? (
                                            agentSkillDetails.map((skill) => (
                                              <button
                                                key={skill.ref}
                                                type="button"
                                                className={`w-full rounded-md border px-2.5 py-2 text-left text-xs transition ${
                                                  selectedAgentSkillRef === skill.ref ? 'border-primary bg-primary/10' : 'bg-muted/20 hover:bg-muted/40'
                                                }`}
                                                onClick={() => handleSelectAgentSkill(skill.ref)}
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="truncate font-medium text-foreground">{skill.name}</span>
                                                  <Badge variant={skill.overridden ? 'default' : 'outline'}>
                                                    {skill.overridden ? 'project' : 'base'}
                                                  </Badge>
                                                </div>
                                                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{skill.ref}</p>
                                              </button>
                                            ))
                                          ) : selectedAgentSkillSummaries.length ? (
                                            selectedAgentSkillSummaries.map((skill) => (
                                              <button
                                                key={skill.ref}
                                                type="button"
                                                className="w-full rounded-md border bg-muted/20 px-2.5 py-2 text-left text-xs"
                                                onClick={() => setSelectedAgentSkillRef(skill.ref)}
                                              >
                                                <div className="flex items-center justify-between gap-2">
                                                  <span className="truncate font-medium text-foreground">{skill.name}</span>
                                                  <Badge variant={skill.source === 'role' || skill.source === 'project' ? 'default' : 'outline'}>
                                                    {skill.source}
                                                  </Badge>
                                                </div>
                                                <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">{skill.ref}</p>
                                              </button>
                                            ))
                                          ) : (
                                            <p className="text-xs text-muted-foreground">No skills attached to this role.</p>
                                          )}
                                        </div>
                                        <textarea
                                          className="min-h-[260px] w-full resize-y rounded-md border border-input bg-background px-3 py-2 font-mono text-xs leading-5 text-foreground"
                                          value={agentSkillMarkdownDraft}
                                          readOnly
                                          placeholder="Select a skill to view its SKILL.md"
                                        />
                                      </div>
                                    </div>
                                  )}
                                </div>
                              )}
                              {selectedAgentMember.role.includes('_AGENT') ? (
                                <div className="flex flex-wrap gap-2">
                                  {!IS_PRODUCTION_AGENTCRAFT_HOST && (
                                    <Button
                                    variant="secondary"
                                    disabled={isReadOnly || (activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id))}
                                    title={
                                      activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id)
                                        ? activeAgentCapacityMessage
                                        : undefined
                                    }
                                    onClick={() => handleOpenLaunchAgentRuntime(selectedAgentMember.role, selectedAgentMember.id, 'local-docker')}
                                  >
                                    <Rocket className="mr-2 h-4 w-4" />
                                      Local Docker
                                    </Button>
                                  )}
                                  {IS_PRODUCTION_AGENTCRAFT_HOST && (
                                    <Button
                                      variant="secondary"
                                      disabled={isReadOnly || (activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id))}
                                      title={
                                        activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id)
                                          ? activeAgentCapacityMessage
                                          : undefined
                                      }
                                      onClick={() => handleOpenLaunchAgentRuntime(selectedAgentMember.role, selectedAgentMember.id, 'local-runner')}
                                    >
                                      <Route className="mr-2 h-4 w-4" />
                                      Local Runner
                                    </Button>
                                  )}
                                  <Button
                                    variant="secondary"
                                    data-tour="project-local-agent"
                                    disabled={isReadOnly || (activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id))}
                                    title={
                                      activeAgentCapacityReached && launchWouldAddActiveAgent(selectedAgentMember.id)
                                        ? activeAgentCapacityMessage
                                        : undefined
                                    }
                                    onClick={() => handleOpenLaunchAgentRuntime(selectedAgentMember.role, selectedAgentMember.id, 'local-codex')}
                                  >
                                    <Brain className="mr-2 h-4 w-4" />
                                    Local Agent
                                  </Button>
                                  <Button
                                    variant="outline"
                                    disabled
                                    title="Cloud Agent is temporarily unavailable"
                                    onClick={() => undefined}
                                  >
                                    <Cloud className="mr-2 h-4 w-4" />
                                    Cloud Agent
                                  </Button>
                                </div>
                              ) : (
                                <p className="text-xs text-muted-foreground">This member role does not launch an agent runtime.</p>
                              )}
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                          Select a project member to open the chat or launch a runtime.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-medium">Role Contracts</h3>
                  <p className="text-sm text-muted-foreground">
                    Project-template role coverage for staffing and runtime prompts.
                  </p>
                </div>
	                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
	                  {roleCoverage.map(({ role, label, members, contract }) => {
	                    const RoleIcon = roleIconForRole(role);
	                    return (
	                      <div key={role} className="rounded-lg border bg-background px-3 py-3">
	                        <div className="mb-2 flex items-center justify-between gap-2">
	                          <div className="flex min-w-0 items-center gap-2">
	                            <RoleIcon className="h-4 w-4 shrink-0 text-primary" />
	                            <p className="truncate text-sm font-medium">{label}</p>
	                          </div>
	                          <Badge variant={members.length ? 'success' : 'secondary'}>
	                            {members.length ? `${members.length} staffed` : 'open'}
	                          </Badge>
	                        </div>
                          {contract?.description && (
                            <p className="mb-2 text-xs leading-5 text-muted-foreground">{contract.description}</p>
                          )}
	                        <div className="space-y-1 text-xs leading-5 text-muted-foreground">
	                          <p><span className="font-medium text-foreground">Reads:</span> {contract?.reads || 'Project context'}</p>
	                          <p><span className="font-medium text-foreground">Writes:</span> {contract?.writes || 'Scoped updates'}</p>
	                          <p><span className="font-medium text-foreground">Trigger:</span> {contract?.trigger || 'As assigned'}</p>
                            {contract?.skills?.length ? (
                              <p><span className="font-medium text-foreground">Skills:</span> {contract.skills.length}</p>
                            ) : null}
	                        </div>
	                      </div>
	                    );
	                  })}
	                </div>
                {agentProfiles.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm font-medium">
                      <History className="h-4 w-4 text-primary" />
                      Saved Agent Profiles
                    </div>
                    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                      {agentProfiles.slice(0, 6).map((profile) => {
                        const cloudProfileUnavailable = isCloudAgentLaunchMode(profile.launchMode);
                        return (
                          <div key={profile.id} className="rounded-lg border bg-background px-3 py-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium">{profile.name}</p>
                                <p className="truncate text-xs text-muted-foreground">
                                  {profile.role} · {cloudProfileUnavailable ? 'cloud unavailable' : displayLaunchMode(profile.launchMode)}
                                </p>
                              </div>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                title={cloudProfileUnavailable ? 'Cloud Agent is temporarily unavailable' : undefined}
                                disabled={launchingRole === profile.role || isReadOnly || cloudProfileUnavailable}
                                onClick={() => void handleLaunchAgentProfile(profile)}
                              >
                                <Rocket className="mr-2 h-4 w-4" />
                                Launch
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {pendingDismissMember && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
                  <form
                    className="w-full max-w-md rounded-lg border bg-card shadow-2xl"
                    onSubmit={(event) => {
                      event.preventDefault();
                      void handleConfirmDismissMember();
                    }}
                  >
                    <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
                      <div className="space-y-1">
                        <h3 className="font-medium">Dismiss Project Member</h3>
                        <p className="text-sm text-muted-foreground">
                          This removes the member from the project workspace.
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => {
                          setPendingDismissMember(null);
                        }}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-4 px-5 py-5">
                      <div className="rounded-lg border bg-muted/10 px-3 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium">{pendingDismissMember.user.displayName || pendingDismissMember.user.email}</p>
                          <Badge variant="outline">{pendingDismissMember.role}</Badge>
                        </div>
                        <p className="mt-1 truncate text-sm text-muted-foreground">{pendingDismissMember.user.email}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-3 border-t px-5 py-4">
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => {
                          setPendingDismissMember(null);
                        }}
                      >
                        Cancel
                      </Button>
                      <Button
                        type="submit"
                        variant="destructive"
                        disabled={removingMemberId === pendingDismissMember.id}
                        autoFocus
                      >
                        {removingMemberId === pendingDismissMember.id ? 'Dismissing...' : 'Dismiss'}
                      </Button>
                    </div>
                  </form>
                </div>
              )}

              {pendingAgentLaunch && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
                  <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-lg border bg-card shadow-2xl">
                    <div className="shrink-0 flex items-start justify-between gap-4 border-b px-5 py-4">
                      <div className="space-y-1">
                        <h3 className="font-medium">
                          {isCloudAgentLaunchMode(launchMode)
                            ? 'Launch Cloud Agent'
                            : launchMode === 'local-codex'
                              ? 'Launch Local Agent'
                            : launchMode === 'local-runner'
                              ? 'Launch Local Runner Agent'
                              : 'Launch Local Docker Agent'}
                        </h3>
                        <p className="text-sm text-muted-foreground">
	                          {formatRoleLabel(pendingAgentLaunch.role)} will start with its project role prompt and skill bundle.
                        </p>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 shrink-0"
                        aria-label="Cancel agent launch"
                        onClick={() => setPendingAgentLaunch(null)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>

                    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5">
                      <div className="space-y-3">
	                        <div className="flex items-center gap-2 text-sm font-medium">
	                          {(() => {
	                            const RoleIcon = roleIconForRole(pendingAgentLaunch.role);
	                            return <RoleIcon className="h-4 w-4 text-primary" />;
	                          })()}
	                          Project Role
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
	                          {launchableProjectRoleOptions.map((role) => {
	                            const contract = projectRoleContracts[role.value];
	                            const selected = pendingAgentLaunch.role === role.value;
	                            const locked = Boolean(pendingAgentLaunch.memberId);
	                            const RoleIcon = roleIconForRole(role.value);
	                            return (
                              <button
                                key={role.value}
                                type="button"
                                disabled={locked}
                                onClick={() =>
                                  setPendingAgentLaunch((current) =>
                                    current ? { role: role.value, memberId: undefined } : current,
                                  )
                                }
                                className={`group relative h-11 rounded-lg border px-3 text-left transition-colors ${
                                  selected
                                    ? 'border-primary bg-primary/10'
                                    : 'border-border bg-background hover:border-primary/60 hover:bg-muted/20'
                                } ${locked ? 'cursor-not-allowed opacity-60' : ''}`}
                              >
	                                <span className="flex min-w-0 items-center gap-2">
	                                  <RoleIcon className="h-4 w-4 shrink-0 text-primary" />
	                                  <span className="block truncate text-sm font-medium">{role.label}</span>
	                                </span>
                                <span className="pointer-events-none absolute left-0 right-auto top-full z-20 mt-2 hidden w-72 rounded-md border bg-card px-3 py-2 text-xs leading-5 text-muted-foreground shadow-lg group-hover:block group-focus-visible:block">
                                  {contract?.description || 'Project runtime role.'}
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {pendingAgentLaunch.memberId
                            ? 'This launch is attached to an existing project member.'
                            : 'Launching without an existing member creates a new member instance for the selected role.'}
                        </p>
                        {pendingAgentLaunchCapacityBlocked && (
                          <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs leading-5 text-amber-900 dark:text-amber-100">
                            <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                            <p>{activeAgentCapacityMessage}</p>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <History className="h-4 w-4 text-primary" />
                          Saved Agent
                        </div>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <select
                            className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={selectedAgentProfileId}
                            onChange={(e) => handleApplyAgentProfile(e.target.value)}
                          >
                            <option value="">Current launch settings</option>
                            {launchProfilesForRole.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                  {profile.name} · {isCloudAgentLaunchMode(profile.launchMode) ? 'cloud unavailable' : displayLaunchMode(profile.launchMode)} · {profile.role}
                              </option>
                            ))}
                          </select>
                          <Button
                            type="button"
                            variant="outline"
                            title={
                              pendingAgentLaunchCapacityBlocked
                                ? activeAgentCapacityMessage
                                : selectedLaunchProfileCloudUnavailable
                                  ? 'Cloud Agent is temporarily unavailable'
                                  : undefined
                            }
                            disabled={
                              !selectedAgentProfileId ||
                              launchingRole === pendingAgentLaunch.role ||
                              selectedLaunchProfileCloudUnavailable ||
                              pendingAgentLaunchCapacityBlocked
                            }
                            onClick={() => {
                              const profile = agentProfiles.find((item) => item.id === selectedAgentProfileId);
                              if (profile) void handleLaunchAgentProfile(profile, pendingAgentLaunch.memberId);
                            }}
                          >
                            <Rocket className="mr-2 h-4 w-4" />
                            Launch Saved
                          </Button>
                        </div>
                        <input
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={saveAgentProfileName}
                          onChange={(e) => setSaveAgentProfileName(e.target.value)}
                          placeholder="Save current settings as a reusable agent"
                        />
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <KeyRound className="h-4 w-4 text-primary" />
                          Model API{launchModelApiOptional ? ' (optional)' : ''}
                        </div>
                        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto]">
                          <select
                            className="min-w-0 rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={launchLlmConfigId}
                            disabled={showNewLaunchConfig || apiConfigs.length === 0}
                            onChange={(e) => {
                              setLaunchLlmConfigId(e.target.value);
                              setPendingDeleteLaunchConfig(null);
                            }}
                          >
                            {launchModelApiOptional && (
                              <option value="">Use local CLI auth</option>
                            )}
                            {apiConfigs.length === 0 ? (
                              <option value="">Create a working configuration first</option>
                            ) : (
                              apiConfigs.map((config) => (
                                <option key={config.id} value={config.id}>
                                  {config.name} · {config.apiUrl} · {config.modelName}
                                </option>
                              ))
                            )}
                          </select>
                          <div className="flex flex-wrap items-center gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              onClick={handleOpenNewLaunchConfig}
                            >
                              {showNewLaunchConfig ? (
                                <History className="mr-2 h-4 w-4" />
                              ) : (
                                <Plus className="mr-2 h-4 w-4" />
                              )}
                              {showNewLaunchConfig ? 'Use Saved' : 'New Config'}
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!selectedLaunchApiConfig || showNewLaunchConfig}
                              onClick={() => void handleEditLaunchConfig()}
                            >
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              disabled={!selectedLaunchApiConfig || showNewLaunchConfig}
                              onClick={() => selectedLaunchApiConfig && setPendingDeleteLaunchConfig(selectedLaunchApiConfig)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </Button>
                          </div>
                        </div>

                        {pendingDeleteLaunchConfig && (
                          <div className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <div className="flex min-w-0 items-start gap-2">
                              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                              <div className="min-w-0">
                                <p className="font-medium text-foreground">
                                  Delete "{pendingDeleteLaunchConfig.name}"?
                                </p>
                                <p className="break-all text-xs text-muted-foreground">
                                  {pendingDeleteLaunchConfig.apiUrl} · {pendingDeleteLaunchConfig.modelName}
                                </p>
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-2">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => setPendingDeleteLaunchConfig(null)}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                variant="destructive"
                                size="sm"
                                disabled={deletingLaunchConfigId === pendingDeleteLaunchConfig.id}
                                onClick={() => void handleConfirmDeleteLaunchConfig()}
                              >
                                {deletingLaunchConfigId === pendingDeleteLaunchConfig.id ? 'Deleting...' : 'Delete'}
                              </Button>
                            </div>
                          </div>
                        )}

                        {showNewLaunchConfig && (
                          <div className="grid gap-3 rounded-lg border bg-muted/10 p-3 md:grid-cols-2">
                            <div className="md:col-span-2">
                              <p className="text-sm font-medium">
                                {editingLaunchConfigId ? 'Edit Model API Config' : 'New Model API Config'}
                              </p>
                            </div>
                            <input
                              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                              placeholder="Config name"
                              value={launchConfigForm.name}
                              onChange={(e) => setLaunchConfigForm((form) => ({ ...form, name: e.target.value }))}
                            />
                            <select
                              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={launchConfigForm.apiType}
                              onChange={(e) => {
                                const apiType = e.target.value as 'openai' | 'claude';
                                setLaunchConfigForm((form) => ({
                                  ...form,
                                  apiType,
                                  apiUrl: apiType === 'claude' ? 'https://api.anthropic.com' : 'https://api.openai.com/v1',
                                  modelName: apiType === 'claude' ? 'claude-3-5-sonnet-20241022' : 'gpt-4o',
                                }));
                              }}
                            >
                              <option value="openai">OpenAI Compatible</option>
                              <option value="claude">Claude / Anthropic</option>
                            </select>
                            <input
                              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                              placeholder="API URL"
                              value={launchConfigForm.apiUrl}
                              onChange={(e) => setLaunchConfigForm((form) => ({ ...form, apiUrl: e.target.value }))}
                            />
                            <input
                              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
                              placeholder="Model"
                              value={launchConfigForm.modelName}
                              onChange={(e) => setLaunchConfigForm((form) => ({ ...form, modelName: e.target.value }))}
                            />
                            <input
                              className="rounded-md border border-input bg-background px-3 py-2 text-sm md:col-span-2"
                              type="password"
                              placeholder="API key"
                              value={launchConfigForm.apiKey}
                              onChange={(e) => setLaunchConfigForm((form) => ({ ...form, apiKey: e.target.value }))}
                            />
                            <div className="flex flex-wrap items-center justify-end gap-2 md:col-span-2">
                              <Button
                                type="button"
                                variant="ghost"
                                onClick={() => {
                                  setShowNewLaunchConfig(false);
                                  setEditingLaunchConfigId('');
                                  setLaunchConfigForm(DEFAULT_LAUNCH_CONFIG_FORM);
                                }}
                              >
                                Cancel
                              </Button>
                              <Button
                                type="button"
                                variant="secondary"
                                disabled={
                                  savingLaunchConfig ||
                                  !launchConfigForm.name.trim() ||
                                  !launchConfigForm.apiUrl.trim() ||
                                  !launchConfigForm.apiKey.trim() ||
                                  !launchConfigForm.modelName.trim()
                                }
                                onClick={() => void handleSaveLaunchConfigFromForm()}
                              >
                                <Save className="mr-2 h-4 w-4" />
                                {savingLaunchConfig
                                  ? 'Saving...'
                                  : editingLaunchConfigId
                                    ? 'Save Changes'
                                    : 'Save Config'}
                              </Button>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Route className="h-4 w-4 text-primary" />
                          Launch Mode
                        </div>
                        <div className="grid gap-3 md:grid-cols-2">
                          {[
                            ...(!IS_PRODUCTION_AGENTCRAFT_HOST ? [{
                              id: 'local-docker' as AgentLaunchMode,
                              label: 'Local Docker Agent',
                              caption: 'Runs next to the API host with the existing Docker launcher.',
                              icon: Rocket,
                              unavailable: false,
                            }] : []),
                            ...(IS_PRODUCTION_AGENTCRAFT_HOST ? [{
                              id: 'local-runner' as AgentLaunchMode,
                              label: 'Local Runner Agent',
                              caption: 'Queues a job for agentcraft-local-runner on your Docker machine.',
                              icon: Route,
                              unavailable: false,
                            }] : []),
                            {
                              id: 'local-codex' as AgentLaunchMode,
                              label: 'Local Agent',
                              caption: 'Connects through your local CLI runner with a project token.',
                              icon: Brain,
                              unavailable: false,
                            },
                            {
                              id: 'aws-ecs' as AgentLaunchMode,
                              label: 'Cloud Agent',
                              caption: 'Hosted cloud runtimes are temporarily unavailable.',
                              icon: Cloud,
                              unavailable: true,
                            },
                          ].map((mode) => {
                            const Icon = mode.icon;
                            const selected = launchMode === mode.id;
                            const disabled = Boolean(mode.unavailable) || (launchAgentType !== 'hermes-agent' && isCloudAgentLaunchMode(mode.id));
                            return (
                              <div key={mode.id} className="group relative">
                                <button
                                  type="button"
                                  disabled={disabled}
                                  onClick={() => {
                                    if (disabled) return;
                                    const nextAgentType = mode.id === 'local-codex'
                                      ? supportsLocalCliLaunch(launchAgentType) ? launchAgentType : 'codex'
                                      : launchAgentType;
                                    setLaunchMode(mode.id);
                                    setLaunchAgentType(nextAgentType);
                                    if (isCloudAgentLaunchMode(mode.id)) setLaunchEnableSudo(false);
                                    if (usesLocalCliAuth(mode.id, nextAgentType)) setLaunchLlmConfigId('');
                                    const preferred =
                                      agentRuntimeImages.find((image) => image.provider === mode.id && (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === nextAgentType) ||
                                      agentRuntimeImages.find((image) => (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === nextAgentType);
                                    setLaunchImage(preferred?.id || '');
                                  }}
                                  className={`flex min-h-[82px] w-full items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                                    selected ? 'border-primary bg-primary/10' : 'border-border bg-background'
                                  } ${disabled ? 'cursor-not-allowed opacity-55' : 'hover:border-primary/50'}`}
                                >
                                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
                                    <Icon className="h-5 w-5 text-primary" />
                                  </span>
                                  <span className="min-w-0">
                                    <span className="block text-sm font-medium">{mode.label}</span>
                                    <span className="block text-xs text-muted-foreground">{mode.caption}</span>
                                  </span>
                                </button>
                                {mode.unavailable && (
                                  <div className="pointer-events-none absolute left-full top-1/2 z-30 ml-3 hidden w-72 -translate-y-1/2 rounded-lg border border-amber-500/30 bg-card px-3 py-3 text-xs leading-5 text-card-foreground shadow-xl group-hover:block">
                                    <div className="flex items-start gap-2">
                                      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-300" />
                                      <p>{CLOUD_AGENT_UNAVAILABLE_NOTICE}</p>
                                    </div>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-3">
                        <div className="flex items-center gap-2 text-sm font-medium">
                          <Bot className="h-4 w-4 text-primary" />
                          Agent Type
                        </div>
                        <div className="grid gap-3 md:grid-cols-3">
                          {LAUNCH_AGENT_TYPES.map((agentType) => {
                            const Icon = agentType.icon;
                            const option = launchAgentTypeOption(agentType, launchMode);
                            const selected = launchAgentType === agentType.id;
                            return (
                              <button
                                key={agentType.id}
                                type="button"
                                disabled={!option.available}
                                onClick={() => {
                                  if (!option.available) return;
                                  const nextMode =
                                    agentType.id === 'hermes-agent' || launchMode === 'local-docker' || launchMode === 'local-runner' || launchMode === 'local-codex'
                                      ? launchMode
                                      : IS_PRODUCTION_AGENTCRAFT_HOST
                                        ? 'local-runner'
                                        : 'local-docker';
                                  setLaunchAgentType(agentType.id);
                                  setLaunchMode(nextMode);
                                  if (usesLocalCliAuth(nextMode, agentType.id)) setLaunchLlmConfigId('');
                                  if (agentType.id !== 'hermes-agent' || isCloudAgentLaunchMode(nextMode)) {
                                    setLaunchEnableSudo(false);
                                  }
                                  const preferred =
                                    agentRuntimeImages.find((image) => image.provider === nextMode && (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === agentType.id) ||
                                    agentRuntimeImages.find((image) => (image.agentType || DEFAULT_LAUNCH_AGENT_TYPE) === agentType.id);
                                  setLaunchImage(preferred?.id || '');
                                }}
                                className={`flex min-h-[88px] items-center gap-3 rounded-lg border px-3 py-3 text-left transition-colors ${
                                  selected ? 'border-primary bg-primary/10' : 'border-border bg-background hover:border-primary/50'
                                } ${option.available ? '' : 'cursor-not-allowed opacity-55'}`}
                              >
                                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-secondary">
                                  <Icon className="h-5 w-5 text-primary" />
                                </span>
                                <span className="min-w-0">
                                  <span className="block text-sm font-medium">{agentType.label}</span>
                                  <span className="block text-xs text-muted-foreground">{option.caption}</span>
                                </span>
                              </button>
                            );
                          })}
                        </div>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={launchImage}
                          onChange={(e) => setLaunchImage(e.target.value)}
                        >
                          {(launchImageOptions.length ? launchImageOptions : [{ id: '', label: `Default ${launchAgentType} Image`, provider: launchMode }]).map((image) => (
                            <option key={image.id || 'default'} value={image.id}>
                              {image.label || image.id}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="rounded-lg border bg-background px-4 py-4">
                        <label className="flex items-start gap-3">
                          <input
                            type="checkbox"
                            className="mt-1 h-4 w-4 rounded border-input accent-primary"
                            checked={launchEnableSudo}
                            disabled={isCloudAgentLaunchMode(launchMode)}
                            onChange={(e) => setLaunchEnableSudo(e.target.checked)}
                          />
                          <span className="min-w-0 space-y-1">
                            <span className="flex items-center gap-2 text-sm font-medium">
                              <ShieldCheck className="h-4 w-4 text-primary" />
                              Enable sudo
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Grants passwordless sudo inside local runtimes for system packages. Use only for trusted agents and tasks.
                            </span>
                          </span>
                        </label>
                      </div>

                      <div className="rounded-lg border bg-background px-4 py-4">
                        <div className="flex flex-wrap items-center justify-between gap-4">
                          <div className="space-y-1">
                            <div className="flex items-center gap-2 text-sm font-medium">
                              <Cloud className="h-4 w-4 text-primary" />
                              Agent Deployment Cost
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {launchMode === 'aws-ecs'
                                ? `${agentRuntimeBudget?.dailyAgentCostAmount || AGENT_DEPLOYMENT_PRICE_PER_DAY} ${agentRuntimeBudget?.budgetCurrency || 'AIC'} per day. `
                                : '0 AIC. '}{launchMode === 'aws-ecs'
                                ? 'AWS mode creates a private Fargate runtime.'
                                : launchMode === 'aws-agentcore'
                                  ? 'Cloud Agent is temporarily unavailable.'
                                : launchMode === 'local-codex'
                                  ? 'Local Agent runs through your account runner and local CLI without consuming project AICoin.'
                                : launchMode === 'local-runner'
                                  ? 'Local runner mode starts Docker on your registered runner machine and does not consume project AICoin.'
                                  : 'Local Docker mode starts a runtime from the API host and does not consume project AICoin.'}
                            </p>
                            {agentRuntimeBudget && (
                              <p className="text-xs text-muted-foreground">
                                Available now: {agentRuntimeBudget.availableAmount} {agentRuntimeBudget.budgetCurrency} after {agentRuntimeBudget.committedAmount} {agentRuntimeBudget.budgetCurrency} committed.
                              </p>
                            )}
                          </div>
                          {launchMode !== 'aws-ecs' ? (
                            <div className="min-w-[120px] text-right">
                              <p className="text-sm font-semibold">0 AIC</p>
                              <p className="text-xs text-muted-foreground">
                                {launchMode === 'local-runner'
                                  ? 'local runner'
                                  : launchMode === 'local-codex'
                                    ? 'local agent'
                                  : launchMode === 'aws-agentcore'
                                    ? 'unavailable'
                                    : 'local Docker'}
                              </p>
                            </div>
                          ) : (
                            <div className="flex items-center gap-3">
                              <CalendarDays className="h-4 w-4 text-muted-foreground" />
                              <input
                                className="h-9 w-20 rounded-md border border-input bg-card px-3 text-sm"
                                type="number"
                                min={1}
                                value={launchDeploymentDays}
                                onChange={(e) => setLaunchDeploymentDays(Math.max(1, Number(e.target.value) || 1))}
                              />
                              <div className="min-w-[96px] text-right">
                                <p className="text-sm font-semibold">{launchDeploymentCost} AIC</p>
                                <p className="text-xs text-muted-foreground">{Math.max(1, launchDeploymentDays)} day(s)</p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="overflow-hidden rounded-lg border bg-background">
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left"
                          onClick={() => setLaunchLogsCollapsed((value) => !value)}
                        >
                          <span className="flex items-center gap-2 text-sm font-medium">
                            <FileText className="h-4 w-4 text-primary" />
                            Launching Logs
                            <Badge variant={launchLogs.some((log) => log.level === 'error') ? 'destructive' : 'secondary'}>
                              {launchLogs.length || 'idle'}
                            </Badge>
                          </span>
                          <span className="text-xs text-muted-foreground">
                            {launchLogsCollapsed ? 'Expand' : 'Collapse'}
                          </span>
                        </button>
                        {!launchLogsCollapsed && (
                          <div className="max-h-52 overflow-y-auto border-t bg-muted/10 px-4 py-3 font-mono text-xs">
                            {launchLogs.length ? (
                              <div className="space-y-2">
                                {launchLogs.map((log, index) => (
                                  <div
                                    key={`${log.at}-${index}`}
                                    className={
                                      log.level === 'error'
                                        ? 'text-destructive'
                                        : log.level === 'success'
                                          ? 'text-emerald-400'
                                          : 'text-muted-foreground'
                                    }
                                  >
                                    <span className="mr-2 text-muted-foreground">{log.at}</span>
                                    <span className="mr-2 uppercase">[{log.level}]</span>
                                    <span className="whitespace-pre-wrap break-words">{log.message}</span>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <p className="text-muted-foreground">
                                Logs will appear here after you confirm launch.
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center justify-end gap-3 border-t px-5 py-4">
                      <Button variant="ghost" onClick={() => setPendingAgentLaunch(null)}>
                        Cancel
                      </Button>
                      <Button
                        variant="secondary"
                        data-tour="project-confirm-local-agent"
                        title={
                          pendingAgentLaunchCapacityBlocked
                            ? activeAgentCapacityMessage
                            : isCloudAgentLaunchMode(launchMode)
                              ? 'Cloud Agent is temporarily unavailable'
                              : undefined
                        }
                        disabled={
                          launchingRole === pendingAgentLaunch.role ||
                          savingLaunchConfig ||
                          savingAgentProfile ||
                          (!launchModelApiOptional && !showNewLaunchConfig && !launchLlmConfigId) ||
                          isCloudAgentLaunchMode(launchMode) ||
                          pendingAgentLaunchCapacityBlocked
                        }
                        onClick={handleConfirmLaunchAgentRuntime}
                      >
                        <Rocket className="mr-2 h-4 w-4" />
                        {launchingRole === pendingAgentLaunch.role
                          ? 'Launching...'
                          : pendingAgentLaunchCapacityBlocked
                            ? 'Capacity Reached'
                          : isCloudAgentLaunchMode(launchMode)
                            ? 'Cloud Agent Unavailable'
                            : launchMode === 'local-codex'
                              ? 'Queue Local Agent'
                            : launchMode === 'local-runner'
                              ? 'Queue Local Runner Agent'
                            : 'Confirm Launch Local Agent'}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              <div className="hidden">
                <div className="space-y-1">
                  <h3 className="font-medium">Agent IM</h3>
                  <p className="text-sm text-muted-foreground">
                    Chat with online project agents. Offline agents stay visible for status, but messaging is disabled.
                  </p>
                </div>
                <div className="overflow-hidden rounded-lg border bg-background">
                  <div className="grid min-h-[560px] lg:grid-cols-[300px_minmax(0,1fr)]">
                    <div className="border-b bg-muted/10 lg:border-b-0 lg:border-r">
                      <div className="border-b px-4 py-3">
                        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Members</p>
                      </div>
                      <div className="max-h-[520px] overflow-y-auto p-2">
	                        {projectAgentChatMembers.length ? (
		                          projectAgentChatMembers.map(({ member, runtime, isOnline, isOffline, canMessage }) => {
		                            const isSelected = selectedAgentMemberId === member.id;
		                            const RoleIcon = roleIconForRole(member.role);
                                const isTyping = agentRuntimeStatus(runtime) === 'TYPING';
                                const memberCardClassName = `w-full rounded-md px-3 py-3 text-left transition-colors ${
                                  isTyping
                                    ? 'border border-emerald-300/80 bg-emerald-50/70 shadow-[0_0_0_1px_rgba(16,185,129,0.16),0_0_22px_rgba(16,185,129,0.14)] animate-pulse dark:border-emerald-500/50 dark:bg-emerald-950/20'
                                    : isSelected
                                      ? isOffline
                                        ? 'bg-slate-50/90 text-slate-500 dark:bg-slate-800/35 dark:text-slate-400'
                                        : 'bg-primary/10 text-foreground'
                                      : isOffline
                                        ? 'bg-slate-50/70 text-slate-500 hover:bg-slate-100/80 dark:bg-slate-800/30 dark:text-slate-400'
                                        : isOnline
                                          ? 'hover:bg-muted/50'
                                          : 'hover:bg-muted/30'
                                }`;
                                const memberNameClassName = isOffline ? 'font-medium text-slate-500 dark:text-slate-400' : agentNameClassName(member);
		                            return (
	                              <button
	                                key={member.id}
	                                type="button"
	                                className={memberCardClassName}
	                                onClick={() => runtime && handleSelectAgentRuntime(member.id)}
	                                disabled={!runtime}
                                title={runtime ? 'Open chat' : 'Launch a runtime before chatting'}
                              >
	                                <div className="flex items-start gap-3">
	                                  <span className="relative mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
	                                    <RoleIcon className="h-4 w-4 text-primary" />
	                                    <span
	                                      className={`absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full ${
	                                        isOnline ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-muted-foreground/50'
	                                      }`}
		                                    />
		                                  </span>
		                                  <span className="min-w-0 flex-1">
		                                    <span className={`block truncate text-sm ${memberNameClassName}`}>
		                                      {formatAgentDisplayName(member)}
		                                    </span>
	                                    <span className="mt-1 flex flex-wrap items-center gap-2">
	                                      <Badge variant={isOnline ? 'success' : 'secondary'}>{isOnline ? 'online' : 'offline'}</Badge>
	                                      <Badge variant="outline">{formatRoleLabel(member.role)}</Badge>
	                                    </span>
                                    <span className="mt-2 block truncate text-xs text-muted-foreground">
                                      {runtime ? formatRuntimeStatusLabel(runtime.session.status) : 'Runtime not launched'}
                                    </span>
                                  </span>
                                  {!canMessage && <span className="text-xs text-muted-foreground">read only</span>}
                                </div>
                              </button>
                            );
                          })
                        ) : (
                          <p className="px-3 py-6 text-sm text-muted-foreground">No agent members available.</p>
                        )}
                      </div>
                    </div>

                    <div className="flex min-h-[560px] flex-col">
                      {selectedAgentRuntime ? (
                        <>
                          <div className="border-b px-4 py-3">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div className="min-w-0 space-y-1">
	                                <div className="flex flex-wrap items-center gap-2">
	                                  <p className={`truncate ${agentNameClassName(selectedAgentMember)}`}>
	                                    {selectedAgentMember ? formatAgentDisplayName(selectedAgentMember) : selectedAgentRuntime.user.displayName || selectedAgentRuntime.user.email}
	                                  </p>
	                                  <Badge variant={AGENT_RUNTIME_STATUS_VARIANT[selectedAgentRuntime.session.status] || 'secondary'}>
	                                    {formatRuntimeStatusLabel(selectedAgentRuntime.session.status)}
	                                  </Badge>
	                                  <Badge variant="outline">{formatRoleLabel(selectedAgentRuntime.role)}</Badge>
	                                </div>
                                <p className="truncate text-xs text-muted-foreground">
                                  {selectedAgentRuntime.session.llm?.modelName || selectedAgentRuntime.session.image} ·{' '}
                                  {selectedAgentRuntime.session.provider === 'aws-ecs'
                                    ? selectedAgentRuntime.session.dockerStatus?.running ? 'cloud running' : 'cloud stopped'
                                    : selectedAgentRuntime.session.provider === 'aws-agentcore'
                                      ? selectedAgentRuntime.session.dockerStatus?.running ? 'agentcore ready' : 'agentcore unavailable'
                                    : selectedAgentRuntime.session.dockerStatus?.running ? 'docker running' : 'docker stopped'} /{' '}
                                  {selectedAgentRuntime.session.apiHealth?.ok ? 'api ok' : 'api unavailable'}
                                </p>
                              </div>
                              <div className="max-w-xl rounded-md border bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                {selectedAgentActivity}
                              </div>
                            </div>
                          </div>

                          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4" data-agent-message-list="true">
                            <div className="space-y-4">
                              {selectedAgentMessages.length ? (
                                selectedAgentMessages.map((message) => {
                                  if (message.role === 'tool') {
                                    return (
                                      <div key={message.id}>
                                        {renderAgentActivity(message.actions || [], message.id)}
                                      </div>
                                    );
                                  }
                                  return renderAgentMessage(message);
                                })
                              ) : (
                                <div className="flex h-full min-h-[260px] items-center justify-center text-sm text-muted-foreground">
                                  No messages yet.
                                </div>
                              )}
                              {selectedAgentIsTyping && (
                                <div className="flex justify-start">
                                  <div className="rounded-lg bg-muted/40 px-4 py-3 text-sm leading-6 shadow-sm">
                                    {selectedAgentTypingLines.length > 0 && (
                                      <div className="mb-2 space-y-1 text-xs leading-5 text-muted-foreground">
                                        {selectedAgentTypingLines.map((line) => (
                                          <div key={line}>{line}</div>
                                        ))}
                                      </div>
                                    )}
                                    <div className="flex items-center gap-1.5">
                                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70" />
                                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
                                      <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="border-t bg-card px-4 py-4">
                            <form onSubmit={handleSendAgentMessage} className="space-y-3">
                              <div className="relative">
                                {renderProjectFileMentionMenu('agentMessage')}
                                <textarea
                                  className="min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                  value={agentMessage}
                                  onFocus={() => updateProjectFileMentionState('agentMessage', agentMessage)}
                                  onBlur={() => closeProjectFileMentionMenu('agentMessage')}
                                  onChange={(e) => handleAgentMessageChange(e.target.value)}
                                  onCompositionStart={handleAgentMessageCompositionStart}
                                  onCompositionEnd={handleAgentMessageCompositionEnd}
                                  onKeyDown={handleAgentMessageKeyDown}
                                  placeholder={
                                    selectedAgentMessagePlaceholder
                                  }
                                  disabled={!selectedAgentCanMessage}
                                />
                              </div>
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <p className="text-xs text-muted-foreground">
                                  {agentMessageResponse || 'Replies may arrive after the agent finishes the current turn.'}
                                </p>
                                {selectedAgentIsTyping && (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    disabled={cancellingAgentMessage}
                                    onClick={handleCancelAgentMessage}
                                  >
                                    <X className="mr-2 h-4 w-4" />
                                    {cancellingAgentMessage ? 'Cancelling...' : 'Stop'}
                                  </Button>
                                )}
                                <Button
                                  type="submit"
                                  variant="secondary"
                                  disabled={
                                    sendingAgentMessage ||
                                    !agentMessage.trim() ||
                                    !selectedAgentCanMessage
                                  }
                                >
                                  <MessageSquare className="mr-2 h-4 w-4" />
                                  {sendingAgentMessage ? 'Sending...' : 'Send'}
                                </Button>
                              </div>
                            </form>
                          </div>
                        </>
                      ) : (
                        <div className="flex flex-1 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                          Select an online agent to open the chat.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {selectedAgentRuntime ? (
                <div className="hidden">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="space-y-1">
                      <h3 className="font-medium">Agent</h3>
                      <p className="text-sm text-muted-foreground">
	                        {(selectedAgentMember ? formatAgentDisplayName(selectedAgentMember) : selectedAgentRuntime.user.displayName || selectedAgentRuntime.user.email)} · {formatRoleLabel(selectedAgentRuntime.role)}
                      </p>
                    </div>
                    <Badge variant={AGENT_RUNTIME_STATUS_VARIANT[selectedAgentRuntime.session.status] || 'secondary'}>
                      {formatRuntimeStatusLabel(selectedAgentRuntime.session.status)}
                    </Badge>
                    <Button variant="ghost" size="sm" onClick={() => setSelectedAgentMemberId('')}>
                      Close
                    </Button>
                  </div>
                  <div className="grid gap-2 text-xs text-muted-foreground">
                    <div className="flex items-center justify-between gap-3">
                      <span>Name</span>
	                      <span className={`truncate text-foreground ${agentNameClassName(selectedAgentMember)}`}>
	                        {selectedAgentMember ? formatAgentDisplayName(selectedAgentMember) : selectedAgentRuntime.user.displayName || selectedAgentRuntime.user.email}
	                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Runtime</span>
                      <span className="truncate text-foreground">{selectedAgentRuntime.session.runtimeId}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Model</span>
                      <span className="truncate text-foreground">{selectedAgentRuntime.session.llm?.modelName || selectedAgentRuntime.session.image}</span>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <span>Health</span>
                      <span className="text-foreground">
                        {selectedAgentRuntime.session.provider === 'aws-ecs'
                          ? selectedAgentRuntime.session.dockerStatus?.running ? 'cloud running' : 'cloud stopped'
                          : selectedAgentRuntime.session.provider === 'aws-agentcore'
                            ? selectedAgentRuntime.session.dockerStatus?.running ? 'agentcore ready' : 'agentcore unavailable'
                          : selectedAgentRuntime.session.dockerStatus?.running ? 'docker running' : 'docker stopped'} /{' '}
                        {selectedAgentRuntime.session.apiHealth?.ok ? 'api ok' : 'api unavailable'}
                      </span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">Now</p>
                    <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm">
                      {selectedAgentActivity}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <p className="text-xs font-medium uppercase text-muted-foreground">History</p>
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border bg-background p-2" data-agent-message-list="true">
                      {selectedAgentMessages.length ? (
                        selectedAgentMessages.map((message) => {
                          if (message.role === 'tool') {
                            return (
                              <div key={message.id}>
                                {renderAgentActivity(message.actions || [], message.id)}
                              </div>
                            );
                          }
                          return renderAgentMessage(message, { compact: true });
                        })
                      ) : (
                        <p className="px-2 py-6 text-center text-sm text-muted-foreground">No messages yet.</p>
                      )}
                      {selectedAgentIsTyping && (
                        <div className="flex justify-start">
                          <div className="rounded-md bg-muted/40 px-3 py-2">
                            {selectedAgentTypingLines.length > 0 && (
                              <div className="mb-2 space-y-1 text-xs leading-5 text-muted-foreground">
                                {selectedAgentTypingLines.map((line) => (
                                  <div key={line}>{line}</div>
                                ))}
                              </div>
                            )}
                            <div className="flex items-center gap-1.5">
                              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
                              <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                  <form onSubmit={handleSendAgentMessage} className="space-y-3">
                    <textarea
                      className="min-h-[96px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={agentMessage}
                      onChange={(e) => handleAgentMessageChange(e.target.value)}
                      onCompositionStart={handleAgentMessageCompositionStart}
                      onCompositionEnd={handleAgentMessageCompositionEnd}
                      onKeyDown={handleAgentMessageKeyDown}
                      placeholder="Send a message to this agent through the Hermes IM gateway"
                    />
                    <Button type="submit" variant="secondary" className="w-full" disabled={sendingAgentMessage || !agentMessage.trim() || !selectedAgentCanMessage}>
                      <MessageSquare className="mr-2 h-4 w-4" />
                      {sendingAgentMessage ? 'Sending...' : 'Send Message'}
                    </Button>
                  </form>
                  {agentMessageResponse && (
                    <div className="whitespace-pre-wrap rounded-lg border bg-muted/20 px-4 py-3 text-sm leading-6 text-muted-foreground">
                      {agentMessageResponse}
                    </div>
                  )}
                </div>
              ) : null}

            </CardContent>
          </Card>
          )}

          {activeProjectSection === 'documents' && (
            <Card>
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="min-w-0 space-y-2">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <FolderOpen className="h-5 w-5" />
                      Resources
                    </CardTitle>
                    {canAccessProjectFiles ? (
                      <div className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                        <button
                          type="button"
                          className={`rounded px-2 py-1 hover:bg-muted/50 ${projectFilePrefix ? '' : 'bg-muted/40 text-foreground'}`}
                          onClick={() => navigateProjectFiles('')}
                        >
                          Shared
                        </button>
                        {projectFileBreadcrumbs(projectFilePrefix).map((crumb) => (
                          <span key={crumb.path} className="inline-flex items-center gap-1">
                            <ChevronRight className="h-3 w-3" />
                            <button
                              type="button"
                              className="max-w-[180px] truncate rounded px-2 py-1 text-foreground hover:bg-muted/50"
                              onClick={() => navigateProjectFiles(crumb.path)}
                            >
                              {crumb.name}
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                  {canAccessProjectFiles ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={loadingProjectFiles}
                        onClick={() => loadProjectFiles(projectFileSearch, projectFilePrefix)}
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${loadingProjectFiles ? 'animate-spin' : ''}`} />
                        {loadingProjectFiles ? 'Refreshing' : 'Refresh'}
                      </Button>
                      <label
                        className={`inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm transition-colors hover:bg-muted/40 ${
                          uploadingProjectFile ? 'pointer-events-none opacity-50' : ''
                        }`}
                        title="Upload files"
                      >
                        <Upload className="h-4 w-4" />
                        {uploadingProjectFile ? 'Uploading...' : 'Upload'}
                        <input
                          type="file"
                          multiple
                          className="hidden"
                          disabled={uploadingProjectFile}
                          onChange={handleProjectFileUpload}
                        />
                      </label>
                    </div>
                  ) : null}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {canAccessProjectFiles ? (
                  <>
                    <div className="grid gap-3 lg:grid-cols-[minmax(220px,1fr)_auto]">
                      <input
                        className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                        value={projectFileSearch}
                        onChange={(e) => setProjectFileSearch(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') loadProjectFiles(projectFileSearch, projectFilePrefix);
                        }}
                        placeholder="Search this project"
                      />
                      <div className="flex min-w-[260px] gap-2">
                        <input
                          className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                          value={newProjectFolderName}
                          onChange={(e) => setNewProjectFolderName(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleCreateProjectFolder();
                          }}
                          placeholder="New folder"
                        />
                        <Button type="button" variant="outline" onClick={handleCreateProjectFolder} disabled={creatingProjectFolder || !newProjectFolderName.trim()}>
                          <FolderPlus className="mr-2 h-4 w-4" />
                          Create
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/10 px-3 py-2 text-sm text-muted-foreground">
                      {projectFilePrefix ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2"
                          onClick={() => {
                            const nextPrefix = parentProjectFilePrefix(projectFilePrefix);
                            setProjectFilePrefix(nextPrefix);
                            setSelectedProjectFile(null);
                            void loadProjectFiles(projectFileSearch, nextPrefix);
                          }}
                        >
                          <ArrowLeft className="mr-1 h-3.5 w-3.5" />
                          Up
                        </Button>
                      ) : null}
                      <button
                        type="button"
                        className="font-medium text-foreground hover:text-primary"
                        onClick={() => {
                          setProjectFilePrefix('');
                          setSelectedProjectFile(null);
                          void loadProjectFiles(projectFileSearch, '');
                        }}
                      >
                        Root
                      </button>
                      {projectFilePrefix ? (
                        <>
                          <span>/</span>
                          <span className="break-all text-foreground">{projectFilePrefix}</span>
                        </>
                      ) : null}
                    </div>

                    <div className="grid gap-4 xl:grid-cols-[minmax(280px,0.54fr)_minmax(0,0.46fr)]">
                      <div
                        className={`max-h-[560px] min-h-[360px] overflow-y-auto rounded-md transition-colors ${
                          projectFileDragActive ? 'bg-primary/5 ring-1 ring-primary/40' : 'bg-background'
                        }`}
                        onDrop={handleProjectFileDrop}
                        onDragOver={handleProjectFileDragOver}
                        onDragLeave={handleProjectFileDragLeave}
                      >
                        <div className="grid grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 border-b px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid-cols-[minmax(0,1fr)_9rem_5rem_5rem_2rem]">
                          <span>Name</span>
                          <span className="hidden md:block">Date Modified</span>
                          <span className="hidden text-right md:block">Size</span>
                          <span className="hidden md:block">Kind</span>
                          <span />
                        </div>
                        <div className="divide-y divide-border/40">
                          {projectFilePrefix ? (
                            <div
                              role="button"
                              tabIndex={0}
                              className="grid w-full grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_9rem_5rem_5rem_2rem]"
                              onClick={() => navigateProjectFiles(parentProjectFilePrefix(projectFilePrefix))}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  navigateProjectFiles(parentProjectFilePrefix(projectFilePrefix));
                                }
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <ArrowLeft className="h-4 w-4 shrink-0 text-muted-foreground" />
                                <span className="font-medium">..</span>
                              </div>
                              <span className="hidden text-muted-foreground md:block">--</span>
                              <span className="hidden text-right text-muted-foreground md:block">--</span>
                              <span className="hidden text-muted-foreground md:block">Folder</span>
                              <span />
                            </div>
                          ) : null}

                          {projectFolders.map((folder) => (
                            <div
                              key={folder.path}
                              role="button"
                              tabIndex={0}
                              className="group grid w-full grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_9rem_5rem_5rem_2rem]"
                              onClick={() => navigateProjectFiles(folder.path)}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  navigateProjectFiles(folder.path);
                                }
                              }}
                            >
                              <div className="flex min-w-0 items-center gap-2">
                                <FolderOpen className="h-5 w-5 shrink-0 text-primary" />
                                <div className="min-w-0">
                                  <p className="truncate font-medium">{folder.name}</p>
                                  <p className="truncate text-xs text-muted-foreground md:hidden">
                                    {folder.fileCount || 0} files
                                    {folder.size ? ` · ${formatBytes(folder.size)}` : ''}
                                  </p>
                                </div>
                              </div>
                              <span className="hidden truncate text-muted-foreground md:block">
                                {formatProjectDate(folder.lastModified) || '--'}
                              </span>
                              <span className="hidden text-right text-muted-foreground md:block">
                                {folder.size ? formatBytes(folder.size) : '--'}
                              </span>
                              <span className="hidden text-muted-foreground md:block">Folder</span>
                              <button
                                type="button"
                                className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                title="Delete folder"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  handleDeleteProjectFolder(folder);
                                }}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ))}

                          {projectFiles.map((file) => {
                            const isSelected = selectedProjectFile?.key === file.key;
                            const kind = projectFilePreviewKind(file);
                            const displayPath = projectFileDisplayPath(file, projectFilePrefix);
                            const fileName = displayPath.split('/').pop() || displayPath || file.path;
                            const kindLabel =
                              kind === 'download'
                                ? 'File'
                                : kind === 'pdf'
                                  ? 'PDF'
                                  : kind.charAt(0).toUpperCase() + kind.slice(1);
                            return (
                              <div
                                key={file.key}
                                role="button"
                                tabIndex={0}
                                className={`group grid w-full grid-cols-[minmax(0,1fr)_2rem] items-center gap-3 px-3 py-2 text-left text-sm transition-colors hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_9rem_5rem_5rem_2rem] ${
                                  isSelected ? 'bg-primary/15 text-foreground' : ''
                                }`}
                                onClick={() => handleSelectProjectFile(file)}
                                onKeyDown={(event) => {
                                  if (event.key === 'Enter' || event.key === ' ') {
                                    event.preventDefault();
                                    handleSelectProjectFile(file);
                                  }
                                }}
                              >
                                <div className="flex min-w-0 items-center gap-2">
                                  <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                                  <div className="min-w-0">
                                    <p className="truncate font-medium">{fileName}</p>
                                    <p className="truncate text-xs text-muted-foreground md:hidden">
                                      {formatBytes(file.size)}
                                      {file.lastModified ? ` · ${formatProjectDate(file.lastModified)}` : ''}
                                    </p>
                                  </div>
                                </div>
                                <span className="hidden truncate text-muted-foreground md:block">
                                  {formatProjectDate(file.lastModified) || '--'}
                                </span>
                                <span className="hidden text-right text-muted-foreground md:block">{formatBytes(file.size)}</span>
                                <span className="hidden text-muted-foreground md:block">{kindLabel}</span>
                                <button
                                  type="button"
                                  className="rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive group-hover:opacity-100"
                                  title="Delete file"
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    handleDeleteProjectFile(file);
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                            );
                          })}

                          {!projectFolders.length && !projectFiles.length ? (
                            <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 px-3 py-8 text-center text-sm text-muted-foreground">
                              <FileUp className="h-9 w-9 text-primary" />
                              <p>{loadingProjectFiles ? 'Loading resources...' : projectFileDragActive ? 'Drop files here' : 'Drop files or folders here'}</p>
                              <label className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md border px-3 text-sm text-foreground transition-colors hover:bg-muted/40">
                                <Upload className="h-4 w-4" />
                                Upload files
                                <input type="file" multiple className="hidden" disabled={uploadingProjectFile} onChange={handleProjectFileUpload} />
                              </label>
                            </div>
                          ) : projectFileDragActive ? (
                            <div className="px-3 py-2 text-center text-sm text-primary">
                              Drop files into {projectFilePrefix || 'Shared'}
                            </div>
                          ) : null}
                        </div>
                      </div>

                      <div className="min-h-[360px] rounded-md border bg-background">
                        {selectedProjectFile ? (
                          <div className="flex h-full min-h-[360px] flex-col">
                            <div className="flex flex-wrap items-center justify-between gap-3 border-b px-3 py-2">
                              <div className="min-w-0">
                                <p className="truncate font-medium">{selectedProjectFile.path}</p>
                                <p className="text-xs text-muted-foreground">
                                  {selectedProjectFile.type === 'folder'
                                    ? `${selectedProjectFile.fileCount || 0} files`
                                    : formatBytes(selectedProjectFile.size)}
                                </p>
                              </div>
                              {selectedProjectFile.type !== 'folder' ? (
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleDownloadProjectFile(selectedProjectFile.path)}
                                >
                                  <Download className="mr-2 h-4 w-4" />
                                  Download
                                </Button>
                              ) : null}
                            </div>
                            <div className="flex min-h-0 flex-1 items-center justify-center p-3">
                              {loadingProjectFilePreview ? (
                                <p className="text-sm text-muted-foreground">Loading preview...</p>
                              ) : projectFilePreviewError ? (
                                <div className="space-y-3 text-center text-sm text-muted-foreground">
                                  <AlertTriangle className="mx-auto h-8 w-8 text-destructive" />
                                  <p>{projectFilePreviewError}</p>
                                  <Button type="button" size="sm" variant="secondary" onClick={() => handleDownloadProjectFile(selectedProjectFile.path)}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download file
                                  </Button>
                                </div>
                              ) : selectedProjectFile.type === 'folder' ? (
                                <div className="space-y-2 text-center text-sm text-muted-foreground">
                                  <FolderOpen className="mx-auto h-8 w-8 text-primary" />
                                  <p>Folder is ready for project files.</p>
                                </div>
                              ) : projectFilePreviewKind(selectedProjectFile) === 'image' && projectFilePreviewUrl ? (
                                <img
                                  src={projectFilePreviewUrl}
                                  alt={selectedProjectFile.path}
                                  className="max-h-[480px] max-w-full rounded-md object-contain"
                                />
                              ) : projectFilePreviewKind(selectedProjectFile) === 'pdf' && projectFilePreviewUrl ? (
                                <iframe
                                  title={selectedProjectFile.path}
                                  src={projectFilePreviewUrl}
                                  className="h-[520px] w-full rounded-md border"
                                />
                              ) : projectFilePreviewKind(selectedProjectFile) === 'text' ? (
                                projectFilePreviewText ? (
                                  projectFileTextPreviewMode(selectedProjectFile) === 'markdown' ? (
                                    <div className="max-h-[520px] w-full overflow-auto rounded-md bg-muted/10 px-4 py-3 text-left">
                                      <MathMarkdown content={projectFilePreviewText} className="max-w-none text-sm" />
                                    </div>
                                  ) : (
                                    <pre className="max-h-[520px] w-full overflow-auto whitespace-pre-wrap rounded-md bg-muted/20 p-3 text-xs leading-5">
                                      {projectFilePreviewText}
                                    </pre>
                                  )
                                ) : (
                                  <p className="text-sm text-muted-foreground">No preview content.</p>
                                )
                              ) : (
                                <div className="space-y-3 text-center text-sm text-muted-foreground">
                                  <FileText className="mx-auto h-8 w-8 text-primary" />
                                  <p>Preview is not available for this file type.</p>
                                  <Button type="button" size="sm" variant="secondary" onClick={() => handleDownloadProjectFile(selectedProjectFile.path)}>
                                    <Download className="mr-2 h-4 w-4" />
                                    Download file
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        ) : (
                          <div className="flex min-h-[360px] items-center justify-center px-3 text-center text-sm text-muted-foreground">
                            Select a document to preview it.
                          </div>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="rounded-md border px-3 py-4 text-sm text-muted-foreground">
                    Shared resources are available to project members and authorized agent runtimes.
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeProjectSection !== 'home' && !isReadOnly ? (
            <>
          <Card className={activeProjectSection === 'planning' ? '' : 'hidden'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Plus className="h-5 w-5" />
                Plan
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border bg-muted/10 p-4">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Route className="h-4 w-4 text-primary" />
                    <h3 className="font-medium">Goal Map</h3>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">{projectAllWorkItemTotal} work items</Badge>
                    <Badge variant="outline">{artifacts.length} artifacts</Badge>
                    <Badge variant="outline">{homeOutputFiles.length} shared files</Badge>
                  </div>
                </div>
                <div className="space-y-3">
                  {homeGoalSummaries.length ? (
                    homeGoalSummaries.map((summary) => renderGoalProgressCard(summary, { compact: true }))
                  ) : (
                    <p className="rounded-md border border-dashed bg-background px-3 py-4 text-sm text-muted-foreground">
                      Create a goal to start building the project topology.
                    </p>
                  )}
                </div>
              </div>

              <form onSubmit={handleCreateGoal} className="space-y-4 border-b pb-6">
                <div className="space-y-1">
                  <h3 className="font-medium">Add Goal</h3>
                  <p className="text-sm text-muted-foreground">
                    Goals capture owner-level project outcomes.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Goal Title</label>
                  <textarea
                    className="min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm leading-6"
                    value={goalForm.title}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={goalForm.description}
                    onChange={(e) => setGoalForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <Button type="submit" variant="secondary" className="w-full" disabled={savingGoal}>
                  {savingGoal ? 'Saving...' : 'Add Goal'}
                </Button>
              </form>

              <form onSubmit={handleCreateFeature} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-medium">Add Feature Group</h3>
                  <p className="text-sm text-muted-foreground">
                    Optional deliverable areas for goals with multiple reviewable work streams.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Feature Group Title</label>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={featureForm.title}
                    onChange={(e) => setFeatureForm((prev) => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Goal</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={featureForm.goalId}
                    onChange={(e) => setFeatureForm((prev) => ({ ...prev, goalId: e.target.value }))}
                  >
                    <option value="">No linked goal</option>
                    {(project.goals || []).map((goal: any) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <textarea
                    className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={featureForm.description}
                    onChange={(e) => setFeatureForm((prev) => ({ ...prev, description: e.target.value }))}
                  />
                </div>
                <Button type="submit" variant="secondary" className="w-full" disabled={savingFeature}>
                  {savingFeature ? 'Saving...' : 'Add Feature Group'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className={activeProjectSection === 'work' && workItemsView === 'list' ? 'overflow-hidden' : 'hidden'}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Layers3 className="h-5 w-5" />
                    Current Work Items
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Track project work, see the assigned agent, and open an item for goal context and dispatch.
                  </p>
                </div>
                <div className="flex flex-1 flex-wrap items-center justify-end gap-3">
                  <div className="relative min-w-[240px] flex-1 sm:max-w-sm">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <input
                      className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm"
                      value={workItemSearch}
                      onChange={(e) => setWorkItemSearch(e.target.value)}
                      placeholder="Search title or content"
                    />
                  </div>
                  <select
                    className="h-10 min-w-[220px] rounded-md border border-input bg-background px-3 text-sm"
                    value={workGoalFilter}
                    onChange={(e) => setWorkGoalFilter(e.target.value)}
                  >
                    <option value="ALL">All goals</option>
                    {((project.goals || []) as ProjectGoalOption[]).map((goal) => (
                      <option key={goal.id} value={goal.id}>
                        {goal.title}
                      </option>
                    ))}
                  </select>
                  <select
                    className="h-10 min-w-[120px] rounded-md border border-input bg-background px-3 text-sm"
                    value={workItemPageSize}
                    onChange={(e) => setWorkItemPageSize(Number(e.target.value) || DEFAULT_WORK_ITEM_PAGE_SIZE)}
                  >
                    <option value={25}>25 / page</option>
                    <option value={50}>50 / page</option>
                    <option value={100}>100 / page</option>
                  </select>
                  <Button type="button" onClick={openNewWorkItemForm}>
                    <Plus className="mr-2 h-4 w-4" />
                    New Work Item
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/10 p-2">
                <span className="px-2 text-sm font-medium text-muted-foreground">Status</span>
                <Button
                  type="button"
                  size="sm"
                  variant={workStatusFilter === 'ALL' ? 'default' : 'outline'}
                  className="h-8 gap-2"
                  aria-pressed={workStatusFilter === 'ALL'}
                  onClick={() => setWorkStatusFilter('ALL')}
                >
                  All
                  <span className="text-xs opacity-80">{workStatusAllCount}</span>
                </Button>
                {workStatusFilterOptions.map((status) => (
                  <Button
                    key={status}
                    type="button"
                    size="sm"
                    variant={workStatusFilter === status ? 'default' : 'outline'}
                    className="h-8 gap-2"
                    aria-pressed={workStatusFilter === status}
                    onClick={() => setWorkStatusFilter(status)}
                  >
                    {status.split('_').join(' ')}
                    <span className="text-xs opacity-80">{workStatusCounts[status] || 0}</span>
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-md border bg-muted/10 px-4 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Showing</span>
                  <span className="font-semibold">
                    {workItemPageStart}-{workItemPageEnd}
                  </span>
                  <span className="text-muted-foreground">of</span>
                  <span className="font-semibold">{projectWorkItemTotal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">In Progress</span>
                  <span className="font-semibold">{workStatusCounts.IN_PROGRESS || 0}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Assigned</span>
                  <span className="font-semibold">{activeAssignmentTotal}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground">Project Agents</span>
                  <span className="font-semibold">{projectAgentMembers.length}</span>
                </div>
              </div>

              <div className="space-y-2">
                {loadingWorkItems ? (
                  <p className="text-xs text-muted-foreground">Refreshing work items...</p>
                ) : null}
                <div className="space-y-3">
                  {filteredWorkItems.length ? (
                    filteredWorkItems.map((item) => {
                      const activeItemAgents = activeAgentsForItem(item);
                      const openItemAssignments = openAssignmentsForItem(item);
                      const itemGoalId = resolveWorkItemGoalId(item);
                      const itemOwnerName = formatWorkItemOwnerName(item);
                      const assigneeLabel = activeItemAgents.length
                        ? `${activeItemAgents.map(formatAssigneeName).join(', ')} working now`
                        : openItemAssignments.length
                          ? openItemAssignments.map((assignment: any) => `${formatAssigneeName(assignment)} · ${assignment.status}`).join(', ')
                          : itemOwnerName || 'Unassigned';
                      return (
                        <button
                          key={item.id}
                          type="button"
                          className="w-full rounded-md border bg-background px-3 py-2 text-left transition-colors hover:border-primary/50 hover:bg-muted/20"
                          onClick={() => openWorkItemDetail(item.id)}
                        >
                          <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
                            <div className="min-w-0 flex-1">
                              <div className="flex min-w-0 flex-wrap items-center gap-2">
                                <p className="min-w-0 flex-1 truncate font-medium leading-5">{item.title}</p>
                                <Badge variant={WORK_ITEM_STATUS_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
                                <Badge variant="outline">{item.workType}</Badge>
                                <Badge variant="secondary">{item.concurrencyMode || 'SINGLE'}</Badge>
                                {isAgentGeneratedWorkItem(item) ? (
                                  <Badge variant="outline" className="gap-1">
                                    <Bot className="h-3 w-3" />
                                    Agent Generated
                                  </Badge>
                                ) : null}
                              </div>
                              <div className="mt-1 flex min-w-0 flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                <span className="min-w-0 max-w-[420px] truncate">
                                  Goal: {itemGoalId ? goalById.get(itemGoalId)?.title || 'Linked goal' : 'No linked goal'}
                                </span>
                                <span className="min-w-0 max-w-[360px] truncate">Assignee: {assigneeLabel}</span>
                                <span>Priority {item.priority}</span>
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-3 text-xs text-muted-foreground">
                              <span>{item._count?.artifacts || 0} artifacts</span>
                              <span>{item._count?.reviews || 0} reviews</span>
                              <span>{formatProjectDate(item.createdAt)}</span>
                            </div>
                          </div>
                        </button>
                      );
                    })
                  ) : (
                    <div className="rounded-lg border border-dashed px-4 py-10 text-center text-sm text-muted-foreground">
                      No work items match this filter.
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4 text-sm">
                <div className="text-muted-foreground">
                  Page <span className="font-medium text-foreground">{workItemPage}</span> of{' '}
                  <span className="font-medium text-foreground">{workItemTotalPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={loadingWorkItems || workItemPage <= 1}
                    onClick={() => setWorkItemPage((page) => Math.max(1, page - 1))}
                  >
                    Previous
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={loadingWorkItems || workItemPage >= workItemTotalPages}
                    onClick={() => setWorkItemPage((page) => Math.min(workItemTotalPages, page + 1))}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className={activeProjectSection === 'work' && workItemsView === 'detail' ? '' : 'hidden'}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Layers3 className="h-5 w-5" />
                    Work Item Detail
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">Conclusion, deliverables, details, and item flow.</p>
                </div>
                <Button type="button" variant="outline" onClick={openWorkItemsList}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Work Items
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
                  {selectedWorkItemForDetail ? (
                    <div className="space-y-4">
                      <div className="rounded-lg border bg-background px-4 py-4">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <Badge variant={WORK_ITEM_STATUS_VARIANT[selectedWorkItemForDetail.status] || 'secondary'}>
                                {selectedWorkItemForDetail.status}
                              </Badge>
                              <Badge variant="outline">{selectedWorkItemForDetail.workType}</Badge>
                              <Badge variant="secondary">{selectedWorkItemForDetail.concurrencyMode || 'SINGLE'}</Badge>
                            </div>
                            <h3 className="whitespace-pre-wrap break-words text-2xl font-semibold leading-8">
                              {selectedWorkItemForDetail.title}
                            </h3>
                            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
                              <span>Goal: {selectedWorkItemGoalTitle}</span>
                              <span>Feature: {selectedWorkItemFeatureTitle}</span>
                              <span>Created {formatProjectDate(selectedWorkItemForDetail.createdAt)}</span>
                              {selectedWorkItemForDetail.updatedAt ? (
                                <span>Updated {formatProjectDate(selectedWorkItemForDetail.updatedAt)}</span>
                              ) : null}
                            </div>
                          </div>
                          <div className="grid w-full shrink-0 grid-cols-3 gap-2 text-center sm:w-auto sm:min-w-[320px]">
                            <div className="rounded-md border bg-muted/10 px-3 py-2">
                              <p className="text-lg font-semibold">{selectedWorkItemOutputFiles.length}</p>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Files</p>
                            </div>
                            <div className="rounded-md border bg-muted/10 px-3 py-2">
                              <p className="text-lg font-semibold">{selectedWorkItemArtifacts.length}</p>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Artifacts</p>
                            </div>
                            <div className="rounded-md border bg-muted/10 px-3 py-2">
                              <p className="text-lg font-semibold">{selectedWorkItemReviews.length}</p>
                              <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Reviews</p>
                            </div>
                          </div>
                        </div>

                        <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(280px,0.78fr)]">
                          <div className="rounded-md border bg-muted/10 px-3 py-3">
                            <div className="mb-2 flex items-center gap-2">
                              <ClipboardCheck className="h-4 w-4 text-primary" />
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                {selectedWorkItemConclusion.label}
                              </p>
                            </div>
                            <ExpandableLineClampText
                              text={selectedWorkItemConclusion.text}
                              className="whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground"
                            />
                          </div>
                          <div className="rounded-md border bg-muted/10 px-3 py-3">
                            <div className="mb-3 flex items-center justify-between gap-3">
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-primary" />
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Deliverables</p>
                              </div>
                              <Badge variant="outline">{selectedWorkItemOutputFiles.length + selectedWorkItemArtifacts.length}</Badge>
                            </div>
                            {selectedWorkItemOutputFiles.length || selectedWorkItemArtifacts.length ? (
                              <div className="space-y-2">
                                {selectedWorkItemOutputFiles.slice(0, 4).map((file) => renderProjectOutputButton(file, 'w-full'))}
                                {selectedWorkItemArtifacts.slice(0, 3).map((artifact: any) => (
                                  <div key={artifact.id} className="rounded-md border bg-background px-3 py-2">
                                    <div className="flex min-w-0 items-start justify-between gap-3">
                                      <div className="min-w-0">
                                        <p className="truncate text-sm font-medium">{artifact.title || artifact.artifactType}</p>
                                        <p className="mt-1 text-xs text-muted-foreground">
                                          {artifact.artifactType}{artifact.createdAt ? ` · ${formatProjectDate(artifact.createdAt)}` : ''}
                                        </p>
                                      </div>
                                      {artifact.url ? (
                                        <a
                                          href={artifact.url}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="shrink-0 rounded-md border px-2 py-1 text-xs font-medium text-primary hover:bg-muted"
                                        >
                                          Open
                                        </a>
                                      ) : null}
                                    </div>
                                  </div>
                                ))}
                                {selectedWorkItemOutputFiles.length + selectedWorkItemArtifacts.length > 7 ? (
                                  <p className="text-xs text-muted-foreground">
                                    +{selectedWorkItemOutputFiles.length + selectedWorkItemArtifacts.length - 7} more deliverables
                                  </p>
                                ) : null}
                              </div>
                            ) : (
                              <div className="rounded-md border border-dashed bg-background px-3 py-4 text-sm text-muted-foreground">
                                No deliverables are linked yet.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-background p-2" role="tablist" aria-label="Work item detail sections">
                        {([
                          { key: 'details', label: 'Details', icon: Info },
                          { key: 'activity', label: 'Flow', icon: History, count: selectedWorkItemHistory.length },
                          {
                            key: 'discussion',
                            label: 'Discussion',
                            icon: MessageSquare,
                            count: selectedWorkItemForDetail._count?.comments || selectedWorkItemForDetail.comments?.length || 0,
                          },
                          {
                            key: 'execution',
                            label: 'Execution',
                            icon: Activity,
                            count: selectedWorkItemAssignments.length + (selectedWorkItemForDetail.runs?.length || 0),
                          },
                        ] as Array<{ key: WorkItemDetailTab; label: string; icon: typeof Info; count?: number }>).map(({ key, label, icon: Icon, count }) => (
                          <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={workItemDetailTab === key}
                            className={`inline-flex h-9 items-center gap-2 rounded-md px-3 text-sm font-medium transition-colors ${
                              workItemDetailTab === key
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            }`}
                            onClick={() => setWorkItemDetailTab(key)}
                          >
                            <Icon className="h-4 w-4" />
                            <span>{label}</span>
                            {count !== undefined ? (
                              <span className={`rounded-full px-1.5 py-0.5 text-[11px] ${workItemDetailTab === key ? 'bg-primary-foreground/20' : 'bg-muted'}`}>
                                {count}
                              </span>
                            ) : null}
                          </button>
                        ))}
                      </div>
                      {workItemDetailTab === 'details' ? (
                        <div className="space-y-4">
                      <div className="rounded-md border bg-background px-3 py-3">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Status</label>
                            <select
                              className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                              value={selectedWorkItemForDetail.status}
                              onChange={(e) => void handleUpdateWorkItemStatus(e.target.value)}
                              disabled={!canManageProject || updatingWorkItemStatus}
                            >
                              {WORK_ITEM_STATUS_OPTIONS.map((status) => (
                                <option key={status} value={status}>
                                  {status.split('_').join(' ')}
                                </option>
                              ))}
                            </select>
                            {!canManageProject ? (
                              <p className="text-xs text-muted-foreground">Only project managers can change status.</p>
                            ) : null}
                          </div>
                          <form onSubmit={handleAssignDetailMember} className="space-y-2">
                            <label className="text-sm font-medium">Assign Member</label>
                            <div className="flex gap-2">
                              <select
                                className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm"
                                value={detailAssigneeUserId}
                                onChange={(e) => setDetailAssigneeUserId(e.target.value)}
                                disabled={!canManageProject || savingDetailAssignment}
                              >
                                <option value="">Select member</option>
                                {activeMembers.map((member) => (
                                  <option key={member.id} value={member.userId}>
                                    {formatMemberName(member)} · {formatRoleLabel(member.role)}
                                  </option>
                                ))}
                              </select>
                              <Button
                                type="submit"
                                size="sm"
                                className="h-10 shrink-0"
                                disabled={!canManageProject || savingDetailAssignment || !detailAssigneeUserId}
                              >
                                {savingDetailAssignment ? 'Assigning...' : 'Assign'}
                              </Button>
                            </div>
                            {activeAgentsForItem(selectedWorkItemForDetail).length ? (
                              <div className="rounded-md bg-yellow-100/10 px-3 py-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Currently working: </span>
                                {activeAgentsForItem(selectedWorkItemForDetail).map(formatAssigneeName).join(', ')}
                              </div>
                            ) : openAssignmentsForItem(selectedWorkItemForDetail).length ? (
                              <div className="rounded-md bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                                <span className="font-medium text-foreground">Assigned: </span>
                                {openAssignmentsForItem(selectedWorkItemForDetail)
                                  .map((assignment: any) => `${formatAssigneeName(assignment)} · ${assignment.status}`)
                                  .join(', ')}
                              </div>
                            ) : null}
                          </form>
                        </div>
                      </div>
                      {selectedWorkItemForDetail.description && (
                        <div className="rounded-md border bg-background px-3 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Description</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                            {selectedWorkItemForDetail.description}
                          </p>
                        </div>
                      )}
                      {selectedWorkItemForDetail.scopeBrief && (
                        <div className="rounded-md border bg-background px-3 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{selectedWorkItemForDetail.scopeBrief}</p>
                        </div>
                      )}
                      {selectedWorkItemForDetail.acceptanceCriteria && (
                        <div className="rounded-md border bg-background px-3 py-3">
                          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Acceptance</p>
                          <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">
                            {selectedWorkItemForDetail.acceptanceCriteria}
                          </p>
                        </div>
                      )}
                      {selectedRelatedWorkItems.length ? (
                        <div className="rounded-md border bg-background px-3 py-3">
                          <div className="mb-3 flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <GitPullRequest className="h-4 w-4 text-muted-foreground" />
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Related Items</p>
                            </div>
                            <Badge variant="outline">{selectedRelatedWorkItems.length}</Badge>
                          </div>
                          <div className="space-y-2">
                            {selectedRelatedWorkItems.map((related: any) => {
                              const relatedId = related.id || related.workItemId;
                              const upstream = selectedAcceptedUpstreamByItemId.get(relatedId) as any;
                              const outputPaths =
                                Array.isArray(upstream?.outputPaths) && upstream.outputPaths.length
                                  ? upstream.outputPaths
                                  : Array.isArray(upstream?.outputProjectFiles) && upstream.outputProjectFiles.length
                                    ? upstream.outputProjectFiles
                                    : Array.isArray(related.outputProjectFiles)
                                      ? related.outputProjectFiles
                                      : [];
                              return (
                                <button
                                  key={relatedId}
                                  type="button"
                                  className="w-full rounded-md border bg-muted/10 px-3 py-3 text-left transition-colors hover:border-primary/50 hover:bg-muted/20"
                                  onClick={() => relatedId && openWorkItemDetail(relatedId)}
                                >
                                  <div className="flex flex-wrap items-start justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="line-clamp-2 text-sm font-medium">{related.title || `Work item ${String(relatedId || '').slice(0, 8)}`}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">id {String(relatedId || '').slice(0, 8)}</p>
                                    </div>
                                    <div className="flex flex-wrap justify-end gap-2">
                                      {related.workType ? <Badge variant="outline">{related.workType}</Badge> : null}
                                      {related.status ? (
                                        <Badge variant={WORK_ITEM_STATUS_VARIANT[related.status] || 'secondary'}>{related.status}</Badge>
                                      ) : null}
                                    </div>
                                  </div>
                                  {related.description || related.scopeBrief ? (
                                    <p className="mt-2 line-clamp-3 text-sm leading-6 text-muted-foreground">
                                      {related.description || related.scopeBrief}
                                    </p>
                                  ) : null}
                                  {outputPaths.length ? (
                                    <div className="mt-2 flex flex-wrap gap-2">
                                      {outputPaths.slice(0, 4).map((path: string) => (
                                        <Badge key={path} variant="secondary" className="max-w-full truncate">
                                          {path}
                                        </Badge>
                                      ))}
                                      {outputPaths.length > 4 ? <Badge variant="outline">+{outputPaths.length - 4}</Badge> : null}
                                    </div>
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      ) : null}
                      {selectedResourceRequest && (
                        <form onSubmit={handleCompleteResourceWorkItem} className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <KeyRound className="h-4 w-4 text-primary" />
                                <p className="font-medium">Project Global Resource</p>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Saving this item creates `PROJECT_GLOBAL_{selectedResourceRequest.key.replace(/[^a-zA-Z0-9]+/g, '_').replace(/^_+|_+$/g, '').toUpperCase()}` for current and future agent runtimes.
                              </p>
                            </div>
                            <Badge variant={selectedResourceRequest.isSecret ? 'warning' : 'secondary'}>
                              {selectedResourceRequest.isSecret ? 'Secret' : 'Plain value'}
                            </Badge>
                          </div>
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</p>
                                <p className="mt-1 break-all text-sm text-muted-foreground">{selectedResourceRequest.key}</p>
                              </div>
                              <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</p>
                                <p className="mt-1 text-sm text-muted-foreground">{selectedResourceRequest.label}</p>
                              </div>
                            </div>
                            {selectedResourceRequest.description ? (
                              <p className="text-sm leading-6 text-muted-foreground">{selectedResourceRequest.description}</p>
                            ) : null}
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Value</label>
                              <input
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                type={selectedResourceRequest.isSecret ? 'password' : 'text'}
                                value={
                                  resourceRequestValues[selectedWorkItemForDetail.id] ??
                                  selectedResourceRequest.value ??
                                  ''
                                }
                                onChange={(e) =>
                                  setResourceRequestValues((prev) => ({
                                    ...prev,
                                    [selectedWorkItemForDetail.id]: e.target.value,
                                  }))
                                }
                                placeholder={selectedResourceRequest.isSecret ? 'Stored securely for project runtimes' : 'Resource value'}
                                disabled={!canEditProjectGlobals || ['ACCEPTED', 'DONE', 'COMPLETED'].includes(selectedWorkItemForDetail.status)}
                              />
                            </div>
                            <Button
                              type="submit"
                              className="w-full"
                              disabled={
                                !canEditProjectGlobals ||
                                savingResourceWorkItem ||
                                ['ACCEPTED', 'DONE', 'COMPLETED'].includes(selectedWorkItemForDetail.status)
                              }
                            >
                              {savingResourceWorkItem ? 'Saving...' : 'Save Resource and Finish Item'}
                            </Button>
                          </div>
                        </form>
                      )}
                      {selectedOwnerAction && (
                        <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-3">
                          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <ClipboardCheck className="h-4 w-4 text-primary" />
                                <p className="font-medium">Owner Confirmation</p>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                Complete this manual step or approval so dependent agent work can continue.
                              </p>
                            </div>
                            <Badge variant={selectedOwnerAction.required === false ? 'secondary' : 'warning'}>
                              {selectedOwnerAction.required === false ? 'Optional' : 'Required'}
                            </Badge>
                          </div>
                          <div className="space-y-3">
                            <div className="grid gap-3 sm:grid-cols-2">
                              <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Key</p>
                                <p className="mt-1 break-all text-sm text-muted-foreground">{selectedOwnerAction.key}</p>
                              </div>
                              <div className="rounded-md border bg-background px-3 py-2">
                                <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Label</p>
                                <p className="mt-1 text-sm text-muted-foreground">{selectedOwnerAction.label}</p>
                              </div>
                            </div>
                            {selectedOwnerAction.prompt || selectedOwnerAction.description ? (
                              <p className="text-sm leading-6 text-muted-foreground">
                                {selectedOwnerAction.prompt || selectedOwnerAction.description}
                              </p>
                            ) : null}
                            <div className="flex flex-wrap gap-2">
                              {selectedOwnerAction.choices.length ? (
                                selectedOwnerAction.choices.map((choice) => (
                                  <Button
                                    key={choice.id}
                                    type="button"
                                    variant="outline"
                                    disabled={
                                      isReadOnly ||
                                      savingOwnerActionWorkItemId === selectedWorkItemForDetail.id ||
                                      ['ACCEPTED', 'DONE', 'COMPLETED'].includes(selectedWorkItemForDetail.status)
                                    }
                                    onClick={() =>
                                      handleCompleteOwnerActionWorkItem(selectedWorkItemForDetail, selectedOwnerAction, choice)
                                    }
                                  >
                                    {savingOwnerActionWorkItemId === selectedWorkItemForDetail.id ? 'Saving...' : choice.label}
                                  </Button>
                                ))
                              ) : (
                                <Button
                                  type="button"
                                  disabled={
                                    isReadOnly ||
                                    savingOwnerActionWorkItemId === selectedWorkItemForDetail.id ||
                                    ['ACCEPTED', 'DONE', 'COMPLETED'].includes(selectedWorkItemForDetail.status)
                                  }
                                  onClick={() => handleCompleteOwnerActionWorkItem(selectedWorkItemForDetail, selectedOwnerAction)}
                                >
                                  {savingOwnerActionWorkItemId === selectedWorkItemForDetail.id ? 'Saving...' : 'Confirm Done'}
                                </Button>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      {(selectedWorkItemForDetail.inputPacket || selectedWorkItemForDetail.outputContract) && (
                        <details className="rounded-md border bg-background px-3 py-3">
                          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                            Advanced agent contract
                          </summary>
                          <div className="mt-3 grid gap-3">
                          {selectedWorkItemForDetail.inputPacket && (
                            <div className="rounded-md border bg-muted/10 px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Input Packet</p>
                              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                {JSON.stringify(selectedWorkItemForDetail.inputPacket, null, 2)}
                              </pre>
                            </div>
                          )}
                          {selectedWorkItemForDetail.outputContract && (
                            <div className="rounded-md border bg-muted/10 px-3 py-3">
                              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Output Contract</p>
                              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                {JSON.stringify(selectedWorkItemForDetail.outputContract, null, 2)}
                              </pre>
                            </div>
                          )}
                          </div>
                        </details>
                      )}
                        </div>
                      ) : null}
                      {workItemDetailTab === 'activity' ? (
                        <div className="space-y-4">
                      <div className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Assignment History</p>
                          <Badge variant="outline">{selectedWorkItemAssignments.length}</Badge>
                        </div>
                        {selectedWorkItemAssignments.length ? (
                          <div className="space-y-2">
                            {selectedWorkItemAssignments.map((assignment: any) => (
                              <div key={assignment.id} className="rounded-md border bg-background px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <p className="truncate text-sm font-medium">{formatAssigneeName(assignment)}</p>
                                    <p className="mt-1 text-xs text-muted-foreground">{assignment.role}</p>
                                  </div>
                                  <Badge
                                    variant={
                                      assignment.status === 'ACTIVE'
                                        ? 'warning'
                                        : assignment.status === 'COMPLETED'
                                          ? 'success'
                                          : assignment.status === 'FAILED'
                                            ? 'destructive'
                                            : 'outline'
                                    }
                                  >
                                    {formatAssignmentStatusLabel(assignment.status)}
                                  </Badge>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  Assigned by {formatAssignedByName(assignment)}
                                  {assignment.createdAt ? ` - ${formatProjectDate(assignment.createdAt)}` : ''}
                                  {assignment.finishedAt ? ` - Finished ${formatProjectDate(assignment.finishedAt)}` : ''}
                                </p>
                                {assignment.targetRuntimeId ? (
                                  <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
                                    runtime: {assignment.targetRuntimeId}
                                  </p>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : formatWorkItemOwnerName(selectedWorkItemForDetail) ? (
                          <div className="rounded-md border bg-background px-3 py-2">
                            <div className="flex items-center justify-between gap-2">
                              <p className="truncate text-sm font-medium">{formatWorkItemOwnerName(selectedWorkItemForDetail)}</p>
                              <Badge variant="outline">Owner</Badge>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">No assignment has been created for this item yet.</p>
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                            No member has been assigned yet.
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <ClipboardCheck className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium">Review Results</p>
                          </div>
                          <Badge variant="outline">{selectedWorkItemReviews.length}</Badge>
                        </div>
                        {selectedWorkItemReviews.length ? (
                          <div className="space-y-2">
                            {selectedWorkItemReviews.map((review: any) => {
                              const artifactTitle =
                                review.artifact?.title ||
                                artifacts.find((artifact) => artifact.id === review.artifactId)?.title ||
                                artifacts.find((artifact) => artifact.id === review.artifactId)?.artifactType ||
                                '';
                              return (
                                <div key={review.id} className="rounded-md border bg-background px-3 py-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="min-w-0">
                                      <p className="truncate text-sm font-medium">{formatReviewActor(review)}</p>
                                      <p className="mt-1 text-xs text-muted-foreground">{review.reviewerType}</p>
                                    </div>
                                    <Badge
                                      variant={
                                        review.status === 'APPROVED'
                                          ? 'success'
                                          : review.status === 'CHANGES_REQUESTED'
                                            ? 'warning'
                                            : review.status === 'REJECTED'
                                              ? 'destructive'
                                              : 'secondary'
                                      }
                                    >
                                      {review.status}
                                    </Badge>
                                  </div>
                                  {review.reviewNote ? (
                                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{review.reviewNote}</p>
                                  ) : (
                                    <p className="mt-2 text-sm text-muted-foreground">No written review note.</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                                    <span>{formatProjectDate(review.createdAt)}</span>
                                    {artifactTitle ? <span>Artifact: {artifactTitle}</span> : null}
                                    {review.assignmentId ? <span>Assignment {String(review.assignmentId).slice(0, 8)}</span> : null}
                                  </div>
                                  {review.checklistResult ? (
                                    <details className="mt-3 rounded-md border bg-muted/10 px-3 py-2">
                                      <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                                        Checklist Result
                                      </summary>
                                      <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap text-xs leading-5 text-muted-foreground">
                                        {JSON.stringify(review.checklistResult, null, 2)}
                                      </pre>
                                    </details>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                            No review result has been submitted for this item yet.
                          </div>
                        )}
                        {!isReadOnly && (
                          <details className="rounded-md border bg-background px-3 py-3">
                            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Submit review result
                            </summary>
                            <form onSubmit={handleCreateSelectedWorkItemReview} className="mt-3 space-y-3">
                              <div className="grid gap-3 sm:grid-cols-2">
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-muted-foreground">Reviewer</label>
                                  <select
                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                    value={selectedWorkItemReviewDraft.reviewerType}
                                    onChange={(e) =>
                                      setSelectedWorkItemReviewDraft((prev) => ({ ...prev, reviewerType: e.target.value }))
                                    }
                                  >
                                    {REVIEWER_TYPE_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="space-y-1">
                                  <label className="text-xs font-medium text-muted-foreground">Result</label>
                                  <select
                                    className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                                    value={selectedWorkItemReviewDraft.status}
                                    onChange={(e) =>
                                      setSelectedWorkItemReviewDraft((prev) => ({ ...prev, status: e.target.value }))
                                    }
                                  >
                                    {REVIEW_STATUS_OPTIONS.map((option) => (
                                      <option key={option} value={option}>
                                        {option}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              </div>
                              <textarea
                                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={selectedWorkItemReviewDraft.reviewNote}
                                onChange={(e) =>
                                  setSelectedWorkItemReviewDraft((prev) => ({ ...prev, reviewNote: e.target.value }))
                                }
                                placeholder="Inspection result, opinion, required changes, or approval notes"
                              />
                              <Button type="submit" variant="secondary" disabled={savingReview}>
                                {savingReview ? 'Saving...' : 'Submit Review'}
                              </Button>
                            </form>
                          </details>
                        )}
                      </div>
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium">Project Files Written</p>
                          </div>
                          <Badge variant="outline">{selectedWorkItemFileEvents.length}</Badge>
                        </div>
                        {loadingSelectedWorkItemEvents ? (
                          <p className="text-sm text-muted-foreground">Loading file events...</p>
                        ) : selectedWorkItemFileEvents.length ? (
                          <div className="space-y-2">
                            {selectedWorkItemFileEvents.map((event) => {
                              const canPreviewEventFile =
                                canAccessProjectFiles &&
                                event.file &&
                                event.file.type !== 'folder' &&
                                event.type !== 'PROJECT_FILE_DELETED';
                              const content = (
                                <>
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <p className="min-w-0 truncate font-mono text-xs font-medium">{event.path}</p>
                                    <span className="shrink-0 text-xs text-muted-foreground">{formatProjectDate(event.createdAt)}</span>
                                  </div>
                                  <p className="mt-2 text-xs text-muted-foreground">
                                    {event.actor} - {event.title}
                                    {event.seq ? ` #${event.seq}` : ''}
                                  </p>
                                </>
                              );
                              return canPreviewEventFile ? (
                                <button
                                  key={event.id}
                                  type="button"
                                  className="w-full rounded-md border bg-background px-3 py-3 text-left transition-colors hover:bg-muted/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                  aria-label={`Open preview for ${event.path}`}
                                  onClick={() => {
                                    if (event.file) void handleOpenWorkItemProjectFilePreview(event.file);
                                  }}
                                >
                                  {content}
                                </button>
                              ) : (
                                <div key={event.id} className="rounded-md border bg-background px-3 py-3">
                                  {content}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                            No project file writes are linked to this item yet.
                          </div>
                        )}
                      </div>
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <History className="h-4 w-4 text-primary" />
                            <p className="text-sm font-medium">Change History</p>
                          </div>
                          <Badge variant="outline">{selectedWorkItemHistory.length}</Badge>
                        </div>
                        {loadingSelectedWorkItemEvents ? (
                          <p className="text-sm text-muted-foreground">Loading item history...</p>
                        ) : selectedWorkItemHistory.length ? (
                          <div className="space-y-2">
                            {selectedWorkItemHistory.map((entry: any) => (
                              <div key={entry.id} className="rounded-md border bg-background px-3 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex min-w-0 items-center gap-2">
                                    <Badge variant={entry.type === 'MEMORY' ? 'secondary' : 'outline'}>
                                      {entry.seq ? `#${entry.seq}` : humanizeEventType(entry.type)}
                                    </Badge>
                                    <p className="min-w-0 truncate text-sm font-medium">{entry.title}</p>
                                  </div>
                                  <span className="shrink-0 text-xs text-muted-foreground">{formatProjectDate(entry.createdAt)}</span>
                                </div>
                                <p className="mt-2 text-xs text-muted-foreground">
                                  {entry.actor ? `${entry.actor} · ` : ''}
                                  {entry.summary}
                                </p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                            No durable item history was recorded for this item yet.
                          </div>
                        )}
                      </div>
                        </div>
                      ) : null}
                      {workItemDetailTab === 'discussion' ? (
                      <div className="space-y-3 border-t pt-4">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-sm font-medium">Comments</p>
                          <Badge variant="outline">
                            {selectedWorkItemForDetail._count?.comments || selectedWorkItemForDetail.comments?.length || 0}
                          </Badge>
                        </div>
                        <div className="space-y-2">
                          {selectedWorkItemForDetail.comments?.length ? (
                            selectedWorkItemForDetail.comments.map((comment: any) => (
                              <div key={comment.id} className="rounded-md border bg-background px-3 py-3">
                                <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                                  <span className="truncate">{comment.user?.displayName || comment.user?.email || 'Project member'}</span>
                                  <span>{formatProjectDate(comment.createdAt)}</span>
                                </div>
                                <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{comment.content}</p>
                                {comment.attachments?.length ? (
                                  <div className="mt-3 space-y-2">
                                    {comment.attachments.map((attachment: ProjectWorkItemCommentAttachment, index: number) => (
                                      <div key={`${attachment.path || attachment.name}-${index}`} className="flex items-center justify-between gap-2 rounded-md border bg-muted/10 px-2 py-1 text-xs">
                                        {attachment.downloadUrl || attachment.url ? (
                                          <a
                                            href={attachment.downloadUrl || attachment.url}
                                            target="_blank"
                                            rel="noreferrer"
                                            className="min-w-0 truncate text-primary hover:underline"
                                          >
                                            {attachment.name || attachment.path || attachment.key || 'Attachment'}
                                          </a>
                                        ) : (
                                          <span className="min-w-0 truncate">{attachment.name || attachment.path || attachment.key || 'Attachment'}</span>
                                        )}
                                        <span className="shrink-0 text-muted-foreground">{formatBytes(attachment.size)}</span>
                                      </div>
                                    ))}
                                  </div>
                                ) : null}
                              </div>
                            ))
                          ) : (
                            <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                              No comments yet.
                            </div>
                          )}
                        </div>
                        {!isReadOnly && (
                          <form onSubmit={handleCreateWorkItemComment} className="space-y-3">
                            <div className="relative">
                              {renderProjectFileMentionMenu('workItemComment')}
                              <textarea
                                className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                                value={workItemComment}
                                onFocus={() => updateProjectFileMentionState('workItemComment', workItemComment)}
                                onBlur={() => closeProjectFileMentionMenu('workItemComment')}
                                onChange={(e) => handleWorkItemCommentChange(e.target.value)}
                                onKeyDown={(e) => {
                                  handleProjectFileMentionKeyDown('workItemComment', e);
                                }}
                                placeholder="Add a comment for this item"
                              />
                            </div>
                            {workItemCommentAttachments.length ? (
                              <div className="space-y-2">
                                {workItemCommentAttachments.map((attachment) => (
                                  <div key={attachment.key || attachment.path || attachment.name} className="flex items-center justify-between gap-2 rounded-md border bg-background px-2 py-1 text-xs">
                                    <span className="min-w-0 truncate">{attachment.name || attachment.path || attachment.key}</span>
                                    <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                                      <span>{formatBytes(attachment.size)}</span>
                                      <button
                                        type="button"
                                        className="text-muted-foreground hover:text-foreground"
                                        onClick={() => removeWorkItemCommentAttachment(attachment.key || attachment.path)}
                                        title="Remove attachment"
                                      >
                                        <X className="h-3 w-3" />
                                      </button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : null}
                            <div className="flex flex-wrap items-center gap-2">
                              <label
                                className={`inline-flex h-9 cursor-pointer items-center rounded-md border border-input px-3 text-sm font-medium hover:bg-accent ${
                                  uploadingWorkItemCommentAttachment ? 'pointer-events-none opacity-50' : ''
                                }`}
                              >
                                <Paperclip className="mr-2 h-4 w-4" />
                                {uploadingWorkItemCommentAttachment ? 'Uploading...' : 'Attach'}
                                <input
                                  type="file"
                                  multiple
                                  className="hidden"
                                  disabled={uploadingWorkItemCommentAttachment}
                                  onChange={(e) => {
                                    void handleUploadWorkItemCommentAttachments(e.target.files);
                                    e.currentTarget.value = '';
                                  }}
                                />
                              </label>
                              <Button
                                type="submit"
                                size="sm"
                                disabled={savingWorkItemComment || uploadingWorkItemCommentAttachment || (!workItemComment.trim() && !workItemCommentAttachments.length)}
                              >
                                <MessageSquare className="mr-2 h-4 w-4" />
                                {savingWorkItemComment ? 'Posting...' : 'Comment'}
                              </Button>
                            </div>
                          </form>
                        )}
                      </div>
                      ) : null}
                      {workItemDetailTab === 'execution' ? (
                        <div className="rounded-md border bg-background px-4 py-4">
                          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                            <div className="space-y-1">
                              <div className="flex items-center gap-2">
                                <Activity className="h-4 w-4 text-primary" />
                                <p className="font-medium">Execution Tools</p>
                              </div>
                              <p className="text-sm text-muted-foreground">
                                {selectedWorkItemAssignments.length} assignments · {selectedWorkItemForDetail.runs?.length || 0} runs
                              </p>
                            </div>
                            <Button
                              type="button"
                              variant="secondary"
                              className="shrink-0"
                              onClick={() => {
                                setSelectedWorkItemId(selectedWorkItemForDetail.id);
                                document.getElementById('work-item-execution-panel')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                              }}
                            >
                              Open Assignment Panel
                            </Button>
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Select a work item to inspect details.</p>
                  )}
            </CardContent>
          </Card>

          <Card className={activeProjectSection === 'work' && workItemsView === 'new' ? '' : 'hidden'}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="space-y-1">
                  <CardTitle className="flex items-center gap-2 text-xl">
                    <Plus className="h-5 w-5" />
                    New Work Item
                  </CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Create a scoped item, usually linked directly to a goal, then dispatch it to a project agent.
                  </p>
                </div>
                <Button type="button" variant="outline" onClick={openWorkItemsList}>
                  <ArrowLeft className="mr-2 h-4 w-4" />
                  Work Items
                </Button>
              </div>
            </CardHeader>
            <form onSubmit={handleCreateWorkItem}>
              <CardContent className="space-y-4">
                {error && (
                  <div className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
                    {error}
                  </div>
                )}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={workItemForm.title}
                    onChange={(e) => setWorkItemForm((prev) => ({ ...prev, title: e.target.value }))}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Work Type</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={workItemForm.workType}
                    onChange={(e) => setWorkItemForm((prev) => ({ ...prev, workType: e.target.value }))}
                  >
                    {WORK_ITEM_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Concurrency Mode</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={workItemForm.concurrencyMode}
                    onChange={(e) => setWorkItemForm((prev) => ({ ...prev, concurrencyMode: e.target.value }))}
                  >
                    {CONCURRENCY_MODE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Goal</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={workItemForm.goalId}
                      onChange={(e) => setWorkItemForm((prev) => ({ ...prev, goalId: e.target.value }))}
                    >
                      <option value="">No linked goal</option>
                      {(project.goals || []).map((goal: any) => (
                        <option key={goal.id} value={goal.id}>
                          {goal.title}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Feature Group</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={workItemForm.featureId}
                      onChange={(e) => {
                        const featureId = e.target.value;
                        const feature = featureById.get(featureId);
                        setWorkItemForm((prev) => ({
                          ...prev,
                          featureId,
                          goalId: feature?.goalId || prev.goalId,
                        }));
                      }}
                    >
                      <option value="">No feature group</option>
                      {(project.features || []).map((feature: any) => (
                        <option key={feature.id} value={feature.id}>
                          {feature.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Description</label>
                  <div className="relative">
                    {renderProjectFileMentionMenu('description')}
                    <textarea
                      className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={workItemForm.description}
                      onFocus={() => updateProjectFileMentionState('description', workItemForm.description)}
                      onBlur={() => closeProjectFileMentionMenu('description')}
                      onChange={(e) => handleWorkItemFormTextChange('description', e.target.value)}
                      onKeyDown={(e) => {
                        handleProjectFileMentionKeyDown('description', e);
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Scope Brief</label>
                  <div className="relative">
                    {renderProjectFileMentionMenu('scopeBrief')}
                    <textarea
                      className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={workItemForm.scopeBrief}
                      onFocus={() => updateProjectFileMentionState('scopeBrief', workItemForm.scopeBrief)}
                      onBlur={() => closeProjectFileMentionMenu('scopeBrief')}
                      onChange={(e) => handleWorkItemFormTextChange('scopeBrief', e.target.value)}
                      onKeyDown={(e) => {
                        handleProjectFileMentionKeyDown('scopeBrief', e);
                      }}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Acceptance Criteria</label>
                  <div className="relative">
                    {renderProjectFileMentionMenu('acceptanceCriteria')}
                    <textarea
                      className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={workItemForm.acceptanceCriteria}
                      onFocus={() => updateProjectFileMentionState('acceptanceCriteria', workItemForm.acceptanceCriteria)}
                      onBlur={() => closeProjectFileMentionMenu('acceptanceCriteria')}
                      onChange={(e) => handleWorkItemFormTextChange('acceptanceCriteria', e.target.value)}
                      onKeyDown={(e) => {
                        handleProjectFileMentionKeyDown('acceptanceCriteria', e);
                      }}
                    />
                  </div>
                </div>
                {linkedWorkItemProjectFiles.length ? (
                  <div className="flex flex-wrap gap-2">
                    {linkedWorkItemProjectFiles.map((path) => (
                      <Badge key={path} variant="secondary" className="gap-1">
                        <Paperclip className="h-3 w-3" />
                        {path}
                      </Badge>
                    ))}
                  </div>
                ) : null}
                <div className="space-y-2">
                  <label className="text-sm font-medium">Output Contract</label>
                  <div className="relative">
                    {renderProjectFileMentionMenu('outputContract')}
                    <textarea
                      className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={workItemForm.outputContract}
                      onFocus={() => updateProjectFileMentionState('outputContract', workItemForm.outputContract)}
                      onBlur={() => closeProjectFileMentionMenu('outputContract')}
                      onChange={(e) => handleWorkItemFormTextChange('outputContract', e.target.value)}
                      onKeyDown={(e) => {
                        handleProjectFileMentionKeyDown('outputContract', e);
                      }}
                      placeholder="Expected handoff, PR link, tests, or review evidence"
                    />
                  </div>
                </div>
                <Button type="submit" className="w-full" disabled={savingWorkItem}>
                  {savingWorkItem ? 'Creating...' : 'Add Work Item'}
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card className={activeProjectSection === 'knowledge' ? '' : 'hidden'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-5 w-5" />
                Add Memory
              </CardTitle>
            </CardHeader>
            <form onSubmit={handleCreateMemory}>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium">Memory Type</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={memoryForm.memoryType}
                    onChange={(e) => setMemoryForm((prev) => ({ ...prev, memoryType: e.target.value }))}
                  >
                    {MEMORY_TYPE_OPTIONS.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={memoryForm.title}
                    onChange={(e) => setMemoryForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Content</label>
                  <textarea
                    className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={memoryForm.content}
                    onChange={(e) => setMemoryForm((prev) => ({ ...prev, content: e.target.value }))}
                    required
                  />
                </div>
                <Button type="submit" className="w-full" disabled={savingMemory}>
                  {savingMemory ? 'Saving...' : 'Save Memory'}
                </Button>
              </CardContent>
            </form>
          </Card>

          <Card id="work-item-execution-panel" className={activeProjectSection === 'work' && workItemsView === 'detail' && workItemDetailTab === 'execution' ? '' : 'hidden'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Layers3 className="h-5 w-5" />
                Execution Panel
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium">Focused Work Item</label>
                <select
                  className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  value={selectedWorkItemId}
                  onChange={(e) => setSelectedWorkItemId(e.target.value)}
                >
                  <option value="">Select a work item</option>
                  {selectedWorkItemDetail && !workItems.some((item) => item.id === selectedWorkItemDetail.id) ? (
                    <option value={selectedWorkItemDetail.id}>{selectedWorkItemDetail.title}</option>
                  ) : null}
                  {workItems.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.title}
                    </option>
                  ))}
                </select>
              </div>

              {loadingSelectedWorkItem ? (
                <p className="text-sm text-muted-foreground">Loading work item execution detail...</p>
              ) : selectedWorkItemDetail ? (
                <div className="space-y-6">
                  <div className="rounded-lg border bg-muted/10 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="font-medium">{selectedWorkItemDetail.title}</p>
                        <p className="text-sm text-muted-foreground">
                          {selectedWorkItemDetail.workType} · {selectedWorkItemDetail.concurrencyMode || 'SINGLE'}
                        </p>
                      </div>
                      <Badge variant={WORK_ITEM_STATUS_VARIANT[selectedWorkItemDetail.status] || 'secondary'}>
                        {selectedWorkItemDetail.status}
                      </Badge>
                    </div>
                    {selectedWorkItemDetail.description && (
                      <p className="mt-3 text-sm leading-6 text-muted-foreground">
                        {selectedWorkItemDetail.description}
                      </p>
                    )}
                    {(selectedWorkItemDetail.scopeBrief || selectedWorkItemDetail.acceptanceCriteria) && (
                      <div className="mt-4 grid gap-3 md:grid-cols-2">
                        {selectedWorkItemDetail.scopeBrief && (
                          <div className="rounded-md border bg-background px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Scope</p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {selectedWorkItemDetail.scopeBrief}
                            </p>
                          </div>
                        )}
                        {selectedWorkItemDetail.acceptanceCriteria && (
                          <div className="rounded-md border bg-background px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                              Acceptance
                            </p>
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              {selectedWorkItemDetail.acceptanceCriteria}
                            </p>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <form onSubmit={handleCreateAssignment} className="space-y-4 border-b pb-6">
                    <div className="space-y-1">
                      <h3 className="font-medium">Assign Member</h3>
                      <p className="text-sm text-muted-foreground">
                        Assign this item to a member already attached to the current project.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Assignee</label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={assignmentForm.assigneeUserId}
                          onChange={(e) => {
                            const member = activeMembers.find((item) => item.userId === e.target.value);
                            setAssignmentForm((prev) => ({
                              ...prev,
                              assigneeUserId: e.target.value,
                              role: member?.role || prev.role,
                            }));
                          }}
                          required
                        >
                          <option value="">Select a project member</option>
                          {activeMembers.map((member) => (
                            <option key={member.id} value={member.userId}>
                              {formatMemberName(member) + ' · ' + member.role}
                            </option>
                          ))}
                        </select>
                        {!activeMembers.length && (
                          <p className="text-xs text-muted-foreground">
                            Add a member in Project Members before dispatching work.
                          </p>
                        )}
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Assignment Role</label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={assignmentForm.role}
                          onChange={(e) => setAssignmentForm((prev) => ({ ...prev, role: e.target.value }))}
                        >
                          <option value="WORKER_AGENT">Worker Agent</option>
                          <option value="REVIEW_AGENT">Review Agent</option>
                          <option value="SECURITY_AUDITOR">Security Auditor</option>
                          <option value="LEAD_AGENT">Lead Agent</option>
                          <option value="HUMAN_REVIEWER">Human Reviewer</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Objective</label>
                      <textarea
                        className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={assignmentForm.objective}
                        onChange={(e) => setAssignmentForm((prev) => ({ ...prev, objective: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Task Packet Notes</label>
                      <textarea
                        className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={assignmentForm.packetNotes}
                        onChange={(e) => setAssignmentForm((prev) => ({ ...prev, packetNotes: e.target.value }))}
                        placeholder="Extra constraints, tool hints, or re-entry instructions for the assignee"
                      />
                    </div>
                    {selectedTaskPacketPreview && (
                      <div className="rounded-lg border bg-muted/10 p-4">
                        <div className="mb-3 flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Inbox className="h-4 w-4 text-primary" />
                            <h4 className="font-medium">L3 Packet Preview</h4>
                          </div>
                          <Badge variant="outline">{selectedTaskPacketPreview.state}</Badge>
                        </div>
                        <div className="grid gap-3 text-sm md:grid-cols-2">
                          <div className="rounded-md border bg-background px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Objective</p>
                            <p className="mt-2 text-muted-foreground">{selectedTaskPacketPreview.objective}</p>
                          </div>
                          <div className="rounded-md border bg-background px-3 py-3">
                            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Memory refs</p>
                            <p className="mt-2 text-muted-foreground">
                              {selectedTaskPacketPreview.memoryRefs.length
                                ? selectedTaskPacketPreview.memoryRefs.map((memory) => memory.type).join(', ')
                                : 'None'}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}
                    <Button type="submit" variant="secondary" className="w-full" disabled={savingAssignment}>
                      {savingAssignment ? 'Assigning...' : 'Create Assignment'}
                    </Button>
                  </form>

                  <form onSubmit={handleCreateRun} className="space-y-4 border-b pb-6">
                    <div className="space-y-1">
                      <h3 className="font-medium">Create Run</h3>
                      <p className="text-sm text-muted-foreground">
                        Capture a concrete execution run with instructions and an optional assignment link.
                      </p>
                    </div>
                    <div className="grid gap-4 md:grid-cols-2">
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Run Type</label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={runForm.runType}
                          onChange={(e) => setRunForm((prev) => ({ ...prev, runType: e.target.value }))}
                        >
                          <option value="EXECUTION">Execution</option>
                          <option value="PLANNING">Planning</option>
                          <option value="REVIEW">Review</option>
                          <option value="VERIFICATION">Verification</option>
                        </select>
                      </div>
                      <div className="space-y-2">
                        <label className="text-sm font-medium">Assignment</label>
                        <select
                          className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                          value={runForm.assignmentId}
                          onChange={(e) => setRunForm((prev) => ({ ...prev, assignmentId: e.target.value }))}
                        >
                          <option value="">No linked assignment</option>
                          {(selectedWorkItemDetail.assignments || []).map((assignment: any) => (
                            <option key={assignment.id} value={assignment.id}>
                              {(assignment.assigneeUser?.displayName || assignment.assigneeUser?.email || 'Assignee') + ' · ' + assignment.role}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Instruction</label>
                      <textarea
                        className="min-h-[100px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={runForm.instruction}
                        onChange={(e) => setRunForm((prev) => ({ ...prev, instruction: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Result Summary</label>
                      <textarea
                        className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={runForm.resultSummary}
                        onChange={(e) => setRunForm((prev) => ({ ...prev, resultSummary: e.target.value }))}
                      />
                    </div>
                    <Button type="submit" variant="secondary" className="w-full" disabled={savingRun}>
                      {savingRun ? 'Creating...' : 'Create Run'}
                    </Button>
                  </form>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium">Assignments</h3>
                      <p className="text-sm text-muted-foreground">Current staffing for the selected work item.</p>
                    </div>
                    {(selectedWorkItemDetail.assignments || []).length ? (
                      (selectedWorkItemDetail.assignments || []).map((assignment: any) => (
                        <div key={assignment.id} className="rounded-lg border px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">
                                {assignment.assigneeUser?.displayName || assignment.assigneeUser?.email}
                              </p>
                              <p className="text-sm text-muted-foreground">{assignment.role}</p>
                            </div>
                            <Badge variant="outline">{assignment.status}</Badge>
                          </div>
                          {assignment.objective && (
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{assignment.objective}</p>
                          )}
                          {assignment.contextPacket && (
                            <div className="mt-3 rounded-md border bg-muted/10 px-3 py-3 text-sm">
                              <div className="mb-2 flex items-center gap-2">
                                <Inbox className="h-4 w-4 text-primary" />
                                <p className="font-medium">Task packet attached</p>
                              </div>
                              <p className="text-muted-foreground">
                                {assignment.contextPacket.objective ||
                                  assignment.contextPacket.notes ||
                                  'Scoped execution context is available for this assignee.'}
                              </p>
                            </div>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={updatingAssignmentId === assignment.id || assignment.status === 'ACTIVE'}
                              onClick={() => handleUpdateAssignmentStatus(assignment.id, 'ACTIVE')}
                            >
                              {updatingAssignmentId === assignment.id ? 'Updating...' : 'Start'}
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              disabled={updatingAssignmentId === assignment.id || assignment.status === 'PAUSED'}
                              onClick={() => handleUpdateAssignmentStatus(assignment.id, 'PAUSED')}
                            >
                              Pause
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              disabled={updatingAssignmentId === assignment.id || assignment.status === 'COMPLETED'}
                              onClick={() => handleUpdateAssignmentStatus(assignment.id, 'COMPLETED')}
                            >
                              Complete
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="destructive"
                              disabled={updatingAssignmentId === assignment.id || assignment.status === 'FAILED'}
                              onClick={() => handleUpdateAssignmentStatus(assignment.id, 'FAILED')}
                            >
                              Fail
                            </Button>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No assignments yet.</p>
                    )}
                  </div>

                  <div className="space-y-4">
                    <div>
                      <h3 className="font-medium">Runs</h3>
                      <p className="text-sm text-muted-foreground">Execution history for the selected work item.</p>
                    </div>
                    {(selectedWorkItemDetail.runs || []).length ? (
                      (selectedWorkItemDetail.runs || []).map((run: any) => (
                        <button
                          key={run.id}
                          type="button"
                          className={`w-full rounded-lg border px-4 py-3 text-left transition-colors ${
                            selectedRunId === run.id ? 'border-primary/50 ring-1 ring-primary/30' : ''
                          }`}
                          onClick={() => setSelectedRunId(run.id)}
                        >
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{run.runType}</p>
                              <p className="text-sm text-muted-foreground">
                                {new Date(run.createdAt).toLocaleString()}
                              </p>
                            </div>
                            <Badge variant="outline">{run.status}</Badge>
                          </div>
                          {run.instruction && (
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">{run.instruction}</p>
                          )}
                          {run.resultSummary && (
                            <p className="mt-2 text-sm leading-6 text-muted-foreground">
                              Result: {run.resultSummary}
                            </p>
                          )}
                        </button>
                      ))
                    ) : (
                      <p className="text-sm text-muted-foreground">No runs yet.</p>
                    )}
                  </div>

                  <div className="space-y-4 border-t pt-6">
                    <div>
                      <h3 className="font-medium">Run Console</h3>
                      <p className="text-sm text-muted-foreground">Track the selected run, update status, and write log entries.</p>
                    </div>
                    {loadingSelectedRun ? (
                      <p className="text-sm text-muted-foreground">Loading run detail...</p>
                    ) : selectedRunDetail ? (
                      <div className="space-y-6">
                        <div className="rounded-lg border bg-muted/10 p-4">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <p className="font-medium">{selectedRunDetail.runType}</p>
                              <p className="text-sm text-muted-foreground">
                                {selectedRunDetail.assignment?.assigneeUser?.displayName ||
                                  selectedRunDetail.assignment?.assigneeUser?.email ||
                                  'Unassigned run'}
                              </p>
                            </div>
                            <Badge variant="outline">{selectedRunDetail.status}</Badge>
                          </div>
                          {selectedRunDetail.instruction && (
                            <p className="mt-3 text-sm leading-6 text-muted-foreground">
                              {selectedRunDetail.instruction}
                            </p>
                          )}
                        </div>

                        <form onSubmit={handleUpdateRun} className="space-y-4 border-b pb-6">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Run Status</label>
                              <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={runUpdateForm.status}
                                onChange={(e) => setRunUpdateForm((prev) => ({ ...prev, status: e.target.value }))}
                              >
                                <option value="QUEUED">Queued</option>
                                <option value="RUNNING">Running</option>
                                <option value="SUCCEEDED">Succeeded</option>
                                <option value="FAILED">Failed</option>
                                <option value="CANCELLED">Cancelled</option>
                              </select>
                            </div>
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Result Summary</label>
                              <input
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={runUpdateForm.resultSummary}
                                onChange={(e) => setRunUpdateForm((prev) => ({ ...prev, resultSummary: e.target.value }))}
                              />
                            </div>
                          </div>
                          <Button type="submit" variant="secondary" className="w-full" disabled={savingRunUpdate}>
                            {savingRunUpdate ? 'Updating...' : 'Update Run'}
                          </Button>
                        </form>

                        <form onSubmit={handleCreateRunLog} className="space-y-4 border-b pb-6">
                          <div className="grid gap-4 md:grid-cols-2">
                            <div className="space-y-2">
                              <label className="text-sm font-medium">Log Level</label>
                              <select
                                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                                value={runLogForm.level}
                                onChange={(e) => setRunLogForm((prev) => ({ ...prev, level: e.target.value }))}
                              >
                                <option value="info">Info</option>
                                <option value="warning">Warning</option>
                                <option value="error">Error</option>
                              </select>
                            </div>
                          </div>
                          <div className="space-y-2">
                            <label className="text-sm font-medium">Log Message</label>
                            <textarea
                              className="min-h-[90px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={runLogForm.message}
                              onChange={(e) => setRunLogForm((prev) => ({ ...prev, message: e.target.value }))}
                              required
                            />
                          </div>
                          <Button type="submit" variant="secondary" className="w-full" disabled={savingRunLog}>
                            {savingRunLog ? 'Writing...' : 'Add Run Log'}
                          </Button>
                        </form>

                        <div className="space-y-3">
                          {(selectedRunDetail.logs || []).length ? (
                            selectedRunDetail.logs?.map((log) => (
                              <div key={log.id} className="rounded-lg border px-4 py-3">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <Badge variant="outline">{log.level}</Badge>
                                  <span className="text-xs text-muted-foreground">
                                    {new Date(log.createdAt).toLocaleString()}
                                  </span>
                                </div>
                                <p className="mt-2 text-sm leading-6 text-muted-foreground">{log.message}</p>
                              </div>
                            ))
                          ) : (
                            <p className="text-sm text-muted-foreground">No run logs yet.</p>
                          )}
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">Select a run to inspect its execution log.</p>
                    )}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Select a work item to manage assignments and runs.</p>
              )}
            </CardContent>
          </Card>

	          <Card className={activeProjectSection === 'delivery' ? '' : 'hidden'}>
	            <CardHeader>
	              <CardTitle className="flex items-center gap-2 text-xl">
	                <FileText className="h-5 w-5" />
	                Delivery Actions
	              </CardTitle>
	            </CardHeader>
	            <CardContent className="space-y-6">
	              {latestDeliveryArtifact ? (
	                <div className="rounded-lg border bg-muted/10 px-4 py-3">
	                  <div className="flex flex-wrap items-start justify-between gap-3">
	                    <div className="min-w-0 space-y-1">
	                      <div className="flex flex-wrap items-center gap-2">
	                        <Badge variant="secondary">Latest Delivery</Badge>
	                        <Badge variant="outline">{latestDeliveryArtifact.artifactType}</Badge>
	                      </div>
	                      <p className="line-clamp-2 font-medium">{latestDeliveryArtifact.title || latestDeliveryArtifact.artifactType}</p>
	                      <p className="text-xs text-muted-foreground">
	                        {latestDeliveryArtifact.createdAt ? formatProjectDate(latestDeliveryArtifact.createdAt) : 'Recent artifact'}
	                      </p>
	                    </div>
	                    <Button type="button" size="sm" variant="secondary" onClick={() => handleReviewArtifactFromHome(latestDeliveryArtifact)}>
	                      <ClipboardCheck className="mr-2 h-4 w-4" />
	                      Review
	                    </Button>
	                  </div>
	                  {latestDeliveryArtifact.content ? (
	                    <div className="mt-3 max-h-56 overflow-auto rounded-md bg-background/80 px-3 py-2 text-muted-foreground">
	                      <MathMarkdown content={latestDeliveryArtifact.content} className="max-w-none text-sm" />
	                    </div>
	                  ) : null}
                  {artifactResources(latestDeliveryArtifact).length ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {artifactResources(latestDeliveryArtifact).slice(0, 3).map((resource) => (
                        <Button
                          key={resource.key || resource.path}
                          type="button"
                          size="sm"
                          variant="outline"
                          className="max-w-full min-w-0 justify-start"
                          onClick={() => handleOpenProjectFileInResources(resource)}
                        >
                          <FileSearch className="mr-2 h-4 w-4 shrink-0" />
                          <span className="truncate">{resource.path}</span>
                        </Button>
                      ))}
                    </div>
                  ) : null}
	                </div>
	              ) : (
	                <div className="rounded-lg border border-dashed px-4 py-5 text-sm text-muted-foreground">
	                  No delivery artifact has been submitted yet.
	                </div>
	              )}

	              <details className="rounded-lg border bg-background">
	                <summary className="cursor-pointer px-4 py-3 text-sm font-medium">
	                  Create or record delivery
	                </summary>
	                <div className="space-y-6 border-t px-4 py-4">
	              <form onSubmit={handleCreateArtifact} className="space-y-4 border-b pb-6">
                <div className="space-y-1">
                  <h3 className="font-medium">Add Artifact</h3>
                  <p className="text-sm text-muted-foreground">
                    Record handoff notes, reports, patch links, or other delivery artifacts.
                  </p>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Artifact Type</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={artifactForm.artifactType}
                      onChange={(e) => setArtifactForm((prev) => ({ ...prev, artifactType: e.target.value }))}
                    >
                      {ARTIFACT_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Work Item</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={artifactForm.workItemId}
                      onChange={(e) => setArtifactForm((prev) => ({ ...prev, workItemId: e.target.value }))}
                    >
                      <option value="">Project-level artifact</option>
                      {workItems.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.title}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Assignment</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={artifactForm.assignmentId}
                      onChange={(e) => setArtifactForm((prev) => ({ ...prev, assignmentId: e.target.value }))}
                    >
                      <option value="">No linked assignment</option>
                      {(selectedWorkItemDetail?.assignments || []).map((assignment: any) => (
                        <option key={assignment.id} value={assignment.id}>
                          {(assignment.assigneeUser?.displayName || assignment.assigneeUser?.email || 'Assignee') +
                            ' · ' +
                            assignment.role}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Run</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={artifactForm.runId}
                      onChange={(e) => setArtifactForm((prev) => ({ ...prev, runId: e.target.value }))}
                    >
                      <option value="">No linked run</option>
                      {(selectedWorkItemDetail?.runs || []).map((run: any) => (
                        <option key={run.id} value={run.id}>
                          {run.runType + ' · ' + run.status}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Title</label>
                  <input
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={artifactForm.title}
                    onChange={(e) => setArtifactForm((prev) => ({ ...prev, title: e.target.value }))}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Content</label>
                  <textarea
                    className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={artifactForm.content}
                    onChange={(e) => setArtifactForm((prev) => ({ ...prev, content: e.target.value }))}
                  />
                </div>
	                <div className="space-y-2">
	                  <label className="text-sm font-medium">URL</label>
	                  <input
	                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
	                    value={artifactForm.url}
	                    onChange={(e) => setArtifactForm((prev) => ({ ...prev, url: e.target.value }))}
	                    placeholder="https://..."
	                  />
	                </div>
	                <div className="space-y-2">
	                  <label className="text-sm font-medium">Attachments</label>
	                  <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border bg-muted/20 px-3 py-4 text-sm text-muted-foreground hover:bg-muted/40">
	                    <Upload className="h-5 w-5" />
	                    <span>Attach delivery files</span>
	                    <input type="file" multiple className="hidden" onChange={handleArtifactAttachmentChange} />
	                  </label>
	                  {artifactAttachments.length ? (
	                    <div className="space-y-2">
	                      {artifactAttachments.map((file, index) => (
	                        <div key={`${file.name}-${index}`} className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-sm">
	                          <div className="flex min-w-0 items-center gap-2">
	                            <Paperclip className="h-4 w-4 shrink-0 text-muted-foreground" />
	                            <span className="truncate">{file.name}</span>
	                            <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(file.size)}</span>
	                          </div>
	                          <button
	                            type="button"
	                            className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
	                            onClick={() => removeArtifactAttachment(index)}
	                            aria-label={`Remove ${file.name}`}
	                          >
	                            <X className="h-4 w-4" />
	                          </button>
	                        </div>
	                      ))}
	                    </div>
	                  ) : null}
	                </div>
	                <Button type="submit" variant="secondary" className="w-full" disabled={savingArtifact}>
	                  {savingArtifact ? 'Saving...' : 'Add Artifact'}
	                </Button>
              </form>

              <form onSubmit={handleCreateReview} className="space-y-4">
                <div className="space-y-1">
                  <h3 className="font-medium">Create Review</h3>
                  <p className="text-sm text-muted-foreground">
                    Lead agent, review agent, or human reviewers can accept or send work back.
                  </p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Work Item</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={reviewForm.workItemId}
                    onChange={(e) => setReviewForm((prev) => ({ ...prev, workItemId: e.target.value }))}
                    required
                  >
                    <option value="">Select a work item</option>
                    {workItems.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.title}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Reviewer Type</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={reviewForm.reviewerType}
                      onChange={(e) => setReviewForm((prev) => ({ ...prev, reviewerType: e.target.value }))}
                    >
                      {REVIEWER_TYPE_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Status</label>
                    <select
                      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                      value={reviewForm.status}
                      onChange={(e) => setReviewForm((prev) => ({ ...prev, status: e.target.value }))}
                    >
                      {REVIEW_STATUS_OPTIONS.map((option) => (
                        <option key={option} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Artifact</label>
                  <select
                    className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                    value={reviewForm.artifactId}
                    onChange={(e) => setReviewForm((prev) => ({ ...prev, artifactId: e.target.value }))}
                  >
                    <option value="">No linked artifact</option>
                    {artifacts.map((artifact) => (
                      <option key={artifact.id} value={artifact.id}>
                        {artifact.title || artifact.artifactType}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Review Note</label>
                  <textarea
                    className="min-h-[110px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={reviewForm.reviewNote}
                    onChange={(e) => setReviewForm((prev) => ({ ...prev, reviewNote: e.target.value }))}
                  />
                </div>
	                <Button type="submit" variant="secondary" className="w-full" disabled={savingReview}>
	                  {savingReview ? 'Saving...' : 'Submit Review'}
	                </Button>
	              </form>
	                </div>
	              </details>
	            </CardContent>
	          </Card>
            </>
          ) : null}
        </div>
      </div>

      <div
        className={
          ['home', 'events', 'work', 'knowledge', 'delivery'].includes(activeProjectSection)
            ? activeProjectSection === 'events'
              ? 'grid gap-8'
              : 'grid gap-8 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]'
            : 'hidden'
        }
      >
        <Card className="hidden">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Layers3 className="h-5 w-5" />
              Work Item Board
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid gap-4 lg:grid-cols-3 xl:grid-cols-4">
              {groupedWorkItems.map((group) => (
                <div key={group.status} className="rounded-xl border bg-muted/10 p-3">
                  <div className="mb-3 flex items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                      {group.status.split('_').join(' ')}
                    </h3>
                    <Badge variant="outline">{group.items.length}</Badge>
                  </div>
                  <div className="space-y-3">
                    {group.items.length === 0 ? (
                      <div className="rounded-md border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
                        Empty
                      </div>
                    ) : (
                      group.items.map((item) => (
                        <button
                          key={item.id}
                          type="button"
                          className={`w-full rounded-lg border bg-background p-3 text-left shadow-sm transition-colors ${
                            selectedWorkItemId === item.id ? 'border-primary/50 ring-1 ring-primary/30' : ''
                          }`}
                          onClick={() => setSelectedWorkItemId(item.id)}
                        >
                          <div className="mb-2 flex items-start justify-between gap-2">
                            <div className="space-y-2">
                              <p className="font-medium leading-5">{item.title}</p>
                              {isAgentGeneratedWorkItem(item) ? (
                                <Badge variant="outline" className="gap-1">
                                  <Bot className="h-3 w-3" />
                                  Agent Generated
                                </Badge>
                              ) : null}
                            </div>
                            <Badge variant={WORK_ITEM_STATUS_VARIANT[item.status] || 'secondary'}>{item.status}</Badge>
                          </div>
                          <div className="space-y-2 text-sm text-muted-foreground">
                            <div className="flex flex-wrap gap-2">
                              <Badge variant="outline">{item.workType}</Badge>
                              <Badge variant="secondary">{item.concurrencyMode || 'SINGLE'}</Badge>
                            </div>
                            {openAssignmentsForItem(item).length ? (
                              <div className="rounded-md border bg-muted/10 px-2 py-2 text-xs">
                                <span className="font-medium text-foreground">Agent: </span>
                                {activeAgentsForItem(item).length
                                  ? `${activeAgentsForItem(item).map(formatAssigneeName).join(', ')} working`
                                  : openAssignmentsForItem(item)
                                      .map((assignment: any) => `${formatAssigneeName(assignment)} · ${assignment.status}`)
                                      .join(', ')}
                              </div>
                            ) : null}
                            {item.goalId && (
                              <p className="text-xs uppercase tracking-wide">
                                Goal: {goalById.get(item.goalId)?.title || 'Linked goal'}
                              </p>
                            )}
                            {item.featureId && (
                              <p className="text-xs uppercase tracking-wide">
                                Feature Group: {featureById.get(item.featureId)?.title || 'Linked feature group'}
                              </p>
                            )}
                            {item.description && <p className="line-clamp-3">{item.description}</p>}
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <span>Priority {item.priority}</span>
                              <span>
                                {item._count?.assignments || 0} assigned · {item._count?.artifacts || 0} artifacts
                              </span>
                            </div>
                          </div>
                        </button>
                      ))
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <div className="space-y-8">
          <Card className="hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Inbox className="h-5 w-5" />
                Agent Todo List
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {agentTodoLists.length ? (
                agentTodoLists.map(({ member, assignments }) => {
                  const runtime = runtimeByMemberId.get(member.id);
                  return (
                    <div key={member.id} className="rounded-lg border px-4 py-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-medium">{formatMemberName(member)}</p>
                          <p className="text-xs text-muted-foreground">
                            member {member.id.slice(0, 8)} · user {member.userId.slice(0, 8)}
                          </p>
                        </div>
                        <Badge variant={runtime ? AGENT_RUNTIME_STATUS_VARIANT[runtime.session.status] || 'secondary' : 'outline'}>
                          {runtime ? formatRuntimeStatusLabel(runtime.session.status) : member.role}
                        </Badge>
                      </div>
                      <div className="mt-3 space-y-2">
                        {assignments.length ? (
                          assignments.map(({ assignment, workItem }) => (
                            <button
                              key={assignment.id}
                              type="button"
                              className={`w-full rounded-md border bg-muted/10 px-3 py-2 text-left transition-colors hover:border-primary/50 ${
                                selectedWorkItemId === workItem.id ? 'border-primary/50 ring-1 ring-primary/30' : ''
                              }`}
                              onClick={() => setSelectedWorkItemId(workItem.id)}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <p className="line-clamp-2 text-sm font-medium">{workItem.title}</p>
                                <Badge variant={assignment.status === 'ACTIVE' ? 'warning' : 'outline'}>
                                  {assignment.status === 'ACTIVE' ? 'Working' : assignment.status}
                                </Badge>
                              </div>
                              <p className="mt-1 text-xs text-muted-foreground">
                                {workItem.status} · {workItem.workType}
                              </p>
                            </button>
                          ))
                        ) : (
                          <div className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
                            No open assignments.
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">No project agents yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className={activeProjectSection === 'knowledge' ? '' : 'hidden'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <Brain className="h-5 w-5" />
                Shared Memory
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {memories.length ? (
                memories.map((memory) => (
                  <div key={memory.id} className="rounded-lg border px-4 py-3">
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <div className="space-y-1">
                        <p className="font-medium">{memory.title || memory.memoryType}</p>
                        <p className="text-xs uppercase tracking-wide text-muted-foreground">{memory.memoryType}</p>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(memory.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">{memory.content}</p>
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No shared memory yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className={activeProjectSection === 'delivery' ? '' : 'hidden'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <FileText className="h-5 w-5" />
                Artifacts
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {artifacts.length ? (
	                artifacts.map((artifact) => {
	                  const resources = artifactResources(artifact);
	                  return (
	                  <div key={artifact.id} className="rounded-lg border px-4 py-3">
	                    <div className="mb-1 flex items-center justify-between gap-2">
	                      <p className="font-medium">{artifact.title || artifact.artifactType}</p>
	                      <Badge variant="outline">{artifact.artifactType}</Badge>
                    </div>
                    {artifact.workItemId && (
                      <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                        Work Item: {workItems.find((item) => item.id === artifact.workItemId)?.title || 'Linked work item'}
                      </p>
                    )}
	                    {artifact.content && (
	                      <div className="rounded-md bg-muted/10 px-3 py-2 text-muted-foreground">
	                        <MathMarkdown content={artifact.content} className="max-w-none text-sm" />
	                      </div>
	                    )}
	                    {artifact.url && (
	                      <a
	                        href={artifact.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex text-sm text-primary underline-offset-4 hover:underline"
                      >
	                        Open artifact link
	                      </a>
	                    )}
	                    {resources.length ? (
	                      <div className="mt-3 space-y-2">
	                        <p className="text-xs uppercase tracking-wide text-muted-foreground">Resources</p>
	                        <div className="grid gap-2">
	                          {resources.map((resource) => (
	                            <button
	                              type="button"
		                              key={resource.key || resource.path}
		                              className="flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm hover:bg-muted/40"
		                              onClick={() => handleOpenProjectFileInResources(resource)}
		                            >
	                              <span className="min-w-0 truncate">{resource.path}</span>
	                              {resource.size ? (
	                                <span className="shrink-0 text-xs text-muted-foreground">{formatBytes(resource.size)}</span>
	                              ) : null}
	                            </button>
	                          ))}
	                        </div>
	                      </div>
	                    ) : null}
	                  </div>
	                  );
	                })
              ) : (
                <p className="text-sm text-muted-foreground">No artifacts yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className={activeProjectSection === 'delivery' ? '' : 'hidden'}>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-xl">
                <ClipboardCheck className="h-5 w-5" />
                Reviews
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {reviews.length ? (
                reviews.map((review) => (
                  <div key={review.id} className="rounded-lg border px-4 py-3">
                    <div className="mb-1 flex items-center justify-between gap-2">
                      <p className="font-medium">{review.reviewerType}</p>
                      <Badge variant={review.status === 'APPROVED' ? 'success' : review.status === 'CHANGES_REQUESTED' ? 'warning' : review.status === 'REJECTED' ? 'destructive' : 'secondary'}>
                        {review.status}
                      </Badge>
                    </div>
                    <p className="mb-2 text-xs uppercase tracking-wide text-muted-foreground">
                      Work Item: {workItems.find((item) => item.id === review.workItemId)?.title || 'Linked work item'}
                    </p>
                    {review.reviewNote && (
                      <p className="text-sm leading-6 text-muted-foreground">{review.reviewNote}</p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No reviews yet.</p>
              )}
            </CardContent>
          </Card>

          <Card className={activeProjectSection === 'events' ? '' : 'hidden'}>
            <CardHeader>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
	                  <CardTitle className="flex items-center gap-2 text-xl">
	                    <Workflow className="h-5 w-5" />
	                    Event Graph
	                  </CardTitle>
	                  <p className="mt-2 text-sm text-muted-foreground">
	                    {projectEventGraphModeOption.question}
	                  </p>
	                </div>
                <div className="flex flex-wrap gap-2">
                  {projectEventGraphStats.map((stat) => (
                    <Badge key={stat.label} variant="outline" className="gap-1">
                      <span>{stat.label}</span>
                      <span>{stat.value}</span>
                    </Badge>
                  ))}
                </div>
	              </div>
	            </CardHeader>
	            <CardContent className="space-y-4">
	              <div className="flex gap-1.5 overflow-x-auto pb-1">
	                {EVENT_GRAPH_MODE_OPTIONS.map((option) => {
	                  const ModeIcon = option.icon;
	                  const selected = eventGraphMode === option.id;
	                  return (
	                    <button
	                      key={option.id}
	                      type="button"
	                      className={`flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-2.5 text-left text-xs transition-colors ${
	                        selected ? 'border-primary/60 bg-primary/10 text-foreground' : 'bg-background/60 hover:border-primary/50 hover:bg-primary/5'
	                      }`}
	                      onClick={() => setEventGraphMode(option.id)}
	                      title={option.question}
	                    >
	                      <ModeIcon className={`h-3.5 w-3.5 shrink-0 ${selected ? 'text-primary' : 'text-muted-foreground'}`} />
	                      <span className="whitespace-nowrap font-medium">{option.label}</span>
	                      <span className="hidden whitespace-nowrap text-[11px] text-muted-foreground 2xl:inline">{option.caption}</span>
	                    </button>
	                  );
	                })}
	              </div>
	              {projectEventGraph?.nodes?.length && !visibleProjectEventGraph?.nodes?.length ? (
	                <div className="rounded-lg border bg-muted/10 p-4">
	                  <p className="text-sm text-muted-foreground">{projectEventGraphModeOption.empty}</p>
	                </div>
	              ) : projectEventGraph?.nodes?.length ? (
	                <div className="space-y-4">
                  <div className="overflow-x-auto rounded-lg border bg-muted/10">
                    <div
                      className="relative"
                      onClick={() => setSelectedEventGraphNodeId('')}
                      style={{
                        width: `${projectEventGraphLayout.width}px`,
                        height: `${projectEventGraphLayout.height}px`,
                      }}
                    >
                      <svg
                        className="absolute inset-0 pointer-events-none"
                        width={projectEventGraphLayout.width}
                        height={projectEventGraphLayout.height}
                        viewBox={`0 0 ${projectEventGraphLayout.width} ${projectEventGraphLayout.height}`}
                        aria-hidden="true"
                      >
                        <defs>
                          <marker id="event-graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
                          </marker>
                          <marker id="event-graph-arrow-highlight" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-primary" />
                          </marker>
                        </defs>
                        {projectEventGraphLayout.edges.map((edge) => {
                          const isHighlighted = highlightedEventGraphEdgeIds.has(edge.id);
                          const isDimmed = Boolean(selectedEventGraphNodeId && !isHighlighted);
                          const isSubtleEdge = edge.type === 'ACTED' || edge.type === 'EVENT_TARGET' || edge.type === 'MESSAGE_TARGET';
                          return (
                          <g key={edge.id} className="transition-opacity">
                            <path
                              d={edge.path}
                              fill="none"
                              stroke="currentColor"
                              strokeWidth={isSubtleEdge ? 1.2 : 1.6}
                              strokeDasharray={isSubtleEdge ? '4 5' : undefined}
                              markerEnd={isHighlighted ? 'url(#event-graph-arrow-highlight)' : 'url(#event-graph-arrow)'}
                              className={
                                isHighlighted
                                  ? 'text-primary opacity-100 drop-shadow-sm'
                                  : isDimmed
                                    ? 'text-muted-foreground/20 opacity-20'
                                    : edge.eventId
                                      ? 'text-primary/45'
                                      : 'text-muted-foreground/35'
                              }
                            />
                          </g>
                          );
                        })}
                      </svg>
                      {projectEventGraphLayout.columns.map((column) => (
                        <div
                          key={column.key}
                          className="absolute top-4 text-xs font-medium uppercase text-muted-foreground"
                          style={{ left: `${18 + column.columnIndex * 264}px`, width: '224px' }}
                        >
                          {column.label}
                        </div>
                      ))}
                      {projectEventGraphLayout.columns.flatMap((column) =>
                        column.nodes.map((node) => {
                          const position = projectEventGraphLayout.nodePositions.get(node.id);
                          if (!position) return null;
                          const attribution = eventGraphNodeDisplayAttribution(node);
                          const isClickable = isProjectEventGraphNodeClickable(node);
                          const isSelected = selectedEventGraphNodeId === node.id;
                          const isOutgoingTarget = highlightedEventGraphTargetIds.has(node.id);
                          const isDimmed = Boolean(selectedEventGraphNodeId && !isSelected && !isOutgoingTarget);
                          const titleParts = [
                            `${node.type}: ${node.label}`,
                            attribution,
                            node.type === 'MESSAGE' ? 'Click to open sender session' : 'Left-click to highlight links',
                            isClickable && node.type !== 'MESSAGE' ? 'Right-click to enter' : '',
                          ].filter(Boolean);
                          return (
                            <div
                              key={node.id}
                              role="button"
                              tabIndex={0}
                              className={`absolute overflow-hidden rounded-md border px-3 py-2 shadow-sm transition ${
                                EVENT_GRAPH_NODE_TYPE_CLASS[node.type] || 'border-border bg-muted/20'
                              } cursor-pointer hover:border-primary/60 ${
                                isSelected ? 'ring-2 ring-primary/60' : isOutgoingTarget ? 'ring-1 ring-primary/40' : ''
                              } ${isDimmed ? 'opacity-45' : ''}`}
                              style={{
                                left: `${position.x}px`,
                                top: `${position.y}px`,
                                width: `${position.width}px`,
                                height: `${position.height}px`,
                              }}
                              title={titleParts.join(' · ')}
                              onClick={(event) => {
                                event.stopPropagation();
                                setSelectedEventGraphNodeId(node.id);
                                if (node.type === 'MESSAGE') {
                                  void handleProjectEventGraphNodeClick(node);
                                }
                              }}
                              onContextMenu={(event) => {
                                event.preventDefault();
                                event.stopPropagation();
                                if (isClickable) {
                                  void handleProjectEventGraphNodeClick(node);
                                }
                              }}
                              onKeyDown={(event) => {
                                if (event.key === 'Enter' || event.key === ' ') {
                                  event.preventDefault();
                                  setSelectedEventGraphNodeId(node.id);
                                  if (node.type === 'MESSAGE') {
                                    void handleProjectEventGraphNodeClick(node);
                                  }
                                }
                                if (isClickable && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
                                  event.preventDefault();
                                  void handleProjectEventGraphNodeClick(node);
                                }
                              }}
                            >
                              <div className="flex items-start justify-between gap-2">
                                <p className="min-w-0 truncate text-sm font-semibold">{node.label}</p>
                                {node.status ? (
                                  <span className="shrink-0 rounded-full border bg-background/60 px-1.5 py-0.5 text-[10px] text-muted-foreground">
                                    {node.status}
                                  </span>
                                ) : null}
                              </div>
                              {node.subtitle ? (
                                <p className="mt-1 line-clamp-1 text-xs leading-4 text-muted-foreground">{node.subtitle}</p>
                              ) : null}
                              {attribution ? (
                                <p className="mt-0.5 truncate text-[11px] leading-4 text-primary/85">{attribution}</p>
                              ) : null}
                            </div>
                          );
                        }),
                      )}
                    </div>
                  </div>

	                  <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
	                    <div className="rounded-lg border bg-muted/10 p-4">
	                      <div className="mb-3 flex items-center gap-2">
	                        <Route className="h-4 w-4 text-primary" />
	                        <h2 className="font-semibold">{projectEventGraphModeOption.label} Edges</h2>
	                      </div>
	                      <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
	                        {projectEventGraphLayout.edges.length ? (
	                          projectEventGraphLayout.edges.slice(0, 24).map((edge) => {
	                            const source = projectEventGraphNodeById.get(edge.source);
	                            const target = projectEventGraphNodeById.get(edge.target);
	                            return (
	                              <div key={edge.id} className="flex items-center gap-2 rounded-md border bg-background/60 px-3 py-2 text-sm">
	                                <span className="min-w-0 flex-1 truncate font-medium">{source?.label || edge.source}</span>
	                                <Badge variant="outline" className="shrink-0">{edge.label || edge.type}</Badge>
	                                <span className="min-w-0 flex-1 truncate text-muted-foreground">{target?.label || edge.target}</span>
	                              </div>
	                            );
	                          })
	                        ) : (
	                          <p className="text-sm text-muted-foreground">No matching relationships in this mode.</p>
	                        )}
	                      </div>
	                    </div>

	                    <div className="space-y-4">
	                      <div className="rounded-lg border bg-muted/10 p-4">
	                        <div className="mb-3 flex items-center gap-2">
	                          <Workflow className="h-4 w-4 text-primary" />
	                          <h2 className="font-semibold">{projectEventGraphModeOption.label}</h2>
	                        </div>
	                        <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
	                          {projectEventGraphFocusItems.length ? (
	                            projectEventGraphFocusItems.map((item) => {
	                              const linkedNode = item.nodeId ? projectEventGraphNodeById.get(item.nodeId) : null;
	                              return (
	                              <button
	                                key={item.id}
	                                type="button"
	                                className="w-full rounded-md border bg-background/60 px-3 py-2 text-left transition-colors hover:border-primary/60 hover:bg-primary/5"
	                                onClick={() => {
	                                  if (!item.nodeId) return;
	                                  setSelectedEventGraphNodeId(item.nodeId);
	                                }}
	                                onContextMenu={(event) => {
	                                  if (!linkedNode || !isProjectEventGraphNodeClickable(linkedNode)) return;
	                                  event.preventDefault();
	                                  void handleProjectEventGraphNodeClick(linkedNode);
	                                }}
	                              >
	                                <div className="flex items-center justify-between gap-2">
	                                  <p className="min-w-0 truncate text-sm font-medium">{item.title}</p>
	                                  {item.badge ? <Badge variant="outline">{item.badge}</Badge> : null}
	                                </div>
	                                {item.summary ? <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">{item.summary}</p> : null}
	                                {item.time ? <p className="mt-1 text-[11px] text-muted-foreground">{formatProjectDate(item.time)}</p> : null}
	                              </button>
	                              );
	                            })
	                          ) : (
	                            <p className="text-sm text-muted-foreground">{projectEventGraphModeOption.empty}</p>
	                          )}
	                        </div>
	                      </div>

	                      {['blockers', 'timeline'].includes(eventGraphMode) ? (
	                        <div className="rounded-lg border bg-muted/10 p-4">
	                          <div className="mb-3 flex items-center gap-2">
	                            <Workflow className="h-4 w-4 text-primary" />
	                            <h2 className="font-semibold">Coordinator</h2>
	                          </div>
	                          <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
	                            {projectCoordinatorEvents.length ? (
	                              projectCoordinatorEvents.slice(0, 6).map((coordinatorEvent) => (
	                                <div key={coordinatorEvent.id} className="rounded-md border bg-background/60 px-3 py-2 text-sm">
	                                  <div className="mb-1 flex items-center justify-between gap-2">
	                                    <Badge variant="outline">{coordinatorEvent.type.replace(/^COORDINATOR_/, '')}</Badge>
	                                    <span className="text-[11px] text-muted-foreground">#{coordinatorEvent.seq}</span>
	                                  </div>
	                                  <p className="leading-5 text-foreground">{coordinatorEvent.message}</p>
	                                  <p className="mt-2 text-[11px] text-muted-foreground">
	                                    {formatProjectDate(coordinatorEvent.createdAt)}
	                                    {coordinatorEvent.dispatchMode ? ` · ${coordinatorEvent.dispatchMode}` : ''}
	                                    {coordinatorEvent.reason ? ` · ${coordinatorEvent.reason}` : ''}
	                                  </p>
	                                  {coordinatorEvent.memberId && coordinatorEvent.conversationId ? (
	                                    <Button
	                                      type="button"
	                                      size="sm"
	                                      variant="ghost"
	                                      className="mt-2 h-7 px-2 text-xs"
	                                      onClick={() => {
	                                        setSelectedAgentMemberId(coordinatorEvent.memberId);
	                                        setSelectedAgentConversationId(coordinatorEvent.conversationId);
	                                        setAgentHistoryOpen(true);
	                                        setAgentRuntimePanel(null);
	                                        openProjectSection('members');
	                                      }}
	                                    >
	                                      <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
	                                      Open agent conversation
	                                    </Button>
	                                  ) : null}
	                                </div>
	                              ))
	                            ) : (
	                              <p className="text-sm text-muted-foreground">No coordinator output yet.</p>
	                            )}
	                          </div>
	                        </div>
	                      ) : null}
	                    </div>
	                  </div>
                </div>
              ) : activityItems.length ? (
                <div className="rounded-lg border bg-muted/10 p-4">
                  <p className="mb-3 text-sm text-muted-foreground">Graph data is unavailable; showing the derived activity stream.</p>
                  <div className="space-y-2">
                    {activityItems.slice(0, 8).map((item) => (
                      <div key={item.id} className="rounded-md border bg-background/60 px-3 py-2">
                        <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                          <div className="flex min-w-0 items-center gap-2">
                            <Radar className="h-4 w-4 shrink-0 text-primary" />
                            <p className="truncate font-medium">{item.title}</p>
                          </div>
                          <Badge variant="outline">{ACTIVITY_LABEL[item.type]}</Badge>
                        </div>
                        {item.summary && <p className="text-sm leading-6 text-muted-foreground">{item.summary}</p>}
                        <p className="mt-2 text-xs text-muted-foreground">
                          {new Date(item.occurredAt).toLocaleString()}
                          {item.actor ? ` · ${item.actor.displayName || item.actor.email}` : ''}
                          {item.workItem ? ` · ${item.workItem.title}` : ''}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">No project events yet.</p>
              )}
            </CardContent>
          </Card>
        </div>
	      </div>
	        </div>
	      </div>
	      <div
	        className="group fixed bottom-5 left-4 right-4 z-40 sm:left-auto sm:right-6"
	        onMouseEnter={handleOpenLeaderChat}
	        onFocus={handleOpenLeaderChat}
	      >
	        <div
	          className={`mb-3 ml-auto w-full max-w-[440px] rounded-lg border bg-background shadow-2xl transition-all duration-150 ${
	            leaderChatPinned
	              ? 'pointer-events-auto translate-y-0 opacity-100'
	              : 'pointer-events-none translate-y-2 opacity-0 group-hover:pointer-events-auto group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:translate-y-0 group-focus-within:opacity-100'
	          }`}
	        >
	          <div className="flex items-start justify-between gap-3 border-b px-4 py-3">
	            <div className="min-w-0 space-y-1">
	              <div className="flex flex-wrap items-center gap-2">
	                <Crown className="h-4 w-4 text-primary" />
	                <p className="truncate text-sm font-semibold">
	                  {leaderAgentMember ? formatAgentDisplayName(leaderAgentMember) : 'Leader Agent'}
	                </p>
	                {leaderAgentRuntime ? (
	                  <Badge variant={AGENT_RUNTIME_STATUS_VARIANT[leaderAgentRuntime.session.status] || 'secondary'}>
	                    {formatRuntimeStatusLabel(leaderAgentRuntime.session.status)}
	                  </Badge>
	                ) : (
	                  <Badge variant="secondary">not launched</Badge>
	                )}
	                {leaderAgentMember ? <Badge variant="outline">{formatRoleLabel(leaderAgentMember.role)}</Badge> : null}
	              </div>
	              <p className="line-clamp-2 text-xs text-muted-foreground">
	                {leaderAgentRuntime
	                  ? leaderAgentIsSelected
	                    ? selectedAgentActivity
	                    : leaderAgentRuntime.session.currentActivity || 'Hover to open the leader conversation.'
	                  : leaderAgentMember
	                    ? 'Start or reconnect the lead runtime before chatting.'
	                    : 'Create a lead agent to coordinate this project.'}
	              </p>
	            </div>
	            <Button
	              type="button"
	              size="icon"
	              variant="ghost"
	              className="h-8 w-8 shrink-0"
	              aria-label={leaderChatPinned ? 'Unpin leader chat' : 'Pin leader chat'}
	              onClick={() => {
	                handleOpenLeaderChat();
	                setLeaderChatPinned((current) => !current);
	              }}
	            >
	              {leaderChatPinned ? <X className="h-4 w-4" /> : <MessageSquare className="h-4 w-4" />}
	            </Button>
	          </div>

	          {leaderAgentRuntime && leaderAgentIsSelected ? (
	            <div className="space-y-3 px-4 py-3">
	              <div className="max-h-72 space-y-2 overflow-y-auto rounded-md border bg-muted/10 p-2" data-agent-message-list="true">
	                {selectedAgentMessages.length ? (
	                  selectedAgentMessages.slice(-4).map((message) => {
	                    if (message.role === 'tool') {
	                      return <div key={message.id}>{renderAgentActivity(message.actions || [], `leader-${message.id}`)}</div>;
	                    }
	                    return renderAgentMessage(message, { compact: true });
	                  })
	                ) : (
	                  <p className="px-2 py-6 text-center text-sm text-muted-foreground">No leader messages yet.</p>
	                )}
	                {selectedAgentIsTyping ? (
	                  <div className="flex justify-start">
	                    <div className="rounded-md bg-muted/40 px-3 py-2">
	                      {selectedAgentTypingLines.length > 0 ? (
	                        <div className="mb-2 space-y-1 text-xs leading-5 text-muted-foreground">
	                          {selectedAgentTypingLines.map((line) => (
	                            <div key={line}>{line}</div>
	                          ))}
	                        </div>
	                      ) : null}
	                      <div className="flex items-center gap-1.5">
	                        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70" />
	                        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:120ms]" />
	                        <span className="h-2 w-2 animate-bounce rounded-full bg-muted-foreground/70 [animation-delay:240ms]" />
	                      </div>
	                    </div>
	                  </div>
	                ) : null}
	              </div>
	              {!selectedAgentCanMessage ? (
	                <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-900 dark:text-amber-100">
	                  <span className="min-w-0 flex-1">
	                    {leaderAgentCanReconnect
	                      ? 'Leader runtime is offline. Reconnect it before sending a message.'
	                      : selectedAgentMessagePlaceholder}
	                  </span>
	                  <div className="flex shrink-0 gap-2">
	                    {leaderAgentCanReconnect ? (
	                      <Button type="button" size="sm" variant="outline" onClick={() => handleReconnectAgentRuntime(leaderAgentRuntime)}>
	                        <RefreshCw className="mr-2 h-4 w-4" />
	                        Reconnect
	                      </Button>
	                    ) : null}
	                    <Button type="button" size="sm" variant="ghost" onClick={() => openProjectSection('members')}>
	                      Members
	                    </Button>
	                  </div>
	                </div>
	              ) : null}
	              <form onSubmit={handleSendAgentMessage} className="space-y-2">
	                <textarea
	                  className="min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
	                  value={agentMessage}
	                  onFocus={() => updateProjectFileMentionState('agentMessage', agentMessage)}
	                  onBlur={() => closeProjectFileMentionMenu('agentMessage')}
	                  onChange={(event) => handleAgentMessageChange(event.target.value)}
	                  onCompositionStart={handleAgentMessageCompositionStart}
	                  onCompositionEnd={handleAgentMessageCompositionEnd}
	                  onKeyDown={handleAgentMessageKeyDown}
	                  placeholder={selectedAgentMessagePlaceholder}
	                  disabled={!selectedAgentCanMessage}
	                />
	                <div className="flex flex-wrap items-center justify-between gap-2">
	                  <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
	                    {agentMessageResponse || 'Ask the lead agent about project state, blockers, or next steps.'}
	                  </p>
	                  <Button type="submit" size="sm" variant="secondary" disabled={sendingAgentMessage || !agentMessage.trim() || !selectedAgentCanMessage}>
	                    <Send className="mr-2 h-4 w-4" />
	                    {sendingAgentMessage ? 'Sending...' : 'Send'}
	                  </Button>
	                </div>
	              </form>
	            </div>
	          ) : (
	            <div className="space-y-3 px-4 py-4">
	              <p className="text-sm leading-6 text-muted-foreground">
	                {leaderAgentMember
	                  ? leaderAgentRuntime
	                    ? 'Open the leader runtime to inspect and message it.'
	                    : 'The lead agent exists, but no runtime is available yet.'
	                  : 'This project does not have a lead agent member yet.'}
	              </p>
	              <div className="flex flex-wrap gap-2">
	                {leaderAgentRuntime && leaderAgentCanReconnect ? (
	                  <Button type="button" size="sm" variant="secondary" onClick={() => handleReconnectAgentRuntime(leaderAgentRuntime)}>
	                    <RefreshCw className="mr-2 h-4 w-4" />
	                    Reconnect
	                  </Button>
	                ) : null}
	                {leaderAgentMember && !leaderAgentRuntime ? (
	                  <Button
	                    type="button"
	                    size="sm"
	                    variant="secondary"
	                    onClick={() => handleOpenLaunchAgentRuntime(leaderAgentMember.role, leaderAgentMember.id, 'local-codex')}
	                  >
	                    <Rocket className="mr-2 h-4 w-4" />
	                    Start Lead
	                  </Button>
	                ) : null}
	                <Button type="button" size="sm" variant="outline" onClick={() => openProjectSection('members')}>
	                  <UserRoundCheck className="mr-2 h-4 w-4" />
	                  Members
	                </Button>
	              </div>
	            </div>
	          )}
	        </div>
	        <button
	          type="button"
	          className={`ml-auto flex h-14 w-14 items-center justify-center rounded-full border bg-primary text-primary-foreground shadow-xl transition-transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
	            leaderAgentRuntime?.session.status === 'TYPING' ? 'animate-pulse' : ''
	          }`}
	          aria-label="Open leader agent chat"
	          onClick={() => {
	            handleOpenLeaderChat();
	            setLeaderChatPinned((current) => !current);
	          }}
	        >
	          <Crown className="h-6 w-6" />
	        </button>
	      </div>
	      {goalGlobalsModalGoal ? (
	        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
          <div className="max-h-[90vh] w-full max-w-4xl overflow-y-auto rounded-lg border bg-background shadow-lg">
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b bg-background px-5 py-4">
              <div>
                <p className="text-lg font-semibold">{goalGlobalsModalGoal.title}</p>
                <p className="text-sm text-muted-foreground">Goal runtime variables</p>
              </div>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => setGoalGlobalsModalGoal(null)}
                disabled={savingGoalGlobals}
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <div className="space-y-4 px-5 py-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  These values are injected only for agents assigned to work under this goal.
                </p>
                <Button type="button" size="sm" variant="outline" onClick={handleAddGoalGlobal} disabled={!canEditProjectGlobals}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Variable
                </Button>
              </div>

              {goalGlobalsForm.length ? (
                <div className="space-y-4">
                  {goalGlobalsForm.map((global, index) => (
                    <div key={`${global.key || 'goal-global'}-${index}`} className="rounded-lg border px-3 py-3">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Key</label>
                          <input
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={global.key || ''}
                            onChange={(e) => handleGoalGlobalChange(index, 'key', e.target.value)}
                            placeholder="target_api_token"
                            disabled={!canEditProjectGlobals || savingGoalGlobals}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Label</label>
                          <input
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={global.label || ''}
                            onChange={(e) => handleGoalGlobalChange(index, 'label', e.target.value)}
                            placeholder="Target API Token"
                            disabled={!canEditProjectGlobals || savingGoalGlobals}
                          />
                        </div>
                      </div>
                      <div className="mt-4 grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Category</label>
                          <input
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            value={global.category || ''}
                            onChange={(e) => handleGoalGlobalChange(index, 'category', e.target.value)}
                            placeholder="credential"
                            disabled={!canEditProjectGlobals || savingGoalGlobals}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Value</label>
                          <input
                            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                            type={global.isSecret !== false ? 'password' : 'text'}
                            value={global.value || ''}
                            onChange={(e) => handleGoalGlobalChange(index, 'value', e.target.value)}
                            placeholder={global.isSecret !== false ? 'Stored securely for this goal' : 'Value'}
                            disabled={!canEditProjectGlobals || savingGoalGlobals}
                          />
                        </div>
                      </div>
                      <div className="mt-4 space-y-2">
                        <label className="text-sm font-medium">Description</label>
                        <textarea
                          className="min-h-[84px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={global.description || ''}
                          onChange={(e) => handleGoalGlobalChange(index, 'description', e.target.value)}
                          placeholder="What this variable unlocks for agents working this goal"
                          disabled={!canEditProjectGlobals || savingGoalGlobals}
                        />
                      </div>
                      <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={global.isSecret !== false}
                            onChange={(e) => handleGoalGlobalChange(index, 'isSecret', e.target.checked)}
                            disabled={!canEditProjectGlobals || savingGoalGlobals}
                          />
                          Secret
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={global.required !== false}
                            onChange={(e) => handleGoalGlobalChange(index, 'required', e.target.checked)}
                            disabled={!canEditProjectGlobals || savingGoalGlobals}
                          />
                          Required
                        </label>
                        <label className="inline-flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={global.createTaskOnMissing === true}
                            onChange={(e) => handleGoalGlobalChange(index, 'createTaskOnMissing', e.target.checked)}
                            disabled={!canEditProjectGlobals || savingGoalGlobals}
                          />
                          Create Owner task when missing
                        </label>
                        <Badge variant={global.configured || global.value ? 'success' : 'secondary'}>
                          {global.configured || global.value ? 'configured' : 'missing'}
                        </Badge>
                        {canEditProjectGlobals ? (
                          <Button type="button" size="sm" variant="ghost" onClick={() => handleRemoveGoalGlobal(index)} disabled={savingGoalGlobals}>
                            Remove
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="rounded-md border border-dashed px-3 py-6 text-sm text-muted-foreground">
                  No goal variables yet.
                </div>
              )}

              {goalGlobalsSyncResult ? (
                <div className="rounded-md border bg-muted/20 px-3 py-2 text-sm text-muted-foreground">
                  Runtime sync updated {goalGlobalsSyncResult.updated} agent session{goalGlobalsSyncResult.updated === 1 ? '' : 's'}.
                </div>
              ) : null}
            </div>
            <div className="sticky bottom-0 flex flex-wrap justify-end gap-2 border-t bg-background px-5 py-4">
              <Button type="button" variant="outline" onClick={() => setGoalGlobalsModalGoal(null)} disabled={savingGoalGlobals}>
                Cancel
              </Button>
              <Button type="button" variant="secondary" onClick={() => handleSaveGoalGlobals(false)} disabled={!canEditProjectGlobals || savingGoalGlobals}>
                <Save className="mr-2 h-4 w-4" />
                Save
              </Button>
              <Button type="button" onClick={() => handleSaveGoalGlobals(true)} disabled={!canEditProjectGlobals || savingGoalGlobals}>
                <RefreshCw className={`mr-2 h-4 w-4 ${savingGoalGlobals ? 'animate-spin' : ''}`} />
                Save & Apply Now
              </Button>
            </div>
          </div>
        </div>
      ) : null}
      {workItemProjectFilePreview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 px-4 py-6 backdrop-blur-sm">
          <div className="flex max-h-[92vh] w-full max-w-5xl flex-col overflow-hidden rounded-lg border bg-background shadow-2xl">
            <div className="flex shrink-0 items-start justify-between gap-4 border-b px-5 py-4">
              <div className="min-w-0 space-y-1">
                <p className="truncate text-lg font-semibold">{workItemProjectFilePreview.path}</p>
                <p className="text-sm text-muted-foreground">
                  {projectFilePreviewKind(workItemProjectFilePreview) === 'download'
                    ? 'File'
                    : projectFilePreviewKind(workItemProjectFilePreview).toUpperCase()}
                  {workItemProjectFilePreview.size ? ` · ${formatBytes(workItemProjectFilePreview.size)}` : ''}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handleDownloadProjectFile(workItemProjectFilePreview.path)}
                >
                  <Download className="mr-2 h-4 w-4" />
                  Download
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  aria-label="Close file preview"
                  onClick={() => {
                    setWorkItemProjectFilePreview(null);
                    setProjectFilePreviewError('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4">
              {loadingProjectFilePreview ? (
                <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                  Loading preview...
                </div>
              ) : projectFilePreviewError ? (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  <AlertTriangle className="h-8 w-8 text-destructive" />
                  <p>{projectFilePreviewError}</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownloadProjectFile(workItemProjectFilePreview.path)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download file
                  </Button>
                </div>
              ) : projectFilePreviewKind(workItemProjectFilePreview) === 'image' && projectFilePreviewUrl ? (
                <div className="flex min-h-[360px] items-center justify-center">
                  <img
                    src={projectFilePreviewUrl}
                    alt={workItemProjectFilePreview.path}
                    className="max-h-[70vh] max-w-full rounded-md object-contain"
                  />
                </div>
              ) : projectFilePreviewKind(workItemProjectFilePreview) === 'pdf' && projectFilePreviewUrl ? (
                <iframe
                  title={workItemProjectFilePreview.path}
                  src={projectFilePreviewUrl}
                  className="h-[70vh] w-full rounded-md border"
                />
              ) : projectFilePreviewKind(workItemProjectFilePreview) === 'text' ? (
                projectFilePreviewText ? (
                  projectFileTextPreviewMode(workItemProjectFilePreview) === 'markdown' ? (
                    <div className="max-h-[70vh] overflow-auto rounded-md bg-muted/10 px-4 py-3">
                      <MathMarkdown content={projectFilePreviewText} className="max-w-none text-sm" />
                    </div>
                  ) : (
                    <pre className="max-h-[70vh] overflow-auto whitespace-pre-wrap rounded-md bg-muted/20 p-3 text-xs leading-5">
                      {projectFilePreviewText}
                    </pre>
                  )
                ) : (
                  <div className="flex min-h-[360px] items-center justify-center text-sm text-muted-foreground">
                    No preview content.
                  </div>
                )
              ) : (
                <div className="flex min-h-[360px] flex-col items-center justify-center gap-3 text-center text-sm text-muted-foreground">
                  <FileText className="h-8 w-8 text-primary" />
                  <p>Preview is not available for this file type.</p>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => handleDownloadProjectFile(workItemProjectFilePreview.path)}
                  >
                    <Download className="mr-2 h-4 w-4" />
                    Download file
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : null}
      </div>
    </div>
  );
}
