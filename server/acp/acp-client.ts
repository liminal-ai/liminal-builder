import { NotImplementedError } from '../errors';
import type {
  AcpInitializeResult,
  AcpCreateResult,
  AcpPromptResult,
  AcpUpdateEvent,
} from './acp-types';
import type { ChatEntry } from '../../shared/types';

/**
 * JSON-RPC client communicating with an ACP agent process over stdio.
 * Implements newline-delimited JSON-RPC 2.0.
 *
 * Mock boundary: Tests mock this class to simulate ACP agent behavior.
 * Covers: AC-5.1 (connection), all session operations via ACP
 */
export class AcpClient {
  constructor(
    _stdin: WritableStream,
    _stdout: ReadableStream
  ) {
    // Stubs -- no initialization needed yet
  }

  /** Send initialize handshake, negotiate capabilities. */
  async initialize(): Promise<AcpInitializeResult> {
    throw new NotImplementedError('AcpClient.initialize');
  }

  /** session/new -- Create a new session with working directory */
  async sessionNew(params: { cwd: string }): Promise<AcpCreateResult> {
    throw new NotImplementedError('AcpClient.sessionNew');
  }

  /** session/load -- Resume session. */
  async sessionLoad(sessionId: string, cwd: string): Promise<ChatEntry[]> {
    throw new NotImplementedError('AcpClient.sessionLoad');
  }

  /** session/prompt -- Send user message with streaming events. */
  async sessionPrompt(
    sessionId: string,
    content: string,
    onEvent: (event: AcpUpdateEvent) => void
  ): Promise<AcpPromptResult> {
    throw new NotImplementedError('AcpClient.sessionPrompt');
  }

  /** session/cancel -- Cancel in-progress prompt. */
  sessionCancel(sessionId: string): void {
    throw new NotImplementedError('AcpClient.sessionCancel');
  }

  /** Close stdin to signal shutdown. */
  async close(timeoutMs?: number): Promise<void> {
    throw new NotImplementedError('AcpClient.close');
  }

  /** Register handler for unexpected errors. */
  onError(handler: (error: Error) => void): void {
    throw new NotImplementedError('AcpClient.onError');
  }

  /** Whether agent supports session/load */
  get canLoadSession(): boolean {
    return false;
  }
}
