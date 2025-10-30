import { describe, expect, it } from 'vitest';

import { InteractiveApprovalProvider } from '../../src/ui/interactive-approval-provider.js';

const mockRequest = {
  command: 'curl https://example.com',
  analysis: {
    command: 'curl https://example.com',
    sanitizedCommand: 'curl https://example.com',
    tokens: ['curl', 'https://example.com'],
    risk: {
      level: 'external',
      reasons: ['network'],
    },
  },
  sandbox: {},
} as const;

describe('InteractiveApprovalProvider', () => {
  it('emits requests and resolves allow-once decisions', async () => {
    const provider = new InteractiveApprovalProvider();
    let capturedId: string | undefined;

    provider.onRequest((event) => {
      capturedId = event.id;
    });

    const resultPromise = provider.requestApproval(mockRequest);

    const requestId = capturedId as string;
    expect(requestId).toBeDefined();

    const resolvedPromise = new Promise((resolve) => {
      provider.onResolved((event) => {
        if (event.id === requestId) {
          resolve(event);
        }
      });
    });

    const responded = provider.respond(requestId, { type: 'allow', scope: 'once' });
    expect(responded).toBe(true);

    const resolution = (await resolvedPromise) as {
      result: { decision: string; scope?: string };
    };
    const result = await resultPromise;

    expect(result.decision).toBe('allow');
    expect(result.scope).toBe('once');
    expect(resolution.result.decision).toBe('allow');
    expect(resolution.result.scope).toBe('once');
  });

  it('caches approvals for the session scope', async () => {
    const provider = new InteractiveApprovalProvider();
    let requestId: string | undefined;

    provider.onRequest((event) => {
      requestId = event.id;
    });

    const first = provider.requestApproval(mockRequest);
    provider.respond(requestId as string, { type: 'allow', scope: 'session' });
    const firstResult = await first;

    expect(firstResult.decision).toBe('allow');
    expect(firstResult.scope).toBe('session');

    const second = await provider.requestApproval(mockRequest);
    expect(second.decision).toBe('allow');
    expect(second.scope).toBe('session');
  });

  it('returns denial when rejected', async () => {
    const provider = new InteractiveApprovalProvider();
    let requestId: string | undefined;

    provider.onRequest((event) => {
      requestId = event.id;
    });

    const pending = provider.requestApproval(mockRequest);
    provider.respond(requestId as string, { type: 'deny', reason: 'Denied in test' });

    const result = await pending;
    expect(result.decision).toBe('deny');
    expect(result.reason).toBe('Denied in test');
  });
});
