<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { useSnakeGame } from './composables/useSnakeGame';
import CardFace from './components/CardFace.vue';
import type { Difficulty } from '../engine/types';

const game = useSnakeGame({ players: 3, difficulty: 'medium' });
const difficulty = ref<Difficulty>('medium');
const selectedAce = ref<number | null>(null); // hand index of an Ace awaiting its value

onMounted(() => game.newGame(difficulty.value));

function start() {
  selectedAce.value = null;
  game.newGame(difficulty.value);
}

const humanSeat = 0;
const pct = computed(() => Math.min(100, (game.length.value / game.maxLength.value) * 100));

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
</script>

<template>
  <div class="wrap">
    <header class="bar">
      <h1>SNAKE</h1>
      <div class="controls">
        <label>
          Bots
          <select v-model="difficulty">
            <option value="easy">easy</option>
            <option value="medium">medium</option>
            <option value="hard">hard</option>
          </select>
        </label>
        <button @click="start">New game</button>
      </div>
    </header>

    <!-- snake length readout -->
    <section class="snake">
      <div class="readout">
        <span class="len">{{ game.length.value }}</span>
        <span class="max">/ {{ game.maxLength.value }}</span>
        <span class="dir">{{ game.direction.value === 1 ? '↻' : '↺' }}</span>
      </div>
      <div class="track">
        <div class="fill" :style="{ width: pct + '%' }"></div>
        <div class="goal"></div>
      </div>
      <p class="hint">Land exactly on {{ game.maxLength.value }} to pin. Overshoot and you are bitten.</p>
    </section>

    <!-- seats -->
    <section class="seats">
      <div
        v-for="(p, i) in game.state.value.players"
        :key="i"
        class="seat"
        :class="{ active: game.current.value === i && !game.gameOver.value, you: i === humanSeat }"
      >
        <div class="seat-head">
          <strong>{{ game.playerName(i) }}</strong>
          <span class="score">{{ p.score }}</span>
        </div>
        <div class="seat-sub">
          <span>{{ p.hand.length }} cards</span>
          <span v-if="game.thinkingSeat.value === i" class="think">thinking…</span>
          <span v-else-if="game.current.value === i && !game.gameOver.value" class="turn">turn</span>
        </div>
        <div v-if="i !== humanSeat" class="backs">
          <CardFace v-for="k in p.hand.length" :key="k" face-down />
        </div>
      </div>
    </section>

    <!-- human hand -->
    <section class="hand-wrap">
      <p class="eyebrow">Your hand</p>
      <div class="hand">
        <button
          v-for="(c, i) in game.humanHand.value"
          :key="i"
          class="hand-card"
          :class="{ legal: game.awaitingHuman.value && game.legalIndices.value.has(i), picking: selectedAce === i }"
          :disabled="!game.awaitingHuman.value || !game.legalIndices.value.has(i)"
          @click="clickCard(i)"
        >
          <CardFace :card="c" />
        </button>
      </div>

      <div v-if="selectedAce !== null" class="ace-picker">
        <span>Play the Ace as…</span>
        <button v-for="v in game.aceValues.value" :key="v" @click="playAce(v)">
          {{ v === 0 ? 'feint (0)' : v }}
        </button>
      </div>

      <p v-if="!game.awaitingHuman.value && !game.gameOver.value && game.roundResult.value === undefined" class="waiting">
        Waiting for the table…
      </p>
    </section>

    <!-- round / game end -->
    <section
      v-if="game.roundResult.value && !game.gameOver.value"
      class="banner"
      :class="game.roundResult.value.ending"
    >
      <strong v-if="game.roundResult.value.ending === 'pin'">
        {{ game.playerName(game.roundResult.value.who) }} pinned the snake. Everyone else +5.
      </strong>
      <strong v-else> {{ game.playerName(game.roundResult.value.who) }} was bitten. +10. </strong>
      <button @click="next">Next round</button>
    </section>

    <section v-if="game.gameOver.value" class="banner over">
      <strong v-if="game.loser.value === humanSeat">The snake got you. You lose this game.</strong>
      <strong v-else>{{ game.playerName(game.loser.value ?? 0) }} hit 100 first — you survive. You win!</strong>
      <button @click="start">Play again</button>
    </section>

    <!-- log -->
    <section class="log">
      <p class="eyebrow">Table talk</p>
      <ul>
        <li v-for="(line, i) in game.log.value.slice(-12).reverse()" :key="i">{{ line }}</li>
      </ul>
    </section>
  </div>
</template>

<style scoped>
.wrap {
  max-width: 760px;
  margin: 0 auto;
  padding: 20px 18px 60px;
}
.bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.bar h1 {
  font-family: var(--display, Georgia, serif);
  letter-spacing: 0.14em;
  color: var(--gold, #a87b2b);
  margin: 0;
  font-size: 34px;
}
.controls {
  display: flex;
  gap: 10px;
  align-items: center;
  font-family: var(--mono, monospace);
  font-size: 12px;
}
button,
select {
  font-family: var(--mono, monospace);
  font-size: 13px;
  padding: 6px 10px;
  border: 1px solid var(--gold, #a87b2b);
  border-radius: 6px;
  background: var(--bone, #f4eee1);
  color: var(--ink, #211c16);
  cursor: pointer;
}
button:disabled {
  opacity: 0.4;
  cursor: default;
}

.snake {
  margin-top: 22px;
  text-align: center;
}
.readout {
  font-family: var(--mono, monospace);
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: center;
}
.readout .len {
  font-size: 52px;
  font-weight: 700;
  color: var(--ink, #211c16);
}
.readout .max {
  font-size: 22px;
  color: var(--ink-soft, #5a4f40);
}
.readout .dir {
  font-size: 26px;
  color: var(--gold, #a87b2b);
}
.track {
  position: relative;
  height: 12px;
  background: var(--bone-2, #ebe2cf);
  border: 1px solid var(--gold, #a87b2b);
  border-radius: 7px;
  margin: 10px auto 0;
  max-width: 520px;
  overflow: hidden;
}
.fill {
  height: 100%;
  background: linear-gradient(90deg, #a87b2b, #d7b45c);
  transition: width 0.4s ease;
}
.hint {
  font-size: 13px;
  color: var(--ink-soft, #5a4f40);
  margin: 8px 0 0;
}

.seats {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
  gap: 12px;
  margin-top: 24px;
}
.seat {
  border: 1px solid var(--gold, #a87b2b);
  border-radius: 10px;
  padding: 10px 12px;
  background: var(--bone, #f4eee1);
}
.seat.active {
  box-shadow: 0 0 0 2px var(--gold-bright, #d7b45c);
}
.seat.you {
  background: linear-gradient(160deg, #f4eee1, #efead7);
}
.seat-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
}
.seat-head .score {
  font-family: var(--mono, monospace);
  font-weight: 700;
  color: #7a1f1f;
}
.seat-sub {
  font-family: var(--mono, monospace);
  font-size: 11px;
  color: var(--ink-soft, #5a4f40);
  display: flex;
  gap: 8px;
  margin-top: 2px;
}
.think {
  color: var(--gold, #a87b2b);
}
.turn {
  color: var(--ink, #211c16);
}
.backs {
  display: flex;
  gap: 3px;
  margin-top: 8px;
  transform: scale(0.7);
  transform-origin: left;
}

.hand-wrap {
  margin-top: 26px;
}
.eyebrow {
  font-family: var(--mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 11px;
  color: var(--gold, #a87b2b);
  margin: 0 0 8px;
}
.hand {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.hand-card {
  padding: 2px;
  border: 2px solid transparent;
  border-radius: 9px;
  background: none;
}
.hand-card.legal {
  border-color: var(--gold, #a87b2b);
}
.hand-card.picking {
  border-color: var(--gold-bright, #d7b45c);
  box-shadow: 0 0 0 2px var(--gold-bright, #d7b45c);
}
.ace-picker {
  margin-top: 12px;
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  align-items: center;
  font-family: var(--mono, monospace);
  font-size: 12px;
}
.waiting {
  font-family: var(--mono, monospace);
  font-size: 12px;
  color: var(--ink-soft, #5a4f40);
  margin-top: 12px;
}

.banner {
  margin-top: 20px;
  padding: 14px 16px;
  border-radius: 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  border: 1px solid var(--gold, #a87b2b);
}
.banner.pin {
  background: #eef0e6;
}
.banner.bite {
  background: #f3e7d6;
}
.banner.over {
  background: linear-gradient(155deg, #24382c, #1b2a22);
  color: #f4eee1;
  border-color: rgba(215, 180, 92, 0.4);
}

.log {
  margin-top: 26px;
}
.log ul {
  list-style: none;
  padding: 0;
  margin: 0;
  font-family: var(--mono, monospace);
  font-size: 12px;
  color: var(--ink-soft, #5a4f40);
}
.log li {
  padding: 2px 0;
  border-bottom: 1px dashed rgba(168, 123, 43, 0.18);
}
</style>
