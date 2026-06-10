// Bot policy.
//
// The strong baseline (smartChooseMove) is a faithful port of choose_move() from
// reference/snake_sim.py — a defensive heuristic that pins ~88% of the time and
// almost never gets bitten. Perfect arithmetic is no fun to beat, so difficulty
// is added by making the bot IMPERFECT via two knobs:
//
//   pinAwareness  probability the bot notices and takes an available pin
//   mathError     probability the bot miscounts the remaining room and plays
//                 greedily (as if it were safe), which corners it near the top
//
// Lower difficulty => misses more pins and miscounts more => gets bitten more.

import type { Card, Difficulty, GameState, Move } from '../engine/types';
import { legalMoves, type ChoosePolicy, type LegalMove } from '../engine/rules';
import type { Rng } from '../engine/rng';

const DANGER = 9; // within this much of the top, switch from offence to survival

// --------------------------------------------------------------- shared heuristic

/** The pin the heuristic would take, if one is on offer (food/Q exact, or ace). */
function pinMove(moves: LegalMove[], length: number, mx: number): Move | null {
  for (const m of moves) {
    if ((m.type === 'food' || m.type === 'Q') && m.pin) return { cardIndex: m.i };
  }
  for (const m of moves) {
    if (m.type === 'A' && m.canPin) return { cardIndex: m.i, aceValue: mx - length };
  }
  return null;
}

/**
 * Non-pin selection. In the danger zone: shed > scramble/dodge > feint > smallest
 * feed. When safe (or `forceSafe`, i.e. the bot miscounted): offload the biggest
 * food, otherwise burn the cheapest trick. `forceSafe` is what turns a defensive
 * bot reckless — it offloads big food while actually near the top, and corners.
 */
function nonPinMove(moves: LegalMove[], length: number, mx: number, forceSafe = false): Move | null {
  const foods = moves.filter((m) => m.type === 'food');
  const room = mx - length;
  const danger = !forceSafe && room <= DANGER;

  if (danger) {
    for (const t of ['Q', 'JOKER', 'K', 'J'] as const) {
      for (const m of moves) if (m.type === t) return { cardIndex: m.i };
    }
    for (const m of moves) if (m.type === 'A') return { cardIndex: m.i, aceValue: 0 }; // feint
    if (foods.length) return { cardIndex: minBy(foods, (x) => x.val as number).i };
    return null;
  }

  if (foods.length) return { cardIndex: maxBy(foods, (x) => x.val as number).i };
  for (const t of ['JOKER', 'J', 'K', 'Q'] as const) {
    for (const m of moves) if (m.type === t) return { cardIndex: m.i };
  }
  for (const m of moves) if (m.type === 'A') return { cardIndex: m.i, aceValue: 0 };
  return null;
}

// ------------------------------------------------------------------- smart (perfect)

/** Perfect defensive heuristic. Mirrors choose_move(hand, length, mx). */
export function smartChooseMove(hand: Card[], length: number, mx: number): Move | null {
  const moves = legalMoves(hand, length, mx);
  if (moves.length === 0) return null;
  return pinMove(moves, length, mx) ?? nonPinMove(moves, length, mx);
}

/** Adapter to the ChoosePolicy signature the round runner expects. */
export const smartPolicy: ChoosePolicy = (state: GameState): Move | null => {
  const cur = state.players[state.current];
  return smartChooseMove(cur.hand, state.length, state.maxLength);
};

// ----------------------------------------------------------------- difficulty bots

export interface BotConfig {
  pinAwareness: number; // chance of taking an available pin
  mathError: number; // chance of miscounting the room and playing greedily
}

export const DIFFICULTY: Record<Difficulty, BotConfig> = {
  easy: { pinAwareness: 0.4, mathError: 0.5 },
  medium: { pinAwareness: 0.75, mathError: 0.22 },
  hard: { pinAwareness: 0.95, mathError: 0.07 },
};

/** A perfectly naive baseline (never pins on purpose, always miscounts) — the
 *  ~62%-bite contrast the build plan references. Exposed for the sim demo. */
export const NAIVE: BotConfig = { pinAwareness: 0, mathError: 1 };

/**
 * Difficulty-aware move choice. Returns the chosen move, or null on a forced
 * bite (no legal play exists at all).
 */
export function botChooseMove(state: GameState, difficulty: Difficulty, rng: Rng): Move | null {
  const cfg = state.players[state.current].difficulty
    ? DIFFICULTY[state.players[state.current].difficulty as Difficulty]
    : DIFFICULTY[difficulty];
  return chooseImperfect(state, cfg, rng);
}

/** Core imperfect chooser, parameterised directly by a BotConfig. */
export function chooseImperfect(state: GameState, cfg: BotConfig, rng: Rng): Move | null {
  const hand = state.players[state.current].hand;
  const { length, maxLength: mx } = state;
  const moves = legalMoves(hand, length, mx);
  if (moves.length === 0) return null;

  // Pin awareness: a perfect player always pins; imperfect ones sometimes miss it.
  const pin = pinMove(moves, length, mx);
  if (pin && rng() < cfg.pinAwareness) return pin;

  // Math error: misjudge the remaining room and play as if safe (greedy).
  const miscount = rng() < cfg.mathError;
  return nonPinMove(moves, length, mx, miscount);
}

/** Build a ChoosePolicy for a fixed difficulty. */
export function botPolicy(difficulty: Difficulty): ChoosePolicy {
  return (state: GameState, rng: Rng) => chooseImperfect(state, DIFFICULTY[difficulty], rng);
}

/** Build a ChoosePolicy from an explicit config (for the naive baseline / tuning). */
export function configPolicy(cfg: BotConfig): ChoosePolicy {
  return (state: GameState, rng: Rng) => chooseImperfect(state, cfg, rng);
}

/** Dispatch per seat: policies[seat] chooses for that seat. Lets one game mix a
 *  "human" proxy in one seat with bots of a given difficulty in the others. */
export function seatedPolicy(policies: ChoosePolicy[]): ChoosePolicy {
  return (state: GameState, rng: Rng) => policies[state.current](state, rng);
}

// ---------------------------------------------------------------------- helpers

function minBy<T>(arr: T[], key: (x: T) => number): T {
  return arr.reduce((best, x) => (key(x) < key(best) ? x : best));
}
function maxBy<T>(arr: T[], key: (x: T) => number): T {
  return arr.reduce((best, x) => (key(x) > key(best) ? x : best));
}
