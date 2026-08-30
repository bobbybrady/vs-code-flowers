import * as vscode from 'vscode';
import { randomBytes } from 'node:crypto';
import {
  BIOMES, BiomeId, DEFAULT_PLANTING, GardenState, GrowthSpeed, HeightClass,
  normalizeReadyMessage, normalizeState, Plant, SPECIES
} from './state';

/** Which plant heights look right in each depth band of the bed. */
const BAND_HEIGHTS: Record<string, HeightClass[]> = {
  back: ['tall', 'mid'],
  mid: ['tall', 'mid', 'low'],
  near: ['mid', 'low'],
  front: ['low', 'mid']
};

/**
 * The species catalogue. Adding a plant is a row here plus a sprite set in
 * media/garden.js; nothing else needs to change.
 */
/** Seed-to-bloom durations. Users pick a speed, never a per-stage duration. */
const SPEED_MS: Record<GrowthSpeed, number> = {
  fast: 24 * 60 * 60 * 1000,
  normal: 3 * 24 * 60 * 60 * 1000,
  slow: 7 * 24 * 60 * 60 * 1000
};
/** Development-only: the whole lifecycle in about 45 seconds. */
const DEV_LIFECYCLE_MS = 45 * 1000;
const STATE_KEY = 'gardenState.v1';

export function activate(context: vscode.ExtensionContext): void {
  // One provider serves the Explorer section, the panel view and the Activity
  // Bar view; they all share a single persisted garden.
  const provider = new FlowersViewProvider(context);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider('vsCodeFlowers.gardenExplorer', provider),
    vscode.window.registerWebviewViewProvider('vsCodeFlowers.garden', provider),
    vscode.window.registerWebviewViewProvider('vsCodeFlowers.gardenBar', provider)
  );
}

export function deactivate(): void {}

class FlowersViewProvider implements vscode.WebviewViewProvider {
  private readonly views = new Set<vscode.WebviewView>();
  private readonly isDev: boolean;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.isDev = context.extensionMode === vscode.ExtensionMode.Development;
  }

  resolveWebviewView(view: vscode.WebviewView): void {
    this.views.add(view);
    view.onDidDispose(() => this.views.delete(view));
    view.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'media')]
    };
    const state = this.loadState();
    void this.context.globalState.update(STATE_KEY, state);
    view.webview.html = this.html(view.webview, state);

    view.webview.onDidReceiveMessage(async (message: Record<string, unknown>) => {
      const state = this.loadState();
      const type = message.type;

      // The webview owns the slot tables (they are composition), so it reports
      // how many slots the active biome has and we reconcile plants to fit.
      const ready = normalizeReadyMessage(message, state.biome);
      if (ready) {
        this.bands = ready.bands;
        this.reconcile(state, ready.slotCount);
        await this.saveAndSend(state);
        return;
      }

      if (type === 'water') {
        this.water(state);
        await this.saveAndSend(state);
        return;
      }

      if (type === 'toggleSpecies' && typeof message.species === 'string') {
        const biome = state.biomes[state.biome];
        const inBiome = SPECIES.some(s => s.id === message.species && s.biome === state.biome);
        if (!inBiome) return;
        const next = biome.selected.includes(message.species)
          ? biome.selected.filter(id => id !== message.species)
          : [...biome.selected, message.species];
        // A garden needs at least one plant; ignore clearing the last species.
        if (next.length === 0) return;
        biome.selected = next;
        biome.plants = biome.plants.filter(p => next.includes(p.species));
        if (this.slotCount > 0) this.reconcile(state, this.slotCount);
        await this.saveAndSend(state);
        return;
      }

      if (type === 'setMode' && (message.mode === 'growing' || message.mode === 'blooming')) {
        // Switching modes never touches the planting.
        state.mode = message.mode;
        await this.saveAndSend(state);
        return;
      }

      if (type === 'setSpeed' && typeof message.speed === 'string' && message.speed in SPEED_MS) {
        state.speed = message.speed as GrowthSpeed;
        await this.saveAndSend(state);
        return;
      }

      if (type === 'setBiome' && BIOMES.some(b => b.id === message.biome)) {
        state.biome = message.biome as BiomeId;
        // Slot count differs per biome; the webview re-reports on the next frame.
        await this.saveAndSend(state);
        return;
      }

      if (type === 'replant') {
        const now = Date.now();
        state.biomes[state.biome].plants.forEach(p => {
          p.plantedAt = now;
          p.growthBonusMs = 0;
          p.lastWateredAt = null;
        });
        await this.saveAndSend(state);
        return;
      }

      if (type === 'setWildlife' &&
          (message.wildlife === 'off' || message.wildlife === 'occasional' || message.wildlife === 'frequent')) {
        state.wildlife = message.wildlife;
        await this.saveAndSend(state);
        return;
      }

      if (type === 'devFast' && this.isDev) {
        state.devFast = !state.devFast;
        await this.saveAndSend(state);
        return;
      }
    });
  }

  private slotCount = 0;
  private bands: string[] = [];

  /** Fill every slot from the selected species, keeping existing plants intact. */
  private reconcile(state: GardenState, slotCount: number): void {
    this.slotCount = slotCount;
    const biome = state.biomes[state.biome];
    const selected = biome.selected.length ? biome.selected : DEFAULT_PLANTING[state.biome];
    const kept = biome.plants.filter(p => p.slot < slotCount && selected.includes(p.species));
    const bySlot = new Map(kept.map(p => [p.slot, p]));
    const now = Date.now();
    // Join the bed at its current age rather than as a fresh seed: the user is
    // choosing what grows here, not sowing each plant by hand. "Replant" is the
    // explicit way to take everything back to seed.
    const joinAt = kept.length ? Math.min(...kept.map(p => p.plantedAt)) : now;
    const joinBonus = kept.length ? Math.min(...kept.map(p => p.growthBonusMs || 0)) : 0;
    const plants: Plant[] = [];
    for (let slot = 0; slot < slotCount; slot++) {
      const target = this.pickSpecies(selected, this.bands[slot], slot);
      const existing = bySlot.get(slot);
      if (existing && existing.species === target) {
        plants.push(existing);
        continue;
      }
      plants.push({
        id: `${slot}-${now.toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
        species: target,
        slot,
        plantedAt: joinAt,
        lastWateredAt: existing ? existing.lastWateredAt : null,
        growthBonusMs: existing ? existing.growthBonusMs : joinBonus
      });
    }
    biome.plants = plants;
  }

  /** Prefer species whose height suits the slot's band; fall back to any. */
  private pickSpecies(selected: string[], band: string | undefined, slot: number): string {
    const allowed = BAND_HEIGHTS[band ?? 'mid'] ?? [];
    const fitting = selected.filter(id => {
      const def = SPECIES.find(s => s.id === id);
      return def ? allowed.includes(def.height) : false;
    });
    const pool = fitting.length ? fitting : selected;
    return pool[slot % pool.length];
  }

  /**
   * Watering is a nudge, not a cheat: each plant accepts a bonus at most once
   * per cooldown, and the total is capped, so clicking repeatedly does nothing.
   */
  private water(state: GardenState): void {
    const now = Date.now();
    state.lastWateredAt = now;
    state.waterings += 1;
    const total = state.devFast && this.isDev ? DEV_LIFECYCLE_MS : SPEED_MS[state.speed];
    const cooldown = total * 0.08;
    const step = total * 0.05;
    const cap = total * 0.25;
    for (const plant of state.biomes[state.biome].plants) {
      if (plant.lastWateredAt !== null && now - plant.lastWateredAt < cooldown) continue;
      plant.lastWateredAt = now;
      plant.growthBonusMs = Math.min(cap, plant.growthBonusMs + step);
    }
  }

  private loadState(): GardenState {
    return normalizeState(this.context.globalState.get(STATE_KEY), this.isDev);
  }

  private async saveAndSend(state: GardenState): Promise<void> {
    await this.context.globalState.update(STATE_KEY, state);
    const message = { type: 'state', state, config: this.config(state) };
    await Promise.all([...this.views].map(v => v.webview.postMessage(message)));
  }

  private config(state: GardenState) {
    return {
      lifecycleMs: state.devFast && this.isDev ? DEV_LIFECYCLE_MS : SPEED_MS[state.speed],
      isDev: this.isDev
    };
  }

  private html(webview: vscode.Webview, state: GardenState): string {
    const nonce = makeNonce();
    const payload = Buffer.from(
      JSON.stringify({ state, config: this.config(state), species: SPECIES, biomes: BIOMES }),
      'utf8'
    ).toString('base64');
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'garden.css'));
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'media', 'garden.js'));
    const devButton = this.isDev
      ? '<button id="devFast" class="secondary dev">Dev: fast growth</button>'
      : '';
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
</head>
<body>
  <main data-payload="${payload}" id="app">
    <div class="garden" aria-label="A pixel-art garden">
      <canvas id="gardenCanvas" width="300" height="160"></canvas>
    </div>
    <button id="toggle" class="toggle" type="button" aria-expanded="false">Customise</button>
    <div class="controls" id="controls">
      <div class="seg" id="mode" role="group" aria-label="Garden mode">
        <button type="button" data-mode="growing">🌱 Growing</button>
        <button type="button" data-mode="blooming">🌸 Blooming</button>
      </div>
      <div class="seg" id="biome" role="group" aria-label="Biome"></div>
      <div class="seg" id="speed" role="group" aria-label="Growth speed">
        <button type="button" data-speed="fast">Fast</button>
        <button type="button" data-speed="normal">Normal</button>
        <button type="button" data-speed="slow">Slow</button>
      </div>
      <div class="seg" id="wildlife" role="group" aria-label="Wildlife">
        <button type="button" data-wildlife="off">No wildlife</button>
        <button type="button" data-wildlife="occasional">Occasional</button>
        <button type="button" data-wildlife="frequent">Frequent</button>
      </div>
      <p class="picker-label">Plants in this garden</p>
      <div class="picker" id="picker" role="group" aria-label="Plants in this garden"></div>
      <div class="actions">
        <button id="water">💧 Water</button>
        <button id="replant" class="secondary">Replant</button>
        ${devButton}
      </div>
      <p class="status" id="status"></p>
    </div>
  </main>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function makeNonce(): string {
  return randomBytes(24).toString('base64');
}
