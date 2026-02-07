import type { WebSocket } from '@fastify/websocket';
import type { ClientMessage, ServerMessage } from '../shared/types';

/**
 * WebSocket connection handler.
 * Routes client messages to project-store, session-manager, agent-manager.
 * Sends server messages back to the connected client.
 */
export function handleWebSocket(socket: WebSocket): void {
  console.log('[ws] Client connected');

  socket.on('message', (raw: Buffer | string) => {
    try {
      const message: ClientMessage = JSON.parse(
        typeof raw === 'string' ? raw : raw.toString('utf-8')
      );
      console.log('[ws] Received:', message.type);

      // Message routing will be implemented per-story.
      // For now, send an error response for any message.
      const response: ServerMessage = {
        type: 'error',
        requestId: message.requestId,
        message: `Handler not implemented: ${message.type}`,
      };
      socket.send(JSON.stringify(response));
    } catch (err) {
      console.error('[ws] Failed to parse message:', err);
      const response: ServerMessage = {
        type: 'error',
        message: 'Invalid message format',
      };
      socket.send(JSON.stringify(response));
    }
  });

  socket.on('close', () => {
    console.log('[ws] Client disconnected');
  });

  socket.on('error', (err: Error) => {
    console.error('[ws] Socket error:', err.message);
  });
}
