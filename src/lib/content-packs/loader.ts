import type { ContentPack } from "../types/content-pack";
import basePack from "./base/base.pack.json";

// Static registry for now — swap for filesystem/DB discovery once packs
// are user-uploadable.
const REGISTRY: Record<string, ContentPack> = {
  base: basePack as ContentPack,
};

export function loadContentPack(id: string): ContentPack {
  const pack = REGISTRY[id];
  if (!pack) {
    throw new Error(`Unknown content pack: "${id}"`);
  }
  return pack;
}

export function loadContentPacks(ids: string[]): ContentPack[] {
  return ids.map(loadContentPack);
}
