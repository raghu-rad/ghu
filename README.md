# Ghu

Ghu is a modular terminal agent CLI built with [Ink](https://github.com/vadimdemedes/ink) and React. It lets you chat with a large language model, invoke tools, and render responses with tasteful terminal styling.

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

## Scripts

- `pnpm build` – bundle the CLI
- `pnpm dev` – run the CLI in watch mode
- `pnpm test` – run unit tests
- `pnpm lint` – lint the source
- `pnpm format` – format the source
