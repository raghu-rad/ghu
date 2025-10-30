# Ghu

Ghu is a modular terminal agent CLI built with [Ink](https://github.com/vadimdemedes/ink) and React. It lets you chat with a large language model, invoke tools, and render responses with tasteful terminal styling.

## Features

- **Interactive Terminal UI**: Built with Ink for a smooth, responsive terminal experience
- **Tool Integration**: Extensible tool system for file operations and shell commands
- **Provider Support**: Multiple LLM providers (Deepseek, Mock) with easy configuration
- **Real-time Feedback**: Live previews and status updates for tool operations

## Available Tools

Ghu comes with a comprehensive set of built-in tools for file system operations and shell execution:

### File Operations

#### `read-file`
Read file contents from the local filesystem.

**Parameters:**
- `path` (required): Path to the file to read
- `encoding`: Optional file encoding (defaults to utf8)
- `maxBytes`: Optional maximum size (in bytes) permitted for the file
- `withMetadata`: Include file metadata such as size, mtime, and hash when true
- `baseDir`: Optional base directory to resolve the path against

**Features:**
- File size validation and safety limits
- SHA-256 hash generation for file integrity
- Smart preview with head/tail line display
- Comprehensive error handling

#### `read-files`
Read multiple file contents from the local filesystem.

**Parameters:**
- `paths` (required): List of file paths to read
- `encoding`: Optional file encoding (defaults to utf8)
- `maxBytes`: Optional maximum size (in bytes) permitted per file
- `maxTotalBytes`: Optional maximum aggregate size (in bytes) permitted across all files
- `withMetadata`: Include file metadata such as size, mtime, and hash when true
- `baseDir`: Optional base directory to resolve the paths against

**Features:**
- Batch file reading with aggregate size limits
- Individual file validation and error reporting
- Summary statistics for multi-file operations
- Efficient memory usage for large file sets

#### `write-file`
Modify a local file by inserting or deleting specific lines.

**Parameters:**
- `path` (required): Path to the file to update
- `baseDir`: Optional base directory used to resolve the provided path
- `encoding`: Optional file encoding used for reading and writing (defaults to utf8)
- `ensureTrailingNewline`: Ensure the file ends with a newline when true (defaults to true)
- `operations` (required): Ordered list of operations to apply to the file

**Operation Types:**
- `insert`: Add content at specific line positions
- `delete`: Remove lines from specific positions

**Features:**
- Precise line-based editing with 1-based line numbering
- Atomic file operations with rollback on failure
- Change tracking with detailed previews
- Automatic directory creation for new files

### Shell Execution

#### `shell`
Execute a shell command and return stdout/stderr.

**Parameters:**
- `command` (required): Command string to execute

**Features:**
- Timeout protection (default 5 seconds)
- Buffer size limits for safety
- Combined stdout/stderr output
- Error handling with detailed previews
- Configurable working directory

## Getting Started

```bash
pnpm install
pnpm dev
```

The development command launches the interactive Ink interface. Type `/reset` to clear the conversation or `/exit` to quit.

## Configuration

Set the following environment variables (see `.env.example` for a template):

- `GHU_PROVIDER` – `mock` or `deepseek`
- `GHU_MODEL` – optional model override
- `GHU_SYSTEM_PROMPT` – optional custom system prompt
- `DEEPSEEK_API_KEY`, `DEEPSEEK_BASE_URL` – required when using the Deepseek provider

## Tool Registry

The tool system is modular and extensible. Tools can be selectively enabled/disabled via the `createDefaultToolRegistry` function:

```typescript
import { createDefaultToolRegistry } from './src/tools';

const registry = createDefaultToolRegistry({
  includeShell: true,
  includeReadFile: true,
  includeReadFiles: true,
  includeWriteFile: true,
  shell: { timeoutMs: 10000, cwd: '/custom/path' },
  readFile: { defaultEncoding: 'utf16le' }
});
```

## Scripts

- `pnpm build` – bundle the CLI
- `pnpm dev` – run the CLI in watch mode
- `pnpm test` – run unit tests
- `pnpm lint` – lint the source
- `pnpm format` – format the source

## Architecture

Ghu follows a modular architecture:

- **CLI Layer**: Commander-based CLI with Ink UI
- **Provider Layer**: LLM provider abstraction (Deepseek, Mock)
- **Tool Layer**: Extensible tool system with safety features
- **Display Layer**: Rich terminal output with previews and status indicators

All tools include comprehensive error handling, safety limits, and user-friendly output formatting.
