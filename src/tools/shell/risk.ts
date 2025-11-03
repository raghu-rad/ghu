import type { ShellCommandAnalysis, ShellCommandRisk } from './approvals.js';

const NETWORK_COMMANDS = new Set([
  'curl',
  'wget',
  'http',
  'https',
  'ftp',
  'scp',
  'ssh',
  'sftp',
  'rsync',
  'ping',
  'nc',
  'ncat',
  'netcat',
  'telnet',
  'dig',
  'nslookup',
]);

const PACKAGE_COMMANDS = new Set([
  'npm',
  'pnpm',
  'yarn',
  'pip',
  'pip3',
  'poetry',
  'cargo',
  'brew',
  'apt',
  'apt-get',
  'yum',
  'dnf',
  'apk',
  'pacman',
  'conda',
  'gem',
  'bundle',
  'bundler',
  'composer',
]);

const SOURCE_CONTROL_COMMANDS = new Set([
  'git',
  'hg',
  'mercurial',
  'svn',
  'bzr',
  'p4',
]);

const CONTAINER_COMMANDS = new Set([
  'docker',
  'podman',
  'kubectl',
  'helm',
  'minikube',
  'nerdctl',
]);

export function analyzeShellCommand(command: string): ShellCommandAnalysis {
  const sanitizedCommand = command.trim();
  const tokens = tokenizeShellCommand(sanitizedCommand);
  const risk = determineRisk(tokens, sanitizedCommand);

  return {
    command,
    sanitizedCommand,
    tokens,
    risk,
  };
}

function determineRisk(tokens: string[], sanitizedCommand: string): ShellCommandRisk {
  const reasons = new Set<string>();

  if (tokens.some((token) => NETWORK_COMMANDS.has(token))) {
    reasons.add('network');
  }

  if (
    tokens.some(
      (token, index) =>
        PACKAGE_COMMANDS.has(token) &&
        (tokens[index + 1] === 'install' ||
          tokens[index + 1] === 'add' ||
          tokens[index + 1] === 'upgrade' ||
          tokens[index + 1] === 'update'),
    )
  ) {
    reasons.add('package-manager');
  }

  if (
    tokens.some(
      (token, index) =>
        SOURCE_CONTROL_COMMANDS.has(token) &&
        (tokens[index + 1] === 'clone' ||
          tokens[index + 1] === 'fetch' ||
          tokens[index + 1] === 'pull' ||
          tokens[index + 1] === 'push' ||
          tokens[index + 1] === 'remote'),
    )
  ) {
    reasons.add('remote-source-control');
  }

  if (
    tokens.some(
      (token, index) =>
        CONTAINER_COMMANDS.has(token) &&
        (tokens[index + 1] === 'pull' ||
          tokens[index + 1] === 'run' ||
          tokens[index + 1] === 'push' ||
          tokens[index + 1] === 'login' ||
          tokens[index + 1] === 'build'),
    )
  ) {
    reasons.add('container-runtime');
  }

  if (/https?:\/\//iu.test(sanitizedCommand)) {
    reasons.add('url-detected');
  }

  if (/scp:\/\/|sftp:\/\//iu.test(sanitizedCommand)) {
    reasons.add('remote-filesystem');
  }

  const level = reasons.size > 0 ? 'external' : 'low';

  return {
    level,
    reasons: Array.from(reasons),
  };
}

function tokenizeShellCommand(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let quote: '"' | "'" | null = null;
  let escaping = false;

  for (let index = 0; index < command.length; index += 1) {
    const char = command[index];

    if (escaping) {
      current += char;
      escaping = false;
      continue;
    }

    if (char === '\\') {
      escaping = true;
      continue;
    }

    if (quote) {
      if (char === quote) {
        quote = null;
      } else {
        current += char;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    if (/\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens.map((token) => token.trim()).filter((token) => token.length > 0);
}
