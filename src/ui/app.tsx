import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useStdout } from 'ink';
import TextInput from 'ink-text-input';

import type { Agent } from '../agent/index.js';
import { formatMarkdown, formatUserMessage } from '../output/markdown.js';

type ConversationItem =
  | { id: string; role: 'user'; content: string }
  | { id: string; role: 'assistant'; content: string }
  | { id: string; role: 'tool'; name: string; content: string }
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

      appendItems([{ id: uid(), role: 'user', content: trimmed }]);

      try {
        const result = await agent.processUserMessage(trimmed);

        if (result.error) {
          appendItems([{ id: uid(), role: 'error', content: result.error }]);
        }

        if (result.toolMessages?.length) {
          const toolItems = result.toolMessages.map<ConversationItem>((message) => ({
            id: uid(),
            role: 'tool',
            name: message.name ?? 'tool',
            content: message.content,
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
      return (
        <Box flexDirection="column">
          <Text color="magenta">{`tool:${item.name}`}</Text>
          <Text>{item.content}</Text>
        </Box>
      );
    case 'error':
    default:
      return <Text color="red">{item.content}</Text>;
  }
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
