---
sidebar_position: 1
---

# Python SDK Installation

Install and configure the Python SDK for the Mentiora platform.

## Installation

Install the package using pip:

```bash
pip install "git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

Or with uv:

```bash
uv pip install "git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

For optional dependencies:

```bash
# With OpenAI plugin support
pip install "mentiora-ai-sdk[openai] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"

# With LangChain plugin support
pip install "mentiora-ai-sdk[langchain] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"

# With both
pip install "mentiora-ai-sdk[openai,langchain] @ git+https://github.com/mentiora-ai/mentiora-sdk.git#subdirectory=python"
```

## Requirements

- Python >= 3.11
- httpx >= 0.28.1
- pydantic >= 2.12.5

- uuid-utils >= 0.14.0

## Import

```python
from mentiora import MentioraClient, MentioraConfig
```

## Create a Client

```python
from mentiora import MentioraClient, MentioraConfig
import os

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
    # base_url defaults to https://platform.mentiora.ai
)

client = MentioraClient(config)
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `api_key` | str | Yes | Project API key — see [Authentication](/authentication) |
| `base_url` | str | No | Base URL (defaults to https://platform.mentiora.ai) |
| `timeout` | int | No | Request timeout in ms (default: 30000) |
| `retries` | int | No | Max retry attempts (default: 3) |
| `debug` | bool | No | Enable verbose SDK logging (default: False) |

## Next Steps

- Learn how to [use the SDK](./usage)
- Check out the [API reference](./api-reference)
