import { create } from 'zustand';
import { api } from '@/lib/api';

export type AgentStatus = 'idle' | 'searching' | 'working' | 'submitting' | 'stopped' | 'error';

export type TaskExecutionStatus = 'evaluating' | 'working' | 'submitted' | 'skipped' | 'error';

export interface AgentLog {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

export interface TaskExecution {
  sessionId?: string;
  taskId: string;
  taskTitle: string;
  reward: number;
  currency: string;
  status: TaskExecutionStatus;
  logs: AgentLog[];
  startedAt: number;
}

interface AgentState {
  currentUserId: string | null;
  status: AgentStatus;
  taskExecutions: TaskExecution[];
  activeTaskId: string | null;
  globalLogs: AgentLog[];
  stats: {
    tokensUsed: number;
    tasksCompleted: number;
    earnings: number;
  };
  syncUser: (userId: string | null) => void;
  setStatus: (status: AgentStatus) => void;
  startTaskExecution: (taskId: string, title: string, reward: number, currency: string) => void;
  addTaskLog: (taskId: string, message: string, type?: AgentLog['type']) => void;
  finishTaskExecution: (taskId: string, status: TaskExecutionStatus) => void;
  addGlobalLog: (message: string, type?: AgentLog['type']) => void;
  addTokens: (count: number) => void;
  addCompletion: (reward: number) => void;
  clearLogs: () => void;
  reset: () => void;
}

function dbSessionToExecution(s: any): TaskExecution {
  return {
    sessionId: s.id,
    taskId: s.taskId || '',
    taskTitle: s.taskTitle || 'Untitled',
    reward: s.reward || 0,
    currency: s.currency || 'AIC',
    status: s.status as TaskExecutionStatus,
    logs: (s.logs || []).map((l: any) => ({
      timestamp: new Date(l.createdAt).getTime(),
      message: l.message,
      type: l.level as AgentLog['type'],
    })),
    startedAt: new Date(s.startedAt).getTime(),
  };
}

async function loadFromBackend(set: any) {
  try {
    const [sessions, stats] = await Promise.all([
      api.agentLogs.listSessions('WORKER', 50),
      api.agentLogs.getStats('WORKER'),
    ]);
    set({
      taskExecutions: (sessions || []).map(dbSessionToExecution),
      stats: {
        tokensUsed: stats?.tokensUsed || 0,
        tasksCompleted: stats?.tasksCompleted || 0,
        earnings: stats?.earnings || 0,
      },
    });
  } catch {
    // If backend unavailable, keep current state
  }
}

export const useAgentStore = create<AgentState>()(
  (set, get) => ({
    currentUserId: null,
    status: 'idle' as AgentStatus,
    taskExecutions: [],
    activeTaskId: null,
    globalLogs: [],
    stats: { tokensUsed: 0, tasksCompleted: 0, earnings: 0 },

    syncUser: (userId) => {
      const s = get();
      if (s.currentUserId === userId) return;
      set({
        currentUserId: userId,
        status: 'idle',
        taskExecutions: [],
        activeTaskId: null,
        globalLogs: [],
        stats: { tokensUsed: 0, tasksCompleted: 0, earnings: 0 },
      });
      if (userId) {
        loadFromBackend(set);
      }
    },

    setStatus: (status) => set({ status }),

    startTaskExecution: (taskId, taskTitle, reward, currency) => {
      const now = Date.now();
      set((s) => ({
        activeTaskId: taskId,
        taskExecutions: [
          {
            taskId,
            taskTitle,
            reward,
            currency,
            status: 'evaluating' as TaskExecutionStatus,
            logs: [{ timestamp: now, message: `Started evaluating: "${taskTitle}"`, type: 'info' as const }],
            startedAt: now,
          },
          ...s.taskExecutions,
        ].slice(0, 50),
      }));
      // Persist to backend
      api.agentLogs
        .createSession({ type: 'WORKER', taskId, taskTitle, reward, currency })
        .then((session) => {
          if (session?.id) {
            set((s) => ({
              taskExecutions: s.taskExecutions.map((te) =>
                te.taskId === taskId && !te.sessionId
                  ? { ...te, sessionId: session.id }
                  : te,
              ),
            }));
          }
        })
        .catch(() => {});
    },

    addTaskLog: (taskId, message, type = 'info') => {
      set((s) => ({
        taskExecutions: s.taskExecutions.map((te) =>
          te.taskId === taskId
            ? { ...te, logs: [...te.logs, { timestamp: Date.now(), message, type }] }
            : te,
        ),
      }));
      // Persist to backend
      const te = get().taskExecutions.find((t) => t.taskId === taskId);
      if (te?.sessionId) {
        api.agentLogs.addLog(te.sessionId, { message, level: type }).catch(() => {});
      }
    },

    finishTaskExecution: (taskId, status) => {
      const te = get().taskExecutions.find((t) => t.taskId === taskId);
      set((s) => ({
        activeTaskId: s.activeTaskId === taskId ? null : s.activeTaskId,
        taskExecutions: s.taskExecutions.map((t) =>
          t.taskId === taskId ? { ...t, status } : t,
        ),
      }));
      if (te?.sessionId) {
        api.agentLogs.finishSession(te.sessionId, { status }).catch(() => {});
      }
    },

    addGlobalLog: (message, type = 'info') =>
      set((s) => ({
        globalLogs: [...s.globalLogs.slice(-99), { timestamp: Date.now(), message, type }],
      })),

    addTokens: (count) => {
      set((s) => ({
        stats: { ...s.stats, tokensUsed: s.stats.tokensUsed + count },
      }));
      api.agentLogs.incrementStats({ type: 'WORKER', tokensUsed: count }).catch(() => {});
    },

    addCompletion: (reward) => {
      set((s) => ({
        stats: {
          ...s.stats,
          tasksCompleted: s.stats.tasksCompleted + 1,
          earnings: s.stats.earnings + reward,
        },
      }));
      api.agentLogs
        .incrementStats({ type: 'WORKER', tasksCompleted: 1, earnings: reward })
        .catch(() => {});
    },

    clearLogs: () => {
      set({ taskExecutions: [], globalLogs: [] });
      api.agentLogs.clear('WORKER').catch(() => {});
    },

    reset: () =>
      set((s) => ({
        currentUserId: s.currentUserId,
        status: 'idle',
        taskExecutions: [],
        activeTaskId: null,
        globalLogs: [],
        stats: { tokensUsed: 0, tasksCompleted: 0, earnings: 0 },
      })),
  }),
);
