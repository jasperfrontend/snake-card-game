# Snake — single-player card game

### ▶ Play now at **[avoidthebite.com](https://avoidthebite.com/)**

A polished, fully client-side browser version of **Snake**, a push-your-luck card
game, played against two bots. Built to read as a sibling of the printed rulebook
(`reference/snake-rulebook.html`), with behaviour matched to the reference Monte-Carlo
simulator (`reference/snake_sim.py`).

No backend, no database, no networking — everything runs in the browser.

## Play

```bash
npm install
npm run dev          # http://localhost:5173
```

Feed the snake without overshooting its max length. Land exactly on the max to
**pin** it (you score 0, everyone else +5); get cornered with no legal card and you
are **bitten** (+10). Points are bad — first to 100 loses, everyone else wins. The
wild **Ace** (Strike) is how you thread the needle for a pin.

> The rulebook and the Python oracle use a max of **15 × players**; the playable
> game runs a roomier **23 × players** (69 at a 3-handed table) for more
> breathing room. It's the `maxPerPlayer` option on `useSnakeGame`; the engine
> default stays 15 so the statistical tests keep matching the oracle.

## Develop

```bash
npm test             # Vitest: engine, stats, bots, composable, persistence (31 tests)
npm run typecheck    # vue-tsc --noEmit
npm run lint         # eslint (Vue + TS) and stylelint
npm run lint:fix     # auto-fix lint issues
npm run format       # prettier --write
npm run check        # typecheck + lint + format check + tests (what CI runs)
npm run simulate     # headless Monte-Carlo report (the engine oracle)
npm run build        # type-check + static bundle into dist/
npm run preview      # serve the production build locally
```

Linting is enforced in CI (`.github/workflows/ci.yml`) on every push and PR:
ESLint (`@vue/eslint-config-typescript`, essential Vue rules), Stylelint
(`stylelint-config-standard` + Vue), and Prettier own formatting.

## Architecture

```
src/
  engine/      pure, deterministic TS — no Vue, no DOM, no Math.random
    types.ts   deck.ts  rng.ts (mulberry32)  rules.ts  simulate.ts
  bots/
    policy.ts  smart heuristic + difficulty-aware imperfect bots
  ui/
    composables/useSnakeGame.ts   the interactive driver over the engine
    components/  App.vue · SnakeRow.vue · CardFace.vue
    persistence.ts                localStorage: resume, record, settings
  styles/tokens.css               palette + fonts lifted from the rulebook
reference/     snake_sim.py · snake-rulebook.html  (authoritative)
```

The engine is the single source of truth: both the headless simulator and the live
UI drive it through the same `beginTurn` / `executeMove` primitives, so play can
never diverge from the simulation. A seeded PRNG makes every game reproducible and
the statistical tests stable. The TS port reproduces the Python's signatures under
smart play (≈88% pins at 4 players, right-skewed round lengths, uniform loser-by-seat
with a random tiebreak).

**Difficulty** comes from two knobs on top of the smart baseline: `pinAwareness`
(chance to take an available pin) and `mathError` (chance to miscount the room and
play greedily). Weaker bots get bitten more and lose more — beatable, not trivial.

**Persistence** (localStorage, no backend): an in-progress game resumes after a
refresh, plus a win-loss record and the chosen difficulty.

## Deploy (static)

The build output in `dist/` is a static site — host it anywhere.

Cloudflare Pages:

```bash
npm run build
npx wrangler pages deploy dist        # or connect the repo in the Pages dashboard
# Build command: npm run build   ·   Output directory: dist
```

Or copy `dist/` to any static host / nginx root. No SSR, no server process.
(An online leaderboard is the only feature that would need a backend — out of v1 scope.)
