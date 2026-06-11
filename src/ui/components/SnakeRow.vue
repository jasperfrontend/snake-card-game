<script setup lang="ts">
import { computed } from 'vue';
import type { SnakeSegment } from '../composables/useSnakeGame';

const props = defineProps<{
  segments: SnakeSegment[];
  length: number;
  maxLength: number;
  direction: 1 | -1;
}>();

const pct = computed(() => Math.min(100, (props.length / props.maxLength) * 100));
const room = computed(() => props.maxLength - props.length);
</script>

<template>
  <section class="snake" aria-label="The snake">
    <div class="readout">
      <span class="len">{{ length }}</span>
      <span class="max">/ {{ maxLength }}</span>
      <span class="dir" :title="direction === 1 ? 'play goes left' : 'play reversed'">
        {{ direction === 1 ? '↻' : '↺' }}
      </span>
    </div>

    <div class="track" role="img" :aria-label="`${length} of ${maxLength}, ${room} to go`">
      <div class="fill" :class="{ tight: room <= 9 }" :style="{ width: pct + '%' }"></div>
      <div class="goal"></div>
    </div>

    <div class="body">
      <TransitionGroup name="seg">
        <div
          v-for="(s, i) in segments"
          :key="s.id"
          class="seg"
          :class="[
            s.kind === 'food' ? 'food' : s.kind === 'start' ? 'start' : 'trick',
            { head: i === segments.length - 1 },
          ]"
          :title="`length ${s.length}`"
        >
          {{ s.label }}
        </div>
      </TransitionGroup>
    </div>
    <p class="hint">
      {{ room <= 0 ? 'pinned' : `${room} to the max — land exactly on ${maxLength} to pin` }}
    </p>
  </section>
</template>

<style scoped>
.snake {
  text-align: center;
}

.readout {
  font-family: var(--mono), monospace;
  display: flex;
  gap: 8px;
  align-items: baseline;
  justify-content: center;
}

.len {
  font-size: clamp(40px, 11vw, 60px);
  font-weight: 700;
  color: var(--ink);
  line-height: 1;
}

.max {
  font-size: 22px;
  color: var(--ink-soft);
}

.dir {
  font-size: 26px;
  color: var(--gold);
}

.track {
  position: relative;
  height: 12px;
  background: var(--bone-2);
  border: 1px solid var(--gold);
  border-radius: 7px;
  margin: 12px auto 0;
  max-width: 540px;
  overflow: hidden;
}

.fill {
  height: 100%;
  background: linear-gradient(90deg, var(--gold), var(--gold-bright));
  transition: width 0.45s cubic-bezier(0.22, 1, 0.36, 1);
}

.fill.tight {
  background: linear-gradient(90deg, var(--red), #b8442f);
}

.goal {
  position: absolute;
  top: -3px;
  right: 0;
  width: 3px;
  height: 18px;
  background: var(--cardback);
}

.body {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  justify-content: center;
  align-items: center;
  margin: 16px auto 0;
  max-width: 620px;
  min-height: 40px;
}

.seg {
  min-width: 30px;
  height: 40px;
  padding: 0 7px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: var(--display), serif;
  font-weight: 600;
  font-size: 16px;
  border: 1px solid var(--gold);
  background: var(--bone);
  color: var(--ink);
  box-shadow: 0 1px 0 rgb(168 123 43 / 25%);
}

.seg.trick {
  background: linear-gradient(160deg, #fbf4e3, var(--bone-2));
  color: var(--gold);
}

.seg.start {
  background: var(--cardback);
  color: var(--gold-bright);
  border-color: var(--cardback-2);
}

.seg.head {
  transform: translateY(-3px);
  box-shadow: 0 6px 14px -8px rgb(33 28 22 / 60%);
}

.hint {
  font-size: 13px;
  color: var(--ink-soft);
  margin: 12px 0 0;
}

.seg-enter-active {
  transition:
    transform 0.3s ease,
    opacity 0.3s ease;
}

.seg-enter-from {
  opacity: 0;
  transform: translateY(-10px) scale(0.85);
}
</style>
