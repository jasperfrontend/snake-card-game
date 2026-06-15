# Skill variants: design spec (ideas 1 + 3)

Status: **design, not built.** Two opt-in rule variants that make Snake reward
quick mental arithmetic and give dead hands an out, without adding luck.

Both ship behind variant flags. The **engine defaults stay off** so the Python
oracle's statistical tests keep matching. The **app may default them on.**

- `forfeitAtOne`, extend forfeit to the 1-card desperation case (idea 1)
- `comboPin`, sequential multi-card Pin attempts, 2–3 cards (idea 3)

---

## Variant A: Forfeit at 1 card (idea 1)

Today you can only forfeit a **full fresh hand** (once per hand). This variant
also lets you forfeit when you are down to **exactly 1 card**.

- **When:** hand size == max (full) OR hand size == 1.
- **Effect:** voids your turn, discards your hand, redraws to max. The snake
  does **not** grow (you fed it nothing).
- **Limiter:** the deck. Forfeit draws from it; when it can't refill, forfeit is
  disabled. You are also *not* immune to points while stalling, every time an
  opponent Pins, you still take the +5 splash. So infinite forfeit bleeds you.
- **Differentiation from a combo bust (below):** forfeit = free full-hand wipe,
  no snake growth, no points. Combo bust = shed ≤3 chosen cards, grows the
  snake, costs points. Different tools for different problems.

**Edge:** if the deck can't refill to max, draw what's left; hand may stay
short. If the deck is empty, forfeit is unavailable.

---

## Variant B: Combo Pin (idea 3)

On your turn, instead of playing one card you may walk the snake to the max
**exactly** using **2 or 3 number cards from your hand**, laid one at a time.

### Open information, no helper
All inputs are visible, the snake's length, the max, your cards. The skill is
the mental `max − current` subtraction plus the subset-sum, done in your head.
The UI deliberately offers **no running-total, no "this combo pins" highlight,
no validation.** You commit by laying cards. That's where the calculation error
lives, open data, human arithmetic.

### The turn loop
1. **Card 1** is a normal play. Must be legal (cannot push past max). If it
   lands exactly on max → normal Pin, you win, done. If not, you may **stop**
   (ordinary turn, snake grew, no penalty) or **continue**.
2. **Laying card 2 commits you.** From here you must hit the max exactly or
   bust. Card 2 must be legal (cannot overshoot, that's always blocked).
   - snake == max → **Pin.** You win the round (you score 0, others +5).
   - snake < max → you may lay **card 3** (if legal) or **bust now**.
3. **Card 3** (cap). snake == max → Pin. Otherwise → **bust.**

Overshoot is **never** allowed, you physically cannot place a card that exceeds
the max (consistent with base Snake). So the only failure is **undershoot /
can't-complete**.

### Bust
- **Penalty:** 10 points if you laid **2** cards, **20** points if you laid
  **3.** (10 == a Bite's worth; 20 == reckless.)
- **A bust is NOT a round-ending Bite.** You take the points, your turn is
  voided, and **play continues.** Only a true Bite (cornered, no legal move)
  or a Pin ends the round.
- **Partial cards stay on the snake.** They fed it. The snake is now longer for
  everyone, costly, annoying, and it hands the **next** player a smaller gap
  (and thus a better single-card Pin shot). That consequence is the point.
- **Redraw:** after a bust you top your hand back up to max from the deck.

### The recursion (the good part)
Because a bust leaves the snake longer and play continues, the next player
inherits a tighter board and may *themselves* attempt a 2–3 card Pin and bust.
The snake creeps toward max through a chain of failed gambits until someone
lands it exactly (Pin) or gets genuinely cornered (Bite). Both end the round,
so it always terminates.

### The fake-miscalc dump (kept, but priced)
You may deliberately start a doomed combo to shed up to 3 junk cards, eat the
bust penalty, and redraw. This is **intentionally allowed**, it's snakey. It is
*not* degenerate because it costs 10/20 points and grows the snake; you only do
it in real desperation, when paying the penalty beats your trajectory. The
points penalty is the only thing keeping it from dominating the honest forfeit,
do not remove it.

### v1 scope decisions
- **Number cards only** in a combo. No tricks/Aces in the stack, keeps the math
  pure. (Aces-as-wild-in-combo is a tempting future extension; out of scope.)
- **No draw-to-complete.** Combos use cards already in hand. 2 cards → max a
  2-card attempt. Holding cards is what unlocks big Pins; that tradeoff is the
  skill. (A "draw blind to finish" chaos toggle is possible later but off by
  default, it reintroduces luck.)
- A single-card Pin is unchanged and is **not** a combo (no penalty risk).

---

## Bots

The asymmetry is clean and thematic, you're the cunning one, the bots play
straight.

- Bots compute `legalCombos(state, hand)` = subsets of size 2–3 of number cards
  summing exactly to the gap. If one exists and Pinning is good (it usually is,
  scoring 0), an honest bot takes it.
- Bots **never fake-dump** and never bust on purpose.
- The existing **`mathError`** knob does the balancing for free: with probability
  `mathError`, an easier bot misjudges the subset (e.g. sum off by ±1), attempts
  a non-landing combo, and **busts for real**, handing you breathing room. Hard
  bots combo flawlessly. So combos reward your maths exactly to the degree the
  bots are fallible, which is already how difficulty works.
- Bots use `forfeitAtOne` the same way they use the existing forfeit (dump a
  hopeless hand), gated on deck supply.

---

## Engine surface (altitude, not final code)

Keep the pure/deterministic engine pure. Variants are parameters, defaults off.

- **Flags:** thread `forfeitAtOne: boolean` and `comboPin: boolean` through
  `startRound` / `playRound` / `playGame` (same pattern as `maxPerPlayer`,
  `handSize`). Defaults `false` so the 31 oracle tests are untouched.
- **State:** the engine already steps a turn via `beginTurn` / `executeMove` /
  `stepTurn`. Add an in-turn combo buffer (cards laid this turn, count) so a turn
  can place multiple cards before it ends. Bust resolution applies the 10/20
  penalty to the active player's score, marks turn void, triggers redraw-to-max.
- **Enumeration:** `legalCombos(gap, hand)` for bots and for any UI affordance
  that needs to know a combo is *possible* (not *which*, never reveal that to
  the human player).
- **Scoring hooks:** Pin already does "others +5"; reuse it for combo Pins. Add
  "self += 10|20" for busts. A bust must NOT trigger round-end.
- **Deck exhaustion:** forfeit/bust/Scramble all draw; on an empty deck, draw
  what's available and degrade gracefully (no stalls). The simulator must
  confirm rounds still terminate.

## App / UX

- **Combo affordance:** after a non-pinning card, a "Lay another →" action enters
  combo mode, with a one-time confirm ("this commits you to a Pin or a Bite").
  No running total, no validation hint. Cards animate onto the snake with the
  existing per-play delay so the recursion reads visually.
- **Bust feedback:** clear "BUST, you took 10/20" toast; snake stays grown.
- **Settings:** an "Advanced / skill rules" group in SettingsModal toggling
  `comboPin` and `forfeitAtOne`. App may default them on even though the engine
  defaults them off.
- **Docs:** update RulesModal, TacticsModal, and HOW-TO-PLAY.md once shipped.

## Simulator acceptance (before/after)

Run baseline vs each variant (and both) and report:

- Win-rate spread across seats (fairness preserved, random tiebreak intact).
- Pin : Bite : combo-bust mix; average round length (should stay bounded).
- % of Pins that are combos; bust frequency by difficulty.
- A skilled human-equivalent policy should **win more** than baseline (more
  reachable Pins) without games failing to terminate or stalling on an empty
  deck.

---

## Build order

1. `forfeitAtOne` first, small, low-risk, isolated. Sim for stalls.
2. `comboPin` engine primitives + `legalCombos` + bust scoring. Headless sim.
3. Bot policy: honest combos + `mathError`-driven real busts.
4. App UX (combo affordance, bust toast, settings toggles).
5. Docs.
