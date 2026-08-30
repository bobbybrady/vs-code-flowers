# Changelog

## 0.1.1

Security and reliability patch.

- Validate persisted garden data and safely recover from malformed state.
- Validate webview messages, ignore stale biome updates and cap garden slot allocation.
- Tighten the webview Content Security Policy and use secure script nonces.
- Add focused tests for state migration, corrupted-state recovery and message boundaries.

## 0.1.0

First release.

- A pixel-art garden in the Explorer sidebar, the Activity Bar and the bottom panel.
- Two garden modes: Growing (real elapsed time) and Always Blooming.
- Growth speeds of roughly one, three or seven days from seed to bloom.
- Two biomes, Flower Garden and Succulent Garden, each remembering its own planting.
- Seventeen plant species; choose any combination, or one for a potted plant.
- Watering that nudges growth, capped and rate-limited so it cannot be rushed.
- Ambient wildlife (butterfly, tarantula, gecko) with Off / Occasional / Frequent.
