/**
 * Secondary indexes built lazily on first query and kept warm in the
 * SourceManager's index cache. Every index follows the same shape:
 *
 *   - `Map<token, [key, entry]>` for unique lookups (e.g. byInternalName)
 *   - `Map<token, Array<[key, entry]>>` for multi-hit lookups
 *
 * Entries are kept as raw `Record<string, unknown>` per the project's
 * raw-passthrough convention — every CDN field stays addressable by
 * tool callers.
 */

export type Entry = Record<string, unknown>;
export type Hit = [string, Entry];

const TOKEN_SPLIT_RE = /[^A-Za-z0-9_]+/;

export function tokenize(s: string): string[] {
  return s.toLowerCase().split(TOKEN_SPLIT_RE).filter(Boolean);
}

function pushBucket<K>(map: Map<K, Hit[]>, key: K, hit: Hit): void {
  const bucket = map.get(key) ?? [];
  bucket.push(hit);
  map.set(key, bucket);
}

// ─── items ─────────────────────────────────────────────────────────────

export interface ItemIndexes {
  byInternalName: Map<string, Hit>;
  byIconId: Map<number, Hit[]>;
  byEffectDescToken: Map<string, Hit[]>;
  byKeyword: Map<string, Hit[]>;
  byItemKey: Map<string, Hit>; // key is the raw item_<id> CDN key
}

export function buildItemIndexes(data: Record<string, unknown>): ItemIndexes {
  const byInternalName = new Map<string, Hit>();
  const byIconId = new Map<number, Hit[]>();
  const byEffectDescToken = new Map<string, Hit[]>();
  const byKeyword = new Map<string, Hit[]>();
  const byItemKey = new Map<string, Hit>();

  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Entry;
    const hit: Hit = [key, entry];
    byItemKey.set(key, hit);

    const internalName = typeof entry.InternalName === 'string' ? entry.InternalName : null;
    if (internalName) byInternalName.set(internalName, hit);

    const iconId = typeof entry.IconId === 'number' ? entry.IconId : null;
    if (iconId !== null) pushBucket(byIconId, iconId, hit);

    if (Array.isArray(entry.EffectDescs)) {
      for (const desc of entry.EffectDescs) {
        if (typeof desc !== 'string') continue;
        for (const token of tokenize(desc)) pushBucket(byEffectDescToken, token, hit);
      }
    }

    if (Array.isArray(entry.Keywords)) {
      for (const kw of entry.Keywords) {
        if (typeof kw !== 'string') continue;
        // Keywords can be `Foo=quality`; index just the token name.
        const eq = kw.indexOf('=');
        const name = eq > 0 ? kw.slice(0, eq) : kw;
        pushBucket(byKeyword, name, hit);
      }
    }
  }

  return { byInternalName, byIconId, byEffectDescToken, byKeyword, byItemKey };
}

// ─── recipes ───────────────────────────────────────────────────────────

export interface RecipeIndexes {
  byInternalName: Map<string, Hit>;
  bySkill: Map<string, Hit[]>;
  /** Keyed by item internal_name; built by joining recipe ResultItems / ProtoResultItems against items.byItemKey. */
  byResultInternalName: Map<string, Hit[]>;
  /** Keyed by item internal_name; built by joining recipe Ingredients[].ItemCode against items.byItemKey. */
  byIngredientInternalName: Map<string, Hit[]>;
}

export function buildRecipeIndexes(
  data: Record<string, unknown>,
  itemIndexes: ItemIndexes,
): RecipeIndexes {
  const byInternalName = new Map<string, Hit>();
  const bySkill = new Map<string, Hit[]>();
  const byResultInternalName = new Map<string, Hit[]>();
  const byIngredientInternalName = new Map<string, Hit[]>();

  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Entry;
    const hit: Hit = [key, entry];

    const internalName = typeof entry.InternalName === 'string' ? entry.InternalName : null;
    if (internalName) byInternalName.set(internalName, hit);

    const skill = typeof entry.Skill === 'string' ? entry.Skill : null;
    if (skill) pushBucket(bySkill, skill, hit);

    const resultNames = new Set<string>();
    for (const list of [entry.ResultItems, entry.ProtoResultItems]) {
      if (!Array.isArray(list)) continue;
      for (const slot of list) {
        const codeNum = pickItemCode(slot);
        if (codeNum === null) continue;
        const itemHit = lookupItemByCode(itemIndexes, codeNum);
        const itemInternal = itemHit ? readInternalName(itemHit[1]) : null;
        if (itemInternal) resultNames.add(itemInternal);
      }
    }
    for (const name of resultNames) pushBucket(byResultInternalName, name, hit);

    const ingredientNames = new Set<string>();
    if (Array.isArray(entry.Ingredients)) {
      for (const slot of entry.Ingredients) {
        const codeNum = pickItemCode(slot);
        if (codeNum === null) continue;
        const itemHit = lookupItemByCode(itemIndexes, codeNum);
        const itemInternal = itemHit ? readInternalName(itemHit[1]) : null;
        if (itemInternal) ingredientNames.add(itemInternal);
      }
    }
    for (const name of ingredientNames) pushBucket(byIngredientInternalName, name, hit);
  }

  return { byInternalName, bySkill, byResultInternalName, byIngredientInternalName };
}

function pickItemCode(slot: unknown): number | null {
  if (!slot || typeof slot !== 'object') return null;
  const obj = slot as Record<string, unknown>;
  const code = obj.ItemCode;
  return typeof code === 'number' ? code : null;
}

function lookupItemByCode(itemIndexes: ItemIndexes, code: number): Hit | undefined {
  return itemIndexes.byItemKey.get(`item_${code}`);
}

function readInternalName(entry: Entry): string | null {
  return typeof entry.InternalName === 'string' ? entry.InternalName : null;
}

// ─── npcs ──────────────────────────────────────────────────────────────

export type GiftSentiment = 'Likes' | 'Loves' | 'Dislikes' | 'Hates';

export interface NpcIndexes {
  byInternalName: Map<string, Hit>;
  byArea: Map<string, Hit[]>;
  /** Inverted from NPC -> keyword[]; entry value is `[npcKey, sentiment]`. */
  byGiftKeyword: Map<string, Array<[string, GiftSentiment]>>;
}

export function buildNpcIndexes(data: Record<string, unknown>): NpcIndexes {
  const byInternalName = new Map<string, Hit>();
  const byArea = new Map<string, Hit[]>();
  const byGiftKeyword = new Map<string, Array<[string, GiftSentiment]>>();

  const sentiments: GiftSentiment[] = ['Likes', 'Loves', 'Dislikes', 'Hates'];

  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Entry;
    const hit: Hit = [key, entry];

    const internalName = typeof entry.InternalName === 'string' ? entry.InternalName : null;
    if (internalName) byInternalName.set(internalName, hit);

    const area = typeof entry.AreaName === 'string' ? entry.AreaName : null;
    if (area) pushBucket(byArea, area, hit);

    for (const sentiment of sentiments) {
      const list = entry[sentiment];
      if (!Array.isArray(list)) continue;
      for (const kw of list) {
        if (typeof kw !== 'string') continue;
        const bucket = byGiftKeyword.get(kw) ?? [];
        bucket.push([key, sentiment]);
        byGiftKeyword.set(kw, bucket);
      }
    }
  }

  return { byInternalName, byArea, byGiftKeyword };
}

// ─── effects ───────────────────────────────────────────────────────────

export interface EffectIndexes {
  byToken: Map<string, Hit[]>;
  byModName: Map<string, Hit[]>;
}

export function buildEffectIndexes(data: Record<string, unknown>): EffectIndexes {
  const byToken = new Map<string, Hit[]>();
  const byModName = new Map<string, Hit[]>();

  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Entry;
    const hit: Hit = [key, entry];

    // Dedupe tokens across Name + Desc so an entry whose both fields share a
    // token isn't double-pushed (multi-token AND-intersect would otherwise
    // see duplicate keys).
    const tokens = new Set<string>();
    for (const field of ['Name', 'Desc'] as const) {
      const v = entry[field];
      if (typeof v !== 'string') continue;
      for (const token of tokenize(v)) tokens.add(token);
    }
    for (const token of tokens) pushBucket(byToken, token, hit);

    const mods = entry.Mods;
    if (mods && typeof mods === 'object' && !Array.isArray(mods)) {
      for (const modName of Object.keys(mods)) pushBucket(byModName, modName, hit);
    }
  }

  return { byToken, byModName };
}

// ─── quests ────────────────────────────────────────────────────────────

export interface QuestIndexes {
  byInternalName: Map<string, Hit>;
  byArea: Map<string, Hit[]>;
  byFavorNpc: Map<string, Hit[]>;
  byObjectiveTarget: Map<string, Hit[]>;
}

export function buildQuestIndexes(data: Record<string, unknown>): QuestIndexes {
  const byInternalName = new Map<string, Hit>();
  const byArea = new Map<string, Hit[]>();
  const byFavorNpc = new Map<string, Hit[]>();
  const byObjectiveTarget = new Map<string, Hit[]>();

  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Entry;
    const hit: Hit = [key, entry];

    const internalName = typeof entry.InternalName === 'string' ? entry.InternalName : null;
    if (internalName) byInternalName.set(internalName, hit);

    const area = typeof entry.Area === 'string' ? entry.Area : null;
    if (area) pushBucket(byArea, area, hit);

    const favor = typeof entry.FavorNpc === 'string' ? entry.FavorNpc : null;
    if (favor) pushBucket(byFavorNpc, favor, hit);

    if (Array.isArray(entry.Objectives)) {
      for (const obj of entry.Objectives) {
        if (!obj || typeof obj !== 'object') continue;
        const target = (obj as Record<string, unknown>).Target;
        if (typeof target === 'string' && target.length > 0) {
          pushBucket(byObjectiveTarget, target, hit);
        }
      }
    }
  }

  return { byInternalName, byArea, byFavorNpc, byObjectiveTarget };
}

// ─── abilities ─────────────────────────────────────────────────────────

export interface AbilityIndexes {
  byInternalName: Map<string, Hit>;
  bySkill: Map<string, Hit[]>;
  byKeyword: Map<string, Hit[]>;
}

export function buildAbilityIndexes(data: Record<string, unknown>): AbilityIndexes {
  const byInternalName = new Map<string, Hit>();
  const bySkill = new Map<string, Hit[]>();
  const byKeyword = new Map<string, Hit[]>();

  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Entry;
    const hit: Hit = [key, entry];

    const internalName = typeof entry.InternalName === 'string' ? entry.InternalName : null;
    if (internalName) byInternalName.set(internalName, hit);

    const skill = typeof entry.Skill === 'string' ? entry.Skill : null;
    if (skill) pushBucket(bySkill, skill, hit);

    if (Array.isArray(entry.Keywords)) {
      for (const kw of entry.Keywords) {
        if (typeof kw !== 'string') continue;
        const eq = kw.indexOf('=');
        const name = eq > 0 ? kw.slice(0, eq) : kw;
        pushBucket(byKeyword, name, hit);
      }
    }
  }

  return { byInternalName, bySkill, byKeyword };
}
