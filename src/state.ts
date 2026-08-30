export type GardenMode = 'growing' | 'blooming';
export type GrowthSpeed = 'fast' | 'normal' | 'slow';
export type BiomeId = 'meadow' | 'succulent';
export type WildlifeRate = 'off' | 'occasional' | 'frequent';
export type HeightClass = 'tall' | 'mid' | 'low';

export interface SpeciesDef {
  id: string;
  label: string;
  biome: BiomeId;
  height: HeightClass;
}

export interface Plant {
  id: string;
  species: string;
  slot: number;
  plantedAt: number;
  lastWateredAt: number | null;
  growthBonusMs: number;
}

export interface BiomeState {
  selected: string[];
  plants: Plant[];
}

export interface GardenState {
  version: number;
  mode: GardenMode;
  speed: GrowthSpeed;
  biome: BiomeId;
  biomes: Record<BiomeId, BiomeState>;
  lastWateredAt: number | null;
  waterings: number;
  wildlife: WildlifeRate;
  devFast: boolean;
}

export const MAX_GARDEN_SLOTS = 100;

export const SPECIES: readonly SpeciesDef[] = [
  { id: 'daisy', label: 'Daisy', biome: 'meadow', height: 'mid' },
  { id: 'sunflower', label: 'Sunflower', biome: 'meadow', height: 'tall' },
  { id: 'tulip', label: 'Tulip', biome: 'meadow', height: 'mid' },
  { id: 'lavender', label: 'Lavender', biome: 'meadow', height: 'tall' },
  { id: 'bluebell', label: 'Bluebell', biome: 'meadow', height: 'mid' },
  { id: 'pansy', label: 'Pansy', biome: 'meadow', height: 'low' },
  { id: 'hyacinth', label: 'Hyacinth', biome: 'meadow', height: 'mid' },
  { id: 'foxglove', label: 'Foxglove', biome: 'meadow', height: 'tall' },
  { id: 'allium', label: 'Allium', biome: 'meadow', height: 'tall' },
  { id: 'babysbreath', label: "Baby's Breath", biome: 'meadow', height: 'low' },
  { id: 'marigold', label: 'Marigold', biome: 'meadow', height: 'low' },
  { id: 'cosmos', label: 'Cosmos', biome: 'meadow', height: 'mid' },
  { id: 'echeveria', label: 'Echeveria', biome: 'succulent', height: 'low' },
  { id: 'aloe', label: 'Aloe', biome: 'succulent', height: 'mid' },
  { id: 'haworthia', label: 'Haworthia', biome: 'succulent', height: 'low' },
  { id: 'jade', label: 'Jade', biome: 'succulent', height: 'tall' },
  { id: 'cactus', label: 'Cactus', biome: 'succulent', height: 'tall' }
];

export const BIOMES: readonly { id: BiomeId; label: string }[] = [
  { id: 'meadow', label: 'Flower Garden' },
  { id: 'succulent', label: 'Succulent Garden' }
];

export const DEFAULT_PLANTING: Record<BiomeId, string[]> = {
  meadow: ['daisy', 'sunflower', 'tulip', 'lavender'],
  succulent: ['echeveria', 'aloe', 'jade', 'cactus']
};

export function freshState(): GardenState {
  return {
    version: 2,
    mode: 'growing',
    speed: 'normal',
    biome: 'meadow',
    biomes: {
      meadow: { selected: [...DEFAULT_PLANTING.meadow], plants: [] },
      succulent: { selected: [...DEFAULT_PLANTING.succulent], plants: [] }
    },
    lastWateredAt: null,
    waterings: 0,
    wildlife: 'occasional',
    devFast: false
  };
}

export function normalizeState(saved: unknown, isDev: boolean): GardenState {
  if (!isRecord(saved)) return freshState();
  const base = freshState();
  if (typeof saved.version !== 'number') {
    const legacySpecies = typeof saved.flowerType === 'string' ? saved.flowerType : 'daisy';
    const known = SPECIES.some(s => s.id === legacySpecies && s.biome === 'meadow');
    base.biomes.meadow.selected = known
      ? [...new Set([legacySpecies, ...DEFAULT_PLANTING.meadow])]
      : [...DEFAULT_PLANTING.meadow];
    base.lastWateredAt = finiteNumber(saved.lastWateredAt);
    base.waterings = Math.max(0, Math.floor(finiteNumber(saved.waterings) ?? 0));
    return base;
  }
  const rawBiomes = isRecord(saved.biomes) ? saved.biomes : {};
  return {
    version: 2,
    mode: saved.mode === 'blooming' ? 'blooming' : 'growing',
    speed: saved.speed === 'fast' || saved.speed === 'slow' ? saved.speed : 'normal',
    biome: saved.biome === 'succulent' ? 'succulent' : 'meadow',
    biomes: {
      meadow: cleanBiomeState(rawBiomes.meadow, 'meadow'),
      succulent: cleanBiomeState(rawBiomes.succulent, 'succulent')
    },
    lastWateredAt: finiteNumber(saved.lastWateredAt),
    waterings: Math.max(0, Math.floor(finiteNumber(saved.waterings) ?? 0)),
    wildlife: saved.wildlife === 'off' || saved.wildlife === 'frequent'
      ? saved.wildlife
      : 'occasional',
    devFast: isDev && saved.devFast === true
  };
}

export function normalizeReadyMessage(
  message: Record<string, unknown>, currentBiome: BiomeId
): { slotCount: number; bands: string[] } | null {
  if (message.type !== 'ready' || message.biome !== currentBiome ||
      typeof message.slotCount !== 'number' || !Number.isFinite(message.slotCount)) return null;
  return {
    slotCount: Math.min(MAX_GARDEN_SLOTS, Math.max(0, Math.floor(message.slotCount))),
    bands: Array.isArray(message.bands)
      ? message.bands.slice(0, MAX_GARDEN_SLOTS).map(band => typeof band === 'string' ? band : '')
      : []
  };
}

function cleanBiomeState(value: unknown, biome: BiomeId): BiomeState {
  const raw = isRecord(value) ? value : {};
  const selected = Array.isArray(raw.selected)
    ? raw.selected.filter((id): id is string =>
        typeof id === 'string' && SPECIES.some(s => s.id === id && s.biome === biome))
    : [];
  const uniqueSelected = [...new Set(selected)];
  const safeSelected = uniqueSelected.length ? uniqueSelected : [...DEFAULT_PLANTING[biome]];
  const plants = Array.isArray(raw.plants)
    ? raw.plants.slice(0, MAX_GARDEN_SLOTS).flatMap((plant): Plant[] => {
        if (!isRecord(plant) || typeof plant.species !== 'string' ||
            !safeSelected.includes(plant.species)) return [];
        const slot = finiteNumber(plant.slot);
        const plantedAt = finiteNumber(plant.plantedAt);
        if (slot === null || plantedAt === null || slot < 0) return [];
        return [{
          id: typeof plant.id === 'string' ? plant.id.slice(0, 100) : `restored-${Math.floor(slot)}`,
          species: plant.species,
          slot: Math.min(MAX_GARDEN_SLOTS - 1, Math.floor(slot)),
          plantedAt,
          lastWateredAt: finiteNumber(plant.lastWateredAt),
          growthBonusMs: Math.max(0, finiteNumber(plant.growthBonusMs) ?? 0)
        }];
      })
    : [];
  return { selected: safeSelected, plants };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
