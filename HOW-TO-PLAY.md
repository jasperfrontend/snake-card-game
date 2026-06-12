# Snake — How to Play & How to Win

A push-your-luck card game. A snake grows down the middle of the table; everyone
feeds it, and nobody wants to be the one who **overfeeds** it. Feed it too far and
it **bites**. Get bitten too often and the snake takes you out.

> ▶ Play it: **[avoidthebite.com](https://avoidthebite.com/)** — you against two bots.

---

## The goal

Every card you play feeds the snake and makes it a little longer. The snake has a
maximum length. Push it past that and it bites whoever was holding the card. A bite
costs you points — and in this game **points are bad**. They are snakebite.

**The first player to reach 100 points loses. Everyone still standing wins.**

So the whole game is one long round of not-it.

---

## What you need

- A standard 54-card deck (52 + both jokers).
- 3 to 6 players. (The digital version is you + two bots.)
- A way to keep score.

Pick a dealer for the first round; the deal passes one seat to the left after every
round. Play goes to the left until something changes the direction.

---

## The cards

Number cards feed the snake. Face cards, aces and jokers bend the rules.

### Food (2–10)

Worth its face value. Play one and the snake grows by exactly that much. A 10 is the
biggest single bite you can take out of the room at the top — and you can't aim it.

### Tricks

Tricks carry **no food value**. Each does a job instead.

| Card | Name | What it does |
|------|----------|--------------|
| **K** | Coil | Reverses the direction of play. |
| **J** | Slip | Skips the next player. |
| **Q** | Shed | Halves the snake's length, rounded down. |
| **A** | Strike | Wild — counts as any value **0–9**. Played as **0** it's a *feint* (nothing changes). |
| **★** | Scramble (Joker) | The next player bins their whole hand and draws a fresh one. Bliss or disaster. |

---

## A turn

You start with a full hand (4 cards in the classic game; the app lets you choose 4 or
5). On your turn you play **exactly one card**, feeding the snake or pulling a trick.

Two rules constrain you:

1. **No overshoot.** You cannot play a card that would push the snake **over** its max.
2. **No trick last.** You cannot play a trick (K, Q, J, A or Joker) as the **last card**
   in your hand — always keep a number for the bottom.

You don't draw after every card. You play your hand all the way down, and only when
it's empty do you draw a fresh full hand. So everyone can watch your options shrink
from a full hand to one card — which tells them when you're about to be in trouble.

### Stranded on a trick

If a trick is somehow the only card you have left, you can't play it. **Draw one card**
— now you're holding two, so the trick is no longer your last card. You may then play
**either** card: the trick (to leave the drawn card for next time) or the drawn card.
A lucky pull there can even win you the round on the spot.

### Forfeit (the chosen Joker)

Dealt a rotten hand? You may **forfeit** it — bin the whole thing and draw a fresh
full hand. But it **costs your turn** (you don't feed the snake), and it's random, so
it might save you or sink you. You can only forfeit a full, freshly-dealt hand, once
per hand — it's a mulligan for a bad deal, not an escape from a bite.

---

## Ending a round

A round always ends one of two ways.

### The Pin — *you win the round*

You land the snake on its maximum **exactly**. You've pinned it. **You score 0, and
everyone else takes 5.** This is what the wild Ace is for.

### The Bite — *you lose the round*

It's your turn and you're cornered: every card you could play would shove the snake
over the top, and you have no trick to wriggle out. The snake bites you. **Take 10
points.**

---

## The maximum length

Count the players and multiply. That's how long the snake can get before it bites.

- The **tabletop rulebook** uses **15 × players** (45 at a 3-handed table).
- The **app** uses a roomier **23 × players** — **69** at a 3-handed table — for more
  breathing room and choices.

To start a round, flip the top card and use its number as the snake's starting length.
If you flip a trick, set it aside and flip again until you get a number.

---

## Scoring & winning

Your score only ever moves two ways:

- **You get bitten:** **+10** to you.
- **Someone *else* pins:** **+5** to you (everyone except the pinner).

When *you* pin, you take **0** and dump +5 on everyone else. So, written out:

```
your score  =  10 × (your bites)  +  5 × (pins by other players)
```

**First to 100 loses; everyone else wins.** That formula is the whole game — and it's
why the strategy below works.

---

## How to win

The bots play a tight defensive game and pin most rounds. Here's how to beat them.

1. **It's a pin race, not a survival game.** A pin drops +5 on everyone else and 0 on
   you — whoever pins *least* loses. Actively hunt pins; don't just dodge bites.

2. **A bite costs double.** The +10 from a bite is worth two enemy pins. Always keep an
   out for the danger zone — a trick or a small card — so you're never cornered.

3. **Dump big food early.** 9s and 10s are liabilities near the top; you won't be able
   to play them without overshooting. Offload them while the snake is low and there's
   room.

4. **Hoard the low cards.** 2s, 3s and 4s are gold near the max — they nudge the snake
   safely and let you land on the exact number for a pin.

5. **The Ace is your pin.** It's wild 0–9, so it pins from **up to 9 away** — your single
   best win tool. Played as 0 it's a feint: survive a turn without feeding. Save it for
   the kill.

6. **The Queen is a panic button.** Shed halves the snake — wasted at length 12, a
   lifesaver at 60. Hold it for when things get dangerously high, and to tee up your own
   pin afterwards.

7. **King & Jack pass the danger.** About to inherit a sky-high snake? Reverse the table
   with a King or skip with a Jack to shove the hot potato onto someone else.

8. **Joker & Forfeit are gambles.** A Joker forces the next player to bin their hand and
   redraw — brutal on someone hoarding Queens, but random, so *aim* it. Forfeit is the
   same bet on yourself: swap a dead hand, but it costs your turn.

**The one-line version:** out-pin them without feeding yourself into a bite. A bite is
twice as expensive as letting an opponent pin, so when you can't pin, bail safe (feint,
shed, dump a small card) rather than shoving the snake high and gambling on your next
draw.

---

## Settings (digital version)

- **Bots** — Easy (forgiving) / Medium (balanced) / Hard (brutal). Takes effect next game.
- **Speed** — Slow / Normal / Fast bot pacing. Live.
- **Hand** — 4 cards (tight) or 5 cards (casual). Five cards is far more forgiving —
   roughly half the bites. Takes effect next game.
- **Tooltips** — hover any card for a reminder of what it does. Live.

Your settings, win–loss record, and an in-progress game all save automatically and
survive a refresh.

---

*Feed it well.*
