/**
 * Secondary indexes built lazily on first query and kept warm in the loader's
 * cache. Today only items needs a full set of indexes (find_items hits
 * several of them); recipes/npcs/effects indexes land in v0.2.
 *
 * Item key shape on the CDN is `item_<id>`; the entry is an object with
 * `Name`, `InternalName`, `IconId`, `EquipSlot`, `EffectDescs[]`, `Keywords[]`,
 * `SkillReqs{}`, `Value`, etc. We don't pin a TS type — record/object
 * passthrough keeps every field addressable by tool callers.
 */
export interface ItemIndexes {
  byInternalName: Map<string, [string, Record<string, unknown>]>;
  byIconId: Map<number, Array<[string, Record<string, unknown>]>>;
  byEffectDescToken: Map<string, Array<[string, Record<string, unknown>]>>;
  byKeyword: Map<string, Array<[string, Record<string, unknown>]>>;
}

export function buildItemIndexes(data: Record<string, unknown>): ItemIndexes {
  const byInternalName = new Map<string, [string, Record<string, unknown>]>();
  const byIconId = new Map<number, Array<[string, Record<string, unknown>]>>();
  const byEffectDescToken = new Map<string, Array<[string, Record<string, unknown>]>>();
  const byKeyword = new Map<string, Array<[string, Record<string, unknown>]>>();

  for (const [key, raw] of Object.entries(data)) {
    if (!raw || typeof raw !== 'object') continue;
    const entry = raw as Record<string, unknown>;

    const internalName = typeof entry.InternalName === 'string' ? entry.InternalName : null;
    if (internalName) byInternalName.set(internalName, [key, entry]);

    const iconId = typeof entry.IconId === 'number' ? entry.IconId : null;
    if (iconId !== null) {
      const bucket = byIconId.get(iconId) ?? [];
      bucket.push([key, entry]);
      byIconId.set(iconId, bucket);
    }

    if (Array.isArray(entry.EffectDescs)) {
      for (const desc of entry.EffectDescs) {
        if (typeof desc !== 'string') continue;
        for (const token of tokenize(desc)) {
          const bucket = byEffectDescToken.get(token) ?? [];
          bucket.push([key, entry]);
          byEffectDescToken.set(token, bucket);
        }
      }
    }

    if (Array.isArray(entry.Keywords)) {
      for (const kw of entry.Keywords) {
        if (typeof kw !== 'string') continue;
        // Keywords can be `Foo=quality`; index just the token name.
        const eq = kw.indexOf('=');
        const name = eq > 0 ? kw.slice(0, eq) : kw;
        const bucket = byKeyword.get(name) ?? [];
        bucket.push([key, entry]);
        byKeyword.set(name, bucket);
      }
    }
  }

  return { byInternalName, byIconId, byEffectDescToken, byKeyword };
}

const TOKEN_SPLIT_RE = /[^A-Za-z0-9_]+/;

function tokenize(s: string): string[] {
  return s.toLowerCase().split(TOKEN_SPLIT_RE).filter(Boolean);
}
