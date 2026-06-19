<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import type { Difficulty } from '../../engine/types';
import type { GameSpeed } from '../composables/useSnakeGame';

defineProps<{
  difficulty: Difficulty;
  speed: GameSpeed;
  handSize: number;
  tooltips: boolean;
  forfeitAtOne: boolean;
  comboPin: boolean;
}>();
const emit = defineEmits<{
  close: [];
  newGame: [];
  'update:difficulty': [Difficulty];
  'update:speed': [GameSpeed];
  'update:handSize': [number];
  'update:tooltips': [boolean];
  'update:forfeitAtOne': [boolean];
  'update:comboPin': [boolean];
}>();

const closeBtn = ref<HTMLButtonElement | null>(null);

const DIFFS: { v: Difficulty; label: string; hint: string }[] = [
  { v: 'easy', label: 'Easy', hint: 'forgiving' },
  { v: 'medium', label: 'Medium', hint: 'balanced' },
  { v: 'hard', label: 'Hard', hint: 'brutal' },
];
const SPEEDS: { v: GameSpeed; label: string; hint: string }[] = [
  { v: 'slow', label: 'Slow', hint: '~3s' },
  { v: 'normal', label: 'Normal', hint: '~2s' },
  { v: 'fast', label: 'Fast', hint: '~1.3s' },
];
const HANDS: { v: number; label: string; hint: string }[] = [
  { v: 4, label: '4 cards', hint: 'tight' },
  { v: 5, label: '5 cards', hint: 'casual' },
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
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <button ref="closeBtn" class="x" aria-label="Close settings" @click="emit('close')">×</button>

      <p class="eyebrow">Settings</p>
      <h2 id="settings-title">How you want to play</h2>

      <div class="row">
        <div class="row-head">
          <span class="r-label">Bots</span>
          <span class="r-tag">next game</span>
        </div>
        <div class="seg" role="group" aria-label="Bot difficulty">
          <button
            v-for="d in DIFFS"
            :key="d.v"
            class="seg-btn"
            :class="{ on: difficulty === d.v }"
            @click="emit('update:difficulty', d.v)"
          >
            <span class="s-main">{{ d.label }}</span>
            <span class="s-hint">{{ d.hint }}</span>
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row-head">
          <span class="r-label">Speed</span>
          <span class="r-tag live">live</span>
        </div>
        <div class="seg" role="group" aria-label="Game speed">
          <button
            v-for="s in SPEEDS"
            :key="s.v"
            class="seg-btn"
            :class="{ on: speed === s.v }"
            @click="emit('update:speed', s.v)"
          >
            <span class="s-main">{{ s.label }}</span>
            <span class="s-hint">{{ s.hint }}</span>
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row-head">
          <span class="r-label">Hand</span>
          <span class="r-tag">next game</span>
        </div>
        <div class="seg" role="group" aria-label="Hand size">
          <button
            v-for="h in HANDS"
            :key="h.v"
            class="seg-btn"
            :class="{ on: handSize === h.v }"
            @click="emit('update:handSize', h.v)"
          >
            <span class="s-main">{{ h.label }}</span>
            <span class="s-hint">{{ h.hint }}</span>
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row-head">
          <span class="r-label">Tooltips</span>
          <span class="r-tag live">live</span>
        </div>
        <div class="seg" role="group" aria-label="Card tooltips">
          <button class="seg-btn" :class="{ on: tooltips }" @click="emit('update:tooltips', true)">
            <span class="s-main">On</span>
            <span class="s-hint">hover help</span>
          </button>
          <button class="seg-btn" :class="{ on: !tooltips }" @click="emit('update:tooltips', false)">
            <span class="s-main">Off</span>
            <span class="s-hint">clean</span>
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row-head">
          <span class="r-label">Forfeit when you have</span>
          <span class="r-tag live">live</span>
        </div>
        <div class="seg" role="group" aria-label="When you can bin your hand for a fresh one">
          <button class="seg-btn" :class="{ on: forfeitAtOne }" @click="emit('update:forfeitAtOne', true)">
            <span class="s-main">1 or {{ handSize }} cards</span>
            <span class="s-hint">dump a dead last card</span>
          </button>
          <button class="seg-btn" :class="{ on: !forfeitAtOne }" @click="emit('update:forfeitAtOne', false)">
            <span class="s-main">{{ handSize }} cards only</span>
            <span class="s-hint">full hand only</span>
          </button>
        </div>
      </div>

      <div class="row">
        <div class="row-head">
          <span class="r-label">Combo pins</span>
          <span class="r-tag live">live</span>
        </div>
        <div class="seg" role="group" aria-label="Multi-card pin attempts">
          <button class="seg-btn" :class="{ on: comboPin }" @click="emit('update:comboPin', true)">
            <span class="s-main">On</span>
            <span class="s-hint">2–3 card pins</span>
          </button>
          <button class="seg-btn" :class="{ on: !comboPin }" @click="emit('update:comboPin', false)">
            <span class="s-main">Off</span>
            <span class="s-hint">classic</span>
          </button>
        </div>
      </div>

      <p class="note">
        Speed, tooltips and the skill rules apply right away. Bots and hand size take effect on your next game.
      </p>

      <div class="actions">
        <button class="ghost" @click="emit('close')">Done</button>
        <button class="primary" @click="emit('newGame')">Start new game</button>
      </div>
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
  max-width: 520px;
  background: var(--bone);
  border: 1px solid var(--gold);
  border-radius: 14px;
  padding: 28px 28px 24px;
  box-shadow: 0 30px 70px -30px rgb(0 0 0 / 70%);
  background-image: radial-gradient(var(--dot) 1px, transparent 1px);
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
  font-size: clamp(24px, 5vw, 30px);
  margin: 0 0 20px;
  color: var(--ink);
}

.row {
  margin-bottom: 18px;
}

.row-head {
  display: flex;
  align-items: baseline;
  gap: 10px;
  margin-bottom: 7px;
}

.r-label {
  font-family: var(--display), serif;
  font-weight: 600;
  font-size: 17px;
  color: var(--ink);
}

.r-tag {
  font-family: var(--mono), monospace;
  font-size: 9px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
  border: 1px solid rgb(168 123 43 / 40%);
  border-radius: 999px;
  padding: 1px 7px;
}

.r-tag.live {
  color: var(--gold);
  border-color: var(--gold);
}

.seg {
  display: grid;
  grid-auto-flow: column;
  grid-auto-columns: 1fr;
  gap: 7px;
}

.seg-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 9px 6px;
  border: 1px solid var(--gold);
  border-radius: 9px;
  background: var(--bone);
  color: var(--ink);
  cursor: pointer;
  transition:
    background 0.15s ease,
    transform 0.1s ease;
}

.seg-btn:hover {
  border-color: var(--gold-bright);
}

.seg-btn.on {
  background: var(--gold);
  border-color: var(--gold);
  color: var(--on-dark);
}

.s-main {
  font-family: var(--mono), monospace;
  font-size: 13px;
  font-weight: 700;
}

.s-hint {
  font-family: var(--mono), monospace;
  font-size: 9px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  opacity: 0.75;
}

.note {
  font-size: 13px;
  color: var(--ink-soft);
  margin: 4px 0 20px;
}

.actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

button.ghost,
button.primary {
  font-family: var(--mono), monospace;
  font-size: 13px;
  padding: 9px 16px;
  border: 1px solid var(--gold);
  border-radius: 6px;
  cursor: pointer;
}

button.ghost {
  background: transparent;
  color: var(--ink);
}

button.primary {
  background: var(--gold);
  color: var(--on-dark);
  font-weight: 700;
}
</style>
