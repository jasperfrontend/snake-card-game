// Phase 3 acceptance (headless): a full game is playable end to end through the
// composable. The "human" auto-plays with the smart heuristic; bots run on their
// own. The game must reach a clean game-over with someone at >= 100 points.

import { describe, it, expect } from 'vitest';
import { useSnakeGame, type SnakeGame } from '../useSnakeGame';
import { smartChooseMove } from '../../../bots/policy';
import type { Card } from '../../../engine/types';

async function playToEnd(seed: number, difficulty: 'easy' | 'medium' | 'hard') {
  const g = useSnakeGame({ players: 3, difficulty, seed, botDelayMs: 0 });
  await g.newGame();

  let guard = 0;
  while (!g.gameOver.value && guard++ < 20000) {
    if (g.awaitingHuman.value) {
      const mv = smartChooseMove(g.humanHand.value, g.length.value, g.maxLength.value);
      if (mv) await g.play(mv);
      else if (g.canForfeit.value)
        await g.forfeitHand(); // forfeit-at-one: cornered last card
      else break;
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

  it('routes the interactive stranded-trick turn into the normal hand (draw then choose)', async () => {
    // interactiveStranded forces a draw, drops the drawn card into the hand, and
    // hands off to the normal awaiting-human turn — no bespoke prompt. The driver
    // only needs to handle awaitingHuman; the two-card choice flows through play().
    let strandedTurnsSeen = 0;
    for (const seed of [3, 17, 88, 271, 909]) {
      const g = useSnakeGame({ players: 3, difficulty: 'easy', seed, botDelayMs: 0, interactiveStranded: true });
      await g.newGame();
      let guard = 0;
      while (!g.gameOver.value && guard++ < 30000) {
        if (g.awaitingHuman.value) {
          const mv = smartChooseMove(g.humanHand.value, g.length.value, g.maxLength.value);
          if (mv) await g.play(mv);
          else if (g.canForfeit.value) await g.forfeitHand();
          else break;
        } else if (g.state.value.phase === 'roundEnd') {
          await g.nextRound();
        } else break;
      }
      expect(g.gameOver.value).toBe(true);
      expect(Math.max(...g.scores.value)).toBeGreaterThanOrEqual(100);
      expect(g.strandedNote.value).toBeNull();
      strandedTurnsSeen += g.log.value.filter((l) => l.startsWith('Down to a')).length;
    }
    expect(strandedTurnsSeen).toBeGreaterThan(0); // the stranded path really runs
  });

  it('forfeit swaps a full hand for a fresh one, spends the turn, and is once-per-hand', async () => {
    const g = useSnakeGame({ players: 3, difficulty: 'easy', seed: 4242, botDelayMs: 0, handSize: 4 });
    await g.newGame();
    expect(g.awaitingHuman.value).toBe(true);
    // a freshly dealt, full hand can be forfeited
    expect(g.canForfeit.value).toBe(true);
    expect(g.humanHand.value.length).toBe(4);

    const before = g.humanHand.value.map((c) => `${c.kind}${c.value ?? ''}`);
    await g.forfeitHand();

    // the hand was swapped for a fresh full one, the turn was spent (so the
    // mulligan can't be used again on this hand)
    expect(g.humanHand.value.length).toBe(4);
    const after = g.humanHand.value.map((c) => `${c.kind}${c.value ?? ''}`);
    expect(after).not.toEqual(before);
    expect(g.canForfeit.value).toBe(false);
  });

  it('forfeit-at-one rescues a cornered last card instead of biting', async () => {
    // Force the human (seat 0) onto a single, overshooting card with the round
    // live: a gap of 1, holding a 9. Normally an instant bite.
    const corner = (g: SnakeGame) => {
      const s = g.state.value;
      s.current = 0;
      s.phase = 'playing';
      s.length = s.maxLength - 1; // gap of 1
      const lone: Card[] = [{ kind: 'food', value: 9 }]; // overshoots, unplayable
      s.players[0].hand = lone;
      g.awaitingHuman.value = false; // let resume()'s loop take the turn
    };

    const on = useSnakeGame({ players: 3, seed: 7, botDelayMs: 0, forfeitAtOne: true });
    await on.newGame();
    corner(on);
    await on.resume();
    // no bite: the round is still live and the corner is offered as a forfeit
    expect(on.state.value.phase).toBe('playing');
    expect(on.awaitingHuman.value).toBe(true);
    expect(on.legalMoves.value.length).toBe(0); // the lone 9 truly can't be played
    expect(on.canForfeit.value).toBe(true);
    await on.forfeitHand();
    expect(on.humanHand.value.length).toBe(4); // swapped for a fresh full hand

    // With the variant off, the identical corner is a bite on the human.
    const off = useSnakeGame({ players: 3, seed: 7, botDelayMs: 0, forfeitAtOne: false });
    await off.newGame();
    corner(off);
    await off.resume();
    expect(off.canForfeit.value).toBe(false);
    expect(off.state.value.roundResult?.ending).toBe('bite');
    expect(off.state.value.roundResult?.who).toBe(0);
  });

  it('bots get the same rescue: a cornered bot forfeits instead of being bitten', async () => {
    const g = useSnakeGame({ players: 2, seed: 9, botDelayMs: 0, forfeitAtOne: true });
    await g.newGame();
    const s = g.state.value;
    s.current = 1; // a bot's turn (seat 1 = Bot A)
    s.phase = 'playing';
    s.length = s.maxLength - 1; // gap of 1
    s.players[1].hand = [{ kind: 'food', value: 5 }] as Card[]; // overshoots, cornered
    s.players[1].score = 0;
    g.awaitingHuman.value = false;
    await g.resume();

    // the bot dodged the bite for a fresh hand, and the round carried on
    expect(g.biteCounts.value[1]).toBe(0);
    expect(g.log.value.some((l) => l.includes('Bot A forfeit'))).toBe(true);

    // with the variant off, the same cornered bot is bitten instead
    const off = useSnakeGame({ players: 2, seed: 9, botDelayMs: 0, forfeitAtOne: false });
    await off.newGame();
    const o = off.state.value;
    o.current = 1;
    o.phase = 'playing';
    o.length = o.maxLength - 1;
    o.players[1].hand = [{ kind: 'food', value: 5 }] as Card[];
    off.awaitingHuman.value = false;
    await off.resume();
    expect(off.log.value.some((l) => l.includes('Bot A forfeit'))).toBe(false);
  });

  describe('human combo pin', () => {
    const food = (v: number): Card => ({ kind: 'food', value: v });

    // force seat 0 to be awaiting with a known hand and gap, the round live
    function arrange(g: SnakeGame, hand: Card[], gap: number, draw: Card[] = []) {
      const s = g.state.value;
      s.current = 0;
      s.phase = 'playing';
      s.length = s.maxLength - gap;
      s.players[0].hand = hand;
      s.players[0].score = 0;
      s.drawPile = draw;
      g.awaitingHuman.value = true;
    }

    it('laying cards that sum to the gap pins the round', async () => {
      const g = useSnakeGame({ players: 3, seed: 5, botDelayMs: 0, comboPin: true });
      await g.newGame();
      arrange(g, [food(4), food(5), food(7)], 9); // 4 + 5 = 9
      expect(g.canCombo.value).toBe(true);

      g.startCombo();
      await g.layCombo(0); // lay the 4
      expect(g.state.value.roundResult).toBeUndefined(); // one card down, not committed-resolved
      await g.layCombo(0); // the 5 shifted to index 0 → lands the pin

      expect(g.state.value.roundResult).toMatchObject({ ending: 'pin', who: 0, pinKind: 'food' });
    });

    it('a missed 2-card attempt busts for 10 and play continues (not a round end)', async () => {
      const g = useSnakeGame({ players: 3, seed: 5, botDelayMs: 0, comboPin: true });
      await g.newGame();
      arrange(g, [food(4), food(2), food(8)], 9, [food(3), food(5), food(6), food(7)]); // 4 + 2 = 6, short

      g.startCombo();
      await g.layCombo(0); // 4
      await g.layCombo(0); // 2 (shifted)
      expect(g.comboLaid.value).toBe(2);
      await g.endCombo(); // give up: 2-card bust

      // the penalty landed (a later bot pin can only add +5 splash on top)
      expect(g.state.value.players[0].score).toBeGreaterThanOrEqual(10);
      expect(g.log.value.some((l) => l.includes('reached for a 2-card pin'))).toBe(true);
    });

    it('laying one card then ending is an ordinary play, no penalty', async () => {
      const g = useSnakeGame({ players: 3, seed: 5, botDelayMs: 0, comboPin: true });
      await g.newGame();
      arrange(g, [food(4), food(5), food(6)], 20, [food(3), food(5), food(6), food(7)]);

      g.startCombo();
      await g.layCombo(0); // lay one
      await g.endCombo(); // one card down → finalize as a normal play

      expect(g.log.value.some((l) => l.includes('reached for a'))).toBe(false); // no bust
    });
  });

  it('only offers legal cards to the human while awaiting input', async () => {
    // classic invariant: awaiting ⟹ at least one legal move. The forfeit-at-one
    // variant deliberately breaks it (a cornered last card awaits with no moves),
    // so pin it off here.
    const g = useSnakeGame({ players: 3, difficulty: 'easy', seed: 42, botDelayMs: 0, forfeitAtOne: false });
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
