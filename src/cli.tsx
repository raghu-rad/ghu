import React from 'react';
import { Command } from 'commander';
import { render } from 'ink';

import { Agent } from './agent/index.js';
import { loadConfig } from './config/index.js';
import { createLLMClient } from './llm/index.js';
import { ModelController } from './llm/routing/model-controller.js';
import { resolveModel } from './llm/routing/model-routing.js';
import { PromptBuilder } from './prompt/builder.js';
import { runNonInteractiveSession } from './non-interactive/index.js';
import { createDefaultToolRegistry } from './tools/index.js';
import { App, InteractiveApprovalProvider } from './ui/index.js';
import packageJson from '../package.json' with { type: 'json' };

interface CliOptions {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  listTools?: boolean;
  yolo?: boolean;
  prompt?: string;
  nonInteractive?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('ghu')
    .description('Ghu, a modular terminal agent CLI.')
    .version(packageJson.version ?? '0.0.0')
    .option('-p, --provider <provider>', 'LLM provider override')
    .option('-m, --model <model>', 'Model name override')
    .option('-s, --system-prompt <prompt>', 'Custom system prompt')
    .option('--prompt <prompt>', 'Prompt to execute in non-interactive mode')
    .option('--non-interactive', 'Run once without launching the interactive UI')
    .option('--list-tools', 'List available tools and exit')
    .option('--yolo', 'Skip shell approvals (YOLO mode)');

  program.parse(process.argv);

  const options = program.opts<CliOptions>();
  if (options.nonInteractive) {
    await runNonInteractiveMode(options);
    return;
  }

  const baseConfig = loadConfig();
  const config = {
    ...baseConfig,
    systemPrompt: options.systemPrompt ?? baseConfig.systemPrompt,
  };

  const initializationWarnings: string[] = [];
  let providerLabel = baseConfig.providerLabel;

  let modelOverrideIdentifier: string | undefined;
  try {
    modelOverrideIdentifier = resolveModelOverrideIdentifier(options);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  if (modelOverrideIdentifier) {
    const resolvedOverride = resolveModel(modelOverrideIdentifier, { requireCredentials: false });
    config.provider = resolvedOverride.provider;
    config.model = resolvedOverride.model;
    config.apiKey = resolvedOverride.apiKey;
    config.baseUrl = resolvedOverride.baseUrl;
    providerLabel = resolvedOverride.providerLabel;
  }
  config.providerLabel = providerLabel;

  const approvalProvider = new InteractiveApprovalProvider();
  let agentRef: Agent | undefined;
  const toolRegistry = createDefaultToolRegistry({
    shell: {
      approvalProvider,
      timeoutMs: 2 * 60 * 1000,
      shouldSkipApproval: () => agentRef?.isYoloMode() ?? false,
    },
  });

  if (options.listTools) {
    const tools = toolRegistry.list();
    if (tools.length === 0) {
      console.log('No tools registered yet.');
    } else {
      tools.forEach((tool) => {
        console.log(`- ${tool.name}: ${tool.description}`);
      });
    }
    return;
  }

  let llmClient;
  try {
    llmClient = createLLMClient(config.provider, config.model, {
      apiKey: config.apiKey,
      baseUrl: config.baseUrl,
      providerName: providerLabel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!modelOverrideIdentifier && message.includes('_API_KEY')) {
      initializationWarnings.push(
        `${message} Starting with mock-alpha until you configure credentials. Use /model to switch providers.`,
      );
      config.provider = 'mock';
      config.providerLabel = 'Mock';
      config.model = 'mock-alpha';
      config.apiKey = undefined;
      config.baseUrl = undefined;
      providerLabel = 'Mock';
      llmClient = createLLMClient(config.provider, config.model, {
        providerName: providerLabel,
      });
    } else {
      throw error;
    }
  }
  const agent = new Agent({
    config,
    llmClient,
    promptBuilder: new PromptBuilder(),
    toolRegistry,
    maxIterations: 100,
    yoloMode: Boolean(options.yolo),
  });
  agentRef = agent;
  const modelController = new ModelController(agent);

  const { waitUntilExit } = render(
    <App
      agent={agent}
      approvalProvider={approvalProvider}
      modelController={modelController}
      initializationWarnings={initializationWarnings}
    />,
  );
  await waitUntilExit();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

async function runNonInteractiveMode(options: CliOptions): Promise<void> {
  if (options.listTools) {
    console.error('Listing tools is not available in non-interactive mode.');
    process.exitCode = 1;
    return;
  }

  if (!options.prompt) {
    console.error('Non-interactive mode requires --prompt <prompt>.');
    process.exitCode = 1;
    return;
  }

  const result = await runNonInteractiveSession({
    prompt: options.prompt,
    provider: options.provider,
    model: options.model,
    systemPrompt: options.systemPrompt,
  });

  result.warnings.forEach((warning) => {
    console.warn(warning);
  });

  if (result.error) {
    console.error(result.error);
    process.exitCode = 1;
    return;
  }

  if (typeof result.output === 'string') {
    console.log(result.output);
  }
}

function resolveModelOverrideIdentifier(options: CliOptions): string | undefined {
  const provider = normalizeOption(options.provider);
  const model = normalizeOption(options.model);

  if (provider && !model) {
    throw new Error('--provider requires --model to be specified.');
  }

  if (provider && model) {
    return `${provider}/${model}`;
  }

  if (model) {
    return model;
  }

  return undefined;
}

function normalizeOption(value?: string): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}
