import { api } from './api';
import { useLlmStore } from '../store/llm';

export async function callLlm(
  messages: { role: string; content: string }[],
  maxTokens?: number,
): Promise<{ content: string; tokensUsed: number }> {
  const { apiUrl, apiKey, modelName, apiType } = useLlmStore.getState();

  if (!apiUrl || !apiKey || !modelName) {
    throw new Error('LLM not configured');
  }

  return api.llm.chat({
    messages,
    apiUrl,
    apiKey,
    modelName,
    apiType,
    maxTokens,
  });
}
