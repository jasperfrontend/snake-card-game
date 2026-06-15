<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { type Beat, useSnakeGame } from './composables/useSnakeGame';
import { hasSeenRules, markRulesSeen } from './persistence';
import CardFace from './components/CardFace.vue';
import SnakeRow from './components/SnakeRow.vue';
import RulesModal from './components/RulesModal.vue';
import SettingsModal from './components/SettingsModal.vue';
import TacticsModal from './components/TacticsModal.vue';

const game = useSnakeGame({ players: 3, interactiveStranded: true, maxPerPlayer: 23 });
const selectedAce = ref<number | null>(null);
const showRules = ref(false);
const showSettings = ref(false);
const showTactics = ref(false);

onMounted(() => {
  if (game.loadSaved()) game.resume();
  else game.newGame();
  // first-time visitors get the rules shoved at them; we remember after that
  if (!hasSeenRules()) showRules.value = true;
});

function closeRules() {
  showRules.value = false;
  markRulesSeen();
}

function start() {
  selectedAce.value = null;
  game.newGame();
}

function settingsNewGame() {
  showSettings.value = false;
  start();
}

const humanSeat = game.humanSeat;

function clickCard(i: number) {
  if (!game.awaitingHuman.value || !game.legalIndices.value.has(i)) return;
  const card = game.humanHand.value[i];
  if (card.kind === 'A') {
    selectedAce.value = selectedAce.value === i ? null : i;
    return;
  }
  selectedAce.value = null;
  game.play({ cardIndex: i });
}

function playAce(value: number) {
  if (selectedAce.value === null) return;
  const i = selectedAce.value;
  selectedAce.value = null;
  game.play({ cardIndex: i, aceValue: value });
}

async function next() {
  selectedAce.value = null;
  await game.nextRound();
}

// --- the beat: flash a real moment on the table -----------------------------
const BIG = new Set(['pin', 'bite']);
const activeBeat = ref<Beat | null>(null);
const beatText: Record<string, string> = {
  pin: 'PIN',
  bite: 'BITE',
  shed: 'shed',
  coil: 'coil',
  slip: 'slip',
  scramble: 'scramble',
  forfeit: 'new hand',
};
let beatTimer: ReturnType<typeof setTimeout> | undefined;
watch(
  () => game.beat.value?.id,
  () => {
    const b = game.beat.value;
    if (!b) return;
    activeBeat.value = b;
    clearTimeout(beatTimer);
    beatTimer = setTimeout(() => (activeBeat.value = null), BIG.has(b.type) ? 1500 : 950);
  },
);
const beatIsBig = computed(() => !!activeBeat.value && BIG.has(activeBeat.value.type));
const games = computed(() => game.record.value.wins + game.record.value.losses);

// final standings, best (lowest score) first, for the game-over banner
const standings = computed(() =>
  game.scores.value
    .map((s, i) => ({ i, s }))
    .sort((a, b) => a.s - b.s)
    .map(({ i, s }) => `${game.playerName(i)} ${s}`)
    .join('  ·  '),
);

// who's playing right now, a loud, central indicator
const turnInfo = computed(() => {
  if (game.gameOver.value || game.roundResult.value) return null;
  const cur = game.current.value;
  const you = cur === humanSeat;
  return {
    you,
    seat: cur,
    text: you
      ? game.awaitingHuman.value
        ? 'Your turn: play a card'
        : 'Your turn'
      : `${game.playerName(cur)} is playing…`,
  };
});
</script>

<template>
  <div class="wrap" :class="{ 'shake-on': activeBeat?.type === 'bite' }">
    <!-- beat overlays -->
    <Transition name="pop">
      <div v-if="activeBeat && beatIsBig" class="beat-big" :class="activeBeat.type" role="status" aria-live="polite">
        <span class="word">{{ beatText[activeBeat.type] }}</span>
        <span class="sub">
          {{
            activeBeat.type === 'pin'
              ? `${game.playerName(activeBeat.by)} threaded it`
              : `${game.playerName(activeBeat.by)} got cornered`
          }}
        </span>
      </div>
    </Transition>
    <Transition name="toast">
      <div v-if="activeBeat && !beatIsBig" class="beat-small" :class="activeBeat.type" role="status">
        {{ game.playerName(activeBeat.by) }} · {{ beatText[activeBeat.type] }}
      </div>
    </Transition>

    <header class="bar">
      <div class="brand">
        <svg class="crest" viewBox="0 0 40 20" fill="none" aria-hidden="true">
          <path d="M2 10 C8 2 12 18 20 10 C28 2 32 18 38 10" stroke="#A87B2B" stroke-width="2" stroke-linecap="round" />
          <circle cx="37" cy="10" r="1.6" fill="#A87B2B" />
        </svg>
        <h1>SNAKE</h1>
      </div>
      <div class="controls">
        <span class="record" :title="`${games} ${games === 1 ? 'game' : 'games'} played`">
          <b>{{ game.record.value.wins }}</b
          >W · <b>{{ game.record.value.losses }}</b
          >L
        </span>
        <button class="ghost" @click="showSettings = true">Settings</button>
        <button class="ghost" @click="showRules = true">Rules</button>
        <button class="ghost" @click="showTactics = true">Tactics</button>
        <button class="primary" @click="start">New game</button>
      </div>
    </header>

    <Transition name="fade">
      <RulesModal
        v-if="showRules"
        :max-length="game.maxLength.value"
        :players="game.state.value.players.length"
        @close="closeRules"
      />
    </Transition>

    <Transition name="fade">
      <SettingsModal
        v-if="showSettings"
        :difficulty="game.difficulty.value"
        :speed="game.speed.value"
        :hand-size="game.handSize.value"
        :tooltips="game.tooltips.value"
        :forfeit-at-one="game.forfeitAtOne.value"
        @update:difficulty="game.setDifficulty($event)"
        @update:speed="game.setSpeed($event)"
        @update:handSize="game.setHandSize($event)"
        @update:tooltips="game.setTooltips($event)"
        @update:forfeit-at-one="game.setForfeitAtOne($event)"
        @new-game="settingsNewGame"
        @close="showSettings = false"
      />
    </Transition>

    <Transition name="fade">
      <TacticsModal v-if="showTactics" @close="showTactics = false" />
    </Transition>

    <Transition name="turn">
      <div v-if="turnInfo" class="turnbar" :class="{ you: turnInfo.you }" aria-live="polite">
        <span class="pip"></span>
        <span class="txt">{{ turnInfo.text }}</span>
      </div>
    </Transition>

    <SnakeRow
      :segments="game.snake.value"
      :length="game.length.value"
      :max-length="game.maxLength.value"
      :direction="game.direction.value"
    />

    <section class="seats">
      <div
        v-for="(p, i) in game.state.value.players"
        :key="i"
        class="seat"
        :class="{
          active: game.current.value === i && !game.gameOver.value && !game.roundResult.value,
          you: i === humanSeat,
        }"
      >
        <span v-if="game.current.value === i && !game.gameOver.value && !game.roundResult.value" class="now">
          ▶ now
        </span>
        <div class="seat-head">
          <strong>{{ game.playerName(i) }}</strong>
          <span class="score">{{ p.score }}</span>
        </div>
        <div class="seat-sub">
          <span>{{ p.hand.length }} {{ p.hand.length === 1 ? 'card' : 'cards' }}</span>
          <span v-if="game.thinkingSeat.value === i" class="think">thinking<span class="dots">…</span></span>
          <span v-else-if="game.current.value === i && !game.gameOver.value" class="turn">to play</span>
        </div>
        <div v-if="i !== humanSeat" class="backs">
          <CardFace v-for="k in p.hand.length" :key="k" face-down />
        </div>
      </div>
    </section>

    <div
      class="flow"
      :class="{ rev: game.direction.value === -1 }"
      role="img"
      :aria-label="
        game.direction.value === 1 ? 'play order runs left to right' : 'play order is reversed, right to left'
      "
    >
      <span class="shaft"></span>
      <span class="head"></span>
      <span class="tag">play order</span>
    </div>

    <Transition name="pop">
      <section v-if="game.strandedNote.value" class="stranded">
        <p class="eyebrow">Stuck with a trick</p>
        <p class="s-note">{{ game.strandedNote.value }}</p>
      </section>
    </Transition>

    <section class="hand-wrap">
      <p class="eyebrow">Your hand</p>
      <div class="hand">
        <button
          v-for="(c, i) in game.humanHand.value"
          :key="i"
          class="hand-card"
          :class="{
            legal: game.awaitingHuman.value && game.legalIndices.value.has(i),
            picking: selectedAce === i,
            'just-drawn': c === game.strandedDrawn.value,
          }"
          :disabled="!game.awaitingHuman.value || !game.legalIndices.value.has(i)"
          @click="clickCard(i)"
        >
          <span v-if="c === game.strandedDrawn.value" class="drawn-tag">drawn</span>
          <CardFace
            :card="c"
            :dimmed="!game.awaitingHuman.value || !game.legalIndices.value.has(i)"
            :tips="game.tooltips.value"
          />
        </button>

        <button
          v-if="game.canForfeit.value"
          class="forfeit"
          title="Bin this whole hand and draw a fresh one. This spends your turn"
          @click="game.forfeitHand()"
        >
          <span class="ff-icon">⟳</span>
          <span class="ff-text">Forfeit</span>
          <span class="ff-sub">{{ game.handSize.value }} new</span>
        </button>
      </div>

      <div v-if="selectedAce !== null" class="ace-picker">
        <span>Strike as…</span>
        <button v-for="v in game.aceValues.value" :key="v" @click="playAce(v)">
          {{ v === 0 ? 'feint · 0' : v }}
        </button>
      </div>

      <p
        v-else-if="
          !game.awaitingHuman.value && !game.gameOver.value && !game.roundResult.value && !game.strandedNote.value
        "
        class="waiting"
      >
        <span v-if="game.thinkingSeat.value !== null">{{ game.playerName(game.thinkingSeat.value) }} is thinking…</span>
        <span v-else>Watching the table…</span>
      </p>
      <p
        v-else-if="game.awaitingHuman.value && selectedAce === null && !game.strandedNote.value"
        class="waiting your-turn"
      >
        Your turn. Play a glowing card.
      </p>
    </section>

    <section
      v-if="game.roundResult.value && !game.gameOver.value"
      class="banner"
      :class="game.roundResult.value.ending"
    >
      <strong v-if="game.roundResult.value.ending === 'pin'">
        {{ game.playerName(game.roundResult.value.who) }} pinned the snake. Everyone else +5.
      </strong>
      <strong v-else>{{ game.playerName(game.roundResult.value.who) }} was bitten. +10.</strong>
      <button class="primary" @click="next">Next round</button>
    </section>

    <section v-if="game.gameOver.value" class="banner over">
      <div class="over-msg">
        <strong v-if="game.loser.value === humanSeat"
          >The snake got you! You lose. Highest score takes the bite.</strong
        >
        <strong v-else>{{ game.playerName(game.loser.value ?? 0) }} hit 100 first: you survive. You win!</strong>
        <span class="over-sub">Lowest score wins · {{ standings }}</span>
      </div>
      <button class="primary" @click="start">Play again</button>
    </section>

    <section class="tally" aria-label="Pins and bites this game">
      <p class="eyebrow">Pins &amp; bites this game</p>
      <p class="tally-note">
        Lowest score wins. A pin loads <b>+5</b> on everyone else; a bite costs <b>you +10</b>: one bite hurts like two
        enemy pins.
      </p>
      <div class="tally-grid">
        <div
          v-for="(pins, i) in game.pinCounts.value"
          :key="i"
          class="tally-cell"
          :class="{ you: i === humanSeat, lead: pins === Math.max(...game.pinCounts.value) && pins > 0 }"
        >
          <span class="t-name">{{ game.playerName(i) }}</span>
          <span class="t-pins">{{ pins }}</span>
          <span class="t-sub"
            >pin{{ pins === 1 ? '' : 's'
            }}<template v-if="game.biteCounts.value[i]"> · {{ game.biteCounts.value[i] }} bit</template></span
          >
        </div>
      </div>
    </section>

    <details class="log">
      <summary>Table talk</summary>
      <ul>
        <li v-for="(line, i) in game.log.value.slice(-16).reverse()" :key="i">{{ line }}</li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 22px 18px 64px;
}

.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px 14px;
  flex-wrap: wrap;
}

.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 0 0 auto;
}

.crest {
  width: 34px;
  height: 18px;
}

.bar h1 {
  font-family: var(--display), serif;
  font-weight: 900;
  letter-spacing: 0.12em;
  padding-left: 0.12em;
  margin: 0;
  font-size: 32px;
  background: linear-gradient(95deg, var(--gold), var(--gold-bright) 50%, var(--gold));
  /* stylelint-disable-next-line property-no-vendor-prefix -- Safari needs the prefix for text clipping */
  -webkit-background-clip: text;
  background-clip: text;
  -webkit-text-fill-color: transparent;
  color: var(--gold);
}

.controls {
  display: flex;
  gap: 8px 10px;
  align-items: center;
  flex-wrap: wrap;
  justify-content: flex-end;
  font-family: var(--mono), monospace;
  font-size: 12px;
}

.record {
  color: var(--ink-soft);
  white-space: nowrap;
}

.record b {
  color: var(--ink);
}

.diff {
  display: flex;
  gap: 5px;
  align-items: center;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
  white-space: nowrap;
}

button,
select {
  font-family: var(--mono), monospace;
  font-size: 12px;
  padding: 5px 8px;
  border: 1px solid var(--gold);
  border-radius: 6px;
  background: var(--bone);
  color: var(--ink);
  cursor: pointer;
}

button:hover:not(:disabled),
select:hover {
  border-color: var(--gold-bright);
}

button:disabled {
  opacity: 0.38;
  cursor: default;
}

button.primary {
  background: var(--gold);
  color: var(--bone);
  border-color: var(--gold);
  font-weight: 700;
}

button.ghost {
  background: transparent;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

/* ---- whose turn: a loud, central indicator ---- */
.turnbar {
  margin: 18px auto 0;
  max-width: max-content;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 18px;
  border-radius: 999px;
  font-family: var(--mono), monospace;
  font-size: 14px;
  letter-spacing: 0.04em;
  background: var(--cardback);
  color: var(--bone);
  border: 1px solid rgb(215 180 92 / 35%);
  box-shadow: 0 10px 24px -16px rgb(0 0 0 / 60%);
}

.turnbar.you {
  background: var(--gold);
  color: var(--cardback);
  border-color: var(--gold-bright);
  font-weight: 700;
}

.turnbar .pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--gold-bright);
  box-shadow: 0 0 0 0 rgb(215 180 92 / 70%);
  animation: pip 1.4s ease-out infinite;
}

.turnbar.you .pip {
  background: var(--cardback);
  box-shadow: 0 0 0 0 rgb(27 42 34 / 60%);
  animation-name: pip-dark;
}

@keyframes pip {
  0% {
    box-shadow: 0 0 0 0 rgb(215 180 92 / 70%);
  }

  100% {
    box-shadow: 0 0 0 9px rgb(215 180 92 / 0%);
  }
}

@keyframes pip-dark {
  0% {
    box-shadow: 0 0 0 0 rgb(27 42 34 / 60%);
  }

  100% {
    box-shadow: 0 0 0 9px rgb(27 42 34 / 0%);
  }
}

.turn-enter-active,
.turn-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.turn-enter-from,
.turn-leave-to {
  opacity: 0;
  transform: translateY(-6px);
}

.seats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
  gap: 12px;
  margin-top: 22px;
}

.seat {
  position: relative;
  border: 1.5px solid var(--gold);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bone);
  transition:
    box-shadow 0.2s ease,
    transform 0.2s ease,
    background 0.2s ease;
}

.seats .seat.active {
  border-color: var(--gold-bright);
  border-width: 2px;
  background: linear-gradient(160deg, #fbf3df, #f4e8c8);
  transform: translateY(-4px) scale(1.025);
  box-shadow:
    0 0 0 3px rgb(215 180 92 / 45%),
    0 14px 28px -14px rgb(168 123 43 / 70%);
  animation: seatpulse 1.6s ease-in-out infinite;
}

@keyframes seatpulse {
  0%,
  100% {
    box-shadow:
      0 0 0 3px rgb(215 180 92 / 35%),
      0 14px 28px -16px rgb(168 123 43 / 60%);
  }

  50% {
    box-shadow:
      0 0 0 6px rgb(215 180 92 / 60%),
      0 16px 30px -14px rgb(168 123 43 / 75%);
  }
}

.seat .now {
  position: absolute;
  top: -11px;
  left: 12px;
  font-family: var(--mono), monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--cardback);
  background: var(--gold-bright);
  border-radius: 999px;
  padding: 2px 9px;
  box-shadow: 0 4px 10px -4px rgb(168 123 43 / 70%);
}

.seat.you {
  background: linear-gradient(160deg, var(--bone), #efead7);
}

.seat-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}

.seat-head .score {
  font-family: var(--mono), monospace;
  font-weight: 700;
  color: var(--red);
}

.seat-sub {
  font-family: var(--mono), monospace;
  font-size: 11px;
  color: var(--ink-soft);
  display: flex;
  gap: 8px;
  margin-top: 2px;
}

.think {
  color: var(--gold);
}

.dots {
  animation: blink 1.1s steps(3) infinite;
}

@keyframes blink {
  0% {
    opacity: 0.2;
  }

  50% {
    opacity: 1;
  }
}

.turn {
  color: var(--ink);
}

.backs {
  display: flex;
  gap: 3px;
  margin-top: 8px;
  transform: scale(0.66);
  transform-origin: left;
  height: 44px;
}

/* ---- direction-of-play arrow (flips on a King/Coil) ---- */
.flow {
  position: relative;
  display: flex;
  align-items: center;
  height: 18px;
  margin: 16px 0 2px;
}

.flow .shaft {
  flex: 1;
  height: 3px;
  border-radius: 2px;
  background: linear-gradient(90deg, rgb(168 123 43 / 12%), var(--gold) 75%);
  position: relative;
  overflow: hidden;
}

.flow .shaft::after {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(90deg, var(--gold-bright) 0 7px, transparent 7px 18px);
  opacity: 0.45;
  animation: flow 0.9s linear infinite;
}

.flow .head {
  width: 0;
  height: 0;
  border-top: 8px solid transparent;
  border-bottom: 8px solid transparent;
  border-left: 14px solid var(--gold);
  margin-left: -1px;
}

.flow .tag {
  position: absolute;
  left: 50%;
  top: 50%;
  transform: translate(-50%, -50%);
  background: var(--bone);
  padding: 0 10px;
  font-family: var(--mono), monospace;
  font-size: 10px;
  letter-spacing: 0.22em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.flow.rev {
  flex-direction: row-reverse;
}

.flow.rev .shaft {
  background: linear-gradient(270deg, rgb(168 123 43 / 12%), var(--gold) 75%);
}

.flow.rev .shaft::after {
  animation-direction: reverse;
}

.flow.rev .head {
  transform: rotate(180deg);
}

@keyframes flow {
  to {
    background-position: 18px 0;
  }
}

.hand-wrap {
  margin-top: 28px;
}

.eyebrow {
  font-family: var(--mono), monospace;
  text-transform: uppercase;
  letter-spacing: 0.22em;
  font-size: 11px;
  color: var(--gold);
  margin: 0 0 8px;
}

.hand {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
  align-items: center;
}

.forfeit {
  margin-left: 6px;
  height: 70px;
  min-width: 70px;
  padding: 6px 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1px;
  border: 1.5px dashed var(--gold);
  border-radius: 9px;
  background: transparent;
  color: var(--gold);
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.12s ease;
}

.forfeit:hover {
  background: rgb(168 123 43 / 8%);
  transform: translateY(-3px);
}

.forfeit .ff-icon {
  font-size: 20px;
  line-height: 1;
}

.forfeit .ff-text {
  font-family: var(--mono), monospace;
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.forfeit .ff-sub {
  font-family: var(--mono), monospace;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--ink-soft);
}

.hand-card {
  position: relative;
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 9px;
  background: none;
  transition:
    transform 0.15s ease,
    border-color 0.15s ease;
}

/* dimming a disabled card is done on the card face (CardFace), not the button,
   so the tooltip stays fully opaque */
.hand-card:disabled {
  opacity: 1;
}

.hand-card.legal {
  border-color: var(--gold);
}

.hand-card.legal:hover {
  transform: translateY(-5px);
}

.hand-card.picking {
  border-color: var(--gold-bright);
  box-shadow: 0 0 0 2px var(--gold-bright);
  transform: translateY(-5px);
}

.ace-picker {
  margin-top: 14px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  font-family: var(--mono), monospace;
  font-size: 12px;
}

/* ---- stranded trick: a clear, paced moment, then the normal hand ---- */
.stranded {
  margin-top: 24px;
  padding: 14px 18px 16px;
  border: 1.5px solid var(--gold-bright);
  border-radius: 12px;
  background: linear-gradient(160deg, #fbf3df, #f3e7c9);
  text-align: center;
  box-shadow: 0 14px 30px -18px rgb(168 123 43 / 70%);
}

.stranded .s-note {
  font-family: var(--body), serif;
  font-size: 17px;
  color: var(--ink);
  margin: 2px 0 0;
}

/* the freshly drawn card, highlighted in your hand */
.hand-card.just-drawn {
  animation: dealin 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.drawn-tag {
  position: absolute;
  top: -8px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 2;
  font-family: var(--mono), monospace;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--cardback);
  background: var(--gold-bright);
  border-radius: 999px;
  padding: 1px 6px;
  box-shadow: 0 3px 8px -3px rgb(168 123 43 / 70%);
}

@keyframes dealin {
  from {
    opacity: 0;
    transform: translateY(-14px) rotate(-4deg) scale(0.85);
  }
}

.waiting {
  font-family: var(--mono), monospace;
  font-size: 12px;
  color: var(--ink-soft);
  margin-top: 14px;
}

.your-turn {
  color: var(--gold);
}

.banner {
  margin-top: 22px;
  padding: 16px 18px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  border: 1px solid var(--gold);
  font-family: var(--body), serif;
  font-size: 17px;
}

.banner.pin {
  background: #eef0e6;
}

.banner.bite {
  background: #f3e7d6;
}

.banner.over {
  background: linear-gradient(155deg, var(--cardback-2), var(--cardback));
  color: var(--bone);
  border-color: rgb(215 180 92 / 40%);
}

.over-msg {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.over-sub {
  font-family: var(--mono), monospace;
  font-size: 12px;
  letter-spacing: 0.04em;
  color: var(--gold-bright);
}

.banner.over .primary {
  background: var(--gold-bright);
  border-color: var(--gold-bright);
  color: var(--cardback);
}

.tally {
  margin-top: 28px;
}

.tally-note {
  font-size: 13px;
  color: var(--ink-soft);
  margin: -2px 0 12px;
}

.tally-note b {
  color: var(--ink);
  font-weight: 600;
}

.tally-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 10px;
}

.tally-cell {
  border: 1px solid rgb(168 123 43 / 40%);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bone);
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
}

.tally-cell.you {
  background: linear-gradient(160deg, var(--bone), #efead7);
  border-color: var(--gold);
}

.tally-cell.lead {
  box-shadow: inset 0 0 0 1.5px var(--gold-bright);
}

.tally-cell .t-name {
  font-family: var(--mono), monospace;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}

.tally-cell .t-pins {
  font-family: var(--display), serif;
  font-weight: 900;
  font-size: 34px;
  line-height: 1.05;
  color: var(--gold);
}

.tally-cell .t-sub {
  font-family: var(--mono), monospace;
  font-size: 10px;
  letter-spacing: 0.06em;
  color: var(--ink-soft);
}

.log {
  margin-top: 30px;
}

.log summary {
  font-family: var(--mono), monospace;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 11px;
  color: var(--gold);
  cursor: pointer;
}

.log ul {
  list-style: none;
  padding: 0;
  margin: 10px 0 0;
  font-family: var(--mono), monospace;
  font-size: 12px;
  color: var(--ink-soft);
}

.log li {
  padding: 3px 0;
  border-bottom: 1px dashed rgb(168 123 43 / 18%);
}

/* ---- beats ---- */
.beat-big {
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  z-index: 50;
  pointer-events: none;
  text-align: center;
}

.beat-big .word {
  font-family: var(--display), serif;
  font-weight: 900;
  font-size: clamp(64px, 18vw, 150px);
  letter-spacing: 0.06em;
  line-height: 1;
}

.beat-big .sub {
  font-family: var(--mono), monospace;
  text-transform: uppercase;
  letter-spacing: 0.24em;
  font-size: 12px;
}

.beat-big.pin .word {
  color: var(--gold);
  text-shadow: 0 6px 30px rgb(168 123 43 / 45%);
}

.beat-big.pin .sub {
  color: var(--gold);
}

.beat-big.bite .word {
  color: var(--red);
  text-shadow: 0 6px 30px rgb(122 31 31 / 40%);
}

.beat-big.bite .sub {
  color: var(--red);
}

.beat-small {
  position: fixed;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  pointer-events: none;
  font-family: var(--mono), monospace;
  font-size: 12px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  padding: 7px 14px;
  border-radius: 999px;
  background: var(--cardback);
  color: var(--gold-bright);
  border: 1px solid rgb(215 180 92 / 40%);
  box-shadow: 0 8px 20px -10px rgb(0 0 0 / 60%);
}

.pop-enter-active {
  animation: pop 0.35s cubic-bezier(0.22, 1, 0.36, 1);
}

.pop-leave-active {
  animation: pop 0.3s reverse;
}

@keyframes pop {
  from {
    opacity: 0;
    transform: scale(0.6);
  }

  to {
    opacity: 1;
    transform: scale(1);
  }
}

.toast-enter-active,
.toast-leave-active {
  transition:
    opacity 0.25s ease,
    transform 0.25s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translate(-50%, -10px);
}

.shake-on {
  animation: shake 0.4s ease;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }

  20% {
    transform: translateX(-7px);
  }

  40% {
    transform: translateX(7px);
  }

  60% {
    transform: translateX(-4px);
  }

  80% {
    transform: translateX(4px);
  }
}

@media (width <= 620px) {
  .bar {
    flex-direction: column;
    align-items: stretch;
  }

  .controls {
    width: 100%;
    justify-content: space-between;
  }

  .bar h1 {
    font-size: 28px;
  }
}
</style>
