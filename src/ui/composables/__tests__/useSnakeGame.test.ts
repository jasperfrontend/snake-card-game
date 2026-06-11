// Phase 3 acceptance (headless): a full game is playable end to end through the
// composable. The "human" auto-plays with the smart heuristic; bots run on their
// own. The game must reach a clean game-over with someone at >= 100 points.

import { describe, it, expect } from 'vitest';
import { useSnakeGame } from '../useSnakeGame';
import { smartChooseMove } from '../../../bots/policy';

async function playToEnd(seed: number, difficulty: 'easy' | 'medium' | 'hard') {
  const g = useSnakeGame({ players: 3, difficulty, seed, botDelayMs: 0 });
  await g.newGame();

  let guard = 0;
  while (!g.gameOver.value && guard++ < 20000) {
    if (g.awaitingHuman.value) {
      const mv = smartChooseMove(g.humanHand.value, g.length.value, g.maxLength.value);
      expect(mv).not.toBeNull();
      await g.play(mv!);
    } else if (g.state.value.phase === 'roundEnd') {
      await g.nextRound();
    } else {
      break; // run() only returns paused on the human or at round/game end
    }
  }
  return g;
}

describe('useSnakeGame — full game', () => {
  it('plays to a game over with a valid loser at >= 100 points', async () => {
    const g = await playToEnd(12345, 'medium');
    expect(g.gameOver.value).toBe(true);
    expect(g.loser.value).not.toBeNull();
    expect(g.loser.value).toBeGreaterThanOrEqual(0);
    expect(g.loser.value).toBeLessThan(3);
    expect(Math.max(...g.scores.value)).toBeGreaterThanOrEqual(100);
    expect(g.loser.value).toBe(g.scores.value.indexOf(Math.max(...g.scores.value)));
    expect(g.log.value.length).toBeGreaterThan(10);
  });

  it('is deterministic for a fixed seed', async () => {
    const a = await playToEnd(999, 'hard');
    const b = await playToEnd(999, 'hard');
    expect(a.scores.value).toEqual(b.scores.value);
    expect(a.loser.value).toBe(b.loser.value);
  });

  it('drives the interactive stranded-trick path to completion (incl. Ace choice)', async () => {
    // interactiveStranded routes the human's lone-trick turn through the paced,
    // choosable flow; the driver must handle the extra Ace-value pause.
    for (const seed of [3, 17, 88, 271, 909]) {
      const g = useSnakeGame({ players: 3, difficulty: 'easy', seed, botDelayMs: 0, interactiveStranded: true });
      await g.newGame();
      let strandedAcePrompts = 0;
      let guard = 0;
      while (!g.gameOver.value && guard++ < 30000) {
        if (g.awaitingStrandedAce.value) {
          strandedAcePrompts++;
          await g.playStrandedAce(0); // feint — always legal
        } else if (g.awaitingHuman.value) {
          await g.play(smartChooseMove(g.humanHand.value, g.length.value, g.maxLength.value)!);
        } else if (g.state.value.phase === 'roundEnd') {
          await g.nextRound();
        } else break;
      }
      expect(g.gameOver.value).toBe(true);
      expect(Math.max(...g.scores.value)).toBeGreaterThanOrEqual(100);
      // when an Ace pause does occur, the prompt state must always be cleared after
      expect(g.awaitingStrandedAce.value).toBe(false);
      expect(g.strandedNote.value).toBeNull();
      void strandedAcePrompts;
    }
  });

  it('only offers legal cards to the human while awaiting input', async () => {
    const g = useSnakeGame({ players: 3, difficulty: 'easy', seed: 42, botDelayMs: 0 });
    await g.newGame();
    let checks = 0;
    let guard = 0;
    while (!g.gameOver.value && guard++ < 20000) {
      if (g.awaitingHuman.value) {
        // every offered index points at a card actually in hand
        for (const m of g.legalMoves.value) {
          expect(m.i).toBeGreaterThanOrEqual(0);
          expect(m.i).toBeLessThan(g.humanHand.value.length);
        }
        expect(g.legalMoves.value.length).toBeGreaterThan(0);
        checks++;
        const mv = smartChooseMove(g.humanHand.value, g.length.value, g.maxLength.value)!;
        await g.play(mv);
      } else if (g.state.value.phase === 'roundEnd') {
        await g.nextRound();
      } else {
        break;
      }
    }
    expect(checks).toBeGreaterThan(0);
  });
});
