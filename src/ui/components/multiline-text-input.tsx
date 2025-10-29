import React, { useEffect, useRef, useState } from 'react';
import { Text, useInput } from 'ink';
import chalk from 'chalk';

export interface MultilineTextInputProps {
  placeholder?: string;
  focus?: boolean;
  mask?: string;
  showCursor?: boolean;
  highlightPastedText?: boolean;
  continuationPrefix?: string;
  value: string;
  onChange: (value: string) => void;
  onSubmit?: (value: string) => void;
}

interface CursorState {
  cursorOffset: number;
  cursorWidth: number;
}

const SHIFT_ENTER_SEQUENCES = ['\x1b[27;2;13~', '\x1b[13;2~'] as const;
const SHIFT_ENTER_SEQUENCE_SET = new Set<string>(SHIFT_ENTER_SEQUENCES);
const SHIFT_ENTER_PREFIX_SET = (() => {
  const prefixes = new Set<string>();
  for (const sequence of SHIFT_ENTER_SEQUENCES) {
    for (let index = 1; index < sequence.length; index += 1) {
      prefixes.add(sequence.slice(0, index));
    }
  }
  return prefixes;
})();
const SHIFT_ENTER_DIRECT_SET = new Set<string>(['[27;2;13~', '[13;2~']);

const clamp = (value: number, min: number, max: number): number => {
  if (value < min) {
    return min;
  }
  if (value > max) {
    return max;
  }
  return value;
};

const applyContinuationPrefix = (
  value: string | undefined,
  continuationPrefix: string | undefined,
): string | undefined => {
  if (!value || !continuationPrefix || continuationPrefix.length === 0) {
    return value;
  }

  return value.replace(/\n/g, `\n${continuationPrefix}`);
};

// Based on ink-text-input (MIT License). Adds Shift+Enter multiline support.
export function MultilineTextInput({
  value: originalValue,
  placeholder = '',
  focus = true,
  mask,
  highlightPastedText = false,
  showCursor = true,
  continuationPrefix,
  onChange,
  onSubmit,
}: MultilineTextInputProps): React.JSX.Element {
  const [state, setState] = useState<CursorState>({
    cursorOffset: (originalValue ?? '').length,
    cursorWidth: 0,
  });

  const shiftEnterBuffer = useRef('');

  const { cursorOffset, cursorWidth } = state;

  useEffect(() => {
    if (!focus || !showCursor) {
      return;
    }

    const newValue = originalValue ?? '';
    setState((previousState) => {
      if (previousState.cursorOffset > newValue.length) {
        return {
          cursorOffset: newValue.length,
          cursorWidth: 0,
        };
      }
      return previousState;
    });
  }, [focus, originalValue, showCursor]);

  const cursorActualWidth = highlightPastedText ? cursorWidth : 0;
  const value = mask ? mask.repeat(originalValue.length) : originalValue;

  let renderedValue = value;
  let renderedPlaceholder = placeholder ? chalk.grey(placeholder) : undefined;

  if (showCursor && focus) {
    renderedPlaceholder =
      placeholder.length > 0
        ? chalk.inverse(placeholder[0]) + chalk.grey(placeholder.slice(1))
        : chalk.inverse(' ');

    renderedValue = value.length > 0 ? '' : chalk.inverse(' ');

    let index = 0;
    for (const char of value) {
      renderedValue +=
        index >= cursorOffset - cursorActualWidth && index <= cursorOffset
          ? chalk.inverse(char)
          : char;
      index += 1;
    }

    if (value.length > 0 && cursorOffset === value.length) {
      renderedValue += chalk.inverse(' ');
    }
  }

  const handleInsertion = (text: string): void => {
    const insertion = text;
    let nextCursorOffset = cursorOffset;
    let nextCursorWidth = 0;

    const nextValue =
      originalValue.slice(0, cursorOffset) +
      insertion +
      originalValue.slice(cursorOffset, originalValue.length);

    nextCursorOffset += insertion.length;
    if (insertion.length > 1) {
      nextCursorWidth = insertion.length;
    }

    setState({
      cursorOffset: clamp(nextCursorOffset, 0, nextValue.length),
      cursorWidth: nextCursorWidth,
    });

    if (nextValue !== originalValue) {
      onChange(nextValue);
    }
  };

  const tryHandleShiftEnterSequence = (chunk: string): boolean => {
    if (chunk.length === 0) {
      return false;
    }

    const buffered = shiftEnterBuffer.current;

    if (buffered.length > 0) {
      const candidate = `${buffered}${chunk}`;

      if (SHIFT_ENTER_SEQUENCE_SET.has(candidate)) {
        shiftEnterBuffer.current = '';
        handleInsertion('\n');
        return true;
      }

      if (SHIFT_ENTER_PREFIX_SET.has(candidate)) {
        shiftEnterBuffer.current = candidate;
        return true;
      }

      shiftEnterBuffer.current = '';
    }

    if (SHIFT_ENTER_SEQUENCE_SET.has(chunk) || SHIFT_ENTER_DIRECT_SET.has(chunk)) {
      handleInsertion('\n');
      return true;
    }

    if (SHIFT_ENTER_PREFIX_SET.has(chunk)) {
      shiftEnterBuffer.current = chunk;
      return true;
    }

    return false;
  };

  useInput(
    (input, key) => {
      const chunk = input ?? '';

      if (chunk && tryHandleShiftEnterSequence(chunk)) {
        return;
      }

      if (
        key.upArrow ||
        key.downArrow ||
        (key.ctrl && input === 'c') ||
        key.tab ||
        (key.shift && key.tab)
      ) {
        return;
      }

      if (key.return) {
        if (key.shift) {
          handleInsertion('\n');
        } else if (onSubmit) {
          onSubmit(originalValue);
        }
        return;
      }

      let nextCursorOffset = cursorOffset;
      let nextValue = originalValue;
      let nextCursorWidth = 0;

      if (key.leftArrow) {
        if (showCursor) {
          nextCursorOffset -= 1;
        }
      } else if (key.rightArrow) {
        if (showCursor) {
          nextCursorOffset += 1;
        }
      } else if (key.backspace || key.delete) {
        if (cursorOffset > 0) {
          nextValue =
            originalValue.slice(0, cursorOffset - 1) +
            originalValue.slice(cursorOffset, originalValue.length);
          nextCursorOffset -= 1;
        }
      } else {
        handleInsertion(chunk);
        return;
      }

      nextCursorOffset = clamp(nextCursorOffset, 0, nextValue.length);
      setState({
        cursorOffset: nextCursorOffset,
        cursorWidth: nextCursorWidth,
      });

      if (nextValue !== originalValue) {
        onChange(nextValue);
      }
    },
    { isActive: focus },
  );

  return (
    <Text>
      {placeholder
        ? value.length > 0
          ? applyContinuationPrefix(renderedValue, continuationPrefix)
          : applyContinuationPrefix(renderedPlaceholder, continuationPrefix)
        : applyContinuationPrefix(renderedValue, continuationPrefix)}
    </Text>
  );
}

export interface UncontrolledMultilineTextInputProps
  extends Omit<MultilineTextInputProps, 'value' | 'onChange'> {
  initialValue?: string;
}

export function UncontrolledMultilineTextInput({
  initialValue = '',
  ...props
}: UncontrolledMultilineTextInputProps): React.JSX.Element {
  const [value, setValue] = useState(initialValue);
  return <MultilineTextInput {...props} value={value} onChange={setValue} />;
}

