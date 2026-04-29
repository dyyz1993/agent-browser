import { ProxyAgent, Agent } from 'undici';
import { fetch } from 'undici';
import { getEffectiveValue } from './rc-config.js';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export class MessageBridge {
  private baseUrl: string;
  private proxyAgent: ProxyAgent | undefined;
  private timeoutAgent: Agent;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.MESSAGE_BRIDGE_URL ||
      (getEffectiveValue('messageBridge.url') as string) ||
      'https://message-bridge.docker.19930810.xyz:8443';

    this.timeoutAgent = new Agent({
      headersTimeout: TWO_HOURS_MS,
      bodyTimeout: TWO_HOURS_MS,
    });

    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy ||
      (getEffectiveValue('messageProxy.url') as string);
    if (proxyUrl) {
      this.proxyAgent = new ProxyAgent({
        uri: proxyUrl,
        headersTimeout: TWO_HOURS_MS,
        bodyTimeout: TWO_HOURS_MS,
      });
    }
  }

  async push(question: string, sessionId?: string): Promise<string> {
    // 尝试解析 question 字符串为 JSON 对象
    let parsedQuestion: unknown;
    try {
      parsedQuestion = JSON.parse(question);
    } catch {
      // 如果解析失败，保持原字符串
      parsedQuestion = question;
    }

    // 构建请求体
    // 如果 parsedQuestion 已经是包含 question 字段的对象，直接使用
    // 否则包装在 question 字段里
    const body =
      typeof parsedQuestion === 'object' && parsedQuestion !== null && 'question' in parsedQuestion
        ? JSON.stringify({
            ...parsedQuestion,
            session_id: sessionId,
          })
        : JSON.stringify({
            question: parsedQuestion,
            session_id: sessionId,
          });

    const response = await fetch(`${this.baseUrl}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      dispatcher: this.proxyAgent || this.timeoutAgent,
    });

    if (!response.ok) {
      throw new Error(`Failed to push question: ${response.statusText}`);
    }

    const data = (await response.json()) as { id: string };
    return data.id;
  }

  async pull(msgId: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/pull/${msgId}`, {
      dispatcher: this.proxyAgent || this.timeoutAgent,
    });

    if (!response.ok) {
      throw new Error(`Failed to pull answer: ${response.statusText}`);
    }

    const data = (await response.json()) as { answer: string };
    return data.answer;
  }

  async ask(question: string, sessionId?: string): Promise<string> {
    const id = await this.push(question, sessionId);
    return await this.pull(id);
  }
}
