# Snake: Build Plan (single player vs 2 bots)

A handoff plan for Claude Code. The goal is a polished, browser-based, single-player version of the card game Snake, played against two bots. This document is the brief. Work through it in order.

## Reference material (read first)

Drop these two files into the repo at `/reference` before starting. They are authoritative.

- `snake_sim.py`, a complete, working implementation of the v6 rules in Python, plus a defensive bot policy and a statistical test harness. **This is the source of truth for game behavior.** When in doubt about a rule or an edge case, match this file. It also produces known statistics (see Phase 1 acceptance) that the TypeScript port must reproduce.
- `snake-rulebook.html`, the player-facing rulebook. **This is the source of truth for visual identity.** Lift its design tokens (palette, fonts, card components) directly into the game so the two read as one product.

## Goal

A static web app where one human plays Snake against two bots, start to finish, in the browser. Looks like a sibling of the rulebook. Beatable but not trivial.

## Non-goals (hard guardrails)

Do not build any of these. If the implementation seems to need one, stop and re-read this list.

- No multiplayer, no networking, no realtime, no websockets.
- No backend or server process for core gameplay.
- No database. No authentication.
- The only thing that would ever justify a server is an online leaderboard, which is explicitly out of v1 scope.

Everything runs client-side. The bots are local code in the same browser as the player.

## Stack (decided, do not re-litigate)

- Vite + Vue 3 (`<script setup>`, Composition API) + TypeScript.
- Vitest for unit and statistical tests.
- A seeded PRNG (mulberry32) so the engine is deterministic and testable. Do not use bare `Math.random` inside the engine.
- Styling: plain CSS using the custom properties from the rulebook. UnoCSS is fine if you prefer utilities, but reuse the rulebook tokens either way.
- State: a single composable, `useSnakeGame`. Pinia is optional and probably unnecessary.
- Deploy: static build to Cloudflare Pages (or the user's own nginx). No SSR.

## Repo structure

```
src/
  engine/            pure TS, zero Vue/DOM imports, fully testable
    types.ts
    deck.ts
    rules.ts         legalMoves, applyMove, round/game runners
    rng.ts           mulberry32
    simulate.ts      headless batch runner (the test oracle)
    __tests__/
  bots/
    policy.ts        difficulty-aware bot
  ui/                Vue components
    composables/useSnakeGame.ts
    components/
  styles/
    tokens.css       palette + fonts lifted from the rulebook
reference/           snake_sim.py, snake-rulebook.html
```

## Rules summary (orientation only, sim is authoritative)

- Deck: standard 52 plus 2 jokers, 54 cards. Food (2 to 10) feeds its face value. Tricks carry no food value: King reverses direction, Jack skips the next player, Queen halves the length (floor), Ace is wild 0 to 9 with 0 as a feint, Joker makes the next player bin their whole hand and draw 4.
- Max length is 15 times the player count. v1 is 3 players (you plus two bots), so max is 45.
- A turn plays exactly one card. You cannot push the snake over max, and you cannot play a trick (including Ace and Joker) as your last card. Play your hand down to empty, then draw 4.
- Stranded trick: if your only card is a trick, draw one and play it if it is playable, otherwise keep both and pass.
- A round ends on a Bite (the player has no legal play, plus 10 points to them) or a Pin (land exactly on max, the pinner scores 0 and everyone else takes 5).
- First to 100 points loses. Everyone else wins.

## Type sketch (refine as needed)

```ts
type Kind = 'food' | 'K' | 'Q' | 'J' | 'A' | 'JOKER';
interface Card { kind: Kind; value: number | null }      // value only for food
interface Move { cardIndex: number; aceValue?: number }   // aceValue only for Ace
type Difficulty = 'easy' | 'medium' | 'hard';
interface Player { hand: Card[]; score: number; isBot: boolean; difficulty?: Difficulty }
interface GameEvent { type: 'play' | 'pin' | 'bite' | 'shed' | 'coil' | 'slip' | 'scramble' | 'refill'; by: number; payload?: unknown }
interface GameState {
  players: Player[];
  length: number;
  maxLength: number;
  direction: 1 | -1;
  current: number;
  drawPile: Card[];
  discardPile: Card[];
  dealer: number;
  phase: 'playing' | 'roundEnd' | 'gameOver';
  lastEvent?: GameEvent;
}
```

Engine functions are pure: `applyMove(state, move, rng)` returns a new state plus the events that occurred. The UI orchestrates the turn loop and the timing. The engine never touches the DOM.

---

## Phase 0: Scaffold

- [ ] Vite + Vue 3 + TS project, Vitest wired up, lint/format configured.
- [ ] Folder structure above. Copy the two reference files into `/reference`.
- [ ] `rng.ts` with a seeded mulberry32 and a tiny shuffle helper that takes an rng.

## Phase 1: Engine (pure TS, build and verify this before any UI)

- [ ] Port the full v6 logic from `snake_sim.py`: deck builder, `legalMoves`, `applyMove` (handling all five tricks, pin and bite detection, hand refill, the stranded-trick path, and reshuffle when the draw pile empties), round runner, game runner with dealer rotation and the first-to-100 loss.
- [ ] `simulate.ts`: a headless batch runner that plays N games with configurable player count and bot policy, and reports the same metrics the Python prints (rounds per game, plays-per-round distribution, bite vs pin percentages, trick usage per round, pins by Ace vs food, loser-by-seat).
- [ ] Important: break ties for the loss **randomly**, not by seat index. The Python file documents why (a seat-index tiebreak produces a fake positional bias because pins move everyone's score together).

**Acceptance.** Running the batch with the smart policy at 3 to 6 players reproduces the Python's statistical signatures (it does not need to match exactly, the RNG differs, but the shape must hold):
- Smart-play pin rate near 88%, bite rate near 12% at 4 players.
- Round length right-skewed: median well below mean, a long tail.
- Loser-by-seat uniform (no seat advantage) with random tiebreak.

If those land, the engine is correct. This is the QA gate.

## Phase 2: Bots and difficulty

- [ ] Port the defensive heuristic from `snake_sim.py`'s `choose_move` as the strong baseline.
- [ ] Add difficulty by making the bot imperfect, controlled by a config: a `pinAwareness` probability (chance the bot notices and takes an available pin) and a `mathError` probability (chance it plays a slightly suboptimal card). The simulation showed perfect arithmetic pins about 88% and almost never gets bitten, which is no fun to beat, so imperfection is required, not optional.
  - `easy`: low pinAwareness, higher mathError, sometimes dumps the wrong card.
  - `medium`: moderate both.
  - `hard`: strong heuristic but still not perfect arithmetic, so it occasionally gets bitten.
- [ ] `botChooseMove(state, difficulty, rng): Move`.

**Acceptance.** Re-run the batch swapping the bots between difficulties. Bite rate should rise as difficulty falls (mirroring the smart-vs-naive contrast in the sim: roughly 12% bites at smart, roughly 62% at naive). The human seat's win rate should climb noticeably against easier bots.

## Phase 3: Playable shell (function before form)

- [ ] `useSnakeGame` composable wrapping the engine: holds the GameState, exposes `play(move)` for the human, and auto-advances bot turns with a short delay so they feel deliberate. Emits the engine events for the UI to react to.
- [ ] Human input: render the human's hand, click a card to play it. For an Ace, prompt for the value 0 to 9. Show the resulting length and which moves are legal.
- [ ] A full game playable end to end against two bots, scores tracked to 100, round transitions handled. Ugly is fine at this stage.

**Acceptance.** You can sit down and play a complete game to a win or a loss without touching the console.

## Phase 4: Visual polish (reuse the rulebook)

- [ ] `tokens.css` from the rulebook: the gold, bone, ink and card-back palette, plus Fraunces, Newsreader and Space Mono.
- [ ] The snake renders as a growing row of cards across the table, with a prominent length readout in mono and the max shown as a goal marker. The Bite and the Pin each get a real beat. Queen halve, Joker scramble, King reverse and Jack skip each get small, legible feedback. A bot "thinking" indicator.
- [ ] Quality floor: responsive down to mobile, visible keyboard focus, `prefers-reduced-motion` respected.

**Acceptance.** It looks like it belongs next to the rulebook and feels good to play.

## Phase 5: Persistence and deploy

- [ ] localStorage for: resume an in-progress game, a win-loss record, and settings (difficulty). No backend.
- [ ] `vite build`, deploy the static output to Cloudflare Pages (or nginx). Confirm a refresh mid-game restores state.

**Acceptance.** A live URL, save survives refresh, settings persist.

## Optional stretch (clearly out of v1)

- Bot personality lines in the user's dry channel voice, pre-baked as canned strings so the app stays fully static with zero API calls.
- Hardcore mode: hide the running length total so the player has to track it themselves, recreating the call-the-length tension from the table. The sim showed that human miscounting is what keeps the snake dangerous, so this mode is the digital echo of that.
- Sound. More bots (the engine already supports 3 to 6 players, so this is mostly a settings and layout task).
- Online leaderboard. This is the one feature that needs a tiny serverless function plus a KV store. Do not build it in v1.

## Working agreement for the agent

- Build the engine first and pass its statistical acceptance before writing any UI. The Python sim is your oracle; read it.
- Keep `src/engine` pure: no Vue, no DOM, no `Math.random`. It must run headless under Vitest.
- Type everything. Write tests as you port, not after.
- Commit at each phase boundary with a clear message.
- If at any point a server, database, or networking seems necessary for core play, you have misread the scope. Re-read the non-goals.

## Definition of done (v1)

A deployed static site where a single player plays a full game of Snake against two bots at a chosen difficulty, with the rulebook's visual identity, save-on-refresh, and a win-loss record. No backend anywhere.

---

## Kickoff prompt to paste into Claude Code

> Read `/reference/snake_sim.py` and `/reference/snake-rulebook.html` in full, then read `BUILD-PLAN.md`. Confirm you understand the v6 rules and the non-goals, then start Phase 0 and Phase 1: scaffold the Vite + Vue 3 + TS project and port the Python engine into a pure, deterministic `src/engine` with a seeded PRNG. Build the headless `simulate.ts` and show me that it reproduces the Python's statistical signatures (about 88% pins under smart play, fair loser-by-seat with random tiebreak, right-skewed round lengths) before touching any UI. Stop after Phase 1 passes its acceptance and report the numbers.
