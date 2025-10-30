#!/usr/bin/env node
import React from 'react';
import { Command } from 'commander';
import { render } from 'ink';

import { Agent } from './agent/index.js';
import { loadConfig } from './config/index.js';
import { createLLMClient } from './llm/index.js';
import { PromptBuilder } from './prompt/builder.js';
import { createDefaultToolRegistry } from './tools/index.js';
import { App } from './ui/app.js';
import { InteractiveApprovalProvider } from './ui/interactive-approval-provider.js';
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
    provider: options.provider ?? baseConfig.provider,
    model: options.model ?? baseConfig.model,
    systemPrompt: options.systemPrompt ?? baseConfig.systemPrompt,
  };

  const approvalProvider = new InteractiveApprovalProvider();
  const toolRegistry = createDefaultToolRegistry({
    shell: {
      approvalProvider,
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

  const llmClient = createLLMClient(config.provider, config.model, {
    apiKey: config.apiKey,
    baseUrl: config.baseUrl,
  });
  const agent = new Agent({
    config,
    llmClient,
    promptBuilder: new PromptBuilder(),
    toolRegistry,
    maxIterations: 10,
  });

  const leaveAlternateScreen = enterAlternateScreen();
  try {
    const { waitUntilExit } = render(<App agent={agent} approvalProvider={approvalProvider} />);
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
