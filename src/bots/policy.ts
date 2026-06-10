// Bot policy. The strong baseline is a faithful port of choose_move() from
// reference/snake_sim.py — a defensive heuristic. Phase 2 will layer
// difficulty-aware imperfection on top of this; Phase 1 uses it as the "smart
// play" oracle that must reproduce the Python's statistical signatures.

import type { GameState, Move } from '../engine/types';
import { legalMoves, type ChoosePolicy, type LegalMove } from '../engine/rules';
import type { Rng } from '../engine/rng';

const DANGER = 9; // within this much of the top, switch from offence to survival

/**
 * Defensive heuristic. Returns the chosen move, or null if there is no legal
 * play (a bite). Mirrors choose_move(hand, length, mx).
 */
export function smartChooseMove(hand: GameState['players'][number]['hand'], length: number, mx: number): Move | null {
  const moves = legalMoves(hand, length, mx);
  if (moves.length === 0) return null;

  // 1. Pin whenever possible (score 0, dump 5 on everyone else).
  for (const m of moves) {
    if ((m.type === 'food' || m.type === 'Q') && m.pin) return { cardIndex: m.i };
  }
  for (const m of moves) {
    if (m.type === 'A' && m.canPin) return { cardIndex: m.i, aceValue: mx - length };
  }

  const foods = moves.filter((m) => m.type === 'food');
  const room = mx - length;

  if (room <= DANGER) {
    // Survive: shed > scramble/dodge > feint > smallest feed.
    for (const t of ['Q', 'JOKER', 'K', 'J'] as const) {
      for (const m of moves) if (m.type === t) return { cardIndex: m.i };
    }
    for (const m of moves) if (m.type === 'A') return { cardIndex: m.i, aceValue: 0 }; // feint
    if (foods.length) return { cardIndex: minBy(foods, (x) => x.val as number).i };
    return null;
  } else {
    // Safe: offload your biggest food while there is room; hoard tricks/low cards.
    if (foods.length) return { cardIndex: maxBy(foods, (x) => x.val as number).i };
    for (const t of ['JOKER', 'J', 'K', 'Q'] as const) {
      // forced to burn a trick; cheapest first
      for (const m of moves) if (m.type === t) return { cardIndex: m.i };
    }
    for (const m of moves) if (m.type === 'A') return { cardIndex: m.i, aceValue: 0 };
    return null;
  }
}

function minBy<T>(arr: T[], key: (x: T) => number): T {
  return arr.reduce((best, x) => (key(x) < key(best) ? x : best));
}
function maxBy<T>(arr: T[], key: (x: T) => number): T {
  return arr.reduce((best, x) => (key(x) > key(best) ? x : best));
}

/** Adapter to the ChoosePolicy signature the round runner expects. */
export const smartPolicy: ChoosePolicy = (state: GameState, _rng: Rng): Move | null => {
  const cur = state.players[state.current];
  return smartChooseMove(cur.hand, state.length, state.maxLength);
};

// Suppress unused-warning helper export (kept for symmetry with Phase 2 wiring).
export type { LegalMove };
