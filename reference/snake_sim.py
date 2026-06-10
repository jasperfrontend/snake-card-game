"""
Snake - a push-your-luck card game.  Monte-Carlo simulator for the v6 ruleset.

Cards
  Food 2..10        feeds the snake its face value
  King   (Coil)     reverse direction
  Jack   (Slip)     skip next player
  Queen  (Shed)     halve the snake, floor
  Ace    (Strike)   wild 0..9, 0 = feint
  Joker  (Scramble) next player bins their whole hand and draws 4
Round ends on a BITE (cornered, no legal play) -> bitten player +10
         or a PIN  (land exactly on max)        -> pinner +0, everyone else +5
Max length = 15 * players.  First to 100 points loses; everyone else wins.

NOT modelled: the "call the length / reset to 10" social rule (it depends on
human memory failing), so real-life rounds will run a little longer than these.
"""

import random
from collections import Counter, namedtuple

Card = namedtuple("Card", ["kind", "value"])  # kind in food/K/Q/J/A/JOKER

TRICKS = ("K", "Q", "J", "A", "JOKER")


def build_deck():
    deck = []
    for v in range(2, 11):
        deck += [Card("food", v)] * 4          # 36 food cards
    for k in ("K", "Q", "J", "A"):
        deck += [Card(k, None)] * 4            # 16 face/ace
    deck += [Card("JOKER", None)] * 2          # 2 jokers
    return deck                                # 54 total


# ---------------------------------------------------------------- deck helpers
def draw_card(st):
    if not st["draw"]:
        st["draw"] = st["discard"]
        st["discard"] = []
        random.shuffle(st["draw"])
    return st["draw"].pop() if st["draw"] else None


# ---------------------------------------------------------------- legal moves
def legal_moves(hand, length, mx):
    """Return list of legal move dicts.  Tricks are illegal as the last card."""
    moves = []
    last = len(hand) == 1
    for i, c in enumerate(hand):
        if c.kind == "food":
            if length + c.value <= mx:
                moves.append({"i": i, "type": "food", "val": c.value,
                              "pin": length + c.value == mx})
        else:
            if last:
                continue                       # no trick as your last card
            if c.kind == "Q":
                moves.append({"i": i, "type": "Q", "pin": length // 2 == mx})
            elif c.kind == "A":
                room = mx - length
                moves.append({"i": i, "type": "A", "can_pin": 0 <= room <= 9,
                              "room": room})
            else:                              # K / J / JOKER (add nothing)
                moves.append({"i": i, "type": c.kind, "pin": False})
    return moves


DANGER = 9  # within this much of the top, switch from offence to survival


def choose_move(hand, length, mx):
    """Defensive heuristic. Returns (idx, ace_value) or None if no legal play."""
    moves = legal_moves(hand, length, mx)
    if not moves:
        return None

    # 1. Pin whenever possible (score 0, dump 5 on everyone else).
    for m in moves:
        if m["type"] in ("food", "Q") and m.get("pin"):
            return (m["i"], None)
    for m in moves:
        if m["type"] == "A" and m["can_pin"]:
            return (m["i"], mx - length)        # ace value lands exactly on max

    foods = [m for m in moves if m["type"] == "food"]
    room = mx - length

    if room <= DANGER:
        # Survive: shed > scramble/dodge > feint > smallest feed.
        for t in ("Q", "JOKER", "K", "J"):
            for m in moves:
                if m["type"] == t:
                    return (m["i"], None)
        for m in moves:
            if m["type"] == "A":
                return (m["i"], 0)              # feint, change nothing
        if foods:
            m = min(foods, key=lambda x: x["val"])
            return (m["i"], None)
        return None
    else:
        # Safe: offload your biggest food while there is room, hoard tricks/low cards.
        if foods:
            m = max(foods, key=lambda x: x["val"])
            return (m["i"], None)
        for t in ("JOKER", "J", "K", "Q"):      # forced to burn a trick; cheapest first
            for m in moves:
                if m["type"] == t:
                    return (m["i"], None)
        for m in moves:
            if m["type"] == "A":
                return (m["i"], 0)
        return None


# ---------------------------------------------------------------- one round
def play_round(scores, n, dealer, stats):
    mx = 15 * n
    deck = build_deck()
    random.shuffle(deck)
    hands = [[deck.pop() for _ in range(4)] for _ in range(n)]
    st = {"draw": deck, "discard": []}

    # seed starting length: flip until a food card turns up
    while True:
        c = draw_card(st)
        st["discard"].append(c)
        if c.kind == "food":
            length = c.value
            break

    direction = 1
    cur = (dealer + 1) % n
    skip = False
    plays = 0
    tcounts = Counter()
    pin_kind = None

    while True:
        plays += 1
        if plays > 4000:                        # safety valve (effectively never hit)
            stats["capped"] += 1
            scores[cur] += 10
            return ("cap", cur, plays, tcounts, None)

        hand = hands[cur]
        idx = ace_val = None

        # --- stranded trick: lone trick can't be played, draw one and try it ---
        if len(hand) == 1 and hand[0].kind != "food":
            drawn = draw_card(st)
            if drawn is None:
                scores[cur] += 10               # truly out of cards (degenerate)
                return ("bite", cur, plays, tcounts, None)
            hand.append(drawn)                  # now two cards
            if drawn.kind == "food":
                if length + drawn.value <= mx:
                    idx = 1
                    ace_val = None
                else:                            # drawn card unplayable, keep both, pass
                    cur = (cur + direction) % n
                    continue
            else:                                # drawn trick now legal (hand size 2)
                idx = 1
                ace_val = (mx - length) if (drawn.kind == "A" and 0 <= mx - length <= 9) else (0 if drawn.kind == "A" else None)
        else:
            mv = choose_move(hand, length, mx)
            if mv is None:
                scores[cur] += 10               # BITE
                return ("bite", cur, plays, tcounts, None)
            idx, ace_val = mv

        # --- execute the chosen card ---
        card = hand.pop(idx)
        st["discard"].append(card)
        if card.kind != "food":
            tcounts[card.kind] += 1

        if card.kind == "food":
            length += card.value
            feed = card.value
        elif card.kind == "A":
            length += ace_val
            feed = ace_val
        elif card.kind == "Q":
            length //= 2
            feed = 0
        elif card.kind == "K":
            direction *= -1
            feed = 0
        elif card.kind == "J":
            skip = True
            feed = 0
        elif card.kind == "JOKER":
            victim = (cur + direction) % n
            st["discard"].extend(hands[victim])
            hands[victim] = []
            for _ in range(4):
                d = draw_card(st)
                if d:
                    hands[victim].append(d)
            feed = 0

        # --- pin? ---
        if length == mx:
            for j in range(n):
                if j != cur:
                    scores[j] += 5
            pk = "ace" if card.kind == "A" else ("food" if card.kind == "food" else card.kind)
            return ("pin", cur, plays, tcounts, pk)

        # --- refill an emptied hand (only a food card can be your last play) ---
        if not hand:
            for _ in range(4):
                d = draw_card(st)
                if d:
                    hand.append(d)

        # --- advance ---
        cur = (cur + direction) % n
        if skip:
            cur = (cur + direction) % n
            skip = False


# ---------------------------------------------------------------- one game
def play_game(n, stats):
    scores = [0] * n
    dealer = random.randrange(n)
    rounds = 0
    while max(scores) < 100 and rounds < 1000:
        result, who, plays, tcounts, pin_kind = play_round(scores, n, dealer, stats)
        rounds += 1
        stats["plays_per_round"].append(plays)
        stats["round_result"][result] += 1
        for k, v in tcounts.items():
            stats["trick_total"][k] += v
        if result == "pin" and pin_kind:
            stats["pin_kind"][pin_kind] += 1
        dealer = (dealer + 1) % n
    loser = max(range(n), key=lambda i: scores[i])
    stats["rounds_per_game"].append(rounds)
    stats["loser_seat"][loser] += 1
    return scores, loser, rounds


def fresh_stats():
    return {
        "plays_per_round": [], "rounds_per_game": [],
        "round_result": Counter(), "trick_total": Counter(),
        "pin_kind": Counter(), "loser_seat": Counter(), "capped": 0,
    }


def run(n_players, n_games, seed):
    random.seed(seed)
    stats = fresh_stats()
    for _ in range(n_games):
        play_game(n_players, stats)
    return stats


def summary(tag, n, stats):
    import statistics as S
    ppr = stats["plays_per_round"]
    rpg = stats["rounds_per_game"]
    rr = stats["round_result"]
    total_rounds = sum(rr.values())
    print(f"\n===== {tag}  ({n} players) =====")
    print(f"games:                {len(rpg)}")
    print(f"rounds played:        {total_rounds}")
    print(f"rounds / game:        mean {S.mean(rpg):.1f}   median {S.median(rpg)}   "
          f"range {min(rpg)}-{max(rpg)}")
    print(f"plays / round:        mean {S.mean(ppr):.1f}   median {S.median(ppr)}   "
          f"range {min(ppr)}-{max(ppr)}   stdev {S.pstdev(ppr):.1f}")
    print(f"plays / player / rnd: {S.mean(ppr)/n:.2f}")
    bite = rr.get('bite', 0); pin = rr.get('pin', 0); cap = rr.get('cap', 0)
    print(f"round endings:        bite {bite} ({100*bite/total_rounds:.0f}%)   "
          f"pin {pin} ({100*pin/total_rounds:.0f}%)" + (f"   cap {cap}" if cap else ""))
    if stats["pin_kind"]:
        pk = stats["pin_kind"]
        tot = sum(pk.values())
        print(f"pins landed by:       " +
              "  ".join(f"{k} {100*v/tot:.0f}%" for k, v in pk.most_common()))
    tt = stats["trick_total"]
    print(f"trick uses / round:   " +
          "  ".join(f"{k} {tt[k]/total_rounds:.2f}" for k in ("Q", "K", "J", "A", "JOKER")))
    ls = stats["loser_seat"]
    print(f"loser by seat:        " +
          "  ".join(f"s{i}:{100*ls.get(i,0)/len(rpg):.0f}%" for i in range(n)))
    return ppr


if __name__ == "__main__":
    SEED = 42
    # headline run
    main = run(4, 100, SEED)
    ppr4 = summary("HEADLINE: 100 games", 4, main)

    # player-count sweep (tests the 15x scaling / per-player engagement)
    print("\n\n===== PLAYER-COUNT SWEEP (100 games each) =====")
    print(f"{'players':>8} {'max':>5} {'rounds/game':>12} {'plays/round':>12} {'plays/player':>13} {'bite%':>6} {'pin%':>6}")
    import statistics as S
    for n in (3, 4, 5, 6):
        s = run(n, 100, SEED + n)
        ppr = s["plays_per_round"]; rr = s["round_result"]; tot = sum(rr.values())
        print(f"{n:>8} {15*n:>5} {S.mean(s['rounds_per_game']):>12.1f} "
              f"{S.mean(ppr):>12.1f} {S.mean(ppr)/n:>13.2f} "
              f"{100*rr.get('bite',0)/tot:>5.0f}% {100*rr.get('pin',0)/tot:>5.0f}%")

    # chart: round-length distribution for the headline run
    try:
        import matplotlib
        matplotlib.use("Agg")
        import matplotlib.pyplot as plt
        import numpy as np
        ink, bone, gold, cardback = "#211C16", "#F4EEE1", "#A87B2B", "#1B2A22"
        fig, ax = plt.subplots(figsize=(9, 4.6), dpi=130)
        fig.patch.set_facecolor(bone); ax.set_facecolor(bone)
        arr = np.array(ppr4)
        bins = range(min(arr), max(arr) + 2)
        ax.hist(arr, bins=bins, color=gold, edgecolor=ink, linewidth=0.6)
        ax.axvline(arr.mean(), color=cardback, linestyle="--", linewidth=1.5,
                   label=f"mean {arr.mean():.1f} plays")
        ax.axvline(np.median(arr), color="#7a1f1f", linestyle=":", linewidth=1.5,
                   label=f"median {np.median(arr):.0f} plays")
        ax.set_title("Snake: round length over 100 games (4 players)",
                     color=ink, fontsize=13, fontweight="bold")
        ax.set_xlabel("cards played in the round", color=ink)
        ax.set_ylabel("number of rounds", color=ink)
        ax.tick_params(colors=ink)
        for sp in ax.spines.values():
            sp.set_color(ink)
        ax.spines["top"].set_visible(False); ax.spines["right"].set_visible(False)
        ax.legend(frameon=False, labelcolor=ink)
        fig.tight_layout()
        fig.savefig("/home/claude/round_lengths.png", facecolor=bone)
        print("\n[chart saved]")
    except Exception as e:
        print("chart skipped:", e)
