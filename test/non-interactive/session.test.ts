import { afterAll, beforeEach, describe, expect, it } from 'vitest';

import { runNonInteractiveSession } from '../../src/non-interactive/index.js';

const originalDeepseekKey = process.env.DEEPSEEK_API_KEY;

beforeEach(() => {
  delete process.env.DEEPSEEK_API_KEY;
});

afterAll(() => {
  if (typeof originalDeepseekKey === 'string') {
    process.env.DEEPSEEK_API_KEY = originalDeepseekKey;
  } else {
    delete process.env.DEEPSEEK_API_KEY;
  }
});

describe('runNonInteractiveSession', () => {
  it('falls back to the mock provider when credentials are missing', async () => {
    const result = await runNonInteractiveSession({
      prompt: 'Say hello',
    });

    expect(result.error).toBeUndefined();
    expect(result.output).toContain('[mock:mock-alpha]');
    expect(result.warnings[0]).toContain('Falling back to mock-alpha');
  });

  it('reports an error when prompt is empty', async () => {
    const result = await runNonInteractiveSession({
      prompt: '',
    });

    expect(result.error).toContain('non-empty prompt');
  });

  it('requires --model when --provider is specified', async () => {
    const result = await runNonInteractiveSession({
      prompt: 'Hello',
      provider: 'mock',
    });

    expect(result.error).toContain('--model');
  });
});
