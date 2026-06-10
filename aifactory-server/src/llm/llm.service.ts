import { Injectable, BadRequestException } from '@nestjs/common';
import { LlmChatDto, LlmApiType } from './dto/chat.dto';

@Injectable()
export class LlmService {
  async chat(dto: LlmChatDto): Promise<{ content: string; tokensUsed: number }> {
    switch (dto.apiType) {
      case LlmApiType.OPENAI:
        return this.callOpenAi(dto);
      case LlmApiType.CLAUDE:
        return this.callClaude(dto);
      default:
        throw new BadRequestException(`Unsupported API type: ${dto.apiType}`);
    }
  }

  private async callOpenAi(dto: LlmChatDto): Promise<{ content: string; tokensUsed: number }> {
    const url = `${dto.apiUrl.replace(/\/+$/, '')}/chat/completions`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${dto.apiKey}`,
      },
      body: JSON.stringify({
        model: dto.modelName,
        messages: dto.messages,
        max_tokens: dto.maxTokens || 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`OpenAI API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      content: data.choices?.[0]?.message?.content || '',
      tokensUsed: data.usage?.total_tokens || 0,
    };
  }

  private async callClaude(dto: LlmChatDto): Promise<{ content: string; tokensUsed: number }> {
    const url = `${dto.apiUrl.replace(/\/+$/, '')}/messages`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': dto.apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: dto.modelName,
        messages: dto.messages,
        max_tokens: dto.maxTokens || 4096,
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new BadRequestException(`Claude API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    return {
      content: data.content?.[0]?.text || '',
      tokensUsed: (data.usage?.input_tokens || 0) + (data.usage?.output_tokens || 0),
    };
  }
}
