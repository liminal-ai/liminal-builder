import { NotImplementedError } from '../errors';
import type { CliType } from '../sessions/session-types';
import type { AcpClient } from './acp-client';
import { EventEmitter } from 'events';

export type AgentStatus = 'idle' | 'starting' | 'connected' | 'disconnected' | 'reconnecting';

/**
 * Manages ACP agent process lifecycle for all CLI types.
 * One process per CLI type, spawned on demand, monitored for health.
 *
 * Covers: AC-5.1 (auto-start), AC-5.2 (status), AC-5.3 (shutdown),
 *         AC-5.5 (start failure)
 */
export class AgentManager {
  private emitter: EventEmitter;

  constructor(emitter: EventEmitter) {
    this.emitter = emitter;
  }

  /** Get or spawn agent for CLI type. Emits status events. */
  async ensureAgent(cliType: CliType): Promise<AcpClient> {
    throw new NotImplementedError('AgentManager.ensureAgent');
  }

  /** Get current status for a CLI type */
  getStatus(cliType: CliType): AgentStatus {
    throw new NotImplementedError('AgentManager.getStatus');
  }

  /** User-initiated reconnect */
  async reconnect(cliType: CliType): Promise<void> {
    throw new NotImplementedError('AgentManager.reconnect');
  }

  /** Shutdown all agents gracefully */
  async shutdownAll(): Promise<void> {
    throw new NotImplementedError('AgentManager.shutdownAll');
  }
}
