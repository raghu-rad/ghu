import { Agent } from '../agent/index.js';
import { type AgentConfig, loadConfig } from '../config/index.js';
import { createLLMClient } from '../llm/index.js';
import { resolveModel, type ResolvedModel } from '../llm/routing/model-routing.js';
import { PromptBuilder } from '../prompt/builder.js';
import { createDefaultToolRegistry } from '../tools/index.js';

export interface NonInteractiveSessionOptions {
  prompt: string;
  provider?: string;
  model?: string;
  systemPrompt?: string;
}

export interface NonInteractiveSessionResult {
  output?: string;
  error?: string;
  warnings: string[];
}

const DEFAULT_PROVIDER = 'deepseek';
const DEFAULT_MODEL = 'deepseek-chat';
const SHELL_TIMEOUT_MS = 2 * 60 * 1000;

export async function runNonInteractiveSession(
  options: NonInteractiveSessionOptions,
): Promise<NonInteractiveSessionResult> {
  const warnings: string[] = [];
  const prompt = options.prompt?.trim();

  if (!prompt) {
    return {
      error: 'Non-interactive mode requires a non-empty prompt (--prompt).',
      warnings,
    };
  }

  const baseConfig = loadConfig();
  const agentConfig: AgentConfig = {
    ...baseConfig,
    systemPrompt: options.systemPrompt ?? baseConfig.systemPrompt,
  };

  let modelResolution: ResolvedModelResult;
  try {
    modelResolution = resolveSessionModel(options);
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : String(error),
      warnings,
    };
  }

  applyResolvedModel(agentConfig, modelResolution.resolvedModel);

  let llmClient;
  try {
    llmClient = createLLMClient(agentConfig.provider, agentConfig.model, {
      apiKey: agentConfig.apiKey,
      baseUrl: agentConfig.baseUrl,
      providerName: agentConfig.providerLabel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!modelResolution.userProvided && message.includes('_API_KEY')) {
      warnings.push(
        `${message} Falling back to mock-alpha until you configure credentials or pass --provider/--model.`,
      );

      agentConfig.provider = 'mock';
      agentConfig.providerLabel = 'Mock';
      agentConfig.model = 'mock-alpha';
      agentConfig.apiKey = undefined;
      agentConfig.baseUrl = undefined;
      llmClient = createLLMClient(agentConfig.provider, agentConfig.model, {
        providerName: agentConfig.providerLabel,
      });
    } else {
      return {
        error: message,
        warnings,
      };
    }
  }

  const agent = new Agent({
    config: agentConfig,
    llmClient,
    promptBuilder: new PromptBuilder(),
    toolRegistry: createDefaultToolRegistry({
      includeShell: true,
      includeReadFile: true,
      includeReadFiles: true,
      includeWriteFile: true,
      shell: {
        timeoutMs: SHELL_TIMEOUT_MS,
        shouldSkipApproval: () => true,
      },
    }),
    maxIterations: 100,
    yoloMode: true,
  });

  const result = await agent.processUserMessage(prompt);

  if (result.error) {
    return {
      error: result.error,
      warnings,
    };
  }

  if (!result.assistant || !result.assistant.content) {
    return {
      error: 'Agent completed without a final response.',
      warnings,
    };
  }

  return {
    output: result.assistant.content,
    warnings,
  };
}

interface ResolvedModelResult {
  resolvedModel: ResolvedModel;
  userProvided: boolean;
}

function resolveSessionModel(options: NonInteractiveSessionOptions): ResolvedModelResult {
  const provider = normalize(options.provider);
  const model = normalize(options.model);
  const userProvided = Boolean(provider ?? model);

  let identifier: string;

  if (provider && !model) {
    throw new Error('Non-interactive mode requires --model whenever --provider is specified.');
  }

  if (provider && model) {
    identifier = `${provider}/${model}`;
  } else if (model) {
    identifier = model;
  } else {
    identifier = `${DEFAULT_PROVIDER}/${DEFAULT_MODEL}`;
  }

  const resolvedModel = resolveModel(identifier, { requireCredentials: false });

  return { resolvedModel, userProvided };
}

function applyResolvedModel(config: AgentConfig, resolved: ResolvedModel): void {
  config.provider = resolved.provider;
  config.providerLabel = resolved.providerLabel;
  config.model = resolved.model;
  config.apiKey = resolved.apiKey;
  config.baseUrl = resolved.baseUrl;
}

function normalize(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
