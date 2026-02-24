---
title: Errors
description: 'API reference for Mentiora SDK error classes — MentioraError, ConfigurationError, ValidationError, and NetworkError.'
---

import SdkTabs from '@site/src/components/SdkTabs';
import TabItem from '@theme/TabItem';

# Errors

> For usage patterns, see [Usage - Tracing](/usage/tracing) and [Usage - Agents](/usage/agents).

<SdkTabs>
<TabItem value="typescript">

## MentioraError

Base exception for all Mentiora SDK errors. All specific error classes extend this.

```typescript
class MentioraError extends Error {
  readonly code: string;
  constructor(message: string, code: string);
}
```

You can catch `MentioraError` to handle any SDK error, or use the `code` property for programmatic error handling.

## ConfigurationError

Thrown when the client configuration is invalid.

```typescript
class ConfigurationError extends MentioraError {
  // code: 'CONFIGURATION_ERROR'
  constructor(message: string);
}
```

## ValidationError

Thrown when trace event data is invalid.

```typescript
class ValidationError extends MentioraError {
  // code: 'VALIDATION_ERROR'
  constructor(message: string);
}
```

## NetworkError

Thrown when a network or HTTP error occurs. On 4xx/5xx responses, the SDK parses the server's JSON error body and exposes `serverCode` and `serverMessage` for programmatic error handling.

```typescript
class NetworkError extends MentioraError {
  // code: 'NETWORK_ERROR'
  readonly statusCode?: number;
  readonly serverCode?: string; // e.g. 'agent_not_found', 'invalid_request'
  readonly serverMessage?: string; // Detailed error message from the server
  constructor(
    message: string,
    statusCode?: number,
    serverCode?: string,
    serverMessage?: string,
  );
}
```

</TabItem>
<TabItem value="python">

## MentioraError

Base exception for all Mentiora SDK errors.

```python
class MentioraError(Exception):
    def __init__(self, message: str, code: str)
    message: str
    code: str
    name: str
```

## ConfigurationError

Raised when the client configuration is invalid.

```python
class ConfigurationError(MentioraError):
    def __init__(self, message: str)
```

## ValidationError

Raised when trace event data is invalid.

```python
class ValidationError(MentioraError):
    def __init__(self, message: str)
```

## NetworkError

Raised when a network or HTTP error occurs. On 4xx/5xx responses, the SDK parses the server's JSON error body and exposes `server_code` and `server_message` for programmatic error handling.

```python
class NetworkError(MentioraError):
    def __init__(
        self,
        message: str,
        status_code: int | None = None,
        server_code: str | None = None,
        server_message: str | None = None,
    )
    status_code: int | None
    server_code: str | None     # e.g. 'agent_not_found', 'invalid_request'
    server_message: str | None  # Detailed error message from the server
```

</TabItem>
</SdkTabs>

---

**See also:** [Client](/api-reference/client) | [Tracing](/api-reference/tracing) | [Agents](/api-reference/agents)
