---
sidebar_position: 1
---

# Python SDK Installation

The Python SDK for the Mentiora platform.

## Installation

Install the package using pip:

```bash
pip install mentiora-sdk
```

For optional dependencies:

```bash
# With OpenAI plugin support
pip install mentiora-sdk[openai]

# With LangChain plugin support
pip install mentiora-sdk[langchain]

# With both
pip install mentiora-sdk[openai,langchain]
```

## Requirements

- Python >= 3.11
- httpx >= 0.28.1
- pydantic >= 2.12.5

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
    environment='production',  # or 'staging'
)

client = MentioraClient(config)
```

## Configuration Options

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `api_key` | str | Yes | Project API key (from Mentiora platform) |
| `environment` | 'staging' \| 'production' | Yes | Target environment |
| `project_id` | str | No | Project UUID (optional) |
| `base_url` | str | No | Override base URL (for testing) |
| `timeout` | int | No | Request timeout in ms (default: 30000) |
| `retries` | int | No | Max retry attempts (default: 3) |

## Next Steps

- Learn how to [use the SDK](./usage)
- Check out the [API reference](./api-reference)
