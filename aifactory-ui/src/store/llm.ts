import { create } from 'zustand';
import { api } from '@/lib/api';

export type LlmApiType = 'openai' | 'claude';

interface LlmConfig {
  apiUrl: string;
  apiKey: string;
  modelName: string;
  apiType: LlmApiType;
}

interface ApiConfigHistory {
  id: string;
  name: string;
  config: LlmConfig;
  createdAt: string;
  lastUsed?: string;
}

interface ApiConfigRecord {
  id: string;
  name: string;
  apiType: string;
  apiUrl: string;
  apiKey: string;
  modelName: string;
  isActive?: boolean;
  createdAt: string;
  lastUsedAt?: string | null;
}

interface LlmState extends LlmConfig {
  isConfigured: () => boolean;
  setConfig: (config: Partial<LlmConfig>) => void;
  loadFromStorage: () => Promise<void>;
  // 历史配置相关
  history: ApiConfigHistory[];
  currentConfigId: string | null;
  saveToHistory: (name: string) => Promise<void>;
  loadFromHistory: (id: string) => Promise<void>;
  duplicateFromHistory: (id: string) => Promise<void>;
  deleteFromHistory: (id: string) => Promise<void>;
  clearHistory: () => Promise<void>;
  markCurrentConfigUsed: () => Promise<void>;
  clearCurrentConfig: () => Promise<void>;
}

const DEFAULT_CONFIG: LlmConfig = {
  apiUrl: 'https://api.openai.com/v1',
  apiKey: '',
  modelName: 'gpt-4o',
  apiType: 'openai',
};

function normalizeApiType(value: string | null | undefined): LlmApiType {
  return value === 'claude' ? 'claude' : 'openai';
}

function toHistoryEntry(config: ApiConfigRecord): ApiConfigHistory {
  return {
    id: config.id,
    name: config.name,
    createdAt: config.createdAt,
    lastUsed: config.lastUsedAt || undefined,
    config: {
      apiUrl: config.apiUrl,
      apiKey: config.apiKey,
      modelName: config.modelName,
      apiType: normalizeApiType(config.apiType),
    },
  };
}

function toLlmConfig(config: ApiConfigRecord): LlmConfig {
  return {
    apiUrl: config.apiUrl || DEFAULT_CONFIG.apiUrl,
    apiKey: config.apiKey || DEFAULT_CONFIG.apiKey,
    modelName: config.modelName || DEFAULT_CONFIG.modelName,
    apiType: normalizeApiType(config.apiType),
  };
}

export const useLlmStore = create<LlmState>((set, get) => ({
  ...DEFAULT_CONFIG,
  history: [],
  currentConfigId: null,

  isConfigured: () => {
    const s = get();
    return !!(s.apiUrl && s.apiKey && s.modelName);
  },

  setConfig: (config) => {
    set({ ...config, currentConfigId: null });
  },

  saveToHistory: async (name) => {
    const s = get();

    const created = (await api.apiConfigs.create({
      name,
      apiType: s.apiType,
      apiUrl: s.apiUrl,
      apiKey: s.apiKey,
      modelName: s.modelName,
    })) as ApiConfigRecord;

    if (created?.id) {
      await api.apiConfigs.activate(created.id);
    }
    await get().loadFromStorage();
  },

  loadFromHistory: async (id) => {
    await api.apiConfigs.activate(id);
    await get().loadFromStorage();
  },

  duplicateFromHistory: async (id) => {
    const source = (await api.apiConfigs.get(id)) as ApiConfigRecord;
    await api.apiConfigs.create({
      name: `${source.name} (Copy)`,
      apiType: normalizeApiType(source.apiType),
      apiUrl: source.apiUrl,
      apiKey: source.apiKey,
      modelName: source.modelName,
    });

    await get().loadFromStorage();
  },

  deleteFromHistory: async (id) => {
    await api.apiConfigs.delete(id);
    await get().loadFromStorage();
  },

  clearHistory: async () => {
    const configs = (await api.apiConfigs.list()) as ApiConfigRecord[];
    await Promise.allSettled(configs.map((config) => api.apiConfigs.delete(config.id)));
    await get().loadFromStorage();
  },

  markCurrentConfigUsed: async () => {
    const s = get();
    if (!s.currentConfigId) return;

    await api.apiConfigs.activate(s.currentConfigId);
    const now = new Date().toISOString();
    set((state) => ({
      currentConfigId: s.currentConfigId,
      history: state.history.map((h) =>
        h.id === s.currentConfigId ? { ...h, lastUsed: now } : h,
      ),
    }));
  },

  clearCurrentConfig: async () => {
    const s = get();

    if (s.currentConfigId) {
      await api.apiConfigs.delete(s.currentConfigId);
      await get().loadFromStorage();
      return;
    }

    set({
      ...DEFAULT_CONFIG,
      currentConfigId: null,
    });
  },

  loadFromStorage: async () => {
    try {
      const configs = (await api.apiConfigs.list()) as ApiConfigRecord[];
      const history = configs.map(toHistoryEntry);

      let activeConfig: ApiConfigRecord | null = null;
      const activeFromList = configs.find((config) => config.isActive);

      if (activeFromList?.id) {
        try {
          activeConfig = (await api.apiConfigs.get(activeFromList.id)) as ApiConfigRecord;
        } catch {
          activeConfig = null;
        }
      }

      if (!activeConfig) {
        try {
          activeConfig = (await api.apiConfigs.getActive()) as ApiConfigRecord;
        } catch {
          activeConfig = null;
        }
      }

      set({
        ...(activeConfig ? toLlmConfig(activeConfig) : DEFAULT_CONFIG),
        history,
        currentConfigId: activeConfig?.id || activeFromList?.id || null,
      });
    } catch {
      set({
        ...DEFAULT_CONFIG,
        history: [],
        currentConfigId: null,
      });
    }
  },
}));
