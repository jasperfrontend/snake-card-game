// Core v6 rules engine. A faithful port of reference/snake_sim.py.
// Pure TypeScript: no Vue, no DOM, no Math.random — all randomness is threaded
// through a seeded Rng so games are reproducible.

import type { Card, GameState, Kind, Move, Player, PinKind, RoundResult } from './types';
import { buildDeck } from './deck';
import { mulberry32, randInt, shuffle, type Rng } from './rng';

const PLAY_CAP = 4000; // safety valve; effectively never hit

/** A policy decides the current player's move, or returns null when cornered. */
export type ChoosePolicy = (state: GameState, rng: Rng) => Move | null;

// ----------------------------------------------------------------- legal moves

/** Richer move description used by the bot policy (mirrors legal_moves dicts). */
export interface LegalMove {
  i: number;
  type: Kind;
  val?: number; // food face value
  pin?: boolean; // food/Q lands exactly on max
  canPin?: boolean; // ace can land exactly on max
  room?: number; // ace: max - length
}

/** Legal moves for a hand. Tricks are never legal as the last card. */
export function legalMoves(hand: Card[], length: number, mx: number): LegalMove[] {
  const moves: LegalMove[] = [];
  const last = hand.length === 1;
  for (let i = 0; i < hand.length; i++) {
    const c = hand[i];
    if (c.kind === 'food') {
      const v = c.value as number;
      if (length + v <= mx) {
        moves.push({ i, type: 'food', val: v, pin: length + v === mx });
      }
    } else {
      if (last) continue; // no trick as your last card
      if (c.kind === 'Q') {
        moves.push({ i, type: 'Q', pin: Math.floor(length / 2) === mx });
      } else if (c.kind === 'A') {
        const room = mx - length;
        moves.push({ i, type: 'A', canPin: room >= 0 && room <= 9, room });
      } else {
        // K / J / JOKER — add nothing to the length
        moves.push({ i, type: c.kind, pin: false });
      }
    }
  }
  return moves;
}

// ------------------------------------------------------------------ deck draws

/**
 * Draw one card. When the draw pile empties, recycle the discard pile back into
 * it (shuffled). Returns null only if both piles are exhausted (degenerate).
 */
export function drawCard(state: GameState, rng: Rng): Card | null {
  if (state.drawPile.length === 0) {
    if (state.discardPile.length === 0) return null;
    state.drawPile = state.discardPile;
    state.discardPile = [];
    shuffle(state.drawPile, rng);
    state.events.push({ type: 'reshuffle', by: state.current });
  }
  return state.drawPile.pop() ?? null;
}

// ------------------------------------------------------------- state utilities

function mod(i: number, n: number): number {
  return ((i % n) + n) % n;
}

/** Advance the turn one seat in the current direction, consuming a pending skip. */
export function advanceTurn(state: GameState): void {
  const n = state.players.length;
  state.current = mod(state.current + state.direction, n);
  if (state.pendingSkip) {
    state.current = mod(state.current + state.direction, n);
    state.pendingSkip = false;
  }
}

function cloneCard(c: Card): Card {
  return { kind: c.kind, value: c.value };
}

export function cloneState(s: GameState): GameState {
  return {
    players: s.players.map((p) => ({ ...p, hand: p.hand.map(cloneCard) })),
    length: s.length,
    maxLength: s.maxLength,
    direction: s.direction,
    current: s.current,
    drawPile: s.drawPile.map(cloneCard),
    discardPile: s.discardPile.map(cloneCard),
    dealer: s.dealer,
    pendingSkip: s.pendingSkip,
    phase: s.phase,
    events: s.events.slice(),
    roundMeta: { plays: s.roundMeta.plays, trickCounts: { ...s.roundMeta.trickCounts } },
    roundResult: s.roundResult,
  };
}

// --------------------------------------------------------------- move execution

export interface MoveOutcome {
  kind: Kind;
  feed: number;
  pinned: boolean;
}

/**
 * Execute a concrete, already-legal move for the current player, MUTATING
 * `state`: play the card, apply its effect, tally the trick, check for a pin,
 * refill an emptied hand, and (unless pinned) advance the turn. Does NOT count
 * the turn — that is done once per turn by beginTurn().
 */
export function executeMove(state: GameState, idx: number, aceVal: number | undefined, rng: Rng): MoveOutcome {
  const n = state.players.length;
  const cur = state.current;
  const hand = state.players[cur].hand;

  const card = hand.splice(idx, 1)[0];
  state.discardPile.push(card);
  if (card.kind !== 'food') {
    state.roundMeta.trickCounts[card.kind] = (state.roundMeta.trickCounts[card.kind] ?? 0) + 1;
  }

  let feed = 0;
  switch (card.kind) {
    case 'food':
      feed = card.value as number;
      state.length += feed;
      state.events.push({ type: 'play', by: cur, payload: { kind: 'food', feed, length: state.length } });
      break;
    case 'A':
      feed = aceVal ?? 0;
      state.length += feed;
      state.events.push({ type: 'play', by: cur, payload: { kind: 'A', feed, length: state.length } });
      break;
    case 'Q':
      state.length = Math.floor(state.length / 2);
      state.events.push({ type: 'shed', by: cur, payload: { length: state.length } });
      break;
    case 'K':
      state.direction = (state.direction * -1) as 1 | -1;
      state.events.push({ type: 'coil', by: cur });
      break;
    case 'J':
      state.pendingSkip = true;
      state.events.push({ type: 'slip', by: cur });
      break;
    case 'JOKER': {
      const victim = mod(cur + state.direction, n);
      const dumped = state.players[victim].hand;
      state.discardPile.push(...dumped);
      const fresh: Card[] = [];
      for (let k = 0; k < 4; k++) {
        const d = drawCard(state, rng);
        if (d) fresh.push(d);
      }
      state.players[victim].hand = fresh;
      state.events.push({ type: 'scramble', by: victim });
      break;
    }
  }

  // --- pin? land exactly on max ---
  if (state.length === state.maxLength) {
    for (let j = 0; j < n; j++) {
      if (j !== cur) state.players[j].score += 5;
    }
    const pinKind: PinKind = card.kind === 'A' ? 'ace' : card.kind === 'food' ? 'food' : 'Q';
    state.events.push({ type: 'pin', by: cur, payload: { pinKind } });
    state.phase = 'roundEnd';
    state.roundResult = {
      ending: 'pin',
      who: cur,
      plays: state.roundMeta.plays,
      pinKind,
      trickCounts: state.roundMeta.trickCounts,
    };
    return { kind: card.kind, feed, pinned: true };
  }

  // --- refill an emptied hand (only a food card can be your last play) ---
  if (hand.length === 0) {
    for (let k = 0; k < 4; k++) {
      const d = drawCard(state, rng);
      if (d) hand.push(d);
    }
    if (hand.length > 0) state.events.push({ type: 'refill', by: cur });
  }

  advanceTurn(state);
  return { kind: card.kind, feed, pinned: false };
}

/** End the round on a bite: the cornered player takes 10 points. MUTATES state. */
export function endBite(state: GameState, who: number): void {
  state.players[who].score += 10;
  state.events.push({ type: 'bite', by: who });
  state.phase = 'roundEnd';
  state.roundResult = {
    ending: 'bite',
    who,
    plays: state.roundMeta.plays,
    trickCounts: state.roundMeta.trickCounts,
  };
}

// ---------------------------------------------------------------- turn stepping

export type TurnStatus =
  | 'ended' // the round ended this turn (bite, or a pin from an auto-played card)
  | 'resolved' // the turn auto-resolved (stranded-trick draw/play/pass) — no choice needed
  | 'awaiting'; // a normal turn: the current player must choose from `moves`

export interface TurnPrep {
  status: TurnStatus;
  moves?: LegalMove[];
}

/** Compute the ace value the stranded-trick path forces (mirrors snake_sim.py). */
function strandedAceValue(drawnKind: Kind, length: number, mx: number): number | undefined {
  if (drawnKind !== 'A') return undefined;
  const room = mx - length;
  return room >= 0 && room <= 9 ? room : 0;
}

/**
 * Begin a turn, MUTATING state: count the turn, then handle the forced paths —
 * the safety cap, the stranded-trick draw (auto-play / pass / bite), and the
 * no-legal-move bite. Returns 'awaiting' (with the legal moves) only when the
 * current player genuinely has a choice to make. Shared by the headless runner
 * and the interactive UI, so both resolve forced situations identically.
 */
export function beginTurn(state: GameState, rng: Rng): TurnPrep {
  state.roundMeta.plays++;
  const cur = state.current;
  if (state.roundMeta.plays > PLAY_CAP) {
    endBite(state, cur);
    return { status: 'ended' };
  }

  const hand = state.players[cur].hand;
  const { length, maxLength: mx } = state;

  // --- stranded trick: lone trick can't be played; draw one and try it ---
  if (hand.length === 1 && hand[0].kind !== 'food') {
    const drawn = drawCard(state, rng);
    if (drawn === null) {
      endBite(state, cur);
      return { status: 'ended' };
    }
    hand.push(drawn);
    if (drawn.kind === 'food') {
      if (length + (drawn.value as number) <= mx) {
        executeMove(state, 1, undefined, rng);
      } else {
        advanceTurn(state); // drawn card unplayable: keep both, pass
      }
    } else {
      executeMove(state, 1, strandedAceValue(drawn.kind, length, mx), rng);
    }
    return { status: state.phase === 'playing' ? 'resolved' : 'ended' };
  }

  // --- normal turn ---
  const moves = legalMoves(hand, length, mx);
  if (moves.length === 0) {
    endBite(state, cur);
    return { status: 'ended' };
  }
  return { status: 'awaiting', moves };
}

/** Execute one full turn under a policy, MUTATING state. Used by the runner. */
export function stepTurn(state: GameState, choose: ChoosePolicy, rng: Rng): GameState {
  const prep = beginTurn(state, rng);
  if (prep.status !== 'awaiting') return state;
  const mv = choose(state, rng);
  if (mv === null) {
    endBite(state, state.current);
    return state;
  }
  executeMove(state, mv.cardIndex, mv.aceValue, rng);
  return state;
}

// ---------------------------------------------------------------- round runner

/** Build a fresh round: deal 4 each, seed the starting length from a food flip. */
export function startRound(players: Player[], dealer: number, rng: Rng): GameState {
  const n = players.length;
  const deck = shuffle(buildDeck(), rng);
  const dealt: Player[] = players.map((p) => ({ ...p, hand: [] }));
  for (let p = 0; p < n; p++) {
    for (let k = 0; k < 4; k++) dealt[p].hand.push(deck.pop() as Card);
  }

  const state: GameState = {
    players: dealt,
    length: 0,
    maxLength: 15 * n,
    direction: 1,
    current: mod(dealer + 1, n),
    drawPile: deck,
    discardPile: [],
    dealer,
    pendingSkip: false,
    phase: 'playing',
    events: [],
    roundMeta: { plays: 0, trickCounts: {} },
  };

  // seed starting length: flip until a food card turns up
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const c = drawCard(state, rng);
    if (!c) break; // degenerate; deck has 36 food cards so this never trips
    state.discardPile.push(c);
    if (c.kind === 'food') {
      state.length = c.value as number;
      state.events.push({ type: 'startLength', by: dealer, payload: { length: state.length } });
      break;
    }
  }

  return state;
}

/** Play one round to completion (a pin or a bite), MUTATING `state`. */
export function playRound(state: GameState, choose: ChoosePolicy, rng: Rng): GameState {
  while (state.phase === 'playing') stepTurn(state, choose, rng);
  return state;
}

// ----------------------------------------------------------------- game runner

export interface GameOutcome {
  scores: number[];
  loser: number;
  rounds: number;
  roundResults: RoundResult[];
}

/**
 * Pick the loser: the top scorer, breaking ties RANDOMLY — never by seat index.
 * A seat-index tiebreak fabricates a positional bias because a pin moves every
 * other seat's score together, so ties land disproportionately on low seats.
 */
export function pickLoser(scores: number[], rng: Rng): number {
  const top = Math.max(...scores);
  const tied: number[] = [];
  for (let i = 0; i < scores.length; i++) if (scores[i] === top) tied.push(i);
  return tied[randInt(rng, tied.length)];
}

/** Play a full game to a loss (first to 100 points). */
export function playGame(n: number, choose: ChoosePolicy, rng: Rng): GameOutcome {
  let players: Player[] = Array.from({ length: n }, () => ({ hand: [], score: 0, isBot: true }));
  let dealer = randInt(rng, n);
  let rounds = 0;
  const roundResults: RoundResult[] = [];

  while (Math.max(...players.map((p) => p.score)) < 100 && rounds < 1000) {
    const state = startRound(players, dealer, rng);
    const final = playRound(state, choose, rng);
    players = final.players;
    if (final.roundResult) roundResults.push(final.roundResult);
    rounds++;
    dealer = mod(dealer + 1, n);
  }

  const scores = players.map((p) => p.score);
  return { scores, loser: pickLoser(scores, rng), rounds, roundResults };
}

/** Convenience: a fresh seeded rng. */
export function makeRng(seed: number): Rng {
  return mulberry32(seed);
}

/** Re-exported so callers don't need to reach into rng.ts. */
export type { Rng };
