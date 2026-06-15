// Core engine types. Pure data — no Vue, no DOM.

export type Kind = 'food' | 'K' | 'Q' | 'J' | 'A' | 'JOKER';

/** A single card. `value` is the face value for food (2..10), null otherwise. */
export interface Card {
  kind: Kind;
  value: number | null;
}

/**
 * A fully-specified play: which card in hand, and (for an Ace) what value to
 * count it as (0..9, 0 being a feint). aceValue is ignored for non-Ace cards.
 */
export interface Move {
  cardIndex: number;
  aceValue?: number;
}

/**
 * A multi-card pin attempt (skill variant): 2–3 FOOD card indices laid in order,
 * meant to land the snake exactly on max. Missing it busts. See SPEC-skill-variants.
 */
export interface ComboMove {
  combo: number[];
}

/** A bot/human chosen action: a single play or a combo attempt. */
export type ChosenAction = Move | ComboMove;

export function isComboMove(a: ChosenAction): a is ComboMove {
  return (a as ComboMove).combo !== undefined;
}

export type Difficulty = 'easy' | 'medium' | 'hard';

export interface Player {
  hand: Card[];
  score: number;
  isBot: boolean;
  difficulty?: Difficulty;
}

/** Events emitted as a move resolves, so the UI can animate each beat. */
export type GameEventType =
  | 'play' // a food/ace fed the snake
  | 'pin' // landed exactly on max
  | 'bite' // cornered, no legal play
  | 'shed' // Queen halved
  | 'coil' // King reversed
  | 'slip' // Jack skipped
  | 'scramble' // Joker rerolled a hand
  | 'forfeit' // a player binned their own full hand for a fresh one
  | 'combobust' // a multi-card pin attempt missed (variant): penalty, play continues
  | 'refill' // an emptied hand drew back to 4
  | 'reshuffle' // discard recycled into the draw pile
  | 'startLength'; // round seeded its starting length

export interface GameEvent {
  type: GameEventType;
  by: number; // seat index responsible (or affected, for scramble)
  payload?: Record<string, unknown>;
}

export type Phase = 'playing' | 'roundEnd' | 'gameOver';

/** Per-round bookkeeping accumulated as turns are taken. */
export interface RoundMeta {
  plays: number;
  trickCounts: Record<string, number>;
}

export interface GameState {
  players: Player[];
  length: number;
  maxLength: number;
  /** cards dealt/refilled to a hand (rulebook 4). */
  handSize: number;
  direction: 1 | -1;
  current: number;
  drawPile: Card[];
  discardPile: Card[];
  dealer: number;
  /** set true the turn after a Jack, to skip one player on the next advance. */
  pendingSkip: boolean;
  phase: Phase;
  events: GameEvent[];
  roundMeta: RoundMeta;
  /** populated once the round ends. */
  roundResult?: RoundResult;
}

export type RoundEnding = 'pin' | 'bite';
export type PinKind = 'ace' | 'food' | 'Q';

export interface RoundResult {
  ending: RoundEnding;
  /** seat that was bitten, or that pinned. */
  who: number;
  plays: number;
  /** for pins, which card kind landed it. */
  pinKind?: PinKind;
  /** count of each trick kind used during the round. */
  trickCounts: Record<string, number>;
}
