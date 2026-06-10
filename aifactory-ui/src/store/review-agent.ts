import { create } from 'zustand';
import { api } from '@/lib/api';

export type ReviewAgentStatus = 'idle' | 'reviewing' | 'stopped' | 'error';

export type ReviewExecutionStatus = 'evaluating' | 'approved' | 'rejected' | 'revision' | 'skipped' | 'error';

export interface ReviewLog {
  timestamp: number;
  message: string;
  type: 'info' | 'success' | 'error' | 'warn';
}

export interface ReviewExecution {
  sessionId?: string;
  submissionId: string;
  taskId: string;
  taskTitle: string;
  workerName: string;
  status: ReviewExecutionStatus;
  logs: ReviewLog[];
  startedAt: number;
}

interface ReviewAgentState {
  currentUserId: string | null;
  status: ReviewAgentStatus;
  executions: ReviewExecution[];
  activeSubmissionId: string | null;
  globalLogs: ReviewLog[];
  stats: {
    tokensUsed: number;
    reviewed: number;
    approved: number;
    rejected: number;
  };
  syncUser: (userId: string | null) => void;
  setStatus: (status: ReviewAgentStatus) => void;
  startExecution: (submissionId: string, taskId: string, taskTitle: string, workerName: string) => void;
  addExecLog: (submissionId: string, message: string, type?: ReviewLog['type']) => void;
  finishExecution: (submissionId: string, status: ReviewExecutionStatus) => void;
  addGlobalLog: (message: string, type?: ReviewLog['type']) => void;
  addTokens: (count: number) => void;
  addApproval: () => void;
  addRejection: () => void;
  clearLogs: () => void;
  reset: () => void;
}

function dbSessionToExecution(s: any): ReviewExecution {
  return {
    sessionId: s.id,
    submissionId: s.taskId || '',
    taskId: s.taskId || '',
    taskTitle: s.taskTitle || 'Untitled',
    workerName: s.workerName || 'Unknown',
    status: s.status as ReviewExecutionStatus,
    logs: (s.logs || []).map((l: any) => ({
      timestamp: new Date(l.createdAt).getTime(),
      message: l.message,
      type: l.level as ReviewLog['type'],
    })),
    startedAt: new Date(s.startedAt).getTime(),
  };
}

async function loadFromBackend(set: any) {
  try {
    const [sessions, stats] = await Promise.all([
      api.agentLogs.listSessions('REVIEWER', 50),
      api.agentLogs.getStats('REVIEWER'),
    ]);
    set({
      executions: (sessions || []).map(dbSessionToExecution),
      stats: {
        tokensUsed: stats?.tokensUsed || 0,
        reviewed: stats?.reviewed || 0,
        approved: stats?.approved || 0,
        rejected: stats?.rejected || 0,
      },
    });
  } catch {
    // If backend unavailable, keep current state
  }
}

export const useReviewAgentStore = create<ReviewAgentState>()(
  (set, get) => ({
    currentUserId: null,
    status: 'idle' as ReviewAgentStatus,
    executions: [],
    activeSubmissionId: null,
    globalLogs: [],
    stats: { tokensUsed: 0, reviewed: 0, approved: 0, rejected: 0 },

    syncUser: (userId) => {
      const s = get();
      if (s.currentUserId === userId) return;
      set({
        currentUserId: userId,
        status: 'idle',
        executions: [],
        activeSubmissionId: null,
        globalLogs: [],
        stats: { tokensUsed: 0, reviewed: 0, approved: 0, rejected: 0 },
      });
      if (userId) {
        loadFromBackend(set);
      }
    },

    setStatus: (status) => set({ status }),

    startExecution: (submissionId, taskId, taskTitle, workerName) => {
      const now = Date.now();
      set((s) => ({
        activeSubmissionId: submissionId,
        executions: [
          {
            submissionId,
            taskId,
            taskTitle,
            workerName,
            status: 'evaluating' as ReviewExecutionStatus,
            logs: [{ timestamp: now, message: `Reviewing submission from ${workerName}`, type: 'info' as const }],
            startedAt: now,
          },
          ...s.executions,
        ].slice(0, 50),
      }));
      // Persist to backend
      api.agentLogs
        .createSession({ type: 'REVIEWER', taskId, taskTitle, workerName })
        .then((session) => {
          if (session?.id) {
            set((s) => ({
              executions: s.executions.map((e) =>
                e.submissionId === submissionId && !e.sessionId
                  ? { ...e, sessionId: session.id }
                  : e,
              ),
            }));
          }
        })
        .catch(() => {});
    },

    addExecLog: (submissionId, message, type = 'info') => {
      set((s) => ({
        executions: s.executions.map((e) =>
          e.submissionId === submissionId
            ? { ...e, logs: [...e.logs, { timestamp: Date.now(), message, type }] }
            : e,
        ),
      }));
      const exec = get().executions.find((e) => e.submissionId === submissionId);
      if (exec?.sessionId) {
        api.agentLogs.addLog(exec.sessionId, { message, level: type }).catch(() => {});
      }
    },

    finishExecution: (submissionId, status) => {
      const exec = get().executions.find((e) => e.submissionId === submissionId);
      set((s) => ({
        activeSubmissionId: s.activeSubmissionId === submissionId ? null : s.activeSubmissionId,
        executions: s.executions.map((e) =>
          e.submissionId === submissionId ? { ...e, status } : e,
        ),
      }));
      if (exec?.sessionId) {
        api.agentLogs.finishSession(exec.sessionId, { status }).catch(() => {});
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
      api.agentLogs.incrementStats({ type: 'REVIEWER', tokensUsed: count }).catch(() => {});
    },

    addApproval: () => {
      set((s) => ({
        stats: { ...s.stats, reviewed: s.stats.reviewed + 1, approved: s.stats.approved + 1 },
      }));
      api.agentLogs.incrementStats({ type: 'REVIEWER', reviewed: 1, approved: 1 }).catch(() => {});
    },

    addRejection: () => {
      set((s) => ({
        stats: { ...s.stats, reviewed: s.stats.reviewed + 1, rejected: s.stats.rejected + 1 },
      }));
      api.agentLogs.incrementStats({ type: 'REVIEWER', reviewed: 1, rejected: 1 }).catch(() => {});
    },

    clearLogs: () => {
      set({ executions: [], globalLogs: [] });
      api.agentLogs.clear('REVIEWER').catch(() => {});
    },

    reset: () =>
      set((s) => ({
        currentUserId: s.currentUserId,
        status: 'idle',
        executions: [],
        activeSubmissionId: null,
        globalLogs: [],
        stats: { tokensUsed: 0, reviewed: 0, approved: 0, rejected: 0 },
      })),
  }),
);
