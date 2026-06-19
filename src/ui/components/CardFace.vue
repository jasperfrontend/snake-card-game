<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '../../engine/types';

const props = defineProps<{ card?: Card; faceDown?: boolean; dimmed?: boolean; tips?: boolean }>();

const TRICK_NAMES: Record<string, string> = {
  K: 'Coil',
  J: 'Slip',
  Q: 'Shed',
  A: 'Strike',
  JOKER: 'Scramble',
};

const rank = computed(() => {
  const c = props.card;
  if (!c) return '';
  if (c.kind === 'food') return String(c.value);
  if (c.kind === 'JOKER') return '★';
  return c.kind;
});

const name = computed(() => (props.card && props.card.kind !== 'food' ? TRICK_NAMES[props.card.kind] : ''));
const isTrick = computed(() => !!props.card && props.card.kind !== 'food');

const TRICK_DESC: Record<string, string> = {
  K: 'King · Coil, reverses the direction of play.',
  J: 'Jack · Slip, skips the next player.',
  Q: "Queen · Shed, halves the snake's length, rounded down.",
  A: 'Ace · Strike, wild 0–9; play it as 0 for a feint.',
  JOKER: 'Joker · Scramble, the next player bins their hand and draws fresh.',
};

// hover tooltip explaining what the card does (face-up cards only)
const description = computed(() => {
  const c = props.card;
  if (!c || props.faceDown) return undefined;
  return c.kind === 'food' ? `Food, feeds the snake ${c.value}.` : TRICK_DESC[c.kind];
});
</script>

<template>
  <!-- wrap holds the positioning + hover; only `.face` dims, so the tooltip
       stays fully opaque even when the card is disabled -->
  <div class="cardwrap">
    <div class="face card" :class="{ down: faceDown, trick: isTrick, dim: dimmed }">
      <template v-if="!faceDown">
        <div class="rank">{{ rank }}</div>
        <div v-if="name" class="name">{{ name }}</div>
      </template>
    </div>
    <span v-if="description && tips !== false" class="tip" role="tooltip">{{ description }}</span>
  </div>
</template>

<style scoped>
.cardwrap {
  position: relative;
  display: inline-flex;
}

.card {
  width: 46px;
  height: 66px;
  border: 1px solid var(--gold, #a87b2b);
  border-radius: 7px;
  background: linear-gradient(160deg, var(--bone, #f4eee1), var(--bone-2, #ebe2cf));
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  font-family: var(--display), Georgia, serif;
  color: var(--ink, #211c16);
  box-shadow: 0 1px 0 rgb(168 123 43 / 25%);
  flex: none;
}

.card.dim {
  opacity: 0.4;
}

.card.trick .rank {
  color: var(--gold, #a87b2b);
}

.card.down {
  background: linear-gradient(155deg, #24382c, #1b2a22);
  border-color: rgb(215 180 92 / 30%);
}

.rank {
  font-weight: 900;
  font-size: 22px;
  line-height: 1;
}

.name {
  font-family: var(--mono, monospace), monospace;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 8px;
  color: var(--ink-soft, #5a4f40);
  margin-top: 5px;
}

/* custom tooltip, instant, no transition, above the card; one per card so
   moving to the next card swaps it with zero flicker or delay. It lives outside
   `.face`, so a dimmed/disabled card still shows a fully-opaque tooltip. */
.tip {
  position: absolute;
  bottom: calc(100% + 9px);
  left: 50%;
  transform: translateX(-50%);
  z-index: 60;
  width: max-content;
  max-width: 200px;
  padding: 7px 10px;
  border-radius: 8px;
  background: var(--cardback, #1b2a22);
  color: var(--on-dark, #f4eee1);
  border: 1px solid rgb(215 180 92 / 35%);
  font-family: var(--body), Georgia, serif;
  font-size: 13px;
  line-height: 1.35;
  text-align: center;
  box-shadow: 0 8px 20px -8px rgb(0 0 0 / 55%);
  pointer-events: none;
  visibility: hidden;
}

.tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 5px solid transparent;
  border-top-color: var(--cardback, #1b2a22);
}

.cardwrap:hover .tip {
  visibility: visible;
}
</style>
