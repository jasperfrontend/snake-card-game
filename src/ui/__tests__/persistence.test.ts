// Phase 5 acceptance (headless): settings, win/loss record, and resume-on-refresh
// all round-trip through a (mocked) localStorage. The engine stays untouched;
// this exercises the persistence layer and the composable's save/restore wiring.

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { useSnakeGame } from '../composables/useSnakeGame';
import { loadRecord, loadSave, loadSettings } from '../persistence';
import { smartChooseMove } from '../../bots/policy';

class MemStorage {
  private m = new Map<string, string>();
  getItem(k: string) {
    return this.m.has(k) ? (this.m.get(k) as string) : null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, String(v));
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  get length() {
    return this.m.size;
  }
}

beforeEach(() => {
  (globalThis as unknown as { localStorage: Storage }).localStorage = new MemStorage() as unknown as Storage;
});
afterEach(() => {
  delete (globalThis as unknown as { localStorage?: Storage }).localStorage;
});

async function driveToEnd(g: ReturnType<typeof useSnakeGame>) {
  let guard = 0;
  while (!g.gameOver.value && guard++ < 20000) {
    if (g.awaitingHuman.value) {
      const mv = smartChooseMove(g.humanHand.value, g.length.value, g.maxLength.value);
      if (mv) await g.play(mv);
      else if (g.canForfeit.value) await g.forfeitHand(); // forfeit-at-one: cornered last card
      else break;
    } else if (g.state.value.phase === 'roundEnd') {
      await g.nextRound();
    } else break;
  }
}

describe('persistence', () => {
  it('remembers the chosen difficulty', async () => {
    const g = useSnakeGame({ players: 3, seed: 5, botDelayMs: 0 });
    await g.newGame('hard');
    expect(loadSettings().difficulty).toBe('hard');
  });

  it('remembers the chosen speed and a fresh instance picks it up', async () => {
    const g = useSnakeGame({ players: 3, seed: 9, botDelayMs: 0 });
    await g.newGame();
    g.setSpeed('fast');
    expect(loadSettings().speed).toBe('fast');
    expect(useSnakeGame({ players: 3, seed: 9 }).speed.value).toBe('fast');
  });

  it('saves an in-progress game and restores it faithfully', async () => {
    const g = useSnakeGame({ players: 3, seed: 777, botDelayMs: 0, difficulty: 'medium' });
    await g.newGame();
    // newGame runs until the human must act — that pause is a save point.
    expect(g.awaitingHuman.value).toBe(true);
    expect(loadSave()).not.toBeNull();

    // a fresh instance (a page refresh) restores the same position.
    const g2 = useSnakeGame({ players: 3, seed: 1, botDelayMs: 0 });
    expect(g2.loadSaved()).toBe(true);
    await g2.resume();

    expect(g2.length.value).toBe(g.length.value);
    expect(g2.scores.value).toEqual(g.scores.value);
    expect(g2.current.value).toBe(g.current.value);
    expect(g2.awaitingHuman.value).toBe(true);
    expect(g2.humanHand.value.map((c) => `${c.kind}${c.value ?? ''}`)).toEqual(
      g.humanHand.value.map((c) => `${c.kind}${c.value ?? ''}`),
    );
    expect(g2.difficulty.value).toBe('medium');
  });

  it('a restored game can be played through to the end', async () => {
    const g = useSnakeGame({ players: 3, seed: 4242, botDelayMs: 0, difficulty: 'easy' });
    await g.newGame();
    const g2 = useSnakeGame({ players: 3, seed: 1, botDelayMs: 0 });
    expect(g2.loadSaved()).toBe(true);
    await g2.resume();
    await driveToEnd(g2);
    expect(g2.gameOver.value).toBe(true);
    expect(Math.max(...g2.scores.value)).toBeGreaterThanOrEqual(100);
  });

  it('tracks the per-player pin/bite tally and restores it on refresh', async () => {
    const g = useSnakeGame({ players: 3, seed: 31, botDelayMs: 0, difficulty: 'easy' });
    await g.newGame();
    let guard = 0;
    while (!g.gameOver.value && guard++ < 4000) {
      if (g.awaitingHuman.value) {
        const mv = smartChooseMove(g.humanHand.value, g.length.value, g.maxLength.value);
        if (mv) await g.play(mv);
        else if (g.canForfeit.value) await g.forfeitHand();
        else break;
      } else if (g.state.value.phase === 'roundEnd') {
        await g.nextRound();
      } else break;
      if (g.pinCounts.value.reduce((a, b) => a + b, 0) >= 5) break; // a few rounds in
    }
    const totalPins = g.pinCounts.value.reduce((a, b) => a + b, 0);
    expect(totalPins).toBeGreaterThan(0);

    // a fresh instance (a refresh) restores the running tally exactly
    const g2 = useSnakeGame({ players: 3, seed: 1, botDelayMs: 0 });
    expect(g2.loadSaved()).toBe(true);
    expect(g2.pinCounts.value).toEqual(g.pinCounts.value);
    expect(g2.biteCounts.value).toEqual(g.biteCounts.value);
  });

  it('updates the win/loss record and clears the save on game over', async () => {
    const g = useSnakeGame({ players: 3, seed: 31, botDelayMs: 0, difficulty: 'easy' });
    await g.newGame();
    await driveToEnd(g);
    expect(g.gameOver.value).toBe(true);

    const rec = loadRecord();
    expect(rec.wins + rec.losses).toBe(1);
    const humanWon = g.loser.value !== g.humanSeat;
    expect(humanWon ? rec.wins : rec.losses).toBe(1);
    expect(loadSave()).toBeNull(); // finished games are not resumable
  });
});
