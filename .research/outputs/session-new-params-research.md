# ACP `session/new` Parameters Research

## Summary

The `session/new` JSON-RPC method requires **two** fields, not one. Our code currently sends only `{ cwd: string }`, but the ACP protocol schema requires **both** `cwd` (string) and `mcpServers` (McpServer[]). The `mcpServers` field is **required** per the schema, but can be an empty array `[]` when no MCP servers are needed. This is the cause of the "Invalid params" error -- the `@agentclientprotocol/sdk` validates incoming params with a Zod schema, and a missing `mcpServers` field triggers a `-32602 Invalid params` JSON-RPC error.

## Root Cause

The ACP TypeScript SDK (`@agentclientprotocol/sdk` v0.14.1, used by `claude-code-acp` v0.16.0) performs Zod schema validation on all incoming JSON-RPC request params before dispatching to the agent handler. The validation chain is:

```
Client sends session/new -> SDK receives -> zNewSessionRequest.parse(params) -> FAIL -> -32602
```

Specifically, in the SDK's `AgentSideConnection` request handler (`src/acp.ts`):

```typescript
case schema.AGENT_METHODS.session_new: {
  const validatedParams = validate.zNewSessionRequest.parse(params);
  return agent.newSession(validatedParams);
}
```

And the error handler catches Zod validation failures:

```typescript
if (error instanceof z.ZodError) {
  return RequestError.invalidParams(error.format()).toResult();
}
```

This returns the JSON-RPC error `{ code: -32602, message: "Invalid params", data: <zod error details> }`.

## Exact Expected Schema

### NewSessionRequest (TypeScript type from SDK)

```typescript
export type NewSessionRequest = {
  _meta?: { [key: string]: unknown } | null;  // optional
  cwd: string;                                  // REQUIRED
  mcpServers: Array<McpServer>;                 // REQUIRED
};
```

### Field Details

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `cwd` | `string` | **Yes** | Working directory for the session. Must be an absolute path. |
| `mcpServers` | `McpServer[]` | **Yes** | MCP servers the agent should connect to. Can be `[]`. |
| `_meta` | `object \| null` | No | Reserved for extensibility metadata. |

### McpServer Type (Discriminated Union)

`McpServer` is a discriminated union supporting three transport types:

**1. stdio (always supported)**
```typescript
{
  name: string;       // Human-readable identifier
  command: string;     // Path to MCP server executable
  args: string[];      // Command-line arguments
  env: EnvVariable[];  // Environment variables ({ name, value })
  _meta?: object | null;
}
```

**2. http (requires agent capability)**
```typescript
{
  type: "http";
  name: string;
  url: string;
  headers: HttpHeader[];  // ({ name, value })
  _meta?: object | null;
}
```

**3. sse (requires agent capability)**
```typescript
{
  type: "sse";
  name: string;
  url: string;
  headers: HttpHeader[];
  _meta?: object | null;
}
```

## The Fix

Our code in `server/acp/acp-client.ts` line 75:

```typescript
// CURRENT (broken)
async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
    return this.sendRequest<AcpCreateResult>("session/new", params);
}
```

Should be changed to:

```typescript
// FIXED
async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
    return this.sendRequest<AcpCreateResult>("session/new", {
        cwd: params.cwd,
        mcpServers: [],
    });
}
```

This passes an empty `mcpServers` array, which satisfies the Zod schema validation. The empty array is valid because we do not need to connect any MCP servers from the client side -- `claude-code-acp` handles its own MCP server setup internally.

## Corroboration from Go SDK Example

The ACP Go SDK example (`github.com/coder/acp-go-sdk`) confirms this pattern:

```go
sess, _ := conn.NewSession(ctx, NewSessionRequest{
    Cwd:        "/",
    McpServers: []McpServer{},
})
```

Both `Cwd` and `McpServers` are always provided. The Go example uses an empty slice.

## Protocol Reference (Official Spec)

From https://agentclientprotocol.com/protocol/session-setup:

> The `session/new` method creates a new conversation session. The client must provide the working directory (`cwd`) and a list of MCP servers (`mcpServers`). Sessions represent independent conversation contexts with their own history and state.

From https://agentclientprotocol.com/protocol/schema (NewSessionRequest):

> **Required:** `cwd` (string), `mcpServers` (McpServer[])
> **Optional:** `_meta` (object | null)

## Sources

- **ACP Official Schema**: https://agentclientprotocol.com/protocol/schema -- Authoritative, defines NewSessionRequest with both required fields
- **ACP Session Setup Docs**: https://agentclientprotocol.com/protocol/session-setup -- Authoritative, protocol documentation
- **ACP TypeScript SDK** (`@agentclientprotocol/sdk`): https://github.com/agentclientprotocol/typescript-sdk -- Source of Zod validation schemas (`src/schema/zod.gen.ts`, `src/schema/types.gen.ts`)
- **ACP JSON Schema**: https://github.com/agentclientprotocol/typescript-sdk/blob/main/schema/schema.json -- The canonical JSON Schema definition
- **claude-code-acp v0.16.0**: https://github.com/zed-industries/claude-code-acp -- Uses `@agentclientprotocol/sdk` v0.14.1 which enforces schema validation
- **ACP Go SDK example**: https://pkg.go.dev/github.com/coder/acp-go-sdk -- Confirms `NewSessionRequest{Cwd, McpServers}` pattern

## Confidence Assessment

- **Overall Confidence:** High
- The schema is confirmed from three independent sources: the official ACP JSON schema, the TypeScript SDK's generated Zod schemas, and the Go SDK's type definitions
- The Zod validation path in the SDK is clearly visible in the source code
- The fix (adding `mcpServers: []`) is the standard pattern used by other ACP clients
- **No areas of uncertainty** -- the required fields are unambiguous in the protocol spec
