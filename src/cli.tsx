import React from 'react';
import { Command } from 'commander';
import { render } from 'ink';

import { Agent } from './agent/index.js';
import { loadConfig } from './config/index.js';
import { createLLMClient } from './llm/index.js';
import { ModelController } from './llm/routing/model-controller.js';
import { resolveModel } from './llm/routing/model-routing.js';
import { PromptBuilder } from './prompt/builder.js';
import { createDefaultToolRegistry } from './tools/index.js';
import { App, InteractiveApprovalProvider } from './ui/index.js';
import packageJson from '../package.json' with { type: 'json' };

interface CliOptions {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  listTools?: boolean;
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
    .option('--list-tools', 'List available tools and exit');

  program.parse(process.argv);

  const options = program.opts<CliOptions>();
  const baseConfig = loadConfig();
  const config = {
    ...baseConfig,
    systemPrompt: options.systemPrompt ?? baseConfig.systemPrompt,
  };

  const initializationWarnings: string[] = [];
  let providerLabel = baseConfig.providerLabel;

  if (options.model) {
    const resolvedOverride = resolveModel(options.model, { requireCredentials: false });
    config.provider = resolvedOverride.provider;
    config.model = resolvedOverride.model;
    config.apiKey = resolvedOverride.apiKey;
    config.baseUrl = resolvedOverride.baseUrl;
    providerLabel = resolvedOverride.providerLabel;
  }
  config.providerLabel = providerLabel;

  const approvalProvider = new InteractiveApprovalProvider();
  const toolRegistry = createDefaultToolRegistry({
    shell: {
      approvalProvider,
      timeoutMs: 2 * 60 * 1000,
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
    if (!options.model && message.includes('_API_KEY')) {
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
  });
  const modelController = new ModelController(agent);

  const leaveAlternateScreen = enterAlternateScreen();
  try {
    const { waitUntilExit } = render(
      <App
        agent={agent}
        approvalProvider={approvalProvider}
        modelController={modelController}
        initializationWarnings={initializationWarnings}
      />,
    );
    await waitUntilExit();
  } finally {
    leaveAlternateScreen();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

function enterAlternateScreen(): () => void {
  if (!process.stdout.isTTY) {
    return () => {};
  }

  process.stdout.write('\u001b[?1049h\u001b[H');
  return () => {
    process.stdout.write('\u001b[?1049l');
  };
}
