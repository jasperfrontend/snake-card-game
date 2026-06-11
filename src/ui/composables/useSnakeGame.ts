// useSnakeGame — the interactive driver around the pure engine.
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
  drawCard,
  endBite,
  executeMove,
  pickLoser,
  startRound,
  type ChoosePolicy,
  type LegalMove,
} from '../../engine/rules';
import { botChooseMove } from '../../bots/policy';
import type { Card, Difficulty, GameEvent, GameState, Kind, Move, Player } from '../../engine/types';
import {
  clearSave,
  loadRecord,
  loadSave,
  loadSettings,
  saveGame,
  saveRecord,
  saveSettings,
  type Record as PlayRecord,
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
  slow: { think: 2300, settle: 800 }, // ~3.1s — deliberate
  normal: { think: 1500, settle: 550 }, // ~2.0s
  fast: { think: 950, settle: 350 }, // ~1.3s — snappy but not unhinged
};

export interface GameOptions {
  players?: number; // total seats, default 3
  difficulty?: Difficulty; // bot strength, default 'medium'
  speed?: GameSpeed; // pacing, default from settings ('normal')
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

const BEAT_TYPES = new Set<GameEvent['type']>(['pin', 'bite', 'shed', 'coil', 'slip', 'scramble']);

function mod(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function useSnakeGame(opts: GameOptions = {}) {
  const n = opts.players ?? 3;
  const humanSeat = opts.humanSeat ?? 0;
  // Deliberate pacing: a bot turn takes thinkMs + settleMs (~3.1s) so the table
  // is readable. botDelayMs is a shorthand (0 = instant, used by the tests).
  const interactiveStranded = opts.interactiveStranded ?? false;
  const settings0 = loadSettings();
  const difficulty = ref<Difficulty>(opts.difficulty ?? settings0.difficulty);
  const speed = ref<GameSpeed>(opts.speed ?? settings0.speed);

  // A fixed think/settle override (used by headless tests) wins; otherwise the
  // pace follows the live `speed` setting and can change mid-game.
  const fixedPace =
    opts.thinkMs !== undefined || opts.settleMs !== undefined || opts.botDelayMs !== undefined
      ? { think: opts.thinkMs ?? opts.botDelayMs ?? 0, settle: opts.settleMs ?? opts.botDelayMs ?? 0 }
      : null;
  const pace = (): { think: number; settle: number } => fixedPace ?? SPEED_PRESETS[speed.value];

  let rngBox = rngFromState({ seed: opts.seed ?? 1, calls: 0 });

  const state = ref<GameState>(startRound(initialPlayers(), 0, rngBox.rng)) as Ref<GameState>;
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

  // the stranded-trick reveal (human only): a narrated draw-and-play
  const strandedNote = ref<string | null>(null);
  const strandedDrawn = ref<Card | null>(null);
  const awaitingStrandedAce = ref(false);

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

  const botChoose: ChoosePolicy = (s, r) => botChooseMove(s, difficulty.value, r);

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
        if (p.kind === 'A' && p.feed === 0) return `${who} feint (Ace as 0) — still ${p.length}.`;
        return `${who} feed ${p.feed} → ${p.length}.`;
      case 'shed':
        return `${who} shed — the snake halves to ${p.length}.`;
      case 'coil':
        return `${who} coil — play reverses.`;
      case 'slip':
        return `${who} slip — the next player is skipped.`;
      case 'scramble':
        return `${who} scrambled — whole hand binned, 4 fresh drawn.`;
      case 'refill':
        return `${who} empty — draw a fresh 4.`;
      case 'reshuffle':
        return `Discard reshuffled back into the draw pile.`;
      case 'pin':
        return `${who} PIN the snake at ${state.value.maxLength}! Everyone else +5.`;
      case 'bite':
        return `${who} BITTEN — cornered, +10.`;
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
    });
  }

  /** Restore a saved in-progress game. Returns false if there is nothing to resume. */
  function loadSaved(): boolean {
    const saved = loadSave();
    if (!saved) return false;
    rngBox = rngFromState(saved.rng);
    state.value = saved.state;
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
            await resolveHumanStranded();
            if (awaitingStrandedAce.value) return; // wait for playStrandedAce()
            continue;
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
    executeMove(state.value, mv.cardIndex, mv.aceValue, rngBox.rng);
  }

  // -------------------------------------------------- stranded trick (human only)
  // Mirrors beginTurn's stranded branch step-by-step, but paced and narrated so
  // the forced draw-and-play is legible — and the human picks a drawn Ace's value.

  function finishStranded(): void {
    strandedNote.value = null;
    strandedDrawn.value = null;
    awaitingStrandedAce.value = false;
  }

  // stranded pacing scales with the current speed (and is instant when off)
  const strandedPace = (ms: number) => (pace().settle <= 0 ? 0 : Math.round(ms * (pace().settle / 800)));

  async function resolveHumanStranded(): Promise<void> {
    const cur = state.value.current;
    const hand = state.value.players[cur].hand;
    const trick = hand[0];
    state.value.roundMeta.plays++; // count the turn, exactly as beginTurn would

    strandedNote.value = `Only a ${trickName(trick.kind)} left — you must draw a card and play it.`;
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
    strandedNote.value = `You drew ${cardLabel(drawn)}.`;
    log.value.push(`Down to a ${trickName(trick.kind)} — drew ${cardLabel(drawn)}.`);
    await delay(strandedPace(1100));

    const length = state.value.length;
    const mx = state.value.maxLength;

    if (drawn.kind === 'food') {
      if (length + (drawn.value as number) <= mx) {
        strandedNote.value = `Playing the ${drawn.value}.`;
        await delay(strandedPace(550));
        executeMove(state.value, 1, undefined, rngBox.rng);
        flushEvents();
      } else {
        strandedNote.value = `The ${drawn.value} would overshoot — you keep both and pass.`;
        log.value.push(`The ${drawn.value} is too big — kept both and passed.`);
        advanceTurn(state.value);
        await delay(strandedPace(1100));
      }
      finishStranded();
      return;
    }

    if (drawn.kind === 'A') {
      // give the human the choice the engine would otherwise make for them
      strandedNote.value = `You drew a Strike — choose its value.`;
      awaitingStrandedAce.value = true;
      return; // run() returns; playStrandedAce() finishes it
    }

    // K / Q / J / Joker — always playable at hand size 2, so play it
    strandedNote.value = `Playing the ${trickName(drawn.kind)}.`;
    await delay(strandedPace(550));
    executeMove(state.value, 1, undefined, rngBox.rng);
    flushEvents();
    finishStranded();
  }

  async function playStrandedAce(value: number): Promise<void> {
    if (!awaitingStrandedAce.value) return;
    awaitingStrandedAce.value = false;
    strandedNote.value = null;
    executeMove(state.value, 1, value, rngBox.rng); // the drawn Ace sits at index 1
    flushEvents();
    finishStranded();
    await run();
  }

  function onRoundEnd(): void {
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
    saveSettings({ difficulty: difficulty.value, speed: speed.value });
  }

  /** Change the bot pacing live (takes effect on the next bot turn). */
  function setSpeed(s: GameSpeed): void {
    speed.value = s;
    persistSettings();
  }

  async function newGame(diff?: Difficulty): Promise<void> {
    if (diff) difficulty.value = diff;
    persistSettings();
    rngBox = rngFromState({ seed: opts.seed ?? Math.floor(Math.random() * 0x7fffffff), calls: 0 });
    const dealer = randInt(rngBox.rng, n);
    state.value = startRound(initialPlayers(), dealer, rngBox.rng);
    awaitingHuman.value = false;
    thinkingSeat.value = null;
    gameOver.value = false;
    loser.value = null;
    log.value = [];
    lastEvents.value = [];
    legalMoves.value = [];
    snake.value = [];
    beat.value = null;
    finishStranded();
    clearSave();
    flushEvents();
    await run();
  }

  async function play(move: Move): Promise<void> {
    if (!awaitingHuman.value) return;
    awaitingHuman.value = false;
    legalMoves.value = [];
    executeMove(state.value, move.cardIndex, move.aceValue, rngBox.rng);
    flushEvents();
    await run();
  }

  async function nextRound(): Promise<void> {
    if (state.value.phase !== 'roundEnd') return;
    const dealer = mod(state.value.dealer + 1, n);
    state.value = startRound(state.value.players, dealer, rngBox.rng);
    awaitingHuman.value = false;
    legalMoves.value = [];
    beat.value = null;
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
    strandedNote,
    strandedDrawn,
    awaitingStrandedAce,

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

    playerName,
    humanSeat,
    newGame,
    play,
    playStrandedAce,
    nextRound,
    setSpeed,
    loadSaved,
    resume,
  };
}

export type SnakeGame = ReturnType<typeof useSnakeGame>;
