---
sidebar_position: 2
description: 'Create and manage API keys for the Mentiora SDK. Security best practices and troubleshooting.'
---

# Authentication

## Overview

Mentiora uses **project-scoped API keys** for SDK authentication. Keys are created in the Mentiora dashboard and tied to a specific project — all traces sent with a key are automatically associated with that project.

- Keys are managed in the **Settings** page of the dashboard
- Each project can have up to **5 API keys**
- Keys are hashed at rest and the plaintext is only shown once at creation

## Getting Your API Key

### Step 1: Open Settings

Sign in to the [Mentiora dashboard](https://platform.mentiora.ai) and navigate to the **Settings** page using the navigation menu. The **API Keys** section is displayed as a card on this page.

### Step 2: Create an API Key

Click **"Create API Key"** to open the creation dialog.

- Enter an optional **name** to identify this key (e.g., "Production", "Staging", "CI/CD")
- Click **Create**

The system generates a cryptographically random key (32 bytes, base64url-encoded).

### Step 3: Copy Your Key

**Important:** The full API key is only shown once at creation time. Copy it immediately using the copy button.

- Store it securely (environment variable, secrets manager, etc.)
- If you lose the key, delete it and create a new one
- After closing the dialog, only the key prefix (first 8 characters) is visible in the list for identification

## Using Your API Key

### Environment Variable (Recommended)

Create a `.env` file in your project root:

```env
MENTIORA_API_KEY=your-api-key-here
MENTIORA_BASE_URL=https://platform.mentiora.ai
```

Add `.env` to your `.gitignore` to avoid committing secrets.

### TypeScript/JavaScript

```typescript
import { MentioraClient } from '@mentiora.ai/sdk';

const client = new MentioraClient({
  apiKey: process.env.MENTIORA_API_KEY,
});
```

### Python

```python
import os
from mentiora import MentioraClient, MentioraConfig

client = MentioraClient(MentioraConfig(
    api_key=os.getenv('MENTIORA_API_KEY'),
))
```

The SDK sends traces via `POST /api/v1/traces` with the header `Authorization: Bearer <key>`.

## Managing API Keys

### Key Limits

- Maximum **5 API keys** per project
- The "Create API Key" button is disabled when the limit is reached

### Renaming Keys

Click the edit icon next to any key's name to rename it inline. Press Enter to save or Escape to cancel.

### Revoking Keys

Click the delete icon next to a key and confirm in the dialog. **This is irreversible** — any application using this key will immediately lose access.

### Monitoring Usage

The **"Last used"** column shows when each key was last used to send a trace.

## Security Best Practices

1. **Never commit API keys to version control** — use `.env` files (added to `.gitignore`) or a secrets manager
2. **Use separate keys per environment** — create distinct keys named "Production", "Staging", "Development"
3. **Rotate keys periodically** — delete old keys and create new ones
4. **Revoke unused keys** — if a key hasn't been used recently, delete it
5. **Use environment variables** — never hardcode keys in source code

## Troubleshooting

### "401 Unauthorized" errors

- Verify the API key is correct and hasn't been revoked
- Check that the `Authorization: Bearer <key>` header is being sent (enable `debug: true` in the SDK config for detailed logging)
- Ensure the key belongs to the correct project

### "Key not working after creation"

- Ensure you copied the **full key**, not just the 8-character prefix shown in the list
- Check for trailing whitespace or newlines in your environment variable
- Verify the environment variable name is exactly `MENTIORA_API_KEY`

## Next Steps

Now that you have your API key, follow the [Quick Start](/quick-start) guide to install the SDK and send your first trace.
