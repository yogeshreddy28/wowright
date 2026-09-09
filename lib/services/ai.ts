export interface AIProvider {
  generate(input: AIInput): Promise<string>;
  stream?(input: AIInput): AsyncIterable<string>;
  healthCheck(): Promise<boolean>;
}

export type AIInput = {
  message: string;
  context: {
    path?: string;
    product?: unknown;
    cart?: unknown;
    history?: unknown[];
  };
};

export type ProviderConfig = {
  provider: string;
  model: string;
  apiKey?: string;
};

export const SHOPPING_ASSISTANT_PROMPT = `You are WOW Companion, the warm shopping guide inside WOW RIGHT. You work through the WOW Assistant conversation system. Help customers confidently discover, choose, customize and order personalized 3D printed products. Be concise, friendly and useful. Ask one clear question at a time. Never pressure the customer. Never invent prices, availability, dimensions, material claims, delivery promises, payment state or policies. Business facts and calculations must come from trusted backend tools. Never change order or payment status. Never add an item without the customer's explicit confirmation. When the customer is ready, stop unnecessary conversation and guide them to the required product choices, cart and canonical checkout. If the request needs design review or a custom quote, collect a useful brief without promising feasibility or price. Offer a context-preserving WhatsApp human handoff whenever requested.`;

export class UnavailableProvider implements AIProvider {
  async generate(_input: AIInput): Promise<string> {
    throw new Error('AI_UNAVAILABLE');
  }
  async healthCheck() {
    return false;
  }
}

export class OpenAICompatibleProvider implements AIProvider {
  constructor(
    private key: string,
    private model: string,
    private fetcher: typeof fetch = fetch,
  ) {}

  async healthCheck() {
    return Boolean(this.key);
  }

  async generate(input: AIInput) {
    try {
      const response = await this.fetcher(
        'https://api.openai.com/v1/responses',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${this.key}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: this.model,
            instructions: SHOPPING_ASSISTANT_PROMPT,
            input: JSON.stringify(input),
          }),
        },
      );
      if (!response.ok) throw new Error('AI_PROVIDER_ERROR');
      const json = (await response.json()) as {
        output_text?: string;
        output?: Array<{
          content?: Array<{ type?: string; text?: string }>;
        }>;
      };
      const outputText =
        json.output_text ||
        json.output
          ?.flatMap((item) => item.content || [])
          .find((item) => item.type === 'output_text')?.text;
      return outputText || 'I’m sorry, I could not complete that response.';
    } catch {
      throw new Error('AI_PROVIDER_ERROR');
    }
  }
}

export function createAIProvider(
  config: ProviderConfig,
  fetcher: typeof fetch = fetch,
): AIProvider {
  if (config.provider === 'openai' && config.apiKey)
    return new OpenAICompatibleProvider(config.apiKey, config.model, fetcher);
  return new UnavailableProvider();
}

export const AI_UNAVAILABLE_MESSAGE =
  'AI assistant is currently unavailable. You can continue shopping or contact us on WhatsApp.';
