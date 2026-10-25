import test from 'node:test';
import assert from 'node:assert/strict';

import { buildProgressSchedule } from '../src/lib/election-predictor/rollout-progress.ts';

test('progress: 2000 fatias são monotônicas e terminam em 1', () => {
  const progress = buildProgressSchedule(2000);
  assert.equal(progress.length, 2000);
  assert.equal(progress[0], 1 / 2000 ** 2);
  assert.equal(progress.at(-1), 1);
  for (let i = 1; i < progress.length; i += 1) {
    assert.ok(progress[i] > progress[i - 1], `não monotônico em ${i}`);
  }
});

test('progress: concentra fatias no começo e afrouxa no fim', () => {
  const progress = buildProgressSchedule(2000);
  const firstHalfPercent = progress.filter((u) => u <= 0.005).length;
  assert.ok(firstHalfPercent > 100, `primeiras 0,5%: ${firstHalfPercent}`);
  const firstStep = progress[0];
  const lastStep = (progress.at(-1) ?? 1) - (progress.at(-2) ?? 0);
  assert.ok(lastStep > firstStep * 100, 'passo final deve ser bem maior');
});

test('progress: entradas inválidas degradam para grade segura', () => {
  assert.deepEqual(buildProgressSchedule(0), [1]);
  assert.deepEqual(buildProgressSchedule(Number.NaN), [1]);
  assert.equal(buildProgressSchedule(10, 0).at(-1), 1);
  assert.equal(buildProgressSchedule(10, 99).at(-1), 1);
  assert.equal(buildProgressSchedule(10).length, 10);
});
