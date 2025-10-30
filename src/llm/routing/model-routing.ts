import { MODEL_REGISTRY, type ModelPreset, type ProviderConfig } from './model-registry.js';
import type { ProviderId } from './providers.js';

export interface ResolvedModel {
  identifier: string;
  provider: ProviderId;
  providerLabel: string;
  model: string;
  apiKey?: string;
  baseUrl?: string;
}

export interface ResolveModelOptions {
  requireCredentials?: boolean;
}

const PROVIDERS = new Map<ProviderId, ProviderConfig>(
  MODEL_REGISTRY.providers.map((config) => [config.id, config]),
);

const MODEL_PRESETS = MODEL_REGISTRY.models;
const MODEL_PRESET_LOOKUP = new Map(MODEL_PRESETS.map((preset) => [preset.id, preset]));

export function listAvailableModels(): (ModelPreset & { providerLabel: string })[] {
  return MODEL_PRESETS.map((preset) => ({
    ...preset,
    providerLabel: PROVIDERS.get(preset.provider)?.label ?? preset.provider,
  }));
}

export function resolveModel(identifier: string, options: ResolveModelOptions = {}): ResolvedModel {
  const trimmed = identifier.trim();
  if (!trimmed) {
    throw new Error('Model identifier cannot be empty.');
  }

  const parsed = parseIdentifier(trimmed);
  const modelPreset = parsed.model ? MODEL_PRESET_LOOKUP.get(parsed.model) : undefined;

  const providerId = parsed.provider ?? modelPreset?.provider;
  if (!providerId) {
    throw new Error(
      `Unable to determine provider for model "${identifier}". Use "provider/model" syntax or pick from the known models list.`,
    );
  }

  const providerConfig = PROVIDERS.get(providerId);
  if (!providerConfig) {
    throw new Error(`Unsupported provider "${providerId}".`);
  }

  const model = parsed.model ?? modelPreset?.id;
  if (!model) {
    throw new Error(`Model identifier "${identifier}" is not recognized.`);
  }

  const apiKey = providerConfig.apiKeyEnv ? process.env[providerConfig.apiKeyEnv] : undefined;
  const baseUrlEnv = providerConfig.baseUrlEnv ? process.env[providerConfig.baseUrlEnv] : undefined;
  const baseUrl = baseUrlEnv ?? providerConfig.defaultBaseUrl;

  if (providerConfig.requiresApiKey && !apiKey && options.requireCredentials !== false) {
    const envName = providerConfig.apiKeyEnv ?? `${providerConfig.id.toUpperCase()}_API_KEY`;
    throw new Error(
      `${envName} environment variable is required to use the ${providerConfig.label} provider.`,
    );
  }

  return {
    identifier: `${providerId}/${model}`,
    provider: providerId,
    providerLabel: providerConfig.label,
    model,
    apiKey,
    baseUrl,
  };
}

export function describeModel(identifier: string): string | undefined {
  const preset = MODEL_PRESET_LOOKUP.get(identifier);
  return preset?.description;
}

export function inferDefaultModel(): string {
  const firstModel = MODEL_PRESETS[0];
  return firstModel ? firstModel.id : 'mock-alpha';
}

function parseIdentifier(input: string): { provider?: ProviderId; model?: string } {
  const slashIndex = input.indexOf('/');
  if (slashIndex !== -1) {
    const providerCandidate = input.slice(0, slashIndex).toLowerCase() as ProviderId;
    const modelPart = input.slice(slashIndex + 1);
    return {
      provider: providerCandidate,
      model: modelPart || undefined,
    };
  }

  const colonIndex = input.indexOf(':');
  if (colonIndex !== -1) {
    const providerCandidate = input.slice(0, colonIndex).toLowerCase() as ProviderId;
    const modelPart = input.slice(colonIndex + 1);
    return {
      provider: providerCandidate,
      model: modelPart || undefined,
    };
  }

  return {
    model: input,
  };
}
