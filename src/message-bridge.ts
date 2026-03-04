import { ProxyAgent, Agent } from 'undici';
import { fetch } from 'undici';

const TWO_HOURS_MS = 2 * 60 * 60 * 1000;

export class MessageBridge {
  private baseUrl: string;
  private proxyAgent: ProxyAgent | undefined;
  private timeoutAgent: Agent;

  constructor(baseUrl?: string) {
    this.baseUrl =
      baseUrl ||
      process.env.MESSAGE_BRIDGE_URL ||
      'https://message-bridge.docker.19930810.xyz:8443';

    this.timeoutAgent = new Agent({
      headersTimeout: TWO_HOURS_MS,
      bodyTimeout: TWO_HOURS_MS,
    });

    const proxyUrl =
      process.env.HTTPS_PROXY ||
      process.env.https_proxy ||
      process.env.HTTP_PROXY ||
      process.env.http_proxy;
    if (proxyUrl) {
      this.proxyAgent = new ProxyAgent({
        uri: proxyUrl,
        headersTimeout: TWO_HOURS_MS,
        bodyTimeout: TWO_HOURS_MS,
      });
    }
  }

  async push(question: string, sessionId?: string): Promise<string> {
    const response = await fetch(`${this.baseUrl}/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        session_id: sessionId,
      }),
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
