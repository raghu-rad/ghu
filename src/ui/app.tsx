import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useInput, useStdout } from 'ink';

import type { Agent, AgentToolMessage } from '../agent/index.js';
import { formatMarkdown, formatUserMessage } from '../output/markdown.js';
import type { ToolDisplay, ToolDisplayPreview, ToolDisplayTone } from '../tools/index.js';
import type { ShellCommandRiskLevel, ShellToolApprovalScope } from '../tools/shell-approvals.js';
import { MultilineTextInput } from './components/multiline-text-input.js';
import { InteractiveApprovalProvider } from './interactive-approval-provider.js';

type ConversationItem =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string }
  | { id: string; role: 'tool'; name: string; content: string; display?: ToolDisplay }
  | { id: string; role: 'banner'; content: string }
  | {
      id: string;
      role: 'approval';
      requestId: string;
      command: string;
      risk: ShellCommandRiskLevel;
      reasons: string[];
      status: 'pending' | 'approved' | 'denied';
      scope?: ShellToolApprovalScope;
      message?: string;
    }
  | { id: string; role: 'error'; content: string };

const uid = (() => {
  let counter = 0;
  return () => {
    counter += 1;
    return `msg-${counter}`;
  };
})();

interface AppProps {
  agent: Agent;
  approvalProvider: InteractiveApprovalProvider;
}

export function App({ agent, approvalProvider }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const columns = useMemo(() => stdout?.columns ?? 80, [stdout?.columns]);

  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [isProcessing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const streamedToolMessages = useRef(false);
  const [pendingApprovals, setPendingApprovals] = useState<string[]>([]);

  const appendItems = useCallback((items: ConversationItem[]) => {
    setConversation((current) => [...current, ...items]);
  }, []);

  useEffect(() => {
    setConversation([
      {
        id: uid(),
        role: 'banner',
        content: 'Ghu is ready. Type /exit to quit, /reset to clear the conversation.',
      },
    ]);
  }, []);

  useEffect(() => {
    const disposeRequest = approvalProvider.onRequest((event) => {
      setPendingApprovals((current) => [...current, event.id]);
      setConversation((current) => [
        ...current,
        {
          id: uid(),
          role: 'approval',
          requestId: event.id,
          command: event.request.command,
          risk: event.request.analysis.risk.level,
          reasons: event.request.analysis.risk.reasons,
          status: 'pending',
        },
      ]);

      setStatusMessage(
        `Approval needed for ${event.id}. Press 1 (allow once), 2 (allow session), or 3 (deny).`,
      );
    });

    const disposeResolved = approvalProvider.onResolved((event) => {
      setPendingApprovals((current) => current.filter((id) => id !== event.id));
      setConversation((current) =>
        current.filter((item) => !(item.role === 'approval' && item.requestId === event.id)),
      );

      if (event.result.decision === 'allow') {
        setStatusMessage(null);
      } else {
        setStatusMessage(event.result.reason ?? `Denied ${event.id}.`);
      }
    });

    return () => {
      disposeRequest();
      disposeResolved();
    };
  }, [approvalProvider]);

  useInput(
    (input) => {
      if (!pendingApprovals.length) {
        return;
      }

      const requestId = pendingApprovals[0];

      if (input === '1') {
        approvalProvider.respond(requestId, { type: 'allow', scope: 'once' });
      } else if (input === '2') {
        approvalProvider.respond(requestId, { type: 'allow', scope: 'session' });
      } else if (input === '3') {
        approvalProvider.respond(requestId, { type: 'deny' });
      }
    },
    { isActive: pendingApprovals.length > 0 },
  );

  const handleCommand = useCallback(
    (command: string) => {
      if (command === '/exit') {
        exit();
        return;
      }

      if (command === '/reset') {
        agent.reset();
        setConversation([]);
        approvalProvider.cancelAll('Conversation reset.');
        approvalProvider.resetSession();
        setStatusMessage('Conversation history cleared.');
        return;
      }

      const allowAlwaysMatch = command.match(/^\/allow-always\s+(\S+)/);
       if (allowAlwaysMatch) {
         const [, requestId] = allowAlwaysMatch;
         const ok = approvalProvider.respond(requestId, { type: 'allow', scope: 'session' });
         setStatusMessage(
           ok ? `Approved ${requestId} for this session.` : `No pending approval for ${requestId}.`,
         );
         return;
       }

       const allowMatch = command.match(/^\/allow\s+(\S+)/);
       if (allowMatch) {
         const [, requestId] = allowMatch;
         const ok = approvalProvider.respond(requestId, { type: 'allow', scope: 'once' });
         setStatusMessage(ok ? `Approved ${requestId}.` : `No pending approval for ${requestId}.`);
         return;
       }

       const denyMatch = command.match(/^\/deny\s+(\S+)/);
       if (denyMatch) {
         const [, requestId] = denyMatch;
         const ok = approvalProvider.respond(requestId, { type: 'deny' });
         setStatusMessage(ok ? `Denied ${requestId}.` : `No pending approval for ${requestId}.`);
         return;
       }

      setStatusMessage(`Unknown command: ${command}`);
    },
    [agent, approvalProvider, exit],
  );

  const handleStreamedToolMessage = useCallback(
    ({ message, display }: AgentToolMessage) => {
      streamedToolMessages.current = true;
      appendItems([
        {
          id: uid(),
          role: 'tool',
          name: message.name ?? 'tool',
          content: message.content,
          display,
        },
      ]);
    },
    [appendItems, streamedToolMessages],
  );

  const handleSubmit = useCallback(
    async (value: string) => {
      if (isProcessing) {
        return;
      }

      const normalized = value.replace(/\r\n?/g, '\n');
      const trimmed = normalized.trim();

      if (trimmed.length === 0) {
        return;
      }

      if (trimmed.startsWith('/')) {
        handleCommand(trimmed);
        setInput('');
        return;
      }

      setProcessing(true);
      setStatusMessage(null);
      setInput('');

      streamedToolMessages.current = false;
      appendItems([{ id: uid(), role: 'user', content: normalized }]);

      try {
        const result = await agent.processUserMessage(normalized, {
          onToolMessage: handleStreamedToolMessage,
        });

        if (result.error) {
          appendItems([{ id: uid(), role: 'error', content: result.error }]);
        }

        if (!streamedToolMessages.current && result.toolMessages?.length) {
          const toolItems = result.toolMessages.map<ConversationItem>(({ message, display }) => ({
            id: uid(),
            role: 'tool',
            name: message.name ?? 'tool',
            content: message.content,
            display,
          }));
          appendItems(toolItems);
        }

        if (result.assistant && result.assistant.content.trim().length > 0) {
          appendItems([
            {
              id: uid(),
              role: 'assistant',
              content: result.assistant.content,
            },
          ]);
        }

        if (result.exhaustedIterations) {
          setStatusMessage('Reached maximum tool iterations without a final response.');
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unexpected error';
        appendItems([{ id: uid(), role: 'error', content: message }]);
      } finally {
        setProcessing(false);
      }
    },
    [agent, appendItems, handleCommand, isProcessing],
  );

  return (
    <Box flexDirection="column">
      <Box flexDirection="column">
        {conversation.map((message, index) => (
          <Box key={message.id} marginBottom={index === conversation.length - 1 ? 0 : 1}>
            <ConversationLine item={message} width={columns} />
          </Box>
        ))}
      </Box>

      {statusMessage ? (
        <Box marginTop={1}>
          <Text color="yellow">{statusMessage}</Text>
        </Box>
      ) : null}

      <ThinkingIndicator active={isProcessing} />

      <Box marginTop={1}>
        <Text color="cyan">› </Text>
        <MultilineTextInput
          value={input}
          onChange={setInput}
          onSubmit={handleSubmit}
          focus={pendingApprovals.length === 0}
        />
      </Box>
    </Box>
  );
}

interface ConversationLineProps {
  item: ConversationItem;
  width: number;
}

function ConversationLine({ item, width }: ConversationLineProps) {
  switch (item.role) {
    case 'user':
      return <Text>{formatUserMessage(item.content, width)}</Text>;
    case 'assistant': {
      const rendered = formatMarkdown(item.content).split('\n');
      return (
        <Box flexDirection="column">
          {rendered.map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
        </Box>
      );
    }
    case 'banner':
      return <BannerConversationLine text={item.content} />;
    case 'tool':
      return <ToolConversationLine item={item} />;
    case 'approval':
      return <ApprovalConversationLine item={item} />;
    case 'error':
    default:
      return <Text color="red">{item.content}</Text>;
  }
}

interface ToolConversationLineProps {
  item: Extract<ConversationItem, { role: 'tool' }>;
}

interface BannerConversationLineProps {
  text: string;
}

function BannerConversationLine({ text }: BannerConversationLineProps) {
  return (
    <Box
      borderStyle="round"
      borderColor="blue"
      paddingX={1}
      paddingY={0}
      flexBasis="100%"
      justifyContent="center"
    >
      <Text color="blue">{text}</Text>
    </Box>
  );
}

function ToolConversationLine({ item }: ToolConversationLineProps) {
  const toolName = formatToolName(item.name);
  const summary = item.display?.message ?? item.content;
  const hasSummary = summary.trim().length > 0;
  const summaryColor = resolveToneColor(item.display?.tone);
  const detailColor = item.display?.tone === 'error' ? 'red' : 'gray';
  const preview = item.display?.preview;
  const metadataEntries = formatMetadataEntries(item.display?.metadata);

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="magenta">{toolName}</Text>
        {metadataEntries.length ? (
          <Text color="gray">{`  ${metadataEntries.join('  ')}`}</Text>
        ) : null}
      </Box>
      {preview ? <ToolPreview preview={preview} /> : null}
      {hasSummary ? (
        <Box marginLeft={2}>
          <Text color={summaryColor}>{summary}</Text>
        </Box>
      ) : null}
      {item.display?.details ? (
        <Box marginLeft={2}>
          <Text color={detailColor}>{item.display.details}</Text>
        </Box>
      ) : null}
    </Box>
  );
}

interface ApprovalConversationLineProps {
  item: Extract<ConversationItem, { role: 'approval' }>;
}

function ApprovalConversationLine({ item }: ApprovalConversationLineProps) {
  const statusColor = resolveApprovalStatusColor(item.status);
  const reasonsText = item.reasons.length ? ` (${item.reasons.join(', ')})` : '';
  const scopeHint =
    item.scope === 'session' ? ' (session)' : item.scope === 'once' ? ' (once)' : '';

  return (
    <Box flexDirection="column">
      <Text color="magenta">{`Approval ${item.requestId}`}</Text>
      <Box marginLeft={2} flexDirection="column">
        <Text color="white">{item.command}</Text>
        <Text color="gray">{`risk=${item.risk}${reasonsText}`}</Text>
        <Text color={statusColor}>{`${item.status.toUpperCase()}${scopeHint}`}</Text>
        {item.message ? <Text color="gray">{item.message}</Text> : null}
        {item.status === 'pending' ? (
          <Box flexDirection="column">
            <Text color="gray">Choose an option:</Text>
            <Text color="gray">{' 1. Allow once'}</Text>
            <Text color="gray">{' 2. Allow for this session'}</Text>
            <Text color="gray">{' 3. Deny'}</Text>
            <Text color="gray">{`Commands: /allow ${item.requestId}, /allow-always ${item.requestId}, /deny ${item.requestId}`}</Text>
          </Box>
        ) : null}
      </Box>
    </Box>
  );
}

function resolveToneColor(tone: ToolDisplayTone | undefined): string {
  switch (tone) {
    case 'success':
      return 'green';
    case 'warning':
      return 'yellow';
    case 'error':
      return 'red';
    case 'info':
    default:
      return 'white';
  }
}

function resolveApprovalStatusColor(status: 'pending' | 'approved' | 'denied'): string {
  switch (status) {
    case 'approved':
      return 'green';
    case 'denied':
      return 'red';
    case 'pending':
    default:
      return 'yellow';
  }
}

function formatToolName(name: string): string {
  if (!name) {
    return 'unknown';
  }

  return name
    .split(/[-_ ]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(' ');
}

interface ToolPreviewProps {
  preview: ToolDisplayPreview;
}

function ToolPreview({ preview }: ToolPreviewProps) {
  if (!preview.lines.length) {
    return null;
  }

  const hasEllipsisLine = preview.lines.some((line) => line.trim() === '…');

  return (
    <Box marginLeft={2} flexDirection="column">
      {preview.lines.map((line, index) => (
        <Text key={index} color="white">
          {line}
        </Text>
      ))}
      {preview.truncated && !hasEllipsisLine ? <Text color="white">…</Text> : null}
    </Box>
  );
}

function formatMetadataEntries(metadata: Record<string, unknown> | undefined): string[] {
  if (!metadata) {
    return [];
  }

  const formatted: string[] = [];

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null) {
      continue;
    }

    const normalizedValue = normalizeMetadataValue(value);
    if (normalizedValue === undefined) {
      continue;
    }

    if (key === 'command' || key === 'path') {
      formatted.push(normalizedValue);
    } else {
      formatted.push(`${key}=${normalizedValue}`);
    }
  }

  return formatted;
}

function normalizeMetadataValue(value: unknown): string | undefined {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return value.toString();
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  return undefined;
}

interface ThinkingIndicatorProps {
  active: boolean;
}

function ThinkingIndicator({ active }: ThinkingIndicatorProps) {
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    if (!active) {
      setFrame(0);
      return;
    }

    const timer = setInterval(() => {
      setFrame((current) => (current + 1) % 4);
    }, 250);

    return () => {
      clearInterval(timer);
    };
  }, [active]);

  if (!active) {
    return null;
  }

  const dots = '.'.repeat(frame);
  const paddedDots = `${dots}${' '.repeat(3 - frame)}`;

  return (
    <Box marginTop={1}>
      <Text color="gray">{`Thinking${paddedDots}`}</Text>
    </Box>
  );
}
