/**
 * LLM Gateway — abstraction over LLM providers.
 * Tracks every call through the Logger for full transparency.
 */

import { Logger, getLogger, LLMCallLog } from './logger';

export interface LLMRequest {
  system: string;
  prompt: string;
  temperature?: number;
  max_tokens?: number;
}

export interface LLMResponse {
  content: string;
  usage?: { input_tokens: number; output_tokens: number };
}

export interface LLMGatewayConfig {
  provider: string;
  model: string;
  api_key?: string;
  base_url?: string;
  mode: 'strict' | 'balanced' | 'creative';
}

const MODE_TEMPERATURES: Record<string, number> = {
  strict: 0.1,
  balanced: 0.4,
  creative: 0.7,
};

export class LLMGateway {
  private config: LLMGatewayConfig;
  protected logger: Logger;
  protected _currentStage: string = '';
  private _callHistory: Array<{ request: LLMRequest; response: LLMResponse; purpose: string }> = [];

  constructor(config: LLMGatewayConfig, logger?: Logger) {
    this.config = config;
    this.logger = logger || getLogger();
  }

  /** Set current stage name for logging context */
  setStage(stage: string): void {
    this._currentStage = stage;
  }

  /** Get full call history (useful for tests) */
  getCallHistory(): Array<{ request: LLMRequest; response: LLMResponse; purpose: string }> {
    return [...this._callHistory];
  }

  async call(request: LLMRequest, purpose: string = 'LLM call', role: LLMCallLog['role'] = 'generator'): Promise<LLMResponse> {
    const temperature = request.temperature ?? MODE_TEMPERATURES[this.config.mode] ?? 0.4;
    const max_tokens = request.max_tokens ?? 32000;

    const callNum = this.logger.llmCallStart(this._currentStage, purpose, role);

    try {
      let response: LLMResponse;

      if (this.config.provider === 'anthropic') {
        response = await this.callAnthropic(request, temperature, max_tokens);
      } else if (this.config.provider === 'openai') {
        response = await this.callOpenAI(request, temperature, max_tokens);
      } else {
        throw new Error(`Unsupported provider: ${this.config.provider}`);
      }

      this.logger.llmCallEnd(callNum, response.usage?.input_tokens, response.usage?.output_tokens);
      this._callHistory.push({ request, response, purpose });
      return response;
    } catch (error: any) {
      this.logger.llmCallFail(callNum, error.message);
      throw error;
    }
  }

  async callJSON<T>(request: LLMRequest, purpose: string = 'LLM JSON call', role: LLMCallLog['role'] = 'generator'): Promise<T> {
    const response = await this.call(
      {
        ...request,
        prompt: request.prompt + '\n\nRespond ONLY with valid JSON. No markdown fences, no explanation.',
      },
      purpose,
      role,
    );
    return this.parseJSON<T>(response.content);
  }

  private parseJSON<T>(content: string): T {
    let cleaned = content.trim();
    if (cleaned.startsWith('```')) {
      cleaned = cleaned.replace(/^```(?:json)?\s*\n?/, '').replace(/\n?```\s*$/, '');
    }
    try {
      return JSON.parse(cleaned) as T;
    } catch {
      const match = cleaned.match(/\{[\s\S]*\}/);
      if (match) {
        return JSON.parse(match[0]) as T;
      }
      const arrMatch = cleaned.match(/\[[\s\S]*\]/);
      if (arrMatch) {
        return JSON.parse(arrMatch[0]) as T;
      }
      throw new Error(`Failed to parse LLM response as JSON: ${cleaned.substring(0, 200)}`);
    }
  }

  private async callAnthropic(request: LLMRequest, temperature: number, max_tokens: number): Promise<LLMResponse> {
    const apiKey = this.config.api_key || process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY not set');

    const baseUrl = this.config.base_url || 'https://api.anthropic.com';
    const resp = await fetch(`${baseUrl}/v1/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens,
        temperature,
        system: request.system,
        messages: [{ role: 'user', content: request.prompt }],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`Anthropic API error ${resp.status}: ${body}`);
    }

    const data = await resp.json() as any;
    return {
      content: data.content?.[0]?.text ?? '',
      usage: data.usage ? { input_tokens: data.usage.input_tokens, output_tokens: data.usage.output_tokens } : undefined,
    };
  }

  private async callOpenAI(request: LLMRequest, temperature: number, max_tokens: number): Promise<LLMResponse> {
    const apiKey = this.config.api_key || process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY not set');

    const baseUrl = this.config.base_url || 'https://api.openai.com';
    const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        max_completion_tokens: max_tokens,
        temperature,
        messages: [
          { role: 'system', content: request.system },
          { role: 'user', content: request.prompt },
        ],
      }),
    });

    if (!resp.ok) {
      const body = await resp.text();
      throw new Error(`OpenAI API error ${resp.status}: ${body}`);
    }

    const data = await resp.json() as any;
    return {
      content: data.choices?.[0]?.message?.content ?? '',
      usage: data.usage ? { input_tokens: data.usage.prompt_tokens, output_tokens: data.usage.completion_tokens } : undefined,
    };
  }
}
