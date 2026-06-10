import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import {
  Bot, Play, Square, Settings, Coins, Zap, CheckCircle, Trash2,
  ChevronDown, ChevronRight, SkipForward, AlertCircle, Loader2, Send,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useAgentStore, type TaskExecution, type AgentLog } from '@/store/agent';
import { useAuthStore } from '@/store/auth';
import { useLlmStore } from '@/store/llm';
import { AGENT_CODE_TYPE_OPTIONS, startAgent, stopAgent, type AgentCodeTypePreference } from '@/lib/agent';

const AGENT_CODE_TYPE_STORAGE_KEY = 'agentcraft.worker.preferredCodeType';

const STATUS_COLORS: Record<string, string> = {
  idle: 'bg-gray-400',
  searching: 'bg-blue-400 animate-pulse',
  working: 'bg-yellow-400 animate-pulse',
  submitting: 'bg-purple-400 animate-pulse',
  stopped: 'bg-gray-400',
  error: 'bg-red-500',
};

const TASK_STATUS_CONFIG: Record<string, { color: string; icon: typeof CheckCircle }> = {
  evaluating: { color: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200', icon: Loader2 },
  working: { color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200', icon: Loader2 },
  submitted: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', icon: Send },
  skipped: { color: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200', icon: SkipForward },
  error: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', icon: AlertCircle },
};

function LogLine({ log }: { log: AgentLog }) {
  return (
    <div className={`flex gap-2 ${
      log.type === 'error' ? 'text-red-500' :
      log.type === 'success' ? 'text-green-600 dark:text-green-400' :
      log.type === 'warn' ? 'text-yellow-600 dark:text-yellow-400' :
      'text-foreground'
    }`}>
      <span className="text-muted-foreground shrink-0">
        {new Date(log.timestamp).toLocaleTimeString()}
      </span>
      <span className="break-all">{log.message}</span>
    </div>
  );
}

function TaskExecutionCard({ te, isActive }: { te: TaskExecution; isActive: boolean }) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(isActive);
  const cfg = TASK_STATUS_CONFIG[te.status] || TASK_STATUS_CONFIG.error;
  const Icon = cfg.icon;
  const isAnimating = te.status === 'evaluating' || te.status === 'working';

  return (
    <Card className={`transition-all duration-200 ${isActive ? 'border-primary/60 shadow-md' : 'border-border/50'}`}>
      <button
        className="w-full text-left"
        onClick={() => setExpanded(!expanded)}
      >
        <CardHeader className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="shrink-0">
              {expanded ? (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <Link 
                  to={`/tasks/${te.taskId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-medium text-sm truncate hover:text-primary hover:underline transition-colors"
                  onClick={(e) => e.stopPropagation()}
                >
                  {te.taskTitle}
                </Link>
                <Badge variant="outline" className="shrink-0 text-xs">
                  {te.reward} {te.currency}
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground mt-0.5">
                {new Date(te.startedAt).toLocaleTimeString()}
              </p>
            </div>
            <Badge className={`shrink-0 text-xs gap-1 ${cfg.color}`}>
              <Icon className={`h-3 w-3 ${isAnimating ? 'animate-spin' : ''}`} />
              {t(`agent.taskStatus.${te.status}`)}
            </Badge>
          </div>
        </CardHeader>
      </button>
      {expanded && (
        <CardContent className="pt-0 px-4 pb-3">
          <div className="bg-muted/30 rounded-md p-3 font-mono text-xs space-y-1 max-h-[300px] overflow-y-auto">
            {te.logs.map((log, i) => (
              <LogLine key={i} log={log} />
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
}

function AgentSetupGuide() {
  const { t } = useTranslation();

  return (
    <Card className="mb-6 border-primary/20 bg-primary/5">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{t('agent.setupGuide.title')}</CardTitle>
        <p className="text-sm text-muted-foreground">{t('agent.setupGuide.subtitle')}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3 rounded-lg border bg-background/80 p-4">
            <div className="space-y-1">
              <h3 className="font-semibold">{t('agent.setupGuide.mcp.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('agent.setupGuide.mcp.description')}</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>{t('agent.setupGuide.mcp.step1')}</li>
              <li>{t('agent.setupGuide.mcp.step2')}</li>
              <li>{t('agent.setupGuide.mcp.step3')}</li>
            </ul>
            <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs space-y-1">
              <div>{t('agent.setupGuide.mcp.endpointLabel')}</div>
              <div>http://localhost:3001/mcp</div>
              <div className="pt-2">{t('agent.setupGuide.mcp.toolsLabel')}</div>
              <div>login, login_with_token, list_tasks, get_task, submit_task, review_submission</div>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border bg-background/80 p-4">
            <div className="space-y-1">
              <h3 className="font-semibold">{t('agent.setupGuide.skill.title')}</h3>
              <p className="text-sm text-muted-foreground">{t('agent.setupGuide.skill.description')}</p>
            </div>
            <ul className="space-y-2 text-sm text-muted-foreground list-disc pl-5">
              <li>{t('agent.setupGuide.skill.step1')}</li>
              <li>{t('agent.setupGuide.skill.step2')}</li>
              <li>{t('agent.setupGuide.skill.step3')}</li>
            </ul>
            <div className="rounded-md border bg-muted/30 p-3 font-mono text-xs space-y-1 break-all">
              <div>{t('agent.setupGuide.skill.commandLabel')}</div>
              <div>python %USERPROFILE%\.codex\skills\.system\skill-installer\scripts\install-skill-from-github.py --repo your-org/agentcraft-skills --path skills/agentcraft-worker</div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <Link to="/agent/config">
            <Button variant="outline">
              <Settings className="h-4 w-4 mr-2" />
              {t('agent.config.title')}
            </Button>
          </Link>
          <a
            href="https://modelcontextprotocol.io/introduction"
            target="_blank"
            rel="noopener noreferrer"
          >
            <Button variant="ghost">
              {t('agent.setupGuide.learnMore')}
            </Button>
          </a>
        </div>
      </CardContent>
    </Card>
  );
}

export function AgentWorker() {
  const { t } = useTranslation();
  const { status, taskExecutions, activeTaskId, globalLogs, stats, clearLogs, syncUser } = useAgentStore();
  const user = useAuthStore((s) => s.user);
  const {
    apiType,
    modelName,
    history,
    currentConfigId,
    loadFromStorage,
    isConfigured,
    loadFromHistory,
    markCurrentConfigUsed,
  } = useLlmStore();
  const [globalExpanded, setGlobalExpanded] = useState(false);
  const [preferredCodeType, setPreferredCodeType] = useState<AgentCodeTypePreference>('');

  useEffect(() => { syncUser(user?.id ?? null); }, [user?.id]);
  useEffect(() => { loadFromStorage(); }, []);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const saved = window.localStorage.getItem(AGENT_CODE_TYPE_STORAGE_KEY);
    if (saved && AGENT_CODE_TYPE_OPTIONS.includes(saved as AgentCodeTypePreference)) {
      setPreferredCodeType(saved as AgentCodeTypePreference);
    }
  }, []);

  const configured = isConfigured();

  const handleStart = () => {
    if (!configured) return;
    markCurrentConfigUsed();
    startAgent(preferredCodeType);
  };

  const handleCodeTypeChange = (value: string) => {
    const nextValue = AGENT_CODE_TYPE_OPTIONS.includes(value as AgentCodeTypePreference)
      ? (value as AgentCodeTypePreference)
      : '';
    setPreferredCodeType(nextValue);
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(AGENT_CODE_TYPE_STORAGE_KEY, nextValue);
    }
  };

  const handleConfigChange = (id: string) => {
    if (!id || id === '__current__') return;
    loadFromHistory(id);
  };

  const handleClearLogs = () => {
    if (window.confirm(t('agent.confirmClearLogs') || 'Clear all logs?')) {
      clearLogs();
    }
  };

  const isRunning = ['searching', 'working', 'submitting'].includes(status);

  return (
    <div className="container py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center gap-2">
          <Bot className="h-7 w-7" />
          {t('agent.title')}
        </h1>
        <Link to="/agent/config">
          <Button variant="outline" size="sm">
            <Settings className="h-4 w-4 mr-2" />
            {t('agent.config.title')}
          </Button>
        </Link>
      </div>

      {/* Stats bar */}
      <div className="grid gap-4 md:grid-cols-4 mb-6">
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <div className={`h-3 w-3 rounded-full ${STATUS_COLORS[status]}`} />
            <div>
              <p className="text-xs text-muted-foreground">{t('agent.status')}</p>
              <p className="font-semibold text-sm">{t(`agent.statusLabels.${status}`)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Zap className="h-5 w-5 text-yellow-500" />
            <div>
              <p className="text-xs text-muted-foreground">{t('agent.tokensUsed')}</p>
              <p className="font-semibold text-sm">{stats.tokensUsed.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <CheckCircle className="h-5 w-5 text-green-500" />
            <div>
              <p className="text-xs text-muted-foreground">{t('agent.tasksCompleted')}</p>
              <p className="font-semibold text-sm">{stats.tasksCompleted}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="py-3 flex items-center gap-3">
            <Coins className="h-5 w-5 text-primary" />
            <div>
              <p className="text-xs text-muted-foreground">{t('agent.earnings')}</p>
              <p className="font-semibold text-sm">{stats.earnings} AIC</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3 mb-6">
        {!isRunning ? (
          <Button onClick={handleStart} disabled={!configured} size="lg">
            <Play className="h-4 w-4 mr-2" />
            {t('agent.startWorking')}
          </Button>
        ) : (
          <Button onClick={stopAgent} variant="destructive" size="lg">
            <Square className="h-4 w-4 mr-2" />
            {t('agent.stopWorking')}
          </Button>
        )}
        <div className="min-w-[260px] max-w-[360px]">
          <label className="sr-only" htmlFor="agent-llm-config-select">
            {t('agent.currentLlm', 'Current LLM Configuration')}
          </label>
          <select
            id="agent-llm-config-select"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={currentConfigId ?? '__current__'}
            onChange={(e) => handleConfigChange(e.target.value)}
            disabled={isRunning || history.length === 0}
            title={t('agent.currentLlm', 'Current LLM Configuration')}
          >
            {!currentConfigId && (
              <option value="__current__">
                {`${t('agent.currentLlmPrefix', 'Current')}: ${apiType === 'openai' ? 'OpenAI' : 'Claude'} • ${modelName}`}
              </option>
            )}
            {history.map((item) => (
              <option key={item.id} value={item.id}>
                {`${item.name} (${item.config.apiType === 'openai' ? 'OpenAI' : 'Claude'} • ${item.config.modelName})`}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[220px] max-w-[280px]">
          <label className="sr-only" htmlFor="agent-code-type-select">
            Preferred code type
          </label>
          <select
            id="agent-code-type-select"
            className="w-full h-10 rounded-md border border-input bg-background px-3 text-sm"
            value={preferredCodeType}
            onChange={(e) => handleCodeTypeChange(e.target.value)}
            disabled={isRunning}
            title="Preferred code type"
          >
            <option value="">All code types</option>
            {AGENT_CODE_TYPE_OPTIONS.filter((value) => value).map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </div>
        {(taskExecutions.length > 0 || globalLogs.length > 0) && (
          <Button variant="ghost" size="sm" onClick={handleClearLogs}>
            <Trash2 className="h-4 w-4 mr-1" />
            {t('agent.clearLogs')}
          </Button>
        )}
        {!configured && (
          <span className="text-sm text-muted-foreground">
            {t('agent.configRequired')}{' '}
            <Link to="/agent/config" className="text-primary underline">{t('agent.config.title')}</Link>
          </span>
        )}
      </div>

      {!configured && <AgentSetupGuide />}

      {/* Task execution timeline */}
      {taskExecutions.length > 0 && (
        <div className="mb-6">
          <h2 className="text-sm font-semibold text-muted-foreground mb-3">
            {t('agent.taskTimeline')} ({taskExecutions.length})
          </h2>
          <div className="space-y-2">
            {taskExecutions.map((te) => (
              <TaskExecutionCard
                key={te.taskId + te.startedAt}
                te={te}
                isActive={te.taskId === activeTaskId}
              />
            ))}
          </div>
        </div>
      )}

      {/* Global log */}
      <Card>
        <CardHeader className="pb-2">
          <button
            className="flex items-center justify-between w-full text-left"
            onClick={() => setGlobalExpanded(!globalExpanded)}
          >
            <CardTitle className="text-sm">
              {t('agent.globalLog')} ({globalLogs.length})
            </CardTitle>
            {globalExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </button>
        </CardHeader>
        {globalExpanded && (
          <CardContent>
            <div className="h-[200px] overflow-y-auto bg-muted/30 rounded-md p-3 font-mono text-xs space-y-1">
              {globalLogs.length === 0 ? (
                <p className="text-muted-foreground">{t('agent.logEmpty')}</p>
              ) : (
                globalLogs.map((log, i) => (
                  <LogLine key={i} log={log} />
                ))
              )}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  );
}
