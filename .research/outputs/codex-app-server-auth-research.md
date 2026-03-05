# Codex App Server Authentication Research

**Date:** 2026-02-22
**Question:** Can a wrapper application (IDE) provide auth credentials to the Codex App Server process without requiring interactive browser login?

## Summary

**Yes, definitively.** The Codex App Server supports three distinct authentication modes, two of which are fully programmatic and require no interactive browser flow. A wrapper application can either (1) pass an OpenAI API key directly via JSON-RPC, or (2) manage ChatGPT OAuth tokens externally and inject them into the app-server process. There are no environment variables for auth -- all credential passing happens over the JSON-RPC wire protocol after the `initialize` handshake.

## Key Findings

- **Three auth modes:** `apiKey`, `chatgpt` (interactive browser), and `chatgptAuthTokens` (external token injection)
- **API key mode is fully non-interactive:** Send `account/login/start` with `type: "apiKey"` and the key string. Done.
- **External token mode (`chatgptAuthTokens`) is designed exactly for wrapper apps:** The host manages the OAuth lifecycle and pushes `idToken` + `accessToken` into the server via JSON-RPC
- **No environment variables for auth:** Authentication is exclusively via the JSON-RPC protocol, not env vars or config files (at the app-server level)
- **Token refresh is a callback contract:** When tokens expire, the server sends `account/chatgptAuthTokens/refresh` to the client, which must respond with fresh tokens within ~10 seconds
- **Credential caching exists at CLI level** (`~/.codex/auth.json` or system keyring) but the app-server itself is stateless regarding auth -- it receives credentials per-session from the client

## Detailed Analysis

### Authentication Mode 1: API Key (Fully Programmatic)

The simplest path for a wrapper application. Send an OpenAI API key directly:

```json
{
  "method": "account/login/start",
  "id": 2,
  "params": {
    "type": "apiKey",
    "apiKey": "sk-..."
  }
}
```

The server stores the key and uses it for all subsequent API requests. The server emits `account/login/completed` on success. This mode bills to the user's OpenAI Platform account at standard API rates.

**Limitations:** Some features like "cloud threads" (Codex cloud) are not available with API key auth -- they require ChatGPT auth. If your wrapper only needs local Codex agent functionality, API key mode is sufficient.

### Authentication Mode 2: ChatGPT Managed (Interactive Browser)

This is the "Sign in with ChatGPT" flow. The server handles the OAuth lifecycle internally:

```json
{
  "method": "account/login/start",
  "id": 3,
  "params": {
    "type": "chatgpt"
  }
}
```

The server opens a browser window, runs the OAuth flow, and stores/refreshes tokens automatically. This is what the CLI and IDE extensions use by default for ChatGPT Plus/Pro/Team subscription access.

**Not suitable for embedded wrapper use cases** where you want to control the auth experience.

### Authentication Mode 3: External ChatGPT Tokens (Designed for Wrappers)

This is the mode explicitly designed for host applications that manage their own OAuth lifecycle:

```json
{
  "method": "account/login/start",
  "id": 7,
  "params": {
    "type": "chatgptAuthTokens",
    "idToken": "<jwt>",
    "accessToken": "<jwt>"
  }
}
```

The server stores these tokens **in memory only** (not persisted to disk). When they expire and the server gets a 401:

```json
{
  "method": "account/chatgptAuthTokens/refresh",
  "id": 8,
  "params": {
    "reason": "unauthorized",
    "previousAccountId": "org-123"
  }
}
```

The wrapper must respond with fresh tokens. The server retries the original request after successful refresh. **Requests time out after ~10 seconds** if no refresh response is received.

### Protocol Lifecycle for a Wrapper

The full handshake sequence for a wrapper application:

1. **Spawn** `codex app-server` (default: stdio transport via JSONL)
2. **Send `initialize`** with `clientInfo` identifying your wrapper:
   ```json
   {
     "method": "initialize",
     "id": 0,
     "params": {
       "clientInfo": {
         "name": "liminal_builder",
         "title": "Liminal Builder",
         "version": "0.1.0"
       }
     }
   }
   ```
3. **Send `initialized` notification** (no `id`)
4. **Send `account/login/start`** with your chosen auth mode
5. **Listen for `account/login/completed`** notification
6. **Proceed with `thread/start`, `turn/start`, etc.**
7. **Handle `account/chatgptAuthTokens/refresh`** callbacks if using external token mode

### Notifications to Monitor

- `account/login/completed` -- login success/failure
- `account/updated` -- auth mode changes
- `account/rateLimits/updated` -- quota usage (ChatGPT auth only)

### Important: clientInfo Registration

The docs emphasize that `clientInfo.name` is used for the OpenAI Compliance Logs Platform. For enterprise integrations, OpenAI wants you to contact them to register your client name. This is a compliance requirement, not a technical blocker.

### Alternative: Custom Model Provider with env_key

At the **CLI/config level** (not app-server protocol level), you can configure a custom model provider that reads an API key from an environment variable:

```toml
[model_providers.openai-api]
name = "OpenAI (API key from env)"
base_url = "https://api.openai.com/v1"
wire_api = "responses"
env_key = "OPENAI_API_KEY"
requires_openai_auth = false
```

This bypasses the login screen entirely because `requires_openai_auth = false`. However, this operates at the config.toml level, not the app-server JSON-RPC level. For a wrapper spawning `codex app-server` directly, the JSON-RPC auth methods are the proper interface.

### Credential Storage Details

For reference, the CLI stores credentials at:
- `~/.codex/auth.json` (plaintext file) or
- OS system keyring (macOS Keychain, Windows Credential Manager)
- Controlled by `cli_auth_credentials_store` in config.toml (`file | keyring | auto`)

The app-server process itself can read from this cache if a user has previously authenticated via CLI, so if your wrapper ensures the user has logged in once via `codex login`, subsequent app-server sessions may pick up cached credentials automatically.

## Recommended Approach for Liminal Builder

**Option A -- API Key Mode (Simplest)**
- Store the user's API key in your app's secure storage
- Pass it via `account/login/start` with `type: "apiKey"` each session
- No browser flow, no token refresh handling needed
- Trade-off: no cloud thread features, billed at API rates

**Option B -- External Token Mode (Full Feature Access)**
- Implement OAuth flow once in your wrapper's native UI (Electron/Tauri webview, etc.)
- Cache the tokens securely in your app
- Inject via `account/login/start` with `type: "chatgptAuthTokens"`
- Handle `account/chatgptAuthTokens/refresh` callbacks
- Full access to ChatGPT subscription features including cloud threads

**Option C -- Hybrid**
- Let user choose API key or ChatGPT at first launch
- For ChatGPT: run the browser flow once, cache tokens, then use external token mode going forward
- For API key: straightforward injection

## Sources

- [Codex App Server Documentation](https://developers.openai.com/codex/app-server) -- Official developer docs, primary source. Highly authoritative.
- [Codex Authentication Documentation](https://developers.openai.com/codex/auth/) -- Official auth docs covering credential storage, login methods, and headless device support.
- [Codex App Server README (GitHub)](https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md) -- Open source README with protocol details.
- [Unlocking the Codex Harness (OpenAI Blog)](https://openai.com/index/unlocking-the-codex-harness/) -- Engineering blog post from Feb 2026 by Celia Chen describing the architecture.
- [OpenAI Community: Login with OPENAI_API_KEY](https://community.openai.com/t/login-with-openai-api-key-environment-variable/1371778) -- Community discussion with GPT-5.2 analysis of the Rust auth internals, including `env_key` config workaround.
- [Codex SDK Documentation](https://developers.openai.com/codex/sdk/) -- Alternative programmatic interface for CI/automation use cases.

## Confidence Assessment

- **Overall confidence: High.** The three auth modes are explicitly documented in the official app-server docs with JSON-RPC examples. The `chatgptAuthTokens` mode is unambiguously designed for the exact wrapper-app use case described.
- **Area of uncertainty:** Whether `chatgptAuthTokens` requires the wrapper to implement a full OAuth 2.0 flow against OpenAI's authorization server, or whether there's a simpler token acquisition path. The docs don't detail how the wrapper *obtains* the initial ChatGPT tokens -- only how to pass them to the app-server.
- **No conflicting information found** across sources. All sources consistently describe the same three auth modes.
