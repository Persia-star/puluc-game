import { randomUUID } from 'node:crypto';
import type { Difficulty, GameEvent, GameState, Move, Piece, PlayerId, RandomSource, Stack } from './types.js';

export const BOARD_MIN = 0;
export const BOARD_MAX = 10;
const opponent = (player: PlayerId): PlayerId => player === 'human' ? 'bot' : 'human';
const home = (player: PlayerId) => player === 'human' ? 0 : 10;

export function sticksToValue(sticks: boolean[]): number {
  if (sticks.length !== 4) throw new Error('Exactly four sticks are required');
  const painted = sticks.filter(Boolean).length;
  return painted === 0 ? 5 : painted;
}

export function getController(stack: Stack): PlayerId {
  const top = stack.piecesBottomToTop.at(-1);
  if (!top) throw new Error('Empty stacks are invalid');
  return top.owner;
}

export function createGame(options: { gameId?: string; piecesPerPlayer?: 4 | 5 | 6; difficulty?: Difficulty; now?: number } = {}): GameState {
  const piecesPerPlayer = options.piecesPerPlayer ?? 5;
  const makePieces = (owner: PlayerId): Piece[] => Array.from({ length: piecesPerPlayer }, (_, index) => ({ id: `${owner}-${index + 1}`, owner }));
  const state: GameState = {
    gameId: options.gameId ?? randomUUID(), version: 0, phase: 'ROLLING', currentPlayer: 'human', turnNumber: 1,
    halfMoves: 0, completedRounds: 0, piecesPerPlayer, difficulty: options.difficulty ?? 'medium',
    reserves: { human: makePieces('human'), bot: makePieces('bot') }, stacks: [], eliminated: { human: [], bot: [] },
    currentRoll: null, legalMoves: [], extraTurnPending: false, history: [], repetitionKeys: {}, result: null
  };
  recordRepetition(state);
  return state;
}

const outboundDirection = (player: PlayerId): 1 | -1 => player === 'human' ? 1 : -1;

export function getLegalMoves(state: GameState, dieValue: number, player = state.currentPlayer): Move[] {
  if (state.result || state.phase === 'PAUSED') return [];
  const moves: Move[] = [];
  if (dieValue === 1 && state.reserves[player].length) {
    moves.push({ source: { type: 'reserve', owner: player }, targetIndex: home(player), dieValue });
  }
  for (const stack of state.stacks) {
    if (getController(stack) !== player) continue;
    const targetIndex = stack.position + stack.direction * dieValue;
    if (targetIndex >= BOARD_MIN && targetIndex <= BOARD_MAX) {
      moves.push({ source: { type: 'board', index: stack.position }, targetIndex, dieValue });
    }
  }
  return moves;
}

function event(state: GameState, type: string, message: string, now: number): GameEvent {
  return { id: randomUUID(), type, message, version: state.version, timestamp: now };
}

function clone(state: GameState): GameState { return structuredClone(state); }

export function rollSticks(state: GameState, rng: RandomSource = Math.random, now = Date.now()): GameState {
  if (state.phase !== 'ROLLING' || state.result) throw new Error('Roll is not allowed now');
  const next = clone(state);
  const sticks = Array.from({ length: 4 }, () => rng() >= 0.5);
  const value = sticksToValue(sticks);
  next.version++;
  next.currentRoll = { sticks, value };
  next.legalMoves = getLegalMoves(next, value);
  next.extraTurnPending = value === 1 || value === 5;
  next.history.push(event(next, 'roll', `${next.currentPlayer} rolled ${value}`, now));
  if (!next.legalMoves.length) {
    next.history.push(event(next, 'pass', `${next.currentPlayer} has no legal move`, now));
    finishTurn(next, false, now);
  } else {
    next.phase = 'SELECTING_MOVE';
  }
  validateState(next);
  return next;
}

function sameMove(left: Move, right: Move): boolean { return JSON.stringify(left) === JSON.stringify(right); }

export function resolveHomecoming(state: GameState, stack: Stack, now = Date.now()): void {
  const controller = getController(stack);
  if (stack.position !== home(controller)) return;
  for (const piece of stack.piecesBottomToTop) {
    if (piece.owner === controller) {
      state.reserves[controller].push(piece);
      state.history.push(event(state, 'freed', `${piece.id} returned to reserve`, now));
    } else {
      state.eliminated[piece.owner].push(piece);
      state.history.push(event(state, 'eliminated', `${piece.id} was eliminated`, now));
    }
  }
  state.stacks = state.stacks.filter(candidate => candidate.position !== stack.position);
}

export function applyMove(state: GameState, move: Move, now = Date.now()): GameState {
  if (state.phase !== 'SELECTING_MOVE' || !state.currentRoll || state.result) throw new Error('Move is not allowed now');
  const legal = state.legalMoves.find(candidate => sameMove(candidate, move));
  if (!legal) throw new Error('Illegal move');
  const next = clone(state);
  let moving: Piece[];
  if (move.source.type === 'reserve') {
    const piece = next.reserves[next.currentPlayer].shift();
    if (!piece) throw new Error('Reserve is empty');
    moving = [piece];
  } else {
    const sourceIndex = move.source.index;
    const source = next.stacks.find(stack => stack.position === sourceIndex);
    if (!source || getController(source) !== next.currentPlayer) throw new Error('Source is not controlled by current player');
    moving = source.piecesBottomToTop;
    next.stacks = next.stacks.filter(stack => stack.position !== source.position);
  }
  let movingDirection: 1 | -1;
  if (move.source.type === 'reserve') movingDirection = outboundDirection(next.currentPlayer);
  else {
    const originalSourceIndex = move.source.index;
    movingDirection = state.stacks.find(stack => stack.position === originalSourceIndex)!.direction;
  }
  const target = next.stacks.find(stack => stack.position === move.targetIndex);
  if (target) { target.piecesBottomToTop.push(...moving); target.direction = movingDirection; }
  else next.stacks.push({ position: move.targetIndex, direction: movingDirection, piecesBottomToTop: moving });
  const landed = next.stacks.find(stack => stack.position === move.targetIndex)!;
  if ((next.currentPlayer === 'human' && landed.position === BOARD_MAX) || (next.currentPlayer === 'bot' && landed.position === BOARD_MIN)) landed.direction = landed.direction === 1 ? -1 : 1;
  next.stacks.sort((a, b) => a.position - b.position);
  next.version++;
  next.halfMoves++;
  next.history.push(event(next, 'move', `${next.currentPlayer} moved to ${move.targetIndex}`, now));
  const arrived = next.stacks.find(stack => stack.position === move.targetIndex);
  if (arrived && move.source.type === 'board') resolveHomecoming(next, arrived, now);
  next.currentRoll = null;
  next.legalMoves = [];
  checkGameOver(next, now);
  if (!next.result) finishTurn(next, next.extraTurnPending, now);
  validateState(next);
  return next;
}

function finishTurn(state: GameState, grantExtraTurn: boolean, now: number): void {
  state.currentRoll = null;
  state.legalMoves = [];
  state.extraTurnPending = false;
  if (!grantExtraTurn) {
    const previous = state.currentPlayer;
    state.currentPlayer = opponent(previous);
    state.turnNumber++;
    if (previous === 'bot') state.completedRounds++;
  } else state.history.push(event(state, 'extra-turn', `${state.currentPlayer} earned another roll`, now));
  state.phase = state.currentPlayer === 'bot' ? 'BOT_THINKING' : 'ROLLING';
  recordRepetition(state);
  checkGameOver(state, now);
}

export function countLivingPieces(state: GameState, player: PlayerId): number {
  return state.reserves[player].length + state.stacks.flatMap(stack => stack.piecesBottomToTop).filter(piece => piece.owner === player).length;
}

function positionKey(state: GameState): string {
  const stacks = [...state.stacks].sort((a, b) => a.position - b.position).map(s => `${s.position}:${s.direction}:${s.piecesBottomToTop.map(p => p.id).join(',')}`).join('|');
  return `${state.currentPlayer};${state.reserves.human.map(p => p.id).sort()};${state.reserves.bot.map(p => p.id).sort()};${stacks}`;
}
function recordRepetition(state: GameState): void { const key = positionKey(state); state.repetitionKeys[key] = (state.repetitionKeys[key] ?? 0) + 1; }

export function checkGameOver(state: GameState, now = Date.now()): void {
  const human = countLivingPieces(state, 'human');
  const bot = countLivingPieces(state, 'bot');
  if (human === 0 || bot === 0) state.result = { winner: human ? 'human' : 'bot', draw: false, reason: 'All opposing pieces were eliminated' };
  else if (state.completedRounds >= 200 || state.halfMoves >= 500) state.result = { winner: null, draw: true, reason: 'Move limit reached' };
  else if (Object.values(state.repetitionKeys).some(count => count >= 3)) state.result = { winner: null, draw: true, reason: 'Position repeated three times' };
  if (state.result) {
    state.phase = 'FINISHED'; state.currentRoll = null; state.legalMoves = [];
    if (!state.history.some(item => item.type === 'ended')) state.history.push(event(state, 'ended', state.result.reason, now));
  }
}

export function validateState(state: GameState): true {
  const positions = new Set<number>();
  const ids = new Set<string>();
  for (const stack of state.stacks) {
    if (stack.position < 0 || stack.position > 10 || positions.has(stack.position) || !stack.piecesBottomToTop.length || ![1, -1].includes(stack.direction)) throw new Error('Invalid stack');
    positions.add(stack.position); getController(stack);
  }
  const all = [...state.reserves.human, ...state.reserves.bot, ...state.eliminated.human, ...state.eliminated.bot, ...state.stacks.flatMap(s => s.piecesBottomToTop)];
  for (const piece of all) { if (!['human', 'bot'].includes(piece.owner) || ids.has(piece.id)) throw new Error('Invalid or duplicate piece'); ids.add(piece.id); }
  if (all.filter(p => p.owner === 'human').length !== state.piecesPerPlayer || all.filter(p => p.owner === 'bot').length !== state.piecesPerPlayer) throw new Error('Piece conservation failed');
  if (state.currentRoll && (sticksToValue(state.currentRoll.sticks) !== state.currentRoll.value || state.currentRoll.value < 1 || state.currentRoll.value > 5)) throw new Error('Invalid roll');
  if (state.phase === 'SELECTING_MOVE') {
    if (!state.currentRoll || JSON.stringify(getLegalMoves(state, state.currentRoll.value)) !== JSON.stringify(state.legalMoves)) throw new Error('Legal move cache mismatch');
  } else if (state.legalMoves.length) throw new Error('Moves outside selection phase');
  if (state.result && state.phase !== 'FINISHED') throw new Error('Finished game phase mismatch');
  return true;
}

export const serializeState = (state: GameState): string => JSON.stringify(state);
export function deserializeState(value: string): GameState { const state = JSON.parse(value) as GameState; validateState(state); return state; }
