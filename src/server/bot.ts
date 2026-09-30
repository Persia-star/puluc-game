import type { GameState, Move, PlayerId, RandomSource } from '../shared/types.js';
import { countLivingPieces, getController } from '../shared/engine.js';

function scoreMove(state: GameState, move: Move, player: PlayerId): number {
  const target = state.stacks.find(stack => stack.position === move.targetIndex);
  const capture = target && getController(target) !== player ? target.piecesBottomToTop.length * 12 : 0;
  const progress = player === 'bot' ? 10 - move.targetIndex : move.targetIndex;
  const homeward = move.source.type === 'board' && ((player === 'bot' && move.source.index === 0) || (player === 'human' && move.source.index === 10)) ? 20 : 0;
  return capture + progress + homeward + (move.source.type === 'reserve' ? 4 : 0);
}

export function chooseBotMove(state: GameState, rng: RandomSource = Math.random): Move {
  if (!state.legalMoves.length) throw new Error('Bot has no legal move');
  const ranked = state.legalMoves.map(move => ({ move, score: scoreMove(state, move, 'bot') }));
  if (state.difficulty === 'easy') {
    const weights = ranked.map(item => Math.max(1, item.score + 8));
    let cursor = rng() * weights.reduce((sum, value) => sum + value, 0);
    for (let index = 0; index < ranked.length; index++) { cursor -= weights[index]; if (cursor <= 0) return ranked[index].move; }
  }
  ranked.sort((a, b) => b.score - a.score);
  if (state.difficulty === 'hard') {
    const livingLead = countLivingPieces(state, 'bot') - countLivingPieces(state, 'human');
    ranked.sort((a, b) => (b.score + livingLead * 0.1) - (a.score + livingLead * 0.1));
  }
  return ranked[0].move;
}
