<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';

const props = defineProps<{ maxLength: number; players: number }>();
const emit = defineEmits<{ close: [] }>();
const closeBtn = ref<HTMLButtonElement | null>(null);
const perPlayer = computed(() => Math.round(props.maxLength / props.players));

const TRICKS = [
  { rank: 'K', name: 'Coil', does: 'Reverse the direction of play.' },
  { rank: 'J', name: 'Slip', does: 'Skip the next player.' },
  { rank: 'Q', name: 'Shed', does: "Halve the snake's length, rounded down." },
  { rank: 'A', name: 'Strike', does: 'Wild — count it as any value 0–9. Played as 0 it is a feint.' },
  { rank: '★', name: 'Scramble', does: 'The next player bins their whole hand and draws 4 fresh.' },
];

function onKey(e: KeyboardEvent) {
  if (e.key === 'Escape') emit('close');
}
onMounted(() => {
  document.addEventListener('keydown', onKey);
  closeBtn.value?.focus();
});
onBeforeUnmount(() => document.removeEventListener('keydown', onKey));
</script>

<template>
  <div class="backdrop" @click.self="emit('close')">
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="rules-title">
      <button ref="closeBtn" class="x" aria-label="Close rules" @click="emit('close')">×</button>

      <p class="eyebrow">How to play</p>
      <h2 id="rules-title">Don't get eaten</h2>
      <p class="lede">
        A snake grows down the middle of the table. Everyone feeds it; nobody wants to
        <b>overfeed</b> it. Every card you play makes it longer. <b>Points are bad</b> — first to
        <b>100</b> loses, everyone still standing wins.
      </p>

      <div class="block">
        <h3>Your turn</h3>
        <ul>
          <li>Play exactly <b>one</b> card per round.</li>
          <li>You cannot push the snake <b>over its max</b> ({{ perPlayer }} × players — that's <b>{{ maxLength }}</b> at this table).</li>
          <li>You cannot play a <b>trick</b> as your last card — keep a number for the bottom.</li>
          <li>Play your hand down to empty, then draw a fresh 4.</li>
          <li>Dealt a rotten hand? <b>Forfeit</b> it for a fresh one — but that spends your turn.</li>
        </ul>
      </div>

      <div class="block">
        <h3>Food &amp; tricks</h3>
        <p class="note">Numbers 2–10 feed the snake their face value. Tricks bend the rules instead.</p>
        <div class="trickgrid">
          <div v-for="t in TRICKS" :key="t.rank" class="tcard">
            <div class="rank">{{ t.rank }}</div>
            <div class="name">{{ t.name }}</div>
            <div class="does">{{ t.does }}</div>
          </div>
        </div>
      </div>

      <div class="ends">
        <div class="end good">
          <h4>The Pin <span>you win the round</span></h4>
          <p>Land the snake on its max <b>exactly</b>. You score <b>0</b>, everyone else takes <b>5</b>. This is what the wild Ace is for.</p>
        </div>
        <div class="end bad">
          <h4>The Bite <span>you lose the round</span></h4>
          <p>It's your turn and every card overshoots, with no trick to escape. The snake bites you — take <b>10</b>.</p>
        </div>
      </div>

      <button class="primary done" @click="emit('close')">Got it</button>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgba(27, 42, 34, 0.55);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: flex-start;
  justify-content: center;
  padding: 24px 16px;
  overflow-y: auto;
}
.sheet {
  position: relative;
  width: 100%;
  max-width: 640px;
  background: var(--bone);
  border: 1px solid var(--gold);
  border-radius: 14px;
  padding: 30px 30px 26px;
  box-shadow: 0 30px 70px -30px rgba(0, 0, 0, 0.7);
  background-image: radial-gradient(rgba(33, 28, 22, 0.03) 1px, transparent 1px);
  background-size: 4px 4px;
}
.x {
  position: absolute;
  top: 14px;
  right: 14px;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  border: 1px solid var(--gold);
  background: var(--bone);
  color: var(--ink);
  font-size: 20px;
  line-height: 1;
  cursor: pointer;
}
.eyebrow {
  font-family: var(--mono), monospace;
  text-transform: uppercase;
  letter-spacing: 0.3em;
  font-size: 11px;
  color: var(--gold);
  margin: 0 0 6px;
}
h2 {
  font-family: var(--display), serif;
  font-weight: 600;
  font-size: clamp(26px, 5vw, 34px);
  margin: 0 0 12px;
  color: var(--ink);
}
.lede {
  font-size: 16px;
  margin: 0 0 22px;
  color: var(--ink);
}
.lede b,
.does b,
.end b {
  color: var(--gold);
  font-weight: 600;
}
.block {
  margin-bottom: 22px;
}
h3 {
  font-family: var(--display), serif;
  font-weight: 600;
  font-size: 19px;
  margin: 0 0 8px;
  color: var(--ink);
}
ul {
  margin: 0;
  padding-left: 20px;
}
li {
  margin: 0 0 5px;
  font-size: 15px;
}
li b {
  color: var(--ink);
  font-weight: 600;
}
.note {
  font-family: var(--mono), monospace;
  font-size: 12px;
  color: var(--ink-soft);
  margin: 0 0 12px;
}
.trickgrid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 10px;
}
@media (max-width: 560px) {
  .trickgrid {
    grid-template-columns: repeat(2, 1fr);
  }
}
.tcard {
  border: 1px solid var(--gold);
  border-radius: 10px;
  background: linear-gradient(160deg, var(--bone), var(--bone-2));
  padding: 12px 10px 13px;
  text-align: center;
}
.tcard .rank {
  font-family: var(--display), serif;
  font-weight: 900;
  font-size: 28px;
  line-height: 1;
  color: var(--gold);
}
.tcard .name {
  font-family: var(--mono), monospace;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 9px;
  color: var(--ink-soft);
  margin: 6px 0 7px;
}
.tcard .does {
  font-size: 12px;
  line-height: 1.35;
  color: var(--ink);
}
.ends {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 24px;
}
@media (max-width: 560px) {
  .ends {
    grid-template-columns: 1fr;
  }
}
.end {
  border: 1px solid var(--gold);
  border-radius: 10px;
  padding: 14px 15px;
}
.end.good {
  background: linear-gradient(160deg, var(--bone), #efead7);
}
.end.bad {
  background: linear-gradient(160deg, var(--bone), #f0e6d2);
}
.end h4 {
  font-family: var(--display), serif;
  font-weight: 600;
  font-size: 18px;
  margin: 0 0 4px;
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.end h4 span {
  font-family: var(--mono), monospace;
  font-size: 10px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--gold);
}
.end p {
  font-size: 14px;
  margin: 0;
}
button.primary {
  font-family: var(--mono), monospace;
  font-size: 13px;
  padding: 9px 16px;
  border: 1px solid var(--gold);
  border-radius: 6px;
  background: var(--gold);
  color: var(--bone);
  font-weight: 700;
  cursor: pointer;
}
.done {
  display: block;
  width: 100%;
}
</style>
