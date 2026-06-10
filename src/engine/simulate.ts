// Headless batch runner — the test oracle. Plays N games at a given player count
// with a given policy and reports the same metrics reference/snake_sim.py prints,
// so the TS port can be checked against the Python's statistical signatures.

import { mulberry32 } from './rng';
import { playGame, type ChoosePolicy } from './rules';
import { smartPolicy } from '../bots/policy';

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
}

export function runBatch(nPlayers: number, nGames: number, seed: number, policy: ChoosePolicy = smartPolicy): BatchStats {
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
  };

  for (let g = 0; g < nGames; g++) {
    const { loser, rounds, roundResults } = playGame(nPlayers, policy, rng);
    stats.roundsPerGame.push(rounds);
    stats.loserSeat[loser]++;
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
}

// Invoked via the run-sim.ts wrapper (`npm run simulate`); see that file.
