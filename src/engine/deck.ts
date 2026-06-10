// Deck construction. Mirrors build_deck() in reference/snake_sim.py.

import type { Card } from './types';

export const TRICKS = ['K', 'Q', 'J', 'A', 'JOKER'] as const;

/**
 * Build the 54-card deck:
 *   Food 2..10, four of each          -> 36
 *   K / Q / J / A, four of each       -> 16
 *   Joker x2                          ->  2
 */
export function buildDeck(): Card[] {
  const deck: Card[] = [];
  for (let v = 2; v <= 10; v++) {
    for (let i = 0; i < 4; i++) deck.push({ kind: 'food', value: v });
  }
  for (const k of ['K', 'Q', 'J', 'A'] as const) {
    for (let i = 0; i < 4; i++) deck.push({ kind: k, value: null });
  }
  deck.push({ kind: 'JOKER', value: null });
  deck.push({ kind: 'JOKER', value: null });
  return deck;
}
