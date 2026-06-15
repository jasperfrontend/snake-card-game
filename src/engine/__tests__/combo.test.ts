// Combo-pin variant (skill spec step 2). Pure-engine coverage of the multi-card
// pin: enumeration, the pin path, and the bust path (penalty, cards-stay,
// redraw, and that a bust does NOT end the round so play can continue).

import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../rng';
import { legalCombos, nearMissCombos, comboFeed, comboBust, executeCombo } from '../rules';
import type { Card, GameState, Player } from '../types';

const food = (v: number): Card => ({ kind: 'food', value: v });
const trick = (k: Card['kind']): Card => ({ kind: k, value: null });

function makeState(hand: Card[], length: number, mx = 45, draw: Card[] = []): GameState {
  const players: Player[] = Array.from({ length: 3 }, () => ({ hand: [], score: 0, isBot: true }));
  players[0].hand = hand;
  return {
    players,
    length,
    maxLength: mx,
    handSize: 4,
    direction: 1,
    current: 0,
    drawPile: draw,
    discardPile: [],
    dealer: 0,
    pendingSkip: false,
    phase: 'playing',
    events: [],
    roundMeta: { plays: 0, trickCounts: {} },
  };
}

describe('legalCombos', () => {
  it('finds exact 2- and 3-card pins, ignores singles and overshooting cards', () => {
    // gap = 9. pairs: 4+5, 7+2. no triple sums to 9 here.
    const hand = [food(4), food(5), food(7), food(2)];
    const combos = legalCombos(hand, 36, 45);
    expect(combos).toContainEqual([0, 1]); // 4 + 5
    expect(combos).toContainEqual([2, 3]); // 7 + 2
    expect(combos.every((c) => c.length === 2)).toBe(true);
  });

  it('includes a 3-card pin and excludes tricks and a lone exact card', () => {
    // gap = 12. triple 3+4+5; the lone 12 would be a single pin, not a combo.
    const hand = [food(3), food(4), food(5), trick('A')];
    const combos = legalCombos(hand, 33, 45);
    expect(combos).toContainEqual([0, 1, 2]);
    // a card bigger than the gap is never part of a combo
    expect(legalCombos([food(10), food(2)], 40, 45)).toEqual([]); // gap 5: 10 too big, 2 alone short
  });
});

describe('combo pin', () => {
  it('a 2-card combo that sums to the gap pins the round', () => {
    const s = makeState([food(4), food(5), food(7)], 36, 45);
    const res = executeCombo(s, [0, 1], mulberry32(1)); // 4 + 5 = 9 → 45
    expect(res.pinned).toBe(true);
    expect(s.length).toBe(45);
    expect(s.phase).toBe('roundEnd');
    expect(s.roundResult).toMatchObject({ ending: 'pin', who: 0, pinKind: 'food' });
    expect(s.players[1].score).toBe(5); // everyone else +5
    expect(s.players[2].score).toBe(5);
    expect(s.players[0].score).toBe(0);
  });

  it('a 3-card combo can pin too', () => {
    const s = makeState([food(3), food(4), food(5), food(9)], 33, 45);
    const res = executeCombo(s, [0, 1, 2], mulberry32(1)); // 3+4+5 = 12 → 45
    expect(res.pinned).toBe(true);
    expect(s.length).toBe(45);
    expect(s.roundResult?.ending).toBe('pin');
  });

  it('comboFeed resolves a pin when a single laid card lands it', () => {
    const s = makeState([food(9), food(2)], 36, 45);
    const res = comboFeed(s, 0); // 9 → 45
    expect(res.pinned).toBe(true);
    expect(s.phase).toBe('roundEnd');
  });
});

describe('combo bust', () => {
  it('a 2-card miss busts for 10, keeps the cards on the snake, and does NOT end the round', () => {
    const draw = [food(6), food(8), food(3)];
    const s = makeState([food(4), food(2), food(7), food(8)], 36, 45, draw); // gap 9
    const res = executeCombo(s, [0, 1], mulberry32(1)); // 4 + 2 = 6, undershoots
    expect(res.pinned).toBe(false);
    expect(s.players[0].score).toBe(10); // 2-card penalty
    expect(s.length).toBe(42); // both cards fed the snake and stay
    expect(s.phase).toBe('playing'); // a bust never ends the round
    expect(s.roundResult).toBeUndefined();
    expect(s.current).toBe(1); // turn passed on
    expect(s.players[0].hand.length).toBe(4); // redrawn back to a full hand
    expect(s.events.some((e) => e.type === 'combobust')).toBe(true);
  });

  it('a 3-card miss busts for 20', () => {
    const draw = [food(6), food(8), food(3)];
    const s = makeState([food(3), food(4), food(2), food(9)], 33, 45, draw); // gap 12
    executeCombo(s, [0, 1, 2], mulberry32(1)); // 3+4+2 = 9, undershoots 12
    expect(s.players[0].score).toBe(20);
    expect(s.length).toBe(42);
    expect(s.phase).toBe('playing');
  });

  it('comboBust passes the turn and reshuffles the discard when the draw pile is dry', () => {
    const s = makeState([food(4), food(5)], 36, 45, []); // empty draw pile
    s.discardPile = [food(2), food(3), food(4)]; // recyclable on redraw
    comboBust(s, 2, mulberry32(1));
    expect(s.players[0].score).toBe(10);
    expect(s.current).toBe(1);
    expect(s.players[0].hand.length).toBeGreaterThanOrEqual(2); // topped up from the recycled pile
  });
});

describe('nearMissCombos', () => {
  it('returns combos that undershoot the gap by one (a believable miscount)', () => {
    // gap 10, undershoot target 9: 4+5 and 7+2 both sum to 9.
    const hand = [food(4), food(5), food(7), food(2)];
    const misses = nearMissCombos(hand, 35, 45, 1);
    expect(misses).toContainEqual([0, 1]);
    expect(misses).toContainEqual([2, 3]);
  });
});
