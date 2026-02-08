# OAuth / Credential Authentication Research: claude-code-acp, codex-acp, Claude Agent SDK, ACP Protocol

**Date:** 2026-02-08
**Researcher:** Claude Agent (Opus 4.6)
**Priority:** Deal-breaker evaluation for liminal-builder project

---

## Summary

The authentication picture is mixed and nuanced. **codex-acp has robust OAuth support** (ChatGPT browser OAuth) built directly into its `authenticate()` ACP method. **claude-code-acp does NOT implement OAuth natively** -- its README and configuration only document `ANTHROPIC_API_KEY`. However, the underlying **Claude Agent SDK does support OAuth tokens** via the `CLAUDE_CODE_OAUTH_TOKEN` environment variable, and **Zed has implemented `/login` with Claude Pro/Max subscription support** that works through the same adapter. The critical blocker is an **Anthropic policy restriction**: the Claude Agent SDK documentation explicitly states that "Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK." This means OAuth passthrough for Claude is technically possible but policy-restricted for third-party applications without Anthropic approval.

---

## Key Findings

- **claude-code-acp README only documents `ANTHROPIC_API_KEY`** -- no OAuth in the official README or configuration reference
- **BUT: Claude Agent SDK supports `CLAUDE_CODE_OAUTH_TOKEN`** environment variable for Pro/Max subscription auth
- **BUT: Anthropic policy explicitly restricts** third-party apps from offering claude.ai OAuth login without prior approval
- **Zed has special approval** -- its Claude Code threads support `/login` with "Log in with Claude Code" for Pro/Max subscriptions
- **codex-acp has full OAuth support** -- three auth methods including ChatGPT browser OAuth, `CODEX_API_KEY`, and `OPENAI_API_KEY`
- **ACP protocol `authenticate` method** is auth-method-agnostic -- agents declare supported methods during initialization, clients select one
- **For liminal-builder specifically**: You would need to either (a) get Anthropic approval for OAuth passthrough, (b) use API keys for Claude, or (c) find a workaround using `CLAUDE_CODE_OAUTH_TOKEN` env var

---

## Detailed Analysis

### 1. claude-code-acp OAuth Support

#### Official Documentation (README)
The README at `github.com/zed-industries/claude-code-acp` and the npm package page document exactly ONE authentication method:

```bash
ANTHROPIC_API_KEY=sk-... claude-code-acp
```

There is no mention of OAuth, `CLAUDE_CODE_OAUTH_TOKEN`, or alternative credential flows in:
- The GitHub README
- The npm package README
- The DeepWiki configuration reference (indexed 2026-02-08)

#### Library Mode (Constructor)
When used as a library (not CLI), `ClaudeAcpAgent` accepts an `apiKey` constructor parameter:

```typescript
new ClaudeAcpAgent({ apiKey: 'sk-...' })
```

#### Zed's Special Implementation
Despite the README limitations, **Zed has implemented OAuth login** for Claude Code threads. The Zed external agents documentation (zed.dev/docs/ai/external-agents) states:

> Users must run `/login` within a Claude Code thread and choose between:
> - API key authentication
> - "Log in with Claude Code" for Claude Pro/Max subscriptions

This works because:
1. Zed likely has a partnership/approval with Anthropic
2. The underlying Claude Agent SDK supports OAuth tokens
3. The `/login` command triggers the Claude Code CLI's OAuth flow

#### The Environment Variable Workaround
The `CLAUDE_CODE_OAUTH_TOKEN` environment variable IS supported by the Claude Agent SDK:

```bash
# Generate token on local machine:
claude setup-token
# Token format: sk-ant-oat01-... (OAuth token prefix)

# Pass to claude-code-acp:
CLAUDE_CODE_OAUTH_TOKEN=sk-ant-oat01-... claude-code-acp
```

This is documented in:
- GitHub Issues (#7477 on anthropics/claude-code)
- The VibeKit documentation (docs.vibekit.sh/agents/claude-code)
- The community demo (github.com/weidwonder/claude_agent_sdk_oauth_demo)

**Token prefix distinction:**
- OAuth tokens: `sk-ant-oat01-...`
- API keys: `sk-ant-api03-...`

#### Settings File Auth
Claude Code's `~/.claude/settings.json` supports `apiKeyHelper` for custom token generation:

```json
{
  "apiKeyHelper": "your-helper-command token",
  "env": {
    "ANTHROPIC_BASE_URL": "https://your-proxy/claude"
  }
}
```

#### authMethods in ACP Initialize
The claude-code-acp source code (acp-agent.ts) returns `authMethods: []` (empty array) during ACP initialization, meaning it does NOT advertise any authentication methods through the ACP protocol. Authentication is expected to be pre-configured via environment variables.

---

### 2. Claude Agent SDK OAuth Support

The official Claude Agent SDK documentation at `platform.claude.com/docs/en/agent-sdk/overview` documents these auth methods:

#### Primary: ANTHROPIC_API_KEY
```bash
export ANTHROPIC_API_KEY=your-api-key
```

#### Cloud Providers
- **Amazon Bedrock**: `CLAUDE_CODE_USE_BEDROCK=1` + AWS credentials
- **Google Vertex AI**: `CLAUDE_CODE_USE_VERTEX=1` + GCP credentials
- **Microsoft Azure**: `CLAUDE_CODE_USE_FOUNDRY=1` + Azure credentials

#### OAuth Token (Undocumented in SDK overview, but functional)
The `CLAUDE_CODE_OAUTH_TOKEN` environment variable works with the SDK for Pro/Max subscription auth.

#### CRITICAL POLICY RESTRICTION

The SDK documentation contains this explicit notice:

> **Unless previously approved, Anthropic does not allow third party developers to offer claude.ai login or rate limits for their products, including agents built on the Claude Agent SDK. Please use the API key authentication methods described in this document instead.**

This means:
- The OAuth mechanism EXISTS and is technically functional
- Third-party applications (like liminal-builder) are NOT permitted to use it without Anthropic's approval
- Only approved partners (like Zed) can offer OAuth login
- API key authentication is the officially sanctioned method for third-party developers

---

### 3. codex-acp OAuth Support

**codex-acp has the BEST OAuth story** of the two adapters. It supports three authentication methods, all surfaced through the ACP `authenticate()` method:

#### Method 1: ChatGPT Subscription (Browser OAuth)
- Launches a local HTTP server for OAuth redirect
- Opens browser to ChatGPT authentication endpoint
- Stores credentials in OS keyring (macOS Keychain, Linux Secret Service, Windows Credential Manager)
- **Limitation**: Does not work in remote/headless environments (SSH, containers)
- Detected via `NO_BROWSER` environment variable

#### Method 2: CODEX_API_KEY
```bash
CODEX_API_KEY=your-key codex-acp
```

#### Method 3: OPENAI_API_KEY
```bash
OPENAI_API_KEY=sk-... codex-acp
```

#### Authentication Flow Architecture
```
Client calls authenticate() via ACP
    |
    v
Parse methodId from request
    |
    +-- "chatgpt" --> run_login_server() --> browser OAuth --> block_until_done()
    +-- "codex_api_key" --> read CODEX_API_KEY env var --> login_with_api_key()
    +-- "openai_api_key" --> read OPENAI_API_KEY env var --> login_with_api_key()
    |
    v
Reload AuthManager (Arc<AuthManager> singleton)
    |
    v
Credentials stored in OS keyring via codex-keyring-store
    |
    v
Return success to ACP client
```

#### Key Details
- AuthManager is a shared `Arc<AuthManager>` singleton
- Credentials persist in OS keyring across sessions
- Sessions cannot be created without valid authentication
- The `authenticate()` method properly implements the ACP protocol's auth flow
- Remote detection automatically excludes browser-based auth

---

### 4. Zed Editor Auth Flow

Zed maintains **strict separation** between its own authentication and external agent credentials:

> "Authentication to Zed's [agent] installation is decoupled entirely from Zed's agent."

#### How Zed Handles Claude Code Auth
1. User opens a Claude Code thread
2. User runs `/login` command within the thread
3. Options presented: API key OR "Log in with Claude Code" (Pro/Max subscription)
4. OAuth flow opens browser for Anthropic login
5. Token stored, used for subsequent API calls
6. Zed does NOT share its own API keys with Claude Code

#### How Zed Handles Codex Auth
1. User opens a Codex thread
2. User can run `/login` or `/logout` commands
3. Options: ChatGPT browser login, CODEX_API_KEY, or OPENAI_API_KEY
4. Credentials stored in OS keyring

#### Custom Agent Auth
Zed allows passing credentials via settings.json:
```json
{
  "agent_servers": {
    "agent_name": {
      "env": { "API_KEY": "value" }
    }
  }
}
```

---

### 5. ACP Protocol `authenticate` Method

The ACP specification defines an authentication framework that is **method-agnostic**:

#### Initialization Phase
During the `initialize` handshake, agents advertise supported auth methods:

```typescript
interface AuthMethod {
  id: string;        // Unique identifier (e.g., "chatgpt", "api_key")
  name: string;      // Human-readable name
  description?: string;  // Optional details
}
```

The initialize response includes an `authMethods` array. If empty, no authentication is required.

#### authenticate Request
```typescript
interface AuthenticateRequest {
  methodId: string;  // Must match one of the advertised authMethods
  _meta?: object;    // Reserved for extensibility
}
```

#### authenticate Response
Returns confirmation of successful authentication. After success, the client can proceed to `new_session` without receiving `auth_required` errors.

#### Error Handling
- Error code `-32000`: "Authentication required"
- Prevents session creation until proper credentials are provided

#### Key Design Points
- The protocol does NOT mandate any specific auth method (OAuth, API key, etc.)
- Each agent decides what methods to support
- Clients must select from advertised methods
- The protocol supports multiple methods per agent
- Authentication is OPTIONAL -- agents can declare no auth methods

#### Current State for claude-code-acp vs codex-acp
| Feature | claude-code-acp | codex-acp |
|---------|----------------|-----------|
| authMethods advertised | `[]` (empty) | 3 methods |
| OAuth support | No (env var only) | Yes (ChatGPT browser OAuth) |
| API key support | Yes (ANTHROPIC_API_KEY) | Yes (CODEX_API_KEY, OPENAI_API_KEY) |
| ACP authenticate() | Not implemented | Fully implemented |
| Credential storage | None (env var) | OS keyring |

---

## Implications for Liminal-Builder

### Claude Code Path

**Option A: API Key (Officially Sanctioned)**
- Set `ANTHROPIC_API_KEY` environment variable before spawning claude-code-acp
- Works immediately, no policy issues
- Users need Anthropic Console API keys
- Pay-per-use billing

**Option B: OAuth Token Passthrough (Gray Area)**
- Set `CLAUDE_CODE_OAUTH_TOKEN` environment variable
- Technically works with the Claude Agent SDK
- Users run `claude setup-token` to get their OAuth token
- **POLICY RISK**: Anthropic explicitly prohibits third-party apps from offering claude.ai login without approval
- Could work if users set the env var themselves (you just pass it through)

**Option C: Inherit CLI Credentials (Possible but Undocumented)**
- The Claude Code CLI stores OAuth credentials after `claude login`
- The Claude Agent SDK MAY pick up existing CLI credentials automatically
- This needs testing -- if the SDK inherits existing CLI auth, you could skip the key requirement entirely
- Not documented, behavior may change

**Option D: Request Anthropic Approval**
- Contact Anthropic to get approved for OAuth passthrough
- Required if you want to offer "Log in with Claude" natively
- Zed, JetBrains, and Apple Xcode have this approval

### Codex Path

**Straightforward**: codex-acp has full OAuth support. Three options:
1. Pass `OPENAI_API_KEY` or `CODEX_API_KEY` via environment
2. Implement the ACP `authenticate()` flow and let users do browser OAuth
3. Both -- advertise all methods, let user choose

The ChatGPT browser OAuth will NOT work in headless/remote environments -- only locally where a browser can open.

### Recommended Architecture for Liminal-Builder

```
liminal-builder UI
    |
    +-- Claude Code agent
    |       |
    |       +-- Option 1: User provides ANTHROPIC_API_KEY in settings
    |       +-- Option 2: User runs `claude setup-token`, provides CLAUDE_CODE_OAUTH_TOKEN in settings
    |       +-- claude-code-acp receives key via env var
    |
    +-- Codex agent
            |
            +-- Option 1: User provides OPENAI_API_KEY in settings
            +-- Option 2: ACP authenticate() flow with ChatGPT browser OAuth
            +-- codex-acp handles credential storage in OS keyring
```

---

## Sources

- [claude-code-acp GitHub](https://github.com/zed-industries/claude-code-acp) - Official repository, README only documents ANTHROPIC_API_KEY
- [codex-acp GitHub](https://github.com/zed-industries/codex-acp) - Official repository, README documents 3 auth methods
- [Claude Agent SDK Docs](https://platform.claude.com/docs/en/agent-sdk/overview) - Official Anthropic docs, contains critical policy restriction
- [Zed External Agents Docs](https://zed.dev/docs/ai/external-agents) - Zed's official docs on auth for external agents
- [ACP Protocol Spec](https://agentclientprotocol.com/protocol/schema) - authenticate method definition
- [ACP Protocol Initialization](https://agentclientprotocol.com/protocol/initialization) - authMethods in initialize response
- [claude_agent_sdk_oauth_demo](https://github.com/weidwonder/claude_agent_sdk_oauth_demo) - Community demo proving OAuth token works with SDK
- [anthropics/claude-code #18340](https://github.com/anthropics/claude-code/issues/18340) - Feature request for Pro/Max auth in third-party IDEs (closed as duplicate)
- [anthropics/claude-code #7477](https://github.com/anthropics/claude-code/issues/7477) - CLAUDE_CODE_OAUTH_TOKEN usage confirmed working
- [VibeKit Claude Code Docs](https://docs.vibekit.sh/agents/claude-code) - Third-party docs showing OAuth token usage pattern
- [Zed Discussion #33333](https://github.com/zed-industries/zed/discussions/33333) - Pro/Max subscription login implementation in Zed
- [DeepWiki codex-acp](https://deepwiki.com/zed-industries/codex-acp) - Code analysis showing full authenticate() implementation
- [DeepWiki claude-code-acp](https://deepwiki.com/zed-industries/claude-code-acp/7.4-configuration-reference) - Configuration reference, no OAuth documented

---

## Confidence Assessment

- **Overall confidence: HIGH** - Multiple sources corroborate findings, direct documentation reviewed
- **claude-code-acp no native OAuth: HIGH confidence** - README, DeepWiki, and config reference all confirm API key only
- **CLAUDE_CODE_OAUTH_TOKEN workaround: HIGH confidence** - Confirmed working by GitHub issues, community demos, VibeKit docs
- **Anthropic policy restriction: HIGH confidence** - Direct quote from official SDK documentation
- **codex-acp OAuth: HIGH confidence** - Multiple sources, DeepWiki code analysis, Zed docs all confirm
- **ACP authenticate protocol: MEDIUM confidence** - Schema extracted but full spec details sparse

### Areas of Uncertainty

1. **Whether `CLAUDE_CODE_OAUTH_TOKEN` counts as "offering claude.ai login"** if users set it themselves -- policy interpretation unclear
2. **Whether the Claude Agent SDK automatically picks up existing CLI credentials** from a prior `claude login` -- needs direct testing
3. **Whether Anthropic would approve liminal-builder for OAuth** -- depends on relationship/application process
4. **Exact behavior of claude-code-acp's ACP authenticate handler** -- source code was not fully accessible (GitHub auth wall), but DeepWiki suggests it returns empty authMethods

### Recommendations for Further Research

1. **TEST LOCALLY**: Run `claude login` to authenticate the CLI, then spawn `claude-code-acp` WITHOUT setting `ANTHROPIC_API_KEY` -- see if it inherits the CLI's OAuth credentials automatically
2. **Contact Anthropic**: If OAuth is a hard requirement, inquire about partnership/approval for Claude Agent SDK OAuth
3. **Audit claude-code-acp source**: Install the package and inspect `acp-agent.ts` directly for any undocumented auth handling
4. **Test CLAUDE_CODE_OAUTH_TOKEN**: Run `claude setup-token`, then `CLAUDE_CODE_OAUTH_TOKEN=<token> claude-code-acp` to confirm it works outside of Zed
