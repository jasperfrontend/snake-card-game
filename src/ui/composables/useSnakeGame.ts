// useSnakeGame — the interactive driver around the pure engine.
//
// It owns the live GameState, exposes play(move) for the human, and auto-runs
// bot turns with a short delay so they feel deliberate. Forced situations
// (stranded tricks, bites) resolve through the same engine primitives the
// headless runner uses, so the UI can never diverge from the simulation.
//
// This file may use Vue and (UI-side, outside the engine) Math.random for the
// game seed; the engine itself stays pure and deterministic.

import { computed, ref, type ComputedRef, type Ref } from 'vue';
import { mulberry32, randInt, type Rng } from '../../engine/rng';
import {
  beginTurn,
  executeMove,
  pickLoser,
  startRound,
  type ChoosePolicy,
  type LegalMove,
} from '../../engine/rules';
import { botChooseMove } from '../../bots/policy';
import type { Difficulty, GameEvent, GameState, Move, Player } from '../../engine/types';

export interface GameOptions {
  players?: number; // total seats, default 3
  difficulty?: Difficulty; // bot strength, default 'medium'
  humanSeat?: number; // which seat the human plays, default 0
  seed?: number; // fix for deterministic play/tests; otherwise random
  botDelayMs?: number; // pause before each bot acts, default 650 (0 = instant)
}

export interface SnakeGame {
  state: Ref<GameState>;
  difficulty: Ref<Difficulty>;
  awaitingHuman: Ref<boolean>;
  thinkingSeat: Ref<number | null>;
  gameOver: Ref<boolean>;
  loser: Ref<number | null>;
  log: Ref<string[]>;
  lastEvents: Ref<GameEvent[]>;

  // derived, convenient for templates
  length: ComputedRef<number>;
  maxLength: ComputedRef<number>;
  current: ComputedRef<number>;
  direction: ComputedRef<1 | -1>;
  scores: ComputedRef<number[]>;
  humanHand: ComputedRef<GameState['players'][number]['hand']>;
  legalMoves: Ref<LegalMove[]>;
  legalIndices: ComputedRef<Set<number>>;
  aceValues: ComputedRef<number[]>;
  roundResult: ComputedRef<GameState['roundResult']>;
  isHumanTurn: ComputedRef<boolean>;

  playerName: (i: number) => string;
  newGame: (difficulty?: Difficulty) => Promise<void>;
  play: (move: Move) => Promise<void>;
  nextRound: () => Promise<void>;
}

function mod(i: number, n: number): number {
  return ((i % n) + n) % n;
}

export function useSnakeGame(opts: GameOptions = {}): SnakeGame {
  const n = opts.players ?? 3;
  const humanSeat = opts.humanSeat ?? 0;
  const botDelay = opts.botDelayMs ?? 650;
  const difficulty = ref<Difficulty>(opts.difficulty ?? 'medium');

  let rng: Rng = mulberry32(opts.seed ?? 1);

  const state = ref<GameState>(startRound(initialPlayers(), 0, rng)) as Ref<GameState>;
  const awaitingHuman = ref(false);
  const thinkingSeat = ref<number | null>(null);
  const gameOver = ref(false);
  const loser = ref<number | null>(null);
  const log = ref<string[]>([]);
  const lastEvents = ref<GameEvent[]>([]);
  const legalMoves = ref<LegalMove[]>([]);

  let ticking = false;

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

  function flushEvents(): void {
    const evs = state.value.events;
    if (evs.length === 0) return;
    lastEvents.value = evs.slice();
    for (const e of evs) log.value.push(describe(e));
    state.value.events = [];
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

  /** Drive turns until the human must choose, or the round/game ends. */
  async function run(): Promise<void> {
    if (ticking) return;
    ticking = true;
    try {
      while (state.value.phase === 'playing') {
        const cur = state.value.current;

        if (cur === humanSeat) {
          const prep = beginTurn(state.value, rng);
          flushEvents();
          if (prep.status === 'awaiting') {
            legalMoves.value = prep.moves ?? [];
            awaitingHuman.value = true;
            return; // wait for play()
          }
          // a stranded trick auto-resolved (or a bite ended the round)
          await delay(botDelay);
          continue;
        }

        // bot turn — show a thinking beat, then act
        thinkingSeat.value = cur;
        await delay(botDelay);
        thinkingSeat.value = null;
        stepBot(cur);
        flushEvents();
        await delay(botDelay * 0.4);
      }
      onRoundEnd();
    } finally {
      ticking = false;
    }
  }

  function stepBot(cur: number): void {
    const prep = beginTurn(state.value, rng);
    if (prep.status !== 'awaiting') return; // stranded/bite already handled
    const mv = botChoose(state.value, rng);
    if (mv === null) return; // beginTurn already covers the no-move bite
    void cur;
    executeMove(state.value, mv.cardIndex, mv.aceValue, rng);
  }

  function onRoundEnd(): void {
    const scores = state.value.players.map((pl) => pl.score);
    if (Math.max(...scores) >= 100) {
      loser.value = pickLoser(scores, rng);
      state.value.phase = 'gameOver';
      gameOver.value = true;
    }
    // otherwise stay in 'roundEnd'; the UI calls nextRound() to continue
  }

  async function newGame(diff?: Difficulty): Promise<void> {
    if (diff) difficulty.value = diff;
    rng = mulberry32(opts.seed ?? Math.floor(Math.random() * 0x7fffffff));
    const dealer = randInt(rng, n);
    state.value = startRound(initialPlayers(), dealer, rng);
    awaitingHuman.value = false;
    thinkingSeat.value = null;
    gameOver.value = false;
    loser.value = null;
    log.value = [];
    lastEvents.value = [];
    legalMoves.value = [];
    flushEvents();
    await run();
  }

  async function play(move: Move): Promise<void> {
    if (!awaitingHuman.value) return;
    awaitingHuman.value = false;
    legalMoves.value = [];
    executeMove(state.value, move.cardIndex, move.aceValue, rng);
    flushEvents();
    await run();
  }

  async function nextRound(): Promise<void> {
    if (state.value.phase !== 'roundEnd') return;
    const dealer = mod(state.value.dealer + 1, n);
    state.value = startRound(state.value.players, dealer, rng);
    awaitingHuman.value = false;
    legalMoves.value = [];
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
    playerName,
    newGame,
    play,
    nextRound,
  };
}
