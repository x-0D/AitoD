import { streamText as _streamText, convertToCoreMessages } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { MAX_TOKENS } from './constants';
import type { LLM } from './llm-interface.ts';
import type { Prompts } from './prompts-interface';
import type { Message, Messages, StreamingOptions } from './llm-interface';
import { OpenAIPrompts } from './openai-prompts';

export class OpenAILLM implements LLM {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  private apiKey: string = '';

  setApiKey(apiKey: string) {
    this.apiKey = apiKey;
  }

  streamText(messages: Messages, env: Env, options?: StreamingOptions) {
    if (!this.apiKey) {
      try {
        this.apiKey = env.OPENAI_API_KEY;
      } catch {
        throw new Error('API key is not set for OpenAILLM');
      }
    }

    const openai = createOpenAI({
      baseURL: env.OPENAI_BASE_URL || undefined,
      apiKey: env.OPENAI_API_KEY || undefined,
      compatibility: 'compatible',
    });
    console.log('openai:', openai);
    // eslint-disable-next-line @typescript-eslint/naming-convention
    type model_name_t = 'gpt-4o' | 'gpt-4o-mini' | 'o1-mini' | 'o1-preview';

    // eslint-disable-next-line @typescript-eslint/naming-convention
    const model_name = env.OPENAI_MODEL as model_name_t;
    console.log('model_name:', model_name);

    const model = openai(model_name);

    const o1sysmessage: Message = {
      role: 'user',
      content: this.getPrompts().getSystemPrompt(),
    };

    if (model_name === 'o1-mini' || model_name === 'o1-preview') {
      return _streamText({
        model,
        messages: [o1sysmessage, ...convertToCoreMessages(messages)],
        ...options,
      });
    } else {
      return _streamText({
        model,
        system: this.getPrompts().getSystemPrompt(),
        messages: [o1sysmessage, ...convertToCoreMessages(messages)],
        maxTokens: MAX_TOKENS,
        ...options,
      });
    }
  }

  getPrompts(): Prompts {
    return new OpenAIPrompts();
  }
}
