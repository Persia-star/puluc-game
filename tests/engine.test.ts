import { describe, expect, it } from 'vitest';
import { applyMove, checkGameOver, countLivingPieces, createGame, deserializeState, getController, getLegalMoves, rollSticks, serializeState, sticksToValue, validateState } from '../src/shared/engine.js';
import type { GameState, Piece } from '../src/shared/types.js';

const piece = (id: string, owner: 'human' | 'bot'): Piece => ({ id, owner });

describe('casting sticks', () => {
  it('maps all painted counts to Puluc values', () => {
    expect(sticksToValue([false, false, false, false])).toBe(5);
    for (let painted = 1; painted <= 4; painted++) expect(sticksToValue(Array.from({ length: 4 }, (_, index) => index < painted))).toBe(painted);
  });

  it('uses injected deterministic randomness and grants extra turns only after moving', () => {
    let calls = 0; let state = rollSticks(createGame(), () => calls++ === 0 ? 0.9 : 0.1, 10);
    expect(state.currentRoll?.value).toBe(1);
    state = applyMove(state, state.legalMoves[0], 11);
    expect(state.currentPlayer).toBe('human');
    expect(state.phase).toBe('ROLLING');
  });
});

describe('movement and stacks', () => {
  it('allows reserve entry only on one', () => {
    const state = createGame();
    expect(getLegalMoves(state, 1).some(move => move.source.type === 'reserve')).toBe(true);
    expect(getLegalMoves(state, 2).some(move => move.source.type === 'reserve')).toBe(false);
  });

  it('moves in both directions from enemy endpoints and rejects overflow', () => {
    const state = createGame(); state.reserves.human.shift(); state.stacks = [{ position: 10, direction: -1, piecesBottomToTop: [piece('human-1', 'human')] }];
    expect(getLegalMoves(state, 3)[0].targetIndex).toBe(7);
    state.stacks[0].position = 1; state.stacks[0].direction = -1;
    expect(getLegalMoves(state, 3)).toHaveLength(0);
  });

  it('merges destination then moving pieces and changes controller', () => {
    let state = createGame();
    state.reserves.human = state.reserves.human.filter(item => item.id !== 'human-1');
    state.reserves.bot = state.reserves.bot.filter(item => item.id !== 'bot-1');
    state.stacks = [{ position: 1, direction: 1, piecesBottomToTop: [piece('human-1', 'human')] }, { position: 2, direction: -1, piecesBottomToTop: [piece('bot-1', 'bot')] }];
    state.currentRoll = { sticks: [true, false, false, false], value: 1 }; state.legalMoves = getLegalMoves(state, 1); state.phase = 'SELECTING_MOVE';
    state = applyMove(state, state.legalMoves.find(move => move.source.type === 'board')!, 20);
    const stack = state.stacks.find(item => item.position === 2)!;
    expect(stack.piecesBottomToTop.map(item => item.id)).toEqual(['bot-1', 'human-1']);
    expect(getController(stack)).toBe('human');
  });

  it('frees friendly layers and eliminates enemy layers at home', () => {
    let state = createGame();
    state.reserves.human = state.reserves.human.filter(item => item.id !== 'human-1');
    state.reserves.bot = state.reserves.bot.filter(item => item.id !== 'bot-1');
    state.stacks = [{ position: 1, direction: -1, piecesBottomToTop: [piece('bot-1', 'bot'), piece('human-1', 'human')] }];
    state.currentRoll = { sticks: [true, false, false, false], value: 1 }; state.legalMoves = getLegalMoves(state, 1); state.phase = 'SELECTING_MOVE';
    state = applyMove(state, state.legalMoves.find(move => move.source.type === 'board')!, 30);
    expect(state.stacks).toHaveLength(0); expect(state.reserves.human.some(item => item.id === 'human-1')).toBe(true);
    expect(state.eliminated.bot.map(item => item.id)).toContain('bot-1'); validateState(state);
  });
});

describe('end conditions and persistence', () => {
  it('counts captured pieces as living and detects elimination', () => {
    const state = createGame();
    expect(countLivingPieces(state, 'bot')).toBe(5);
    state.eliminated.bot.push(...state.reserves.bot.splice(0)); checkGameOver(state);
    expect(state.result?.winner).toBe('human'); expect(state.phase).toBe('FINISHED');
  });

  it('draws at the half-move limit and round-trips serialized state', () => {
    const state = createGame(); state.halfMoves = 500; checkGameOver(state);
    expect(state.result?.draw).toBe(true); expect(deserializeState(serializeState(state))).toEqual(state);
  });
});
