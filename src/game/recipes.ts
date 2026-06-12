import type { ItemId } from './blocks';

export interface Recipe {
  out: ItemId;
  count: number;
  needs: { item: ItemId; n: number }[];
  table?: boolean; // requires being near a crafting table
}

export const RECIPES: Recipe[] = [
  { out: 'planks', count: 4, needs: [{ item: 'wood', n: 1 }] },
  { out: 'stick', count: 4, needs: [{ item: 'planks', n: 2 }] },
  { out: 'crafting', count: 1, needs: [{ item: 'planks', n: 4 }] },
  { out: 'torch', count: 4, needs: [{ item: 'stick', n: 1 }, { item: 'coal', n: 1 }] },
  { out: 'chest', count: 1, needs: [{ item: 'planks', n: 8 }], table: true },
  { out: 'furnace', count: 1, needs: [{ item: 'stone', n: 8 }], table: true },
  { out: 'glass', count: 2, needs: [{ item: 'sand', n: 2 }], table: true },

  // tools — pickaxes
  { out: 'wood_pick', count: 1, needs: [{ item: 'planks', n: 3 }, { item: 'stick', n: 2 }], table: true },
  { out: 'stone_pick', count: 1, needs: [{ item: 'stone', n: 3 }, { item: 'stick', n: 2 }], table: true },
  { out: 'iron_pick', count: 1, needs: [{ item: 'iron', n: 3 }, { item: 'stick', n: 2 }], table: true },
  { out: 'diamond_pick', count: 1, needs: [{ item: 'diamond', n: 3 }, { item: 'stick', n: 2 }], table: true },

  // axes
  { out: 'wood_axe', count: 1, needs: [{ item: 'planks', n: 3 }, { item: 'stick', n: 2 }], table: true },
  { out: 'stone_axe', count: 1, needs: [{ item: 'stone', n: 3 }, { item: 'stick', n: 2 }], table: true },
  { out: 'iron_axe', count: 1, needs: [{ item: 'iron', n: 3 }, { item: 'stick', n: 2 }], table: true },

  // shovels
  { out: 'wood_shovel', count: 1, needs: [{ item: 'planks', n: 1 }, { item: 'stick', n: 2 }], table: true },
  { out: 'stone_shovel', count: 1, needs: [{ item: 'stone', n: 1 }, { item: 'stick', n: 2 }], table: true },
  { out: 'iron_shovel', count: 1, needs: [{ item: 'iron', n: 1 }, { item: 'stick', n: 2 }], table: true },

  // swords
  { out: 'wood_sword', count: 1, needs: [{ item: 'planks', n: 2 }, { item: 'stick', n: 1 }], table: true },
  { out: 'stone_sword', count: 1, needs: [{ item: 'stone', n: 2 }, { item: 'stick', n: 1 }], table: true },
  { out: 'iron_sword', count: 1, needs: [{ item: 'iron', n: 2 }, { item: 'stick', n: 1 }], table: true },
  { out: 'diamond_sword', count: 1, needs: [{ item: 'diamond', n: 2 }, { item: 'stick', n: 1 }], table: true },

  // doors & redstone mechanisms
  { out: 'door', count: 1, needs: [{ item: 'planks', n: 6 }], table: true },
  { out: 'redstone_block', count: 1, needs: [{ item: 'coal', n: 4 }, { item: 'gold', n: 1 }], table: true },
  { out: 'redstone', count: 8, needs: [{ item: 'coal', n: 1 }, { item: 'gold', n: 1 }], table: true },
  { out: 'lever', count: 1, needs: [{ item: 'stick', n: 1 }, { item: 'stone', n: 1 }], table: true },
  { out: 'button', count: 1, needs: [{ item: 'stone', n: 1 }], table: true },
  { out: 'plate', count: 1, needs: [{ item: 'stone', n: 2 }], table: true },
  { out: 'piston', count: 1, needs: [{ item: 'planks', n: 3 }, { item: 'stone', n: 4 }, { item: 'iron', n: 1 }], table: true },
  { out: 'sticky_piston', count: 1, needs: [{ item: 'piston', n: 1 }, { item: 'leaves', n: 2 }], table: true },
  { out: 'relay', count: 1, needs: [{ item: 'stone', n: 3 }, { item: 'redstone', n: 2 }], table: true },
  { out: 'sound_block', count: 1, needs: [{ item: 'planks', n: 6 }, { item: 'redstone', n: 1 }], table: true },

  // ships / boats
  { out: 'raft', count: 1, needs: [{ item: 'planks', n: 5 }], table: true },
  { out: 'skiff', count: 1, needs: [{ item: 'planks', n: 8 }, { item: 'chest', n: 1 }], table: true },
  { out: 'houseboat', count: 1, needs: [{ item: 'planks', n: 20 }, { item: 'chest', n: 2 }, { item: 'glass', n: 4 }], table: true },
  { out: 'galleon', count: 1, needs: [{ item: 'planks', n: 40 }, { item: 'iron', n: 10 }, { item: 'chest', n: 4 }], table: true },
];
