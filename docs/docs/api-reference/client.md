---
title: Client
description: "API reference for MentioraClient — the main entry point for the Mentiora SDK, including constructor, configuration options, and properties."
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Client

> For a step-by-step setup walkthrough, see the [Quick Start](/quick-start) guide.

## MentioraClient

Main client class for interacting with the Mentiora platform.

### Constructor

<SdkTabs>
<TabItem value="typescript">

```typescript
new MentioraClient(config: MentioraConfig)
```

</TabItem>
<TabItem value="python">

```python
MentioraClient(config: MentioraConfig)
```

</TabItem>
</SdkTabs>

### MentioraConfig

<SdkTabs>
<TabItem value="typescript">

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `apiKey` | string | ¹ | Project API key for **server-side** usage — see [Authentication](/authentication) |
| `publishableKey` | string | ¹ | Publishable key for **browser-side** usage — safe to expose in client code |
| `baseUrl` | string | No | Base URL (defaults to https://platform.mentiora.ai) |
| `timeout` | number | No | Request timeout in ms (default: 30000) |
| `retries` | number | No | Max retry attempts (default: 3) |
| `identityToken` | string | No | Identity token for authenticated end-users (browser mode only) |
| `getIdentityToken` | () => Promise\<string\> | No | Callback to fetch/refresh identity tokens (browser mode only) |
| `debug` | boolean | No | Enable verbose SDK logging (default: false) |

¹ Exactly one of `apiKey` or `publishableKey` is required.

</TabItem>
<TabItem value="python">

| Option | Type | Required | Description |
|--------|------|----------|-------------|
| `api_key` | str | Yes | Project API key — see [Authentication](/authentication) |
| `base_url` | str | No | Base URL (defaults to https://platform.mentiora.ai) |
| `timeout` | int | No | Request timeout in ms (default: 30000) |
| `retries` | int | No | Max retry attempts (default: 3) |
| `debug` | bool | No | Enable verbose SDK logging (default: False) |

:::note
Browser mode (`publishableKey`, `identityToken`, `getIdentityToken`) is only available in the TypeScript SDK — these are browser-specific features.
:::

</TabItem>
</SdkTabs>

### Properties

<SdkTabs>
<TabItem value="typescript">

#### `tracing`

Access to tracing functionality.

```typescript
client.tracing: TracingClient
```

#### `agents`

Access to agent execution functionality.

```typescript
client.agents: AgentsClient
```

#### `debug`

Whether debug mode is enabled (read-only).

```typescript
client.debug: boolean
```

#### `close(): void`

Close the client. Currently a no-op (the TypeScript SDK uses stateless `fetch()`), provided for API parity with the Python SDK.

```typescript
client.close();
```

</TabItem>
<TabItem value="python">

#### `tracing`

Access to tracing functionality.

```python
client.tracing: TracingClient
```

#### `agents`

Access to agent execution functionality.

```python
client.agents: AgentsClient
```

#### `debug`

Whether debug mode is enabled (read-only).

```python
client.debug: bool
```

#### `close() -> None`

Close HTTP clients and cleanup resources.

```python
client.close()
```

#### `aclose() -> None`

Close async HTTP clients and cleanup resources.

```python
await client.aclose()
```

</TabItem>
</SdkTabs>

---

**See also:** [Tracing](/api-reference/tracing) | [Agents](/api-reference/agents) | [Errors](/api-reference/errors)
