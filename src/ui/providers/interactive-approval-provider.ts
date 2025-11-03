import { EventEmitter } from 'node:events';

import type {
  ShellToolApprovalProvider,
  ShellToolApprovalRequest,
  ShellToolApprovalResult,
  ShellToolApprovalScope,
} from '../../tools/shell/approvals.js';

export type InteractiveApprovalDecision =
  | { type: 'allow'; scope: ShellToolApprovalScope }
  | { type: 'deny'; reason?: string };

export interface InteractiveApprovalRequestEvent {
  id: string;
  request: ShellToolApprovalRequest;
  createdAt: Date;
}

export interface InteractiveApprovalResolutionEvent {
  id: string;
  decision: InteractiveApprovalDecision;
  result: ShellToolApprovalResult;
  resolvedAt: Date;
}

interface PendingApproval {
  request: ShellToolApprovalRequest;
  resolve: (result: ShellToolApprovalResult) => void;
  cacheKey: string;
}

const REQUEST_EVENT = 'request';
const RESOLVED_EVENT = 'resolved';

let approvalCounter = 0;

export class InteractiveApprovalProvider
  extends EventEmitter
  implements ShellToolApprovalProvider
{
  private readonly pending = new Map<string, PendingApproval>();
  private readonly approvedCommands = new Set<string>();

  async requestApproval(request: ShellToolApprovalRequest): Promise<ShellToolApprovalResult> {
    const cacheKey = this.buildCacheKey(request);
    if (this.approvedCommands.has(cacheKey)) {
      return {
        decision: 'allow',
        scope: 'session',
      };
    }

    const id = this.nextId();
    return new Promise<ShellToolApprovalResult>((resolve) => {
      this.pending.set(id, {
        request,
        resolve,
        cacheKey,
      });

      this.emit(REQUEST_EVENT, {
        id,
        request,
        createdAt: new Date(),
      } satisfies InteractiveApprovalRequestEvent);
    });
  }

  respond(requestId: string, decision: InteractiveApprovalDecision): boolean {
    const entry = this.pending.get(requestId);
    if (!entry) {
      return false;
    }

    this.pending.delete(requestId);
    const result = this.mapDecision(entry, decision);

    if (decision.type === 'allow' && decision.scope === 'session') {
      this.approvedCommands.add(entry.cacheKey);
    }

    entry.resolve(result);

    this.emit(RESOLVED_EVENT, {
      id: requestId,
      decision,
      result,
      resolvedAt: new Date(),
    } satisfies InteractiveApprovalResolutionEvent);

    return true;
  }

  cancel(requestId: string, reason?: string): boolean {
    return this.respond(requestId, { type: 'deny', reason: reason ?? 'Cancelled' });
  }

  cancelAll(reason?: string): void {
    const ids = Array.from(this.pending.keys());
    ids.forEach((id) => {
      this.cancel(id, reason);
    });
  }

  resetSession(): void {
    this.approvedCommands.clear();
  }

  onRequest(
    listener: (event: InteractiveApprovalRequestEvent) => void,
  ): () => void {
    this.on(REQUEST_EVENT, listener);
    return () => {
      this.off(REQUEST_EVENT, listener);
    };
  }

  onResolved(
    listener: (event: InteractiveApprovalResolutionEvent) => void,
  ): () => void {
    this.on(RESOLVED_EVENT, listener);
    return () => {
      this.off(RESOLVED_EVENT, listener);
    };
  }

  private mapDecision(
    entry: PendingApproval,
    decision: InteractiveApprovalDecision,
  ): ShellToolApprovalResult {
    if (decision.type === 'allow') {
      return {
        decision: 'allow',
        scope: decision.scope,
      };
    }

    return {
      decision: 'deny',
      reason:
        decision.reason ?? `Command "${entry.request.command}" was denied by the user.`,
    };
  }

  private buildCacheKey(request: ShellToolApprovalRequest): string {
    return request.analysis.sanitizedCommand;
  }

  private nextId(): string {
    approvalCounter += 1;
    return `approval-${approvalCounter}`;
  }
}
