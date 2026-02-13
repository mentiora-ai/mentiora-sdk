<div align="center">

# Mentiora SDK

**AI observability made simple**

[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-SDK-3178C6?logo=typescript&logoColor=white)](./typescript/)
[![Python](https://img.shields.io/badge/Python-SDK-3776AB?logo=python&logoColor=white)](./python/)

[Documentation](https://docs.mentiora.ai) • [Website](https://mentiora.ai) • [Issues](https://github.com/periscoop/mentiora-sdk/issues)

</div>

---

## Overview

Mentiora SDK is the official multi-language SDK for the Mentiora observability platform. Monitor, debug, and optimize your AI applications with production-ready tracing for LLM calls, agent workflows, and tool executions.

### Why Mentiora?

- **🔍 Complete Visibility** - Trace every LLM call, tool execution, and agent decision across your entire AI application
- **🚀 Production Ready** - Built for scale with async support, automatic retries, and graceful error handling
- **🔌 Zero-Friction Integration** - Drop-in plugins for OpenAI and LangChain with minimal code changes
- **📊 Rich Context** - Capture inputs, outputs, token usage, latency, errors, and custom metadata
- **🌍 Multi-Language** - Consistent APIs across TypeScript/JavaScript and Python ecosystems

## Quick Start

### TypeScript/JavaScript

```bash
npm install @mentiora/sdk
```

```typescript
import { MentioraClient, trackOpenAI } from '@mentiora/sdk';
import OpenAI from 'openai';

// Initialize Mentiora client (defaults to https://platform.mentiora.ai)
const mentiora = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});

// Wrap your OpenAI client to automatically trace all calls
const openai = trackOpenAI(new OpenAI(), { mentioraClient: mentiora });

// Use OpenAI normally - traces are sent automatically
const response = await openai.chat.completions.create({
  model: 'gpt-4o-mini',
  messages: [{ role: 'user', content: 'Explain quantum computing' }],
});
```

**[📖 TypeScript Documentation →](https://docs.mentiora.ai/typescript/installation)**

### Python

```bash
pip install mentiora-sdk[openai]
```

```python
from mentiora import MentioraClient, MentioraConfig, track_openai, TrackOpenAIOptions
from openai import AsyncOpenAI
import os

# Initialize Mentiora client (defaults to https://platform.mentiora.ai)
mentiora = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))

# Wrap your OpenAI client to automatically trace all calls
openai = track_openai(
    AsyncOpenAI(),
    TrackOpenAIOptions(mentiora_client=mentiora),
)

# Use OpenAI normally - traces are sent automatically
response = await openai.chat.completions.create(
    model='gpt-4o-mini',
    messages=[{'role': 'user', 'content': 'Explain quantum computing'}],
)
```

**[📖 Python Documentation →](https://docs.mentiora.ai/python/installation)**

## Authentication

To use the SDK, you need an API key from the Mentiora platform:

1. Sign in to the [Mentiora dashboard](https://platform.mentiora.ai)
2. Go to **Settings** → **API Keys**
3. Click **"Create API Key"** and copy the key immediately (it's only shown once)
4. Set it as an environment variable:

```env
MENTIORA_API_KEY=your-api-key-here
```

See the [Authentication guide](https://docs.mentiora.ai/authentication) for details on key management and security best practices.

## Features

### 🎯 Core Tracing

- **Automatic Trace Generation** - UUID v7-based trace and span IDs with timestamp ordering
- **Hierarchical Spans** - Parent-child relationships for complex agent workflows
- **Flexible Event Types** - Support for `llm`, `tool`, `chat`, `error`, and `custom` trace types
- **Rich Metadata** - Capture custom tags, metadata, token usage, model information, and more

### 🔌 Integrations

#### OpenAI Plugin

- Automatic tracing for `chat.completions.create`
- Support for streaming and non-streaming responses
- Token usage tracking (automatically injected for streaming)
- Multimodal content support (text + images)
- Tool/function call capture
- Error and refusal handling

#### LangChain Plugin

- Callback-based tracing for chains, agents, tools, and retrievers
- Automatic parent-child span relationships
- LLM token usage tracking
- Support for complex multi-step workflows
- Works with all LangChain components

### ⚡ Performance & Reliability

- **Non-Blocking** - Tracing failures never crash your application
- **Async Support** - First-class async/await support in both SDKs
- **Automatic Retries** - Configurable retry logic with exponential backoff
- **Graceful Degradation** - Returns success/error objects instead of throwing exceptions

## Project Structure

This is a monorepo containing parallel implementations with consistent APIs:

```
mentiora-sdk/
├── typescript/          # TypeScript/JavaScript SDK (@mentiora/sdk)
│   ├── src/
│   ├── package.json
│   └── README.md
├── python/              # Python SDK (mentiora-sdk)
│   ├── src/mentiora/
│   ├── pyproject.toml
│   └── README.md
└── docs/                # Docusaurus documentation site
```

## Requirements

- **TypeScript/JavaScript**: Node.js >= 20.0.0
- **Python**: Python >= 3.11

## Documentation

- **[TypeScript SDK Documentation](https://docs.mentiora.ai/typescript/installation)** - Full API reference, configuration options, and examples
- **[Python SDK Documentation](https://docs.mentiora.ai/python/installation)** - Full API reference, configuration options, and examples
- **[Online Documentation](https://docs.mentiora.ai)** - Guides, tutorials, and best practices

## Contributing

We welcome contributions! Please open an issue or pull request on [GitHub](https://github.com/periscoop/mentiora-sdk).

## Support

- **Issues**: [GitHub Issues](https://github.com/periscoop/mentiora-sdk/issues)
- **Documentation**: [docs.mentiora.ai](https://docs.mentiora.ai)

## License

Apache License 2.0

---

<div align="center">

Made with ❤️ by the Mentiora team

[Website](https://mentiora.ai) • [Documentation](https://docs.mentiora.ai)

</div>
