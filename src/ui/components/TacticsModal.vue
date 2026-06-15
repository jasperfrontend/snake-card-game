<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';

const emit = defineEmits<{ close: [] }>();
const closeBtn = ref<HTMLButtonElement | null>(null);

const TACTICS: { h: string; p: string }[] = [
  {
    h: "It's a pin race, not a survival game",
    p: 'A pin drops +5 on everyone else and 0 on you, whoever pins least loses. Actively hunt pins; don’t just dodge bites.',
  },
  {
    h: 'A bite costs double',
    p: 'The +10 from a bite is worth two enemy pins. Always keep an out for the danger zone, a trick or a small card, so you’re never cornered.',
  },
  {
    h: 'Dump big food early',
    p: '9s and 10s are liabilities near the top; you won’t be able to play them without overshooting. Offload them while the snake is low and there’s room.',
  },
  {
    h: 'Hoard the low cards',
    p: '2s, 3s and 4s are gold near the max, they nudge the snake safely and let you land on the exact number for a pin.',
  },
  {
    h: 'The Ace is your pin',
    p: 'It’s wild 0–9, so it pins from up to 9 away, your single best win tool. Played as 0 it’s a feint: survive a turn without feeding. Save it for the kill.',
  },
  {
    h: 'The Queen is a panic button',
    p: 'Shed halves the snake, wasted at length 12, a lifesaver at 60. Hold it for when things get dangerously high, and to tee up your own pin afterwards.',
  },
  {
    h: 'King & Jack pass the danger',
    p: 'About to inherit a sky-high snake? Reverse the table with a King or skip with a Jack to shove the hot potato onto someone else.',
  },
  {
    h: 'Joker & Forfeit are gambles',
    p: 'A Joker forces the next player to bin their hand and redraw, brutal on someone hoarding Queens, but random, so aim it. Forfeit is the same bet on yourself: swap a dead hand, but it costs your turn.',
  },
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
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="tactics-title">
      <button ref="closeBtn" class="x" aria-label="Close tactics" @click="emit('close')">×</button>

      <p class="eyebrow">How to win</p>
      <h2 id="tactics-title">Out-play the snake</h2>
      <p class="lede">The bots run a tight defensive game and pin most rounds. Here’s how to beat them.</p>

      <ul class="tactics">
        <li v-for="t in TACTICS" :key="t.h">
          <span class="t-h">{{ t.h }}</span>
          <span class="t-p">{{ t.p }}</span>
        </li>
      </ul>

      <button class="primary done" @click="emit('close')">Got it</button>
    </div>
  </div>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  z-index: 80;
  background: rgb(27 42 34 / 55%);
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
  max-width: 560px;
  background: var(--bone);
  border: 1px solid var(--gold);
  border-radius: 14px;
  padding: 30px 30px 26px;
  box-shadow: 0 30px 70px -30px rgb(0 0 0 / 70%);
  background-image: radial-gradient(rgb(33 28 22 / 3%) 1px, transparent 1px);
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
  font-size: clamp(24px, 5vw, 32px);
  margin: 0 0 10px;
  color: var(--ink);
}

.lede {
  font-size: 16px;
  margin: 0 0 20px;
  color: var(--ink);
}

.tactics {
  list-style: none;
  margin: 0 0 24px;
  padding: 0;
  display: grid;
  gap: 14px;
}

.tactics li {
  border-left: 2px solid var(--gold);
  padding-left: 14px;
}

.t-h {
  display: block;
  font-family: var(--display), serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--ink);
  margin-bottom: 2px;
}

.t-p {
  display: block;
  font-size: 14.5px;
  line-height: 1.5;
  color: var(--ink-soft);
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
