import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Box, Text, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';

import type { Agent, AgentToolMessage } from '../agent/index.js';
import { formatMarkdown, formatUserMessage } from '../output/markdown.js';
import type { ToolDisplay, ToolDisplayPreview, ToolDisplayTone } from '../tools/index.js';

type ConversationItem =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string }
  | { id: string; role: 'tool'; name: string; content: string; display?: ToolDisplay }
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
}

export function App({ agent }: AppProps) {
  const { exit } = useApp();
  const { stdout } = useStdout();
  const columns = useMemo(() => stdout?.columns ?? 80, [stdout?.columns]);

  const [input, setInput] = useState('');
  const [conversation, setConversation] = useState<ConversationItem[]>([]);
  const [isProcessing, setProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const streamedToolMessages = useRef(false);

  const appendItems = useCallback((items: ConversationItem[]) => {
    setConversation((current) => [...current, ...items]);
  }, []);

  useEffect(() => {
    setConversation([
      {
        id: uid(),
        role: 'assistant',
        content: 'Ghu is ready. Type /exit to quit, /reset to clear the conversation.',
      },
    ]);
  }, []);

  const handleCommand = useCallback(
    (command: string) => {
      if (command === '/exit') {
        exit();
        return;
      }

      if (command === '/reset') {
        agent.reset();
        setConversation([]);
        setStatusMessage('Conversation history cleared.');
        return;
      }

      setStatusMessage(`Unknown command: ${command}`);
    },
    [agent, exit],
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
      const trimmed = value.trim();
      if (trimmed.length === 0 || isProcessing) {
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
      appendItems([{ id: uid(), role: 'user', content: trimmed }]);

      try {
        const result = await agent.processUserMessage(trimmed, {
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
        <TextInput value={input} onChange={setInput} onSubmit={handleSubmit} />
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
        <Box borderStyle="round" borderColor="blue" padding={1} flexDirection="column">
          {rendered.map((line, index) => (
            <Text key={index}>{line}</Text>
          ))}
        </Box>
      );
    }
    case 'tool':
      return <ToolConversationLine item={item} />;
    case 'error':
    default:
      return <Text color="red">{item.content}</Text>;
  }
}

interface ToolConversationLineProps {
  item: Extract<ConversationItem, { role: 'tool' }>;
}

function ToolConversationLine({ item }: ToolConversationLineProps) {
  const toolName = formatToolName(item.name);
  const command = getMetadataString(item.display?.metadata, 'command');
  const summary = item.display?.message ?? item.content;
  const hasSummary = summary.trim().length > 0;
  const summaryColor = resolveToneColor(item.display?.tone);
  const detailColor = item.display?.tone === 'error' ? 'red' : 'gray';
  const preview = item.display?.preview;

  return (
    <Box flexDirection="column">
      <Box>
        <Text color="magenta">{toolName}</Text>
        {command ? (
          <Text color="cyan">{`  $ ${command}`}</Text>
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

function getMetadataString(metadata: Record<string, unknown> | undefined, key: string): string | undefined {
  if (!metadata) {
    return undefined;
  }

  const value = metadata[key];
  if (typeof value !== 'string') {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
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
