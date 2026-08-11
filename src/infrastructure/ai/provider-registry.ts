import { env } from "@/core/config/env";
import type { AIProvider } from "@/infrastructure/ai/ai-provider";
import { TyphoonProvider } from "@/infrastructure/ai/providers/typhoon-provider";

const providers = new Map<string, AIProvider>([
  ["typhoon", new TyphoonProvider()],
]);

export function getAIProvider(providerName = env.DEFAULT_AI_PROVIDER): AIProvider {
  const provider = providers.get(providerName);
  if (!provider) throw new Error(`Unsupported AI provider: ${providerName}`);
  return provider;
}
