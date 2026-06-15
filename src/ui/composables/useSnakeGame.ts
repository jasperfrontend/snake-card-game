// useSnakeGame: the interactive driver around the pure engine.
//
// It owns the live GameState, exposes play(move) for the human, and auto-runs
// bot turns with a short delay so they feel deliberate. Forced situations
// (stranded tricks, bites) resolve through the same engine primitives the
// headless runner uses, so the UI can never diverge from the simulation.
//
// This file may use Vue, browser storage and (UI-side, outside the engine)
// Math.random for the game seed; the engine itself stays pure and deterministic.

import { computed, ref, type Ref } from 'vue';
import { randInt, rngFromState } from '../../engine/rng';
import {
  advanceTurn,
  beginTurn,
  type ChoosePolicy,
  comboBust,
  comboFeed,
  drawCard,
  endBite,
  executeCombo,
  executeMove,
  finishTurn,
  type LegalMove,
  legalMoves as computeLegalMoves,
  pickLoser,
  startRound,
} from '../../engine/rules';
import { botChooseMove } from '../../bots/policy';
import type { Card, Difficulty, GameEvent, GameState, Kind, Move, Player } from '../../engine/types';
import { isComboMove } from '../../engine/types';
import {
  clearSave,
  loadRecord,
  loadSave,
  loadSettings,
  type Record as PlayRecord,
  saveGame,
  saveRecord,
  saveSettings,
} from '../persistence';

/** One visible segment of the snake's body (the cards fed this round). */
export interface SnakeSegment {
  id: number;
  kind: Kind | 'start';
  label: string;
  by: number;
  length: number;
}

/** A short-lived "beat" used to flash a real moment on the table. */
export interface Beat {
  id: number;
  type: GameEvent['type'];
  by: number;
}

/** How long the fabricated bot pacing runs. A user-facing preference. */
export type GameSpeed = 'slow' | 'normal' | 'fast';

const SPEED_PRESETS: Record<GameSpeed, { think: number; settle: number }> = {
  slow: { think: 2300, settle: 800 }, // ~3.1s, deliberate
  normal: { think: 1500, settle: 550 }, // ~2.0s
  fast: { think: 950, settle: 350 }, // ~1.3s, snappy but not unhinged
};

export interface GameOptions {
  players?: number; // total seats, default 3
  difficulty?: Difficulty; // bot strength, default 'medium'
  speed?: GameSpeed; // pacing, default from settings ('normal')
  maxPerPlayer?: number; // snake max = this × players (rulebook 15; game uses 23)
  handSize?: number; // cards dealt/refilled per hand (rulebook 4)
  humanSeat?: number; // which seat the human plays, default 0
  seed?: number; // fix for deterministic play/tests; otherwise random
  /** Shorthand: sets both think and settle to this. Pass 0 for instant (tests). */
  botDelayMs?: number;
  thinkMs?: number; // fixed override (else derived from speed)
  settleMs?: number; // fixed override (else derived from speed)
  /**
   * When the human's last card is a trick, drive the forced draw-and-play as a
   * paced, narrated sequence (and let the human choose a drawn Ace's value)
   * instead of the engine resolving it instantly. The UI opts in; headless
   * callers (tests) leave it off so beginTurn's bundled resolution is used.
   */
  interactiveStranded?: boolean;
  /**
   * Skill variant: also allow forfeiting when you are down to your LAST card.
   * Without it, a lone card that overshoots (or a stranded trick with no out) is
   * an instant bite; with it, that corner offers a fresh hand instead. Off in
   * headless tests by default so the bot-only simulation is untouched.
   */
  forfeitAtOne?: boolean;
  /**
   * Skill variant: lay 2–3 food cards in one turn to land the snake EXACTLY on
   * max. Missing busts (10 for a 2-card try, 20 for 3) but play continues. Enables
   * the bots' honest-combo play too. Off in headless tests by default.
   */
  comboPin?: boolean;
}

const TRICK_NAMES: Record<string, string> = { K: 'Coil', J: 'Slip', Q: 'Shed', A: 'Strike', JOKER: 'Scramble' };
function trickName(k: Kind): string {
  return TRICK_NAMES[k] ?? k;
}
function cardLabel(c: Card): string {
  if (c.kind === 'food') return `a ${c.value}`;
  if (c.kind === 'JOKER') return 'a Joker';
  if (c.kind === 'A') return 'an Ace';
  return `a ${c.kind} (${trickName(c.kind)})`;
}

const BEAT_TYPES = new Set<GameEvent['type']>([
  'pin',
  'bite',
  'shed',
  'coil',
  'slip',
  'scramble',
  'forfeit',
  'combobust',
]);

function mod(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function useSnakeGame(opts: GameOptions = {}) {
  const n = opts.players ?? 3;
  const humanSeat = opts.humanSeat ?? 0;
  // Deliberate pacing: a bot turn takes thinkMs + settleMs (~3.1s) so the table
  // is readable. botDelayMs is a shorthand (0 = instant, used by the tests).
  const interactiveStranded = opts.interactiveStranded ?? false;
  const maxPerPlayer = opts.maxPerPlayer ?? 15;
  const settings0 = loadSettings();
  const difficulty = ref<Difficulty>(opts.difficulty ?? settings0.difficulty);
  const speed = ref<GameSpeed>(opts.speed ?? settings0.speed);
  const handSize = ref<number>(opts.handSize ?? settings0.handSize); // applies on the next new game
  const tooltips = ref<boolean>(settings0.tooltips); // card hover tooltips on/off (live)
  // forfeit-at-one is a live skill variant; opts wins (tests), else the setting.
  const forfeitAtOne = ref<boolean>(opts.forfeitAtOne ?? settings0.forfeitAtOne);
  const comboPin = ref<boolean>(opts.comboPin ?? settings0.comboPin);

  // A fixed think/settle override (used by headless tests) wins; otherwise the
  // pace follows the live `speed` setting and can change mid-game.
  const fixedPace =
    opts.thinkMs !== undefined || opts.settleMs !== undefined || opts.botDelayMs !== undefined
      ? { think: opts.thinkMs ?? opts.botDelayMs ?? 0, settle: opts.settleMs ?? opts.botDelayMs ?? 0 }
      : null;
  const pace = (): { think: number; settle: number } => fixedPace ?? SPEED_PRESETS[speed.value];

  let rngBox = rngFromState({ seed: opts.seed ?? 1, calls: 0 });

  const state = ref<GameState>(
    startRound(initialPlayers(), 0, rngBox.rng, maxPerPlayer, handSize.value),
  ) as Ref<GameState>;
  const awaitingHuman = ref(false);
  const thinkingSeat = ref<number | null>(null);
  const gameOver = ref(false);
  const loser = ref<number | null>(null);
  const log = ref<string[]>([]);
  const lastEvents = ref<GameEvent[]>([]);
  const legalMoves = ref<LegalMove[]>([]);
  const snake = ref<SnakeSegment[]>([]);
  const beat = ref<Beat | null>(null);
  const record = ref<PlayRecord>(loadRecord());

  // the stranded-trick moment (human only): a narrated forced draw, after which
  // the drawn card joins the hand and the normal click-to-play system takes over
  const strandedNote = ref<string | null>(null);
  const strandedDrawn = ref<Card | null>(null);

  // per-player tally for the current game (the pin/bite race)
  const pinCounts = ref<number[]>(Array.from({ length: n }, () => 0));
  const biteCounts = ref<number[]>(Array.from({ length: n }, () => 0));

  // forfeit: bin the hand for a new one. Once per hand-cycle (resets when the
  // human's hand refills to full or a new round deals), so it's a mulligan, not
  // an every-turn stall. Normally a full fresh hand only; the forfeit-at-one
  // variant also unlocks it on your last card, as an escape from the corner.
  const forfeitUsed = ref(false);

  // combo pin (human, interactive): an in-progress multi-card attempt this turn.
  // comboLaid is how many cards have been laid; 2+ commits you to a pin or a bust.
  const comboActive = ref(false);
  const comboLaid = ref(0);

  let ticking = false;
  let segId = 0;
  let beatId = 0;

  const names: string[] = Array.from({ length: n }, (_, i) =>
    i === humanSeat ? 'You' : `Bot ${String.fromCharCode(65 + (i < humanSeat ? i : i - 1))}`,
  );
  const playerName = (i: number) => names[i] ?? `Seat ${i}`;

  function initialPlayers(): Player[] {
    return Array.from({ length: n }, (_, i) => ({
      hand: [],
      score: 0,
      isBot: i !== humanSeat,
      difficulty: i !== humanSeat ? difficulty.value : undefined,
    }));
  }

  const botChoose: ChoosePolicy = (s, r) => botChooseMove(s, difficulty.value, r, comboPin.value);

  function delay(ms: number): Promise<void> {
    if (ms <= 0) return Promise.resolve();
    return new Promise((res) => setTimeout(res, ms));
  }

  // -------------------------------------------------------------- event surfacing

  function flushEvents(): void {
    const evs = state.value.events;
    if (evs.length === 0) return;
    lastEvents.value = evs.slice();
    for (const e of evs) {
      log.value.push(describe(e));
      applyToSnake(e);
      if (BEAT_TYPES.has(e.type)) beat.value = { id: ++beatId, type: e.type, by: e.by };
      // a fresh full hand (refill) re-arms the human's mulligan
      if (e.type === 'refill' && e.by === humanSeat) forfeitUsed.value = false;
    }
    state.value.events = [];
  }

  function applyToSnake(e: GameEvent): void {
    const p = (e.payload ?? {}) as Record<string, number | string>;
    const len = state.value.length;
    switch (e.type) {
      case 'startLength':
        segId = 0;
        snake.value = [{ id: ++segId, kind: 'start', label: String(p.length), by: e.by, length: Number(p.length) }];
        break;
      case 'play':
        snake.value.push({
          id: ++segId,
          kind: p.kind === 'A' ? 'A' : 'food',
          label: p.kind === 'A' ? (p.feed === 0 ? 'A·0' : `A·${p.feed}`) : String(p.feed),
          by: e.by,
          length: Number(p.length),
        });
        break;
      case 'shed':
        snake.value.push({ id: ++segId, kind: 'Q', label: 'Q', by: e.by, length: Number(p.length) });
        break;
      case 'coil':
        snake.value.push({ id: ++segId, kind: 'K', label: 'K', by: e.by, length: len });
        break;
      case 'slip':
        snake.value.push({ id: ++segId, kind: 'J', label: 'J', by: e.by, length: len });
        break;
      case 'scramble':
        snake.value.push({ id: ++segId, kind: 'JOKER', label: '★', by: e.by, length: len });
        break;
    }
  }

  function describe(e: GameEvent): string {
    const who = playerName(e.by);
    const p = (e.payload ?? {}) as Record<string, number | string>;
    switch (e.type) {
      case 'startLength':
        return `Snake starts at ${p.length}.`;
      case 'play':
        if (p.kind === 'A' && p.feed === 0) return `${who} feint (Ace as 0), still ${p.length}.`;
        return `${who} feed ${p.feed} → ${p.length}.`;
      case 'shed':
        return `${who} shed: the snake halves to ${p.length}.`;
      case 'coil':
        return `${who} coil: play reverses.`;
      case 'slip':
        return `${who} slip: the next player is skipped.`;
      case 'scramble':
        return `${who} scrambled: whole hand binned, 4 fresh drawn.`;
      case 'forfeit':
        return `${who} forfeit the hand: ${handSize.value} fresh cards.`;
      case 'combobust':
        return `${who} reached for a ${p.laid}-card pin and missed: +${p.penalty}.`;
      case 'refill':
        return `${who} empty: draw a fresh 4.`;
      case 'reshuffle':
        return `Discard reshuffled back into the draw pile.`;
      case 'pin':
        return `${who} PIN the snake at ${state.value.maxLength}! Everyone else +5.`;
      case 'bite':
        return `${who} BITTEN: cornered, +10.`;
      default:
        return '';
    }
  }

  // ------------------------------------------------------------------ persistence

  function persist(): void {
    saveGame({
      state: state.value,
      rng: rngBox.state,
      difficulty: difficulty.value,
      awaitingHuman: awaitingHuman.value,
      legalMoves: legalMoves.value,
      snake: snake.value,
      log: log.value,
      pins: pinCounts.value,
      bites: biteCounts.value,
    });
  }

  /** Restore a saved in-progress game. Returns false if there is nothing to resume. */
  function loadSaved(): boolean {
    const saved = loadSave();
    if (!saved) return false;
    rngBox = rngFromState(saved.rng);
    state.value = saved.state;
    if (!state.value.handSize) state.value.handSize = handSize.value; // saves predating handSize
    difficulty.value = saved.difficulty;
    awaitingHuman.value = saved.awaitingHuman;
    legalMoves.value = saved.legalMoves;
    snake.value = saved.snake;
    log.value = saved.log;
    lastEvents.value = [];
    beat.value = null;
    thinkingSeat.value = null;
    gameOver.value = false;
    loser.value = null;
    pinCounts.value = saved.pins ?? Array.from({ length: n }, () => 0);
    biteCounts.value = saved.bites ?? Array.from({ length: n }, () => 0);
    cancelCombo();
    finishStranded();
    segId = saved.snake.reduce((m, s) => Math.max(m, s.id), 0);
    return true;
  }

  /** Continue a restored game if it was paused mid-flight (not on a human turn). */
  async function resume(): Promise<void> {
    if (state.value.phase === 'playing' && !awaitingHuman.value) await run();
  }

  // ------------------------------------------------------------------- turn loop

  async function run(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      while (state.value.phase === 'playing') {
        const cur = state.value.current;
        const { think, settle } = pace();

        if (cur === humanSeat) {
          const hand = state.value.players[cur].hand;
          if (interactiveStranded && hand.length === 1 && hand[0].kind !== 'food') {
            await drawForHumanStranded();
            if (awaitingHuman.value) return; // now choose either card normally
            continue; // round ended (deck exhausted, a degenerate bite)
          }
          // forfeit-at-one rescue: a lone card with no safe play would let
          // beginTurn corner the human into a bite. When the variant is
          // available, surface the turn instead (play it if legal, or forfeit).
          // Count the turn here exactly as beginTurn would, then wait for the
          // human to resolve it via play() or forfeitHand().
          if (forfeitAtOne.value && hand.length === 1 && !forfeitUsed.value) {
            state.value.roundMeta.plays++;
            legalMoves.value = computeLegalMoves(hand, state.value.length, state.value.maxLength);
            awaitingHuman.value = true;
            flushEvents();
            return;
          }
          const prep = beginTurn(state.value, rngBox.rng);
          flushEvents();
          if (prep.status === 'awaiting') {
            legalMoves.value = prep.moves ?? [];
            awaitingHuman.value = true;
            return; // wait for play()
          }
          await delay(settle); // a stranded trick auto-resolved (or a bite ended it)
          continue;
        }

        thinkingSeat.value = cur;
        await delay(think);
        thinkingSeat.value = null;
        stepBot();
        flushEvents();
        await delay(settle);
      }
      onRoundEnd();
    } finally {
      ticking = false;
      persist();
    }
  }

  function stepBot(): void {
    const prep = beginTurn(state.value, rngBox.rng);
    if (prep.status !== 'awaiting') return; // stranded/bite already handled
    const mv = botChoose(state.value, rngBox.rng);
    if (mv === null) return; // beginTurn already covers the no-move bite
    if (isComboMove(mv)) executeCombo(state.value, mv.combo, rngBox.rng);
    else executeMove(state.value, mv.cardIndex, mv.aceValue, rngBox.rng);
  }

  // -------------------------------------------------- stranded trick (human only)
  // When the human's last card is a trick they can't play it (no trick as the
  // last card), so they must draw one. We narrate that forced draw, drop the
  // drawn card into the hand, and then hand off to the normal click-to-play
  // turn: with two cards the trick is no longer "last", so the player may play
  // EITHER the trick or the drawn card, whichever they prefer. (Bots and the
  // headless runner keep beginTurn's bundled resolution, so the sim is intact.)

  function finishStranded(): void {
    strandedNote.value = null;
    strandedDrawn.value = null;
  }

  // stranded pacing scales with the current speed (and is instant when off)
  const strandedPace = (ms: number) => (pace().settle <= 0 ? 0 : Math.round(ms * (pace().settle / 800)));

  async function drawForHumanStranded(): Promise<void> {
    const cur = state.value.current;
    const hand = state.value.players[cur].hand;
    const trick = hand[0];
    state.value.roundMeta.plays++; // count the turn, exactly as beginTurn would

    strandedNote.value = `Only a ${trickName(trick.kind)} left. You must draw a card first.`;
    await delay(strandedPace(900));

    const drawn = drawCard(state.value, rngBox.rng);
    flushEvents(); // surface a reshuffle, if any
    if (drawn === null) {
      endBite(state.value, cur); // truly out of cards (degenerate)
      flushEvents();
      finishStranded();
      return;
    }
    hand.push(drawn);
    strandedDrawn.value = drawn;
    log.value.push(`Down to a ${trickName(trick.kind)}. Drew ${cardLabel(drawn)}.`);
    strandedNote.value = `You drew ${cardLabel(drawn)}. Play your ${trickName(trick.kind)} or the new card.`;
    await delay(strandedPace(700));

    // hand off to the normal turn: both cards are now choosable if legal
    legalMoves.value = computeLegalMoves(hand, state.value.length, state.value.maxLength);
    awaitingHuman.value = true;
  }

  function onRoundEnd(): void {
    // tally the round that just finished
    const rr = state.value.roundResult;
    if (rr) {
      if (rr.ending === 'pin') pinCounts.value[rr.who]++;
      else biteCounts.value[rr.who]++;
    }

    const scores = state.value.players.map((pl) => pl.score);
    if (Math.max(...scores) >= 100) {
      const who = pickLoser(scores, rngBox.rng);
      loser.value = who;
      state.value.phase = 'gameOver';
      gameOver.value = true;
      if (who === humanSeat) record.value.losses++;
      else record.value.wins++;
      saveRecord(record.value);
      clearSave();
    }
    // otherwise stay in 'roundEnd'; the UI calls nextRound() to continue
  }

  // ----------------------------------------------------------------- public API

  function persistSettings(): void {
    saveSettings({
      difficulty: difficulty.value,
      speed: speed.value,
      handSize: handSize.value,
      tooltips: tooltips.value,
      forfeitAtOne: forfeitAtOne.value,
      comboPin: comboPin.value,
    });
  }

  /** Change the bot pacing live (takes effect on the next bot turn). */
  function setSpeed(s: GameSpeed): void {
    speed.value = s;
    persistSettings();
  }

  /** Change bot strength; takes effect on the next new game. */
  function setDifficulty(d: Difficulty): void {
    difficulty.value = d;
    persistSettings();
  }

  /** Change hand size; takes effect on the next new game. */
  function setHandSize(h: number): void {
    handSize.value = h;
    persistSettings();
  }

  /** Toggle card hover tooltips (applies immediately). */
  function setTooltips(on: boolean): void {
    tooltips.value = on;
    persistSettings();
  }

  /** Toggle the forfeit-at-one variant (applies immediately to the live game). */
  function setForfeitAtOne(on: boolean): void {
    forfeitAtOne.value = on;
    persistSettings();
  }

  /** Toggle the combo-pin variant (applies immediately to the live game). */
  function setComboPin(on: boolean): void {
    comboPin.value = on;
    if (!on) cancelCombo();
    persistSettings();
  }

  async function newGame(diff?: Difficulty): Promise<void> {
    if (diff) difficulty.value = diff;
    persistSettings();
    rngBox = rngFromState({ seed: opts.seed ?? Math.floor(Math.random() * 0x7fffffff), calls: 0 });
    const dealer = randInt(rngBox.rng, n);
    state.value = startRound(initialPlayers(), dealer, rngBox.rng, maxPerPlayer, handSize.value);
    awaitingHuman.value = false;
    thinkingSeat.value = null;
    gameOver.value = false;
    loser.value = null;
    log.value = [];
    lastEvents.value = [];
    legalMoves.value = [];
    snake.value = [];
    beat.value = null;
    pinCounts.value = Array.from({ length: n }, () => 0);
    biteCounts.value = Array.from({ length: n }, () => 0);
    forfeitUsed.value = false;
    cancelCombo();
    finishStranded();
    clearSave();
    flushEvents();
    await run();
  }

  async function play(move: Move): Promise<void> {
    if (!awaitingHuman.value) return;
    awaitingHuman.value = false;
    legalMoves.value = [];
    finishStranded(); // clear any "you drew…" note once the choice is made
    executeMove(state.value, move.cardIndex, move.aceValue, rngBox.rng);
    flushEvents();
    await run();
  }

  // ----------------------------------------------------------- combo pin (human)
  // An interactive multi-card pin: the player lays food cards one at a time,
  // hidden-sum, trying to land EXACTLY on max. The first card is free (laying one
  // then stopping is an ordinary play); laying a second commits to a pin or a bust
  // (10 for two cards, 20 for three). A bust keeps the cards on the snake and
  // passes the turn on — it never ends the round. Mirrors executeCombo for bots.

  function cancelCombo(): void {
    comboActive.value = false;
    comboLaid.value = 0;
  }

  /** Food cards in hand that still fit without overshooting — the layable set. */
  const comboLayable = computed<Set<number>>(() => {
    const set = new Set<number>();
    if (comboLaid.value >= 3) return set; // capped at three cards
    const hand = state.value.players[humanSeat].hand;
    const room = state.value.maxLength - state.value.length;
    hand.forEach((c, i) => {
      if (c.kind === 'food' && (c.value as number) <= room) set.add(i);
    });
    return set;
  });

  /** Whether the human may START a pin attempt: variant on, their turn, not mid-
   *  attempt, and at least two food cards in hand (the minimum for a combo). */
  const canCombo = computed(() => {
    if (!comboPin.value || !awaitingHuman.value || comboActive.value) return false;
    const foods = state.value.players[humanSeat].hand.filter((c) => c.kind === 'food').length;
    return foods >= 2;
  });

  /** Begin a pin attempt (no card laid yet). */
  function startCombo(): void {
    if (!canCombo.value) return;
    comboActive.value = true;
    comboLaid.value = 0;
    finishStranded();
  }

  /** Lay one food card into the in-progress attempt. Resolves a pin if it lands. */
  async function layCombo(cardIndex: number): Promise<void> {
    if (!comboActive.value || !awaitingHuman.value || !comboLayable.value.has(cardIndex)) return;
    const res = comboFeed(state.value, cardIndex);
    comboLaid.value++;
    if (res.pinned) {
      awaitingHuman.value = false;
      legalMoves.value = [];
      cancelCombo();
      flushEvents();
      await run(); // the round ended on the pin
      return;
    }
    flushEvents(); // the snake grew; stay in the attempt for the next card
  }

  /** Finish the attempt: 0 cards cancels, 1 card is an ordinary play, 2+ busts. */
  async function endCombo(): Promise<void> {
    if (!comboActive.value) return;
    const laid = comboLaid.value;
    if (laid === 0) {
      cancelCombo(); // nothing laid — back to a normal turn
      return;
    }
    awaitingHuman.value = false;
    legalMoves.value = [];
    const cur = state.value.current;
    if (laid === 1)
      finishTurn(state.value, cur, rngBox.rng); // one card = a normal play
    else comboBust(state.value, laid, rngBox.rng); // two or three = a bust
    cancelCombo();
    flushEvents();
    await run();
  }

  /**
   * Forfeit is offered on a full, freshly-dealt hand, and — with the
   * forfeit-at-one variant — also on your last remaining card (the corner
   * escape). Either way it's gated to once per hand-cycle.
   */
  const canForfeit = computed(() => {
    if (!awaitingHuman.value || forfeitUsed.value || comboActive.value) return false;
    const len = state.value.players[humanSeat].hand.length;
    return len === handSize.value || (forfeitAtOne.value && len === 1);
  });

  /** Forfeit the whole hand for a fresh one; this spends your turn (a chosen Joker). */
  async function forfeitHand(): Promise<void> {
    if (!canForfeit.value) return;
    const cur = state.value.current;
    const hand = state.value.players[cur].hand;
    awaitingHuman.value = false;
    legalMoves.value = [];
    forfeitUsed.value = true;

    state.value.discardPile.push(...hand);
    const fresh: Card[] = [];
    for (let k = 0; k < handSize.value; k++) {
      const d = drawCard(state.value, rngBox.rng);
      if (d) fresh.push(d);
    }
    state.value.players[cur].hand = fresh;
    state.value.events.push({ type: 'forfeit', by: cur });
    advanceTurn(state.value); // forfeiting costs your play this round
    flushEvents();
    await run();
  }

  async function nextRound(): Promise<void> {
    if (state.value.phase !== 'roundEnd') return;
    const dealer = mod(state.value.dealer + 1, n);
    state.value = startRound(state.value.players, dealer, rngBox.rng, maxPerPlayer, handSize.value);
    awaitingHuman.value = false;
    legalMoves.value = [];
    beat.value = null;
    forfeitUsed.value = false;
    cancelCombo();
    finishStranded();
    flushEvents();
    await run();
  }

  return {
    state,
    difficulty,
    awaitingHuman,
    thinkingSeat,
    gameOver,
    loser,
    log,
    lastEvents,
    snake,
    beat,
    record,
    speed,
    handSize,
    tooltips,
    forfeitAtOne,
    comboPin,
    comboActive,
    comboLaid,
    strandedNote,
    strandedDrawn,
    pinCounts,
    biteCounts,

    length: computed(() => state.value.length),
    maxLength: computed(() => state.value.maxLength),
    current: computed(() => state.value.current),
    direction: computed(() => state.value.direction),
    scores: computed(() => state.value.players.map((pl) => pl.score)),
    humanHand: computed(() => state.value.players[humanSeat].hand),
    legalMoves,
    legalIndices: computed(() => new Set(legalMoves.value.map((m) => m.i))),
    aceValues: computed(() => {
      const room = state.value.maxLength - state.value.length;
      const top = Math.min(9, room);
      return Array.from({ length: Math.max(0, top + 1) }, (_, v) => v);
    }),
    roundResult: computed(() => state.value.roundResult),
    isHumanTurn: computed(() => awaitingHuman.value),
    drawCount: computed(() => state.value.drawPile.length),
    canForfeit,
    canCombo,
    comboLayable,

    playerName,
    humanSeat,
    newGame,
    play,
    forfeitHand,
    startCombo,
    layCombo,
    endCombo,
    nextRound,
    setSpeed,
    setDifficulty,
    setHandSize,
    setTooltips,
    setForfeitAtOne,
    setComboPin,
    loadSaved,
    resume,
  };
}

export type SnakeGame = ReturnType<typeof useSnakeGame>;
