<script setup lang="ts">
import { computed } from 'vue';
import type { Card } from '../../engine/types';

const props = defineProps<{ card?: Card; faceDown?: boolean }>();

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
</script>

<template>
  <div class="card" :class="{ down: faceDown, trick: isTrick }">
    <template v-if="!faceDown">
      <div class="rank">{{ rank }}</div>
      <div v-if="name" class="name">{{ name }}</div>
    </template>
  </div>
</template>

<style scoped>
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
  font-family: var(--display, Georgia, serif);
  color: var(--ink, #211c16);
  box-shadow: 0 1px 0 rgb(168 123 43 / 25%);
  flex: none;
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
  font-family: var(--mono, monospace);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 8px;
  color: var(--ink-soft, #5a4f40);
  margin-top: 5px;
}
</style>
