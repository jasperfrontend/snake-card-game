// localStorage persistence. No backend — everything lives in the browser.
// All access is guarded so this is a no-op under Vitest's node environment.

import type { RngState } from '../engine/rng';
import type { LegalMove } from '../engine/rules';
import type { Difficulty, GameState } from '../engine/types';
import type { GameSpeed, SnakeSegment } from './composables/useSnakeGame';

const VERSION = 1;
const K_SETTINGS = 'snake:settings:v1';
const K_RECORD = 'snake:record:v1';
const K_SAVE = 'snake:save:v1';

export interface Settings {
  difficulty: Difficulty;
  speed: GameSpeed;
  handSize: number;
}
export interface Record {
  wins: number;
  losses: number;
}
/** The full UI snapshot needed to resume a game exactly after a refresh. */
export interface SavedGame {
  version: number;
  state: GameState;
  rng: RngState;
  difficulty: Difficulty;
  awaitingHuman: boolean;
  legalMoves: LegalMove[];
  snake: SnakeSegment[];
  log: string[];
  pins: number[];
  bites: number[];
}

export type SaveData = Omit<SavedGame, 'version'>;

function store(): Storage | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    return localStorage;
  } catch {
    return null; // e.g. privacy mode throwing on access
  }
}

function read<T>(key: string): T | null {
  const s = store();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  const s = store();
  if (!s) return;
  try {
    s.setItem(key, JSON.stringify(value));
  } catch {
    /* quota or serialization failure — non-fatal */
  }
}

function remove(key: string): void {
  const s = store();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* ignore */
  }
}

// settings -------------------------------------------------------------------

export function loadSettings(): Settings {
  const s = read<Partial<Settings>>(K_SETTINGS);
  return { difficulty: s?.difficulty ?? 'medium', speed: s?.speed ?? 'normal', handSize: s?.handSize ?? 4 };
}
export function saveSettings(settings: Settings): void {
  write(K_SETTINGS, settings);
}

// win/loss record ------------------------------------------------------------

export function loadRecord(): Record {
  const r = read<Record>(K_RECORD);
  if (r && typeof r.wins === 'number' && typeof r.losses === 'number') return r;
  return { wins: 0, losses: 0 };
}
export function saveRecord(record: Record): void {
  write(K_RECORD, record);
}

// in-progress game -----------------------------------------------------------

export function loadSave(): SavedGame | null {
  const s = read<SavedGame>(K_SAVE);
  if (!s || s.version !== VERSION || !s.state || !s.rng) return null;
  return s;
}
export function saveGame(data: SaveData): void {
  // never persist a finished game
  if (data.state.phase === 'gameOver') {
    clearSave();
    return;
  }
  write(K_SAVE, { version: VERSION, ...data } satisfies SavedGame);
}
export function clearSave(): void {
  remove(K_SAVE);
}
