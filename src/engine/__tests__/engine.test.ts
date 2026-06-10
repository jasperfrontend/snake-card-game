import { describe, it, expect } from 'vitest';
import { buildDeck } from '../deck';
import { mulberry32, rngFromState } from '../rng';
import { legalMoves } from '../rules';
import type { Card } from '../types';

describe('deck', () => {
  it('builds 54 cards in the right proportions', () => {
    const deck = buildDeck();
    expect(deck.length).toBe(54);
    const food = deck.filter((c) => c.kind === 'food');
    expect(food.length).toBe(36);
    for (let v = 2; v <= 10; v++) {
      expect(food.filter((c) => c.value === v).length).toBe(4);
    }
    for (const k of ['K', 'Q', 'J', 'A'] as const) {
      expect(deck.filter((c) => c.kind === k).length).toBe(4);
    }
    expect(deck.filter((c) => c.kind === 'JOKER').length).toBe(2);
  });
});

describe('mulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = mulberry32(123);
    const b = mulberry32(123);
    const seqA = Array.from({ length: 5 }, () => a());
    const seqB = Array.from({ length: 5 }, () => b());
    expect(seqA).toEqual(seqB);
    expect(seqA.every((x) => x >= 0 && x < 1)).toBe(true);
  });

  it('differs across seeds', () => {
    expect(mulberry32(1)()).not.toBe(mulberry32(2)());
  });

  it('rngFromState resumes the stream exactly (for resume-on-refresh)', () => {
    const fresh = mulberry32(2024);
    for (let i = 0; i < 5; i++) fresh(); // advance a reference stream by 5
    const { rng, state } = rngFromState({ seed: 2024, calls: 5 });
    expect([rng(), rng(), rng()]).toEqual([fresh(), fresh(), fresh()]);
    expect(state.calls).toBe(8); // tracked position advanced by the 3 draws
  });
});

describe('legalMoves', () => {
  const food = (v: number): Card => ({ kind: 'food', value: v });
  const trick = (k: Card['kind']): Card => ({ kind: k, value: null });

  it('rejects food that would overshoot the max', () => {
    const hand = [food(6), food(7), food(9), trick('Q')];
    const moves = legalMoves(hand, 41, 45); // room = 4
    // only the Q is legal (foods all overshoot), and it is not the last card
    expect(moves.map((m) => m.type).sort()).toEqual(['Q']);
  });

  it('flags a food pin and an ace can-pin', () => {
    const hand = [food(7), trick('A'), food(3)];
    const moves = legalMoves(hand, 38, 45); // room = 7
    const f7 = moves.find((m) => m.type === 'food' && m.val === 7)!;
    expect(f7.pin).toBe(true);
    const ace = moves.find((m) => m.type === 'A')!;
    expect(ace.canPin).toBe(true);
    expect(ace.room).toBe(7);
  });

  it('never allows a trick as the last card', () => {
    expect(legalMoves([trick('Q')], 10, 45)).toEqual([]);
    expect(legalMoves([trick('A')], 10, 45)).toEqual([]);
    // a food as the last card is fine
    expect(legalMoves([food(4)], 10, 45).map((m) => m.type)).toEqual(['food']);
  });
});
