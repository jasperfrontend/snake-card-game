// The QA gate for Phase 1: the TS engine must reproduce the Python oracle's
// statistical signatures under smart play. Exact numbers differ (the RNG
// differs) but the SHAPE must hold.
//
// Python oracle (reference/snake_sim.py, seed 42):
//   4p: pin 88% / bite 12%; pins ace 62% / food 38%
//   plays/round: mean 13.6, median 10  (right-skewed)
//   sweep pin%: 3p 84, 4p 88, 5p 89, 6p 88
//   loser-by-seat in Python is biased (33/33/19/15) ONLY because it tiebreaks
//   by seat index; our random tiebreak must come out ~uniform.

import { describe, it, expect } from 'vitest';
import { runBatch, mean, median } from '../simulate';

describe('Phase 1 acceptance — smart-play statistical signatures', () => {
  it('4-player pin rate is near 88% (bite near 12%)', () => {
    const s = runBatch(4, 200, 42);
    const pinRate = s.endings.pin / s.roundsPlayed;
    expect(pinRate).toBeGreaterThan(0.83);
    expect(pinRate).toBeLessThan(0.93);
    expect(s.endings.bite / s.roundsPlayed).toBeCloseTo(1 - pinRate, 10);
  });

  it('pins are landed mostly by Ace, then food (ace > food)', () => {
    const s = runBatch(4, 200, 42);
    const tot = (s.pinKind.ace ?? 0) + (s.pinKind.food ?? 0) + (s.pinKind.Q ?? 0);
    const aceShare = (s.pinKind.ace ?? 0) / tot;
    const foodShare = (s.pinKind.food ?? 0) / tot;
    expect(aceShare).toBeGreaterThan(foodShare);
    expect(aceShare).toBeGreaterThan(0.5); // ~62% in the oracle
    expect(aceShare).toBeLessThan(0.75);
  });

  it('round length is right-skewed: median well below mean, with a long tail', () => {
    const s = runBatch(4, 200, 42);
    const mu = mean(s.playsPerRound);
    const med = median(s.playsPerRound);
    expect(med).toBeLessThan(mu); // right skew
    expect(mu - med).toBeGreaterThan(1.5); // "well below", not marginal
    expect(Math.max(...s.playsPerRound)).toBeGreaterThan(mu * 2); // long tail
  });

  it('loser-by-seat is ~uniform with a random tiebreak (no seat advantage)', () => {
    const n = 4;
    const games = 600;
    const s = runBatch(n, games, 7);
    const shares = s.loserSeat.map((c) => c / games);
    // every seat between 18% and 32% (expected 25%); Python's biased version
    // would show a low seat near 33% and a high seat near 15%.
    for (const share of shares) {
      expect(share).toBeGreaterThan(0.18);
      expect(share).toBeLessThan(0.32);
    }
    expect(shares.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 10);
  });

  it('pin rate climbs/holds with player count across the 3–6 sweep', () => {
    const rates = [3, 4, 5, 6].map((n) => {
      const s = runBatch(n, 150, 42 + n);
      return s.endings.pin / s.roundsPlayed;
    });
    // oracle: 84, 88, 89, 88 — all high, 4p+ above 85%
    expect(rates[0]).toBeGreaterThan(0.78); // 3p ~84%
    expect(rates[1]).toBeGreaterThan(0.83); // 4p ~88%
    expect(rates[2]).toBeGreaterThan(0.83); // 5p ~89%
    expect(rates[3]).toBeGreaterThan(0.83); // 6p ~88%
    expect(Math.max(...rates)).toBeLessThan(0.95);
  });

  it('is deterministic for a fixed seed', () => {
    const a = runBatch(4, 50, 99);
    const b = runBatch(4, 50, 99);
    expect(a.endings).toEqual(b.endings);
    expect(a.playsPerRound).toEqual(b.playsPerRound);
    expect(a.loserSeat).toEqual(b.loserSeat);
  });
});
