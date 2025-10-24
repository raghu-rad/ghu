#!/usr/bin/env node
import { Command } from 'commander';

import { Agent } from './agent/index.js';
import { loadConfig } from './config/index.js';
import { createLLMClient } from './llm/index.js';
import { PromptBuilder } from './prompt/builder.js';
import { createDefaultToolRegistry } from './tools/index.js';
import packageJson from '../package.json' assert { type: 'json' };

interface CliOptions {
  provider?: string;
  model?: string;
  systemPrompt?: string;
  listTools?: boolean;
}

async function main(): Promise<void> {
  const program = new Command();

  program
    .name('ragent')
    .description('A modular terminal agent CLI.')
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

  const toolRegistry = createDefaultToolRegistry();

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

  const llmClient = createLLMClient(config.provider, config.model);
  const agent = new Agent({
    config,
    llmClient,
    promptBuilder: new PromptBuilder(),
  });

  await agent.run();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
