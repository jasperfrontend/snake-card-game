// Phase 2 acceptance: imperfect bots create a difficulty gradient.
//  - Bite rate rises as difficulty falls (smart ~ hard < medium < easy < naive).
//  - A "human" (smart proxy) wins more often the weaker its opponents are.

import { describe, it, expect } from 'vitest';
import { biteRate, humanWinRate } from '../simulate';
import { smartPolicy, botPolicy, configPolicy, NAIVE, botChooseMove } from '../../bots/policy';
import { mulberry32 } from '../rng';
import { startRound } from '../rules';
import type { Player } from '../types';

describe('bite rate gradient (3 players)', () => {
  const GAMES = 200;
  const SEED = 1234;
  const rates = {
    smart: biteRate(3, GAMES, SEED, smartPolicy),
    hard: biteRate(3, GAMES, SEED, botPolicy('hard')),
    medium: biteRate(3, GAMES, SEED, botPolicy('medium')),
    easy: biteRate(3, GAMES, SEED, botPolicy('easy')),
    naive: biteRate(3, GAMES, SEED, configPolicy(NAIVE)),
  };

  it('rises monotonically from hard to naive', () => {
    expect(rates.hard).toBeLessThan(rates.medium);
    expect(rates.medium).toBeLessThan(rates.easy);
    expect(rates.easy).toBeLessThan(rates.naive);
  });

  it('keeps the smart/hard baseline low and the naive baseline high', () => {
    expect(rates.smart).toBeLessThan(0.25); // defensive: rarely bitten
    expect(rates.hard).toBeLessThan(0.25);
    expect(rates.naive).toBeGreaterThan(0.38); // reckless: bitten far more
    // naive bites at least double the smart baseline
    expect(rates.naive).toBeGreaterThan(rates.smart * 2);
  });

  it('hard still gets bitten occasionally (not perfect arithmetic)', () => {
    expect(rates.hard).toBeGreaterThan(0);
  });
});

describe('human win rate climbs as bots weaken (3 players)', () => {
  const GAMES = 400;
  const wr = {
    hard: humanWinRate('hard', GAMES, 555),
    medium: humanWinRate('medium', GAMES, 555),
    easy: humanWinRate('easy', GAMES, 555),
  };

  it('is ordered easy > medium > hard', () => {
    expect(wr.easy).toBeGreaterThan(wr.medium);
    expect(wr.medium).toBeGreaterThan(wr.hard);
  });

  it('beats easy bots clearly and stays competitive against hard', () => {
    expect(wr.easy).toBeGreaterThan(0.75);
    expect(wr.hard).toBeGreaterThan(0.6); // smart play still wins most games
    expect(wr.easy - wr.hard).toBeGreaterThan(0.05); // a noticeable climb
  });
});

describe('botChooseMove', () => {
  const players = (): Player[] => [
    { hand: [], score: 0, isBot: true, difficulty: 'easy' },
    { hand: [], score: 0, isBot: true, difficulty: 'hard' },
    { hand: [], score: 0, isBot: true, difficulty: 'hard' },
  ];

  it('is deterministic for a fixed seed', () => {
    const run = () => {
      const rng = mulberry32(2024);
      const state = startRound(players(), 0, rng);
      const m1 = botChooseMove(state, 'medium', rng);
      return m1;
    };
    expect(run()).toEqual(run());
  });

  it('returns a legal card index or null', () => {
    const rng = mulberry32(77);
    const state = startRound(players(), 0, rng);
    const m = botChooseMove(state, 'easy', rng);
    if (m !== null) {
      expect(m.cardIndex).toBeGreaterThanOrEqual(0);
      expect(m.cardIndex).toBeLessThan(state.players[state.current].hand.length);
    }
  });
});
