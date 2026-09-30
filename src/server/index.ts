import express from 'express';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import { applyMove, rollSticks } from '../shared/engine.js';
import { chooseBotMove } from './bot.js';
import { GameSession, parseCommand, type CodedError } from './session.js';

const app = express();
const server = createServer(app);
const webRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../client');
app.use(express.static(webRoot));
app.get('/health', (_request, response) => response.json({ ok: true }));
app.use((_request, response) => response.sendFile(path.join(webRoot, 'index.html')));

const sessions = new Map<string, GameSession>();
const clients = new Map<string, Set<WebSocket>>();
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16_384 });

function send(socket: WebSocket, type: string, payload: unknown): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type, eventId: randomUUID(), timestamp: Date.now(), payload }));
}
function broadcast(gameId: string, type: string, payload: unknown): void { for (const socket of clients.get(gameId) ?? []) send(socket, type, payload); }
function statePayload(session: GameSession) { return { state: session.state, history: session.state.history.slice(-100) }; }

async function runBot(session: GameSession): Promise<void> {
  while (session.state.currentPlayer === 'bot' && !session.state.result && session.state.phase !== 'PAUSED') {
    broadcast(session.state.gameId, 'bot:thinking', { active: true });
    await new Promise(resolve => setTimeout(resolve, 500));
    const ready = structuredClone(session.state); ready.phase = 'ROLLING';
    session.state = rollSticks(ready);
    broadcast(session.state.gameId, 'game:state', statePayload(session));
    if (session.state.currentPlayer !== 'bot' || session.state.result) break;
    await new Promise(resolve => setTimeout(resolve, 450));
    session.state = applyMove(session.state, chooseBotMove(session.state));
    broadcast(session.state.gameId, 'game:state', statePayload(session));
  }
  broadcast(session.state.gameId, 'bot:thinking', { active: false });
  if (session.state.result) broadcast(session.state.gameId, 'game:ended', session.state.result);
}

wss.on('connection', (socket, request) => {
  const query = new URL(request.url ?? '', 'http://localhost').searchParams;
  const requested = query.get('gameId');
  const session = requested && sessions.get(requested) || new GameSession();
  sessions.set(session.state.gameId, session);
  const group = clients.get(session.state.gameId) ?? new Set<WebSocket>(); group.add(socket); clients.set(session.state.gameId, group);
  send(socket, 'game:state', statePayload(session));
  socket.on('message', async raw => {
    try {
      const command = parseCommand(JSON.parse(raw.toString()));
      const state = session.execute(command);
      broadcast(state.gameId, 'game:state', statePayload(session));
      if (state.currentPlayer === 'bot' && !state.result && state.phase !== 'PAUSED') void runBot(session);
    } catch (error) {
      const issue = error as CodedError;
      send(socket, 'game:error', { code: issue.code ?? 'INVALID_COMMAND', message: issue.code ? issue.message : 'Malformed or invalid command', recoverable: true, currentVersion: session.state.version, snapshot: session.state });
    }
  });
  socket.on('close', () => { group.delete(socket); });
});

const port = Number(process.env.PORT ?? 3000);
server.listen(port, () => console.log(`Puluc listening on http://localhost:${port}`));
