// Headless batch runner — the test oracle. Plays N games at a given player count
// with a given policy and reports the same metrics reference/snake_sim.py prints,
// so the TS port can be checked against the Python's statistical signatures.

import { mulberry32 } from './rng';
import { playGame, type ChoosePolicy } from './rules';
import {
  smartPolicy,
  smartComboPolicy,
  botPolicy,
  botComboPolicy,
  configPolicy,
  seatedPolicy,
  NAIVE,
  DIFFICULTY,
} from '../bots/policy';
import type { Difficulty } from './types';

const TRICK_ORDER = ['Q', 'K', 'J', 'A', 'JOKER'] as const;

export interface BatchStats {
  players: number;
  games: number;
  roundsPlayed: number;
  playsPerRound: number[];
  roundsPerGame: number[];
  endings: { bite: number; pin: number };
  pinKind: Record<string, number>; // ace / food / Q
  trickTotal: Record<string, number>;
  loserSeat: number[]; // count per seat
  combobusts: number; // total busted combo attempts (variant metric)
}

export function runBatch(
  nPlayers: number,
  nGames: number,
  seed: number,
  policy: ChoosePolicy = smartPolicy,
  maxPerPlayer = 15,
  handSize = 4,
): BatchStats {
  const rng = mulberry32(seed);
  const stats: BatchStats = {
    players: nPlayers,
    games: nGames,
    roundsPlayed: 0,
    playsPerRound: [],
    roundsPerGame: [],
    endings: { bite: 0, pin: 0 },
    pinKind: {},
    trickTotal: {},
    loserSeat: Array.from({ length: nPlayers }, () => 0),
    combobusts: 0,
  };

  for (let g = 0; g < nGames; g++) {
    const { loser, rounds, roundResults, combobusts } = playGame(nPlayers, policy, rng, maxPerPlayer, handSize);
    stats.roundsPerGame.push(rounds);
    stats.loserSeat[loser]++;
    stats.combobusts += combobusts;
    for (const r of roundResults) {
      stats.roundsPlayed++;
      stats.playsPerRound.push(r.plays);
      stats.endings[r.ending]++;
      if (r.ending === 'pin' && r.pinKind) {
        stats.pinKind[r.pinKind] = (stats.pinKind[r.pinKind] ?? 0) + 1;
      }
      for (const [k, v] of Object.entries(r.trickCounts)) {
        stats.trickTotal[k] = (stats.trickTotal[k] ?? 0) + v;
      }
    }
  }
  return stats;
}

// ----------------------------------------------------------------- statistics

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}
export function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
export function pstdev(xs: number[]): number {
  const mu = mean(xs);
  return Math.sqrt(mean(xs.map((x) => (x - mu) ** 2)));
}

// -------------------------------------------------------------------- printing

export function formatSummary(tag: string, n: number, s: BatchStats): string {
  const ppr = s.playsPerRound;
  const rpg = s.roundsPerGame;
  const total = s.roundsPlayed;
  const out: string[] = [];
  const pct = (x: number) => (100 * x) / total;

  out.push(`\n===== ${tag}  (${n} players) =====`);
  out.push(`games:                ${rpg.length}`);
  out.push(`rounds played:        ${total}`);
  out.push(
    `rounds / game:        mean ${mean(rpg).toFixed(1)}   median ${median(rpg)}   range ${Math.min(...rpg)}-${Math.max(...rpg)}`,
  );
  out.push(
    `plays / round:        mean ${mean(ppr).toFixed(1)}   median ${median(ppr)}   range ${Math.min(...ppr)}-${Math.max(...ppr)}   stdev ${pstdev(ppr).toFixed(1)}`,
  );
  out.push(`plays / player / rnd: ${(mean(ppr) / n).toFixed(2)}`);
  out.push(
    `round endings:        bite ${s.endings.bite} (${pct(s.endings.bite).toFixed(0)}%)   pin ${s.endings.pin} (${pct(s.endings.pin).toFixed(0)}%)`,
  );

  const pkTot = Object.values(s.pinKind).reduce((a, b) => a + b, 0);
  if (pkTot) {
    const parts = Object.entries(s.pinKind)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${((100 * v) / pkTot).toFixed(0)}%`);
    out.push(`pins landed by:       ${parts.join('  ')}`);
  }

  out.push(
    `trick uses / round:   ${TRICK_ORDER.map((k) => `${k} ${((s.trickTotal[k] ?? 0) / total).toFixed(2)}`).join('  ')}`,
  );
  out.push(
    `loser by seat:        ${s.loserSeat.map((c, i) => `s${i}:${((100 * c) / rpg.length).toFixed(0)}%`).join('  ')}`,
  );
  return out.join('\n');
}

// --------------------------------------------------- Phase 2: difficulty reports

/** Bite rate when all seats share one policy. */
export function biteRate(nPlayers: number, nGames: number, seed: number, policy: ChoosePolicy): number {
  const s = runBatch(nPlayers, nGames, seed, policy);
  return s.endings.bite / s.roundsPlayed;
}

/**
 * Win rate for a "human" proxy in seat 0 (played by the smart heuristic) against
 * two bots of a given difficulty in seats 1 and 2. Win = the human is not the
 * loser. Weaker bots should make the human win more often.
 */
export function humanWinRate(difficulty: Difficulty, nGames: number, seed: number): number {
  const rng = mulberry32(seed);
  const policy = seatedPolicy([smartPolicy, botPolicy(difficulty), botPolicy(difficulty)]);
  let wins = 0;
  for (let g = 0; g < nGames; g++) {
    const { loser } = playGame(3, policy, rng);
    if (loser !== 0) wins++;
  }
  return wins / nGames;
}

export function phase2Report(): string {
  const out: string[] = [];
  const GAMES = 300;

  out.push('\n===== PHASE 2: BITE RATE BY OPPONENT STRENGTH (3 players, 300 games) =====');
  out.push(`${'policy'.padStart(8)} ${'pinAware'.padStart(9)} ${'mathErr'.padStart(8)} ${'bite%'.padStart(7)}`);
  const rows: Array<[string, number, number, ChoosePolicy]> = [
    ['smart', 1.0, 0.0, smartPolicy],
    ['hard', DIFFICULTY.hard.pinAwareness, DIFFICULTY.hard.mathError, botPolicy('hard')],
    ['medium', DIFFICULTY.medium.pinAwareness, DIFFICULTY.medium.mathError, botPolicy('medium')],
    ['easy', DIFFICULTY.easy.pinAwareness, DIFFICULTY.easy.mathError, botPolicy('easy')],
    ['naive', NAIVE.pinAwareness, NAIVE.mathError, configPolicy(NAIVE)],
  ];
  for (const [name, pa, me, pol] of rows) {
    const br = biteRate(3, GAMES, 1234, pol);
    out.push(
      `${name.padStart(8)} ${pa.toFixed(2).padStart(9)} ${me.toFixed(2).padStart(8)} ${((100 * br).toFixed(0) + '%').padStart(7)}`,
    );
  }

  out.push('\n===== PHASE 2: HUMAN (smart) WIN RATE vs TWO BOTS (3 players, 300 games) =====');
  out.push(`${'bots'.padStart(8)} ${'human win%'.padStart(11)}`);
  for (const d of ['hard', 'medium', 'easy'] as const) {
    const wr = humanWinRate(d, GAMES, 555);
    out.push(`${d.padStart(8)} ${((100 * wr).toFixed(0) + '%').padStart(11)}`);
  }
  return out.join('\n');
}

// --------------------------------------------------- Step 2: combo-pin variant

/** Win rate for a seat-0 human proxy vs two bots, at a given snake max. */
function winRateVsBots(
  human: ChoosePolicy,
  botFor: (d: Difficulty) => ChoosePolicy,
  d: Difficulty,
  nGames: number,
  seed: number,
  maxPerPlayer: number,
): number {
  const rng = mulberry32(seed);
  const policy = seatedPolicy([human, botFor(d), botFor(d)]);
  let wins = 0;
  for (let g = 0; g < nGames; g++) {
    const { loser } = playGame(3, policy, rng, maxPerPlayer);
    if (loser !== 0) wins++;
  }
  return wins / nGames;
}

export function comboReport(): string {
  const out: string[] = [];
  const GAMES = 400;
  const MP = 23; // the app's snake max (23 × players)

  out.push('\n===== STEP 2: COMBO-PIN VARIANT (3 players, 23×, 400 games) =====');
  out.push('Same-difficulty table — classic vs combo: round endings + busts.');
  out.push(
    `${'bots'.padStart(8)} ${'variant'.padStart(8)} ${'bite%'.padStart(6)} ${'pin%'.padStart(6)} ${'busts/game'.padStart(11)}`,
  );
  for (const d of ['easy', 'medium', 'hard'] as const) {
    for (const [tag, pol] of [
      ['classic', botPolicy(d)],
      ['combo', botComboPolicy(d)],
    ] as const) {
      const s = runBatch(3, GAMES, 1234, pol, MP);
      const tot = s.roundsPlayed;
      const bite = (100 * s.endings.bite) / tot;
      const pin = (100 * s.endings.pin) / tot;
      const bpg = s.combobusts / GAMES;
      out.push(
        `${d.padStart(8)} ${tag.padStart(8)} ${(bite.toFixed(0) + '%').padStart(6)} ${(pin.toFixed(0) + '%').padStart(6)} ${bpg.toFixed(2).padStart(11)}`,
      );
    }
  }

  out.push('\n----- sharp human win% vs two bots (perfect combos), classic vs combo, 23× -----');
  out.push(`${'bots'.padStart(8)} ${'classic'.padStart(9)} ${'combo'.padStart(9)}`);
  for (const d of ['hard', 'medium', 'easy'] as const) {
    const base = winRateVsBots(smartPolicy, botPolicy, d, GAMES, 555, MP);
    const combo = winRateVsBots(smartComboPolicy, botComboPolicy, d, GAMES, 555, MP);
    out.push(
      `${d.padStart(8)} ${((100 * base).toFixed(0) + '%').padStart(9)} ${((100 * combo).toFixed(0) + '%').padStart(9)}`,
    );
  }
  return out.join('\n');
}

// ------------------------------------------------------------------- entrypoint

export function main(): void {
  const SEED = 42;

  const headline = runBatch(4, 100, SEED);
  console.log(formatSummary('HEADLINE: 100 games', 4, headline));

  console.log('\n\n===== PLAYER-COUNT SWEEP (100 games each) =====');
  console.log(
    `${'players'.padStart(8)} ${'max'.padStart(5)} ${'rounds/game'.padStart(12)} ${'plays/round'.padStart(12)} ${'plays/player'.padStart(13)} ${'bite%'.padStart(6)} ${'pin%'.padStart(6)}`,
  );
  for (const n of [3, 4, 5, 6]) {
    const s = runBatch(n, 100, SEED + n);
    const ppr = s.playsPerRound;
    const tot = s.roundsPlayed;
    const bite = (100 * s.endings.bite) / tot;
    const pin = (100 * s.endings.pin) / tot;
    console.log(
      `${String(n).padStart(8)} ${String(15 * n).padStart(5)} ${mean(s.roundsPerGame).toFixed(1).padStart(12)} ${mean(ppr).toFixed(1).padStart(12)} ${(mean(ppr) / n).toFixed(2).padStart(13)} ${(bite.toFixed(0) + '%').padStart(6)} ${(pin.toFixed(0) + '%').padStart(6)}`,
    );
  }

  console.log(phase2Report());
  console.log(comboReport());
}

// Invoked via the run-sim.ts wrapper (`npm run simulate`); see that file.
