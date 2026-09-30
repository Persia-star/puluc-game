export type PlayerId = 'human' | 'bot';
export type Phase = 'WAITING_FOR_PLAYER' | 'ROLLING' | 'SELECTING_MOVE' | 'BOT_THINKING' | 'PAUSED' | 'FINISHED';
export type Difficulty = 'easy' | 'medium' | 'hard';
export type Piece = { id: string; owner: PlayerId };
export type Stack = { position: number; direction: 1 | -1; piecesBottomToTop: Piece[] };
export type Move = {
  source: { type: 'reserve'; owner: PlayerId } | { type: 'board'; index: number };
  targetIndex: number;
  dieValue: number;
};
export type GameEvent = { id: string; type: string; message: string; version: number; timestamp: number };
export type GameResult = { winner: PlayerId | null; draw: boolean; reason: string };
export type GameState = {
  gameId: string;
  version: number;
  phase: Phase;
  currentPlayer: PlayerId;
  turnNumber: number;
  halfMoves: number;
  completedRounds: number;
  piecesPerPlayer: 4 | 5 | 6;
  difficulty: Difficulty;
  reserves: Record<PlayerId, Piece[]>;
  stacks: Stack[];
  eliminated: Record<PlayerId, Piece[]>;
  currentRoll: { sticks: boolean[]; value: number } | null;
  legalMoves: Move[];
  extraTurnPending: boolean;
  history: GameEvent[];
  repetitionKeys: Record<string, number>;
  result: GameResult | null;
};

export type RandomSource = () => number;
