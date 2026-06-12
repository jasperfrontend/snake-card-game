// localStorage persistence. No backend, everything lives in the browser.
// All access is guarded so this is a no-op under Vitest's node environment.

import type {RngState} from '../engine/rng';
import type {LegalMove} from '../engine/rules';
import type {Difficulty, GameState} from '../engine/types';
import type {GameSpeed, SnakeSegment} from './composables/useSnakeGame';

const VERSION = 1;
const K_SETTINGS = 'snake:settings:v1';
const K_RECORD = 'snake:record:v1';
const K_SAVE = 'snake:save:v1';
const K_SEEN_RULES = 'snake:seenRules:v1';
const C_SEEN_RULES = 'snake_seen_rules';

export interface Settings {
  difficulty: Difficulty;
  speed: GameSpeed;
  handSize: number;
  tooltips: boolean;
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
    /* quota or serialization failure. non-fatal */
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
  return {
    difficulty: s?.difficulty ?? 'medium',
    speed: s?.speed ?? 'normal',
    handSize: s?.handSize ?? 4,
    tooltips: s?.tooltips ?? true,
  };
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

// first-visit rules ----------------------------------------------------------
// Stored in BOTH localStorage and a cookie so clearing one still suppresses the
// auto-open. Either present => the visitor has seen the rules.

export function hasSeenRules(): boolean {
  const s = store();
  if (s) {
    try {
      if (s.getItem(K_SEEN_RULES)) return true;
    } catch {
      /* ignore */
    }
  }
  if (typeof document !== 'undefined') {
    if (document.cookie.split('; ').some((c) => c.startsWith(`${C_SEEN_RULES}=`))) return true;
  }
  return false;
}

export function markRulesSeen(): void {
  const s = store();
  if (s) {
    try {
      s.setItem(K_SEEN_RULES, '1');
    } catch {
      /* ignore */
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const oneYear = 60 * 60 * 24 * 365;
      document.cookie = `${C_SEEN_RULES}=1; path=/; max-age=${oneYear}; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  }
}
