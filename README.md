# VS Code Flowers

A calm pixel-art garden that lives in your editor. It grows with real elapsed
time, or blooms permanently if you would rather just have flowers.

Current release: **0.1.1**

## Using it

The garden appears in two places — the **Flowers** icon in the Activity Bar, and
a **Flowers** tab in the bottom panel (⌘J / Ctrl+J), next to Terminal. Both show
the same garden.

Everything else is behind the **Customise** button in the corner of the garden.

## Garden modes

- **🌱 Growing** — plants move through Seed → Sprout → Young plant → Bud → Bloom
  over real elapsed time, whether or not VS Code is open.
- **🌸 Always Blooming** — plants are shown fully grown, with no waiting.

Switching modes never disturbs your planting.

## Growth speed

Roughly one day (**Fast**), three days (**Normal**, the default) or seven days
(**Slow**) from seed to bloom.

## Plants

Pick any combination; the bed is filled from what you choose, with taller
species toward the back. Choose exactly **one** species and it is shown as a
potted plant on a windowsill instead of a bed.

- **Flower Garden** — daisy, sunflower, tulip, lavender, bluebell, pansy,
  hyacinth, foxglove, allium, baby's breath, marigold, cosmos
- **Succulent Garden** — echeveria, aloe, haworthia, jade, cactus

Each biome remembers its own planting, so switching back restores what you had.

## Watering

Watering darkens the soil and nudges growth along a little. It is capped and
rate-limited, so it cannot be used to rush a plant, and nothing ever dies from
neglect.

## Wildlife

Ambient creatures occasionally wander through — a butterfly over the meadow, a
tarantula or gecko across the desert. They are decorative: nothing to feed,
collect or click. Set to **Off**, **Occasional** (default) or **Frequent**, and
suppressed entirely under reduced-motion settings.

## Development

- `npm run compile` — compile TypeScript
- `npm test` — compile and run the state and message-boundary tests
- `npm run watch` — compile as files change
- **F5** — launch an Extension Development Host

A dev-only fast-growth toggle appears in the Customise panel when running in the
Extension Development Host; it runs a full lifecycle in about 45 seconds and
never appears in an installed build.
