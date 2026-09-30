import { describe, expect, it } from 'vitest';
import { chooseBotMove } from '../src/server/bot.js';
import { GameSession, parseCommand } from '../src/server/session.js';
import { rollSticks } from '../src/shared/engine.js';

describe('authoritative commands', () => {
  it('rejects malformed, stale, and client-authored roll data', () => {
    const session = new GameSession('g'); const before = structuredClone(session.state);
    expect(() => parseCommand({ type: 'game:roll', gameId: 'g', commandId: 'x', expectedVersion: 0, value: 5 })).toThrow();
    expect(() => session.execute({ type: 'game:roll', gameId: 'g', commandId: 'x', expectedVersion: 9 })).toThrow(/out of date/);
    expect(session.state).toEqual(before);
  });

  it('makes duplicate command IDs idempotent', () => {
    const session = new GameSession('g'); const command = { type: 'game:roll' as const, gameId: 'g', commandId: 'same', expectedVersion: 0 };
    const first = session.execute(command, () => 0.6, 10); const second = session.execute(command, () => 0.1, 20);
    expect(second).toEqual(first); expect(session.state.version).toBe(first.version);
  });

  it('chooses only a server-generated legal bot move', () => {
    const session = new GameSession('g'); session.state.currentPlayer = 'bot'; session.state.phase = 'ROLLING';
    session.state = rollSticks(session.state, () => 0.9);
    if (session.state.legalMoves.length) expect(session.state.legalMoves).toContainEqual(chooseBotMove(session.state, () => 0));
  });
});
