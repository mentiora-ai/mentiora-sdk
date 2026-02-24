---
sidebar_label: Overview
description: "Learn how to use the Mentiora SDK for tracing, agents, plugins, and streaming."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Usage

Learn how to use the Mentiora SDK to send traces and interact with the platform.

## Basic Setup

<SdkTabs>
<TabItem value="typescript">

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});
```

</TabItem>
<TabItem value="python">

```python
from mentiora import MentioraClient, MentioraConfig
import os

config = MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
)

client = MentioraClient(config)
```

</TabItem>
</SdkTabs>

## Async/Sync Patterns

<SdkTabs>
<TabItem value="typescript">

The TypeScript SDK uses an **async-only API**. All methods return Promises and must be awaited:

```typescript
// All tracing methods are async
const result = await client.tracing.sendTrace(event);
await client.tracing.flush();
```

### Why async-only?

The TypeScript SDK is designed exclusively for asynchronous operations for several important reasons:

- **Native `fetch()` is async-only**: Modern JavaScript/TypeScript has no synchronous HTTP equivalent
- **Node.js ecosystem is async-first**: Most Node.js libraries and frameworks use async patterns
- **Prevents blocking the event loop**: Keeps your application responsive and performant
- **Consistency**: All SDK methods follow the same async pattern, making the API predictable

### Comparison with Python SDK

Unlike the Python SDK (which offers both sync and async APIs to support different Python ecosystems), the TypeScript SDK only provides async methods. This reflects the JavaScript/TypeScript ecosystem's strong preference for asynchronous operations.

```typescript
// ✅ Always use await with TypeScript SDK
async function myHandler() {
  const result = await client.tracing.sendTrace(event);
  return result;
}

// ❌ No sync API available - this won't work correctly
function myHandler() {
  const result = client.tracing.sendTrace(event); // Returns a Promise!
  return result; // You'd be returning a Promise, not the result
}
```

### Top-level await

In modern TypeScript/JavaScript environments (ES modules, Node.js 14.8+), you can use top-level await:

```typescript
// ✅ Top-level await in ES modules
const result = await client.tracing.sendTrace(event);
console.log(result);
```

</TabItem>
<TabItem value="python">

The Python SDK provides both synchronous and asynchronous APIs to match your application's architecture:

### Async API (Recommended)

Use the async API when working with async frameworks or applications:

```python
# For async applications (FastAPI, aiohttp, AsyncOpenAI, etc.)
result = await client.tracing.send_trace_async(event)
await client.tracing.flush_async()
```

**When to use async:**
- FastAPI, Starlette, aiohttp, Sanic
- AsyncOpenAI, async LangChain components
- Any application using `async`/`await` patterns

### Sync API

Use the sync API for traditional synchronous Python code:

```python
# For sync applications (Flask, Django WSGI, scripts, etc.)
result = client.tracing.send_trace(event)
client.tracing.flush()
```

**When to use sync:**
- Flask, Django (WSGI mode), Bottle
- Standard OpenAI client (sync)
- Scripts, CLI tools, Jupyter notebooks
- Traditional synchronous Python code

### Best Practice

**Always match your SDK API to your application's async/sync nature:**

```python
# ✅ Good: Async app using async SDK
async def handle_request():
    result = await client.tracing.send_trace_async(event)
    return result

# ✅ Good: Sync app using sync SDK
def handle_request():
    result = client.tracing.send_trace(event)
    return result

# ❌ Bad: Mixing sync in async (blocks event loop!)
async def handle_request():
    result = client.tracing.send_trace(event)  # Don't do this!
    return result
```

</TabItem>
</SdkTabs>

## Resource Cleanup

<SdkTabs>
<TabItem value="typescript">

While the TypeScript SDK doesn't require explicit cleanup (it uses stateless `fetch()`), a `close()` method is provided for API parity with the Python SDK:

```typescript
// Optional cleanup (no-op but available for consistency)
client.close();
```

**Note:** Unlike Python's `httpx` client which maintains connection pools, the TypeScript SDK uses the native `fetch()` API which is stateless. The `close()` method is a no-op but is provided to maintain a consistent API surface across languages.

</TabItem>
<TabItem value="python">

The SDK supports context managers for automatic resource cleanup:

```python
# Sync context manager
with MentioraClient(config) as client:
    result = client.tracing.send_trace(event)
# Cleanup happens automatically

# Async context manager
async with MentioraClient(config) as client:
    result = await client.tracing.send_trace_async(event)
# Cleanup happens automatically

# Manual cleanup (if not using context managers)
client.close()  # For sync
await client.aclose()  # For async
```

</TabItem>
</SdkTabs>

## Next Steps

- [Tracing](/usage/tracing) -- send traces for observability and debugging
- [Agents](/usage/agents) -- run and stream AI agents hosted on the platform
- [Plugins](/usage/plugins) -- auto-trace OpenAI and LangChain calls
- [Streaming Helpers](/usage/streaming-helpers) -- SSE utilities for web frontends
