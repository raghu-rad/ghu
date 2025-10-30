import { describe, expect, it } from 'vitest';

import { analyzeShellCommand } from '../../src/tools/shell-risk.js';

describe('analyzeShellCommand', () => {
  it('classifies local commands as low risk', () => {
    const analysis = analyzeShellCommand('ls -la');
    expect(analysis.risk.level).toBe('low');
    expect(analysis.risk.reasons).toHaveLength(0);
  });

  it('detects network usage', () => {
    const analysis = analyzeShellCommand('curl https://example.com');
    expect(analysis.risk.level).toBe('external');
    expect(analysis.risk.reasons).toContain('network');
    expect(analysis.risk.reasons).toContain('url-detected');
  });

  it('detects package manager installs', () => {
    const analysis = analyzeShellCommand('npm install lodash');
    expect(analysis.risk.level).toBe('external');
    expect(analysis.risk.reasons).toContain('package-manager');
  });
});
