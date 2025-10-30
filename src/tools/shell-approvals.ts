import type { ShellSandboxOptions } from './shell-sandbox.js';

export type ShellCommandRiskLevel = 'low' | 'external';

export interface ShellCommandRisk {
  level: ShellCommandRiskLevel;
  reasons: string[];
}

export interface ShellCommandAnalysis {
  command: string;
  sanitizedCommand: string;
  tokens: string[];
  risk: ShellCommandRisk;
}

export interface ShellToolApprovalRequest {
  command: string;
  analysis: ShellCommandAnalysis;
  sandbox: ShellSandboxOptions;
}

export type ShellToolApprovalDecision = 'allow' | 'deny';

export type ShellToolApprovalScope = 'once' | 'session';

export interface ShellToolApprovalResult {
  decision: ShellToolApprovalDecision;
  scope?: ShellToolApprovalScope;
  reason?: string;
}

export interface ShellToolApprovalProvider {
  requestApproval(request: ShellToolApprovalRequest): Promise<ShellToolApprovalResult>;
}
