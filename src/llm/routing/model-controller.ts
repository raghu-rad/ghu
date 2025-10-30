import type { Agent } from '../../agent/index.js';
import { createLLMClient } from '../index.js';
import { listAvailableModels, resolveModel } from './model-routing.js';

export interface ModelChangeResult {
  success: boolean;
  message: string;
  model?: string;
  provider?: string;
  providerLabel?: string;
}

export class ModelController {
  constructor(private readonly agent: Agent) {}

  getCurrent(): { provider: string; model: string; providerLabel?: string } {
    const config = this.agent.getConfig();
    return {
      provider: config.provider,
      model: config.model,
      providerLabel: config.providerLabel,
    };
  }

  listModels() {
    return listAvailableModels();
  }

  setModel(identifier: string): ModelChangeResult {
    try {
      const resolved = resolveModel(identifier);
      const current = this.agent.getConfig();
      if (current.provider === resolved.provider && current.model === resolved.model) {
        return {
          success: true,
          message: `Already using ${resolved.providerLabel} model "${resolved.model}".`,
          model: resolved.model,
          provider: resolved.provider,
          providerLabel: resolved.providerLabel,
        };
      }

      const llmClient = createLLMClient(resolved.provider, resolved.model, {
        apiKey: resolved.apiKey,
        baseUrl: resolved.baseUrl,
        providerName: resolved.providerLabel,
      });

      this.agent.updateLLM(
        {
          provider: resolved.provider,
          providerLabel: resolved.providerLabel,
          model: resolved.model,
          apiKey: resolved.apiKey,
          baseUrl: resolved.baseUrl,
        },
        llmClient,
      );

      return {
        success: true,
        message: `Switched to ${resolved.providerLabel} model "${resolved.model}".`,
        model: resolved.model,
        provider: resolved.provider,
        providerLabel: resolved.providerLabel,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown model routing error.';
      return {
        success: false,
        message,
      };
    }
  }
}
