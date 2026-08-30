const test = require('node:test');
const assert = require('node:assert/strict');
const { MAX_GARDEN_SLOTS, normalizeReadyMessage, normalizeState } = require('../out/state');

test('normalizeState returns safe defaults for missing or corrupt state', () => {
  for (const value of [undefined, null, [], 'broken']) {
    const state = normalizeState(value, false);
    assert.equal(state.version, 2);
    assert.equal(state.mode, 'growing');
    assert.equal(state.speed, 'normal');
    assert.equal(state.biome, 'meadow');
    assert.ok(state.biomes.meadow.selected.length > 0);
  }
});

test('normalizeState filters invalid persisted values and production dev flags', () => {
  const state = normalizeState({
    version: 2,
    mode: 'invalid',
    speed: 'instant',
    biome: 'ocean',
    wildlife: 'constant',
    devFast: true,
    waterings: -12,
    biomes: {
      meadow: {
        selected: ['daisy', 'cactus', 'daisy'],
        plants: [
          { id: 'ok', species: 'daisy', slot: 2.9, plantedAt: 100, growthBonusMs: 5 },
          { id: 'wrong-biome', species: 'cactus', slot: 1, plantedAt: 100 }
        ]
      }
    }
  }, false);

  assert.equal(state.mode, 'growing');
  assert.equal(state.speed, 'normal');
  assert.equal(state.biome, 'meadow');
  assert.equal(state.wildlife, 'occasional');
  assert.equal(state.devFast, false);
  assert.equal(state.waterings, 0);
  assert.deepEqual(state.biomes.meadow.selected, ['daisy']);
  assert.equal(state.biomes.meadow.plants.length, 1);
  assert.equal(state.biomes.meadow.plants[0].slot, 2);
});

test('normalizeState migrates a legacy flower selection', () => {
  const state = normalizeState({ flowerType: 'pansy', waterings: 3 }, false);
  assert.equal(state.biomes.meadow.selected[0], 'pansy');
  assert.equal(state.waterings, 3);
});

test('normalizeReadyMessage rejects malformed and stale messages', () => {
  assert.equal(normalizeReadyMessage({ type: 'ready', biome: 'succulent', slotCount: 10 }, 'meadow'), null);
  assert.equal(normalizeReadyMessage({ type: 'ready', biome: 'meadow', slotCount: Infinity }, 'meadow'), null);
  assert.equal(normalizeReadyMessage({ type: 'water', biome: 'meadow', slotCount: 10 }, 'meadow'), null);
});

test('normalizeReadyMessage bounds slot and band input', () => {
  const ready = normalizeReadyMessage({
    type: 'ready',
    biome: 'meadow',
    slotCount: MAX_GARDEN_SLOTS + 500.8,
    bands: Array(MAX_GARDEN_SLOTS + 5).fill('front')
  }, 'meadow');

  assert.equal(ready.slotCount, MAX_GARDEN_SLOTS);
  assert.equal(ready.bands.length, MAX_GARDEN_SLOTS);
});
