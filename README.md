<div align="center">

# Mentiora SDK

**AI observability and agent execution made simple**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-SDK-3178C6?logo=typescript&logoColor=white)](./typescript/)
[![Python](https://img.shields.io/badge/Python-SDK-3776AB?logo=python&logoColor=white)](./python/)

[Documentation](https://docs.mentiora.ai) · [Website](https://mentiora.ai) · [Issues](https://github.com/mentiora-ai/mentiora-sdk/issues)

</div>

---

## Overview

Mentiora SDK is the official multi-language SDK for the [Mentiora](https://mentiora.ai) observability platform. Monitor, debug, and optimize your AI applications with production-ready tracing for LLM calls, agent workflows, and tool executions — plus run and stream agent executions directly from your code.

### Why Mentiora?

- **Complete Visibility** — Trace every LLM call, tool execution, and agent decision across your entire AI application
- **Agent Execution** — Run and stream AI agents with multi-turn conversations, tool calls, and model overrides
- **Production Ready** — Async support, automatic retries, graceful error handling, and non-blocking tracing
- **Zero-Friction Integration** — Drop-in plugins for OpenAI and LangChain with minimal code changes
- **Multi-Language** — Consistent APIs across TypeScript/JavaScript and Python ecosystems

## Quick Start

### TypeScript/JavaScript

```bash
npm install @mentiora.ai/sdk
```

**Tracing — Automatic OpenAI tracing:**

```typescript
import { MentioraClient, trackOpenAI } from '@mentiora.ai/sdk';
import OpenAI from 'openai';

const mentiora = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

const openai = trackOpenAI(new OpenAI(), { mentioraClient: mentiora });

const response = await openai.chat.completions.create({
  model: 'gpt-5-mini',
  messages: [{ role: 'user', content: 'Explain quantum computing' }],
});
```

**Agent Execution — Run an agent and stream the response:**

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

for await (const event of client.agents.stream({
  tag: 'support-agent',
  message: 'How do I reset my password?',
})) {
  if (event.type === 'output_text_delta') {
    process.stdout.write(event.delta);
  }
}
```

[TypeScript SDK Documentation →](./typescript/)

### Python

```bash
pip install "mentiora-ai-sdk[openai] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

**Tracing — Automatic OpenAI tracing:**

```python
import os
from mentiora import MentioraClient, MentioraConfig, track_openai, TrackOpenAIOptions
from openai import AsyncOpenAI

mentiora = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

openai = track_openai(
    AsyncOpenAI(),
    TrackOpenAIOptions(mentiora_client=mentiora),
)

response = await openai.chat.completions.create(
    model='gpt-5-mini',
    messages=[{'role': 'user', 'content': 'Explain quantum computing'}],
)
```

**Agent Execution — Run an agent and stream the response:**

```python
import os
from mentiora import MentioraClient, MentioraConfig, AgentRunParams

client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

async for event in client.agents.stream_async(AgentRunParams(
    tag='support-agent',
    message='How do I reset my password?',
)):
    if event.type == 'output_text_delta':
        print(event.delta, end='', flush=True)
```

[Python SDK Documentation →](./python/)

## Authentication

To use the SDK, you need an API key from the Mentiora platform:

1. Sign in to the [Mentiora dashboard](https://platform.mentiora.ai)
2. Go to **Settings** → **API Keys**
3. Click **"Create API Key"** and copy the key immediately (it's only shown once)
4. Set it as an environment variable:

```bash
export MENTIORA_API_KEY=your-api-key-here
```

See the [Authentication guide](https://docs.mentiora.ai/authentication) for details on key management and security best practices.

## Features at a Glance

| Feature               | TypeScript | Python | Description                                                                          |
| --------------------- | :--------: | :----: | ------------------------------------------------------------------------------------ |
| **Core Tracing**      |     ✓      |   ✓    | Send structured trace events with UUID v7 IDs, hierarchical spans, and rich metadata |
| **Agent Execution**   |     ✓      |   ✓    | Run agents synchronously or stream responses with multi-turn conversation support    |
| **Streaming Helpers** |     ✓      |   ✓    | Convert agent streams to SSE responses for web frameworks                            |
| **OpenAI Plugin**     |     ✓      |   ✓    | Automatic tracing for `chat.completions.create` (streaming + non-streaming)          |
| **LangChain Plugin**  |     ✓      |   ✓    | Callback handler for chains, agents, tools, and retrievers                           |
| **Error Handling**    |     ✓      |   ✓    | Non-throwing trace results, typed error classes, graceful degradation                |

See the [TypeScript SDK](./typescript/) and [Python SDK](./python/) READMEs for full API references.

## Project Structure

```
mentiora-sdk/
├── typescript/       # TypeScript/JavaScript SDK (@mentiora.ai/sdk)
├── python/           # Python SDK (mentiora-ai-sdk)
├── docs/             # Docusaurus documentation site
└── examples/         # Example apps (basic-tracing, openai, langchain, agent-run, chatbot-ui)
```

## Requirements

- **TypeScript/JavaScript**: Node.js >= 20.0.0
- **Python**: Python >= 3.11

## Documentation

- [TypeScript SDK Reference](https://docs.mentiora.ai/typescript/installation)
- [Python SDK Reference](https://docs.mentiora.ai/python/installation)
- [Online Documentation](https://docs.mentiora.ai)

## Contributing

We welcome contributions! Please open an issue or pull request on [GitHub](https://github.com/mentiora-ai/mentiora-sdk).

## Support

- **Issues**: [GitHub Issues](https://github.com/mentiora-ai/mentiora-sdk/issues)
- **Documentation**: [docs.mentiora.ai](https://docs.mentiora.ai)

## License

Apache License 2.0

---

<div align="center">

Made with ❤️ by the Mentiora team

[Website](https://mentiora.ai) · [Documentation](https://docs.mentiora.ai)

</div>
