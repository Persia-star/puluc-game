import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { applyMove, createGame, rollSticks, validateState } from '../shared/engine.js';
import type { Difficulty, GameState, Move } from '../shared/types.js';

const base = z.object({ type: z.string().max(40), gameId: z.string().max(80), commandId: z.string().min(1).max(100), expectedVersion: z.number().int().nonnegative() }).strict();
const source = z.union([z.object({ type: z.literal('reserve'), owner: z.literal('human') }), z.object({ type: z.literal('board'), index: z.number().int().min(0).max(10) })]);
export const commandSchema = z.discriminatedUnion('type', [
  base.extend({ type: z.literal('game:roll') }).strict(),
  base.extend({ type: z.literal('game:move'), move: z.object({ source, targetIndex: z.number().int().min(0).max(10), dieValue: z.number().int().min(1).max(5) }).strict() }).strict(),
  base.extend({ type: z.literal('game:restart'), piecesPerPlayer: z.union([z.literal(4), z.literal(5), z.literal(6)]), difficulty: z.enum(['easy', 'medium', 'hard']) }).strict(),
  base.extend({ type: z.literal('game:pause') }).strict(),
  base.extend({ type: z.literal('game:resumePlay') }).strict()
]);
export type Command = z.infer<typeof commandSchema>;

export class GameSession {
  state: GameState;
  private commandResults = new Map<string, GameState>();
  constructor(gameId = randomUUID()) { this.state = createGame({ gameId }); }

  execute(command: Command, rng = Math.random, now = Date.now()): GameState {
    const prior = this.commandResults.get(command.commandId);
    if (prior) return structuredClone(prior);
    if (command.gameId !== this.state.gameId) throw coded('GAME_NOT_FOUND', 'Unknown game session');
    if (command.expectedVersion !== this.state.version) throw coded('VERSION_MISMATCH', 'Your view is out of date');
    let next: GameState;
    switch (command.type) {
      case 'game:roll':
        if (this.state.currentPlayer !== 'human') throw coded('NOT_YOUR_TURN', 'Wait for the bot');
        next = rollSticks(this.state, rng, now); break;
      case 'game:move':
        if (this.state.currentPlayer !== 'human') throw coded('NOT_YOUR_TURN', 'Wait for the bot');
        next = applyMove(this.state, command.move as Move, now); break;
      case 'game:restart':
        next = createGame({ gameId: this.state.gameId, piecesPerPlayer: command.piecesPerPlayer, difficulty: command.difficulty, now });
        next.version = this.state.version + 1; break;
      case 'game:pause':
        if (this.state.phase === 'FINISHED') throw coded('INVALID_PHASE', 'Finished games cannot be paused');
        next = structuredClone(this.state); next.version++; next.phase = 'PAUSED'; break;
      case 'game:resumePlay':
        if (this.state.phase !== 'PAUSED') throw coded('INVALID_PHASE', 'Game is not paused');
        next = structuredClone(this.state); next.version++; next.phase = next.currentPlayer === 'human' ? 'ROLLING' : 'BOT_THINKING'; break;
    }
    validateState(next);
    this.state = next;
    this.commandResults.set(command.commandId, structuredClone(next));
    if (this.commandResults.size > 200) this.commandResults.delete(this.commandResults.keys().next().value!);
    return structuredClone(next);
  }
}

export type CodedError = Error & { code: string };
function coded(code: string, message: string): CodedError { return Object.assign(new Error(message), { code }); }
export function parseCommand(value: unknown): Command { return commandSchema.parse(value); }
export const isDifficulty = (value: string): value is Difficulty => ['easy', 'medium', 'hard'].includes(value);
