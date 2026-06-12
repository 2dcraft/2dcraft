// Block / item definitions for the sandbox world.

export type BlockId =
  | 'air' | 'grass' | 'dirt' | 'stone' | 'water' | 'sand'
  | 'wood' | 'leaves' | 'coal' | 'iron' | 'gold' | 'diamond' | 'snow'
  | 'planks' | 'crafting' | 'furnace' | 'chest' | 'torch' | 'glass' | 'flower'
  | 'door' | 'door_open'
  | 'redstone' | 'lever' | 'button' | 'plate' | 'piston' | 'sticky_piston'
  | 'sound_block' | 'relay' | 'redstone_block' | 'piston_arm';

export type ItemId =
  | BlockId
  | 'stick'
  | 'wood_pick' | 'stone_pick' | 'iron_pick' | 'diamond_pick'
  | 'wood_axe' | 'stone_axe' | 'iron_axe'
  | 'wood_shovel' | 'stone_shovel' | 'iron_shovel'
  | 'wood_sword' | 'stone_sword' | 'iron_sword' | 'diamond_sword'
  | 'apple' | 'meat'
  | 'raft' | 'skiff' | 'houseboat' | 'galleon';

export type ToolClass = 'pick' | 'axe' | 'shovel' | 'sword' | 'none';

export interface BlockDef {
  id: BlockId;
  name: string;
  solid: boolean;
  mineable: boolean;
  hardness: number;
  drops?: ItemId;
  walkable?: boolean;
  liquid?: boolean;
  prefTool?: ToolClass; // tool that mines it fastest
}

export const BLOCKS: Record<BlockId, BlockDef> = {
  air:      { id: 'air', name: 'Air', solid: false, mineable: false, hardness: 0, walkable: true },
  grass:    { id: 'grass', name: 'Grass Block', solid: false, mineable: true, hardness: 350, drops: 'dirt', walkable: true, prefTool: 'shovel' },
  dirt:     { id: 'dirt', name: 'Dirt', solid: false, mineable: true, hardness: 350, drops: 'dirt', walkable: true, prefTool: 'shovel' },
  sand:     { id: 'sand', name: 'Sand', solid: false, mineable: true, hardness: 300, drops: 'sand', walkable: true, prefTool: 'shovel' },
  snow:     { id: 'snow', name: 'Snow', solid: false, mineable: true, hardness: 250, drops: 'snow', walkable: true, prefTool: 'shovel' },
  stone:    { id: 'stone', name: 'Stone', solid: true, mineable: true, hardness: 900, drops: 'stone', prefTool: 'pick' },
  water:    { id: 'water', name: 'Water', solid: false, mineable: false, hardness: 0, liquid: true, walkable: true },
  wood:     { id: 'wood', name: 'Wood Log', solid: true, mineable: true, hardness: 600, drops: 'wood', prefTool: 'axe' },
  leaves:   { id: 'leaves', name: 'Leaves', solid: true, mineable: true, hardness: 160, drops: 'leaves' },
  coal:     { id: 'coal', name: 'Coal Ore', solid: true, mineable: true, hardness: 1100, drops: 'coal', prefTool: 'pick' },
  iron:     { id: 'iron', name: 'Iron Ore', solid: true, mineable: true, hardness: 1400, drops: 'iron', prefTool: 'pick' },
  gold:     { id: 'gold', name: 'Gold Ore', solid: true, mineable: true, hardness: 1400, drops: 'gold', prefTool: 'pick' },
  diamond:  { id: 'diamond', name: 'Diamond Ore', solid: true, mineable: true, hardness: 1900, drops: 'diamond', prefTool: 'pick' },
  planks:   { id: 'planks', name: 'Planks', solid: true, mineable: true, hardness: 500, drops: 'planks', prefTool: 'axe' },
  crafting: { id: 'crafting', name: 'Crafting Table', solid: true, mineable: true, hardness: 500, drops: 'crafting', prefTool: 'axe' },
  furnace:  { id: 'furnace', name: 'Furnace', solid: true, mineable: true, hardness: 800, drops: 'furnace', prefTool: 'pick' },
  chest:    { id: 'chest', name: 'Chest', solid: true, mineable: true, hardness: 500, drops: 'chest', prefTool: 'axe' },
  torch:    { id: 'torch', name: 'Torch', solid: false, mineable: true, hardness: 50, drops: 'torch', walkable: true },
  glass:    { id: 'glass', name: 'Glass', solid: true, mineable: true, hardness: 200, drops: 'glass' },
  flower:   { id: 'flower', name: 'Flower', solid: false, mineable: true, hardness: 40, drops: 'flower', walkable: true },
  door:     { id: 'door', name: 'Door', solid: true, mineable: true, hardness: 400, drops: 'door', prefTool: 'axe' },
  door_open:{ id: 'door_open', name: 'Door', solid: false, mineable: true, hardness: 400, drops: 'door', walkable: true, prefTool: 'axe' },
  redstone: { id: 'redstone', name: 'Redstone Wire', solid: false, mineable: true, hardness: 60, drops: 'redstone', walkable: true },
  redstone_block: { id: 'redstone_block', name: 'Redstone Block', solid: true, mineable: true, hardness: 400, drops: 'redstone_block', prefTool: 'pick' },
  lever:    { id: 'lever', name: 'Lever', solid: false, mineable: true, hardness: 60, drops: 'lever', walkable: true },
  button:   { id: 'button', name: 'Button', solid: false, mineable: true, hardness: 60, drops: 'button', walkable: true },
  plate:    { id: 'plate', name: 'Pressure Plate', solid: false, mineable: true, hardness: 60, drops: 'plate', walkable: true },
  piston:   { id: 'piston', name: 'Piston', solid: true, mineable: true, hardness: 500, drops: 'piston', prefTool: 'pick' },
  sticky_piston: { id: 'sticky_piston', name: 'Sticky Piston', solid: true, mineable: true, hardness: 500, drops: 'sticky_piston', prefTool: 'pick' },
  piston_arm: { id: 'piston_arm', name: 'Piston Arm', solid: true, mineable: false, hardness: 9999 },
  sound_block: { id: 'sound_block', name: 'Sound Block', solid: true, mineable: true, hardness: 400, drops: 'sound_block', prefTool: 'axe' },
  relay:    { id: 'relay', name: 'Redstone Relay', solid: true, mineable: true, hardness: 400, drops: 'relay', prefTool: 'pick' },
};

// blocks that participate in the redstone network
export const REDSTONE_BLOCKS: BlockId[] = ['redstone', 'lever', 'button', 'plate', 'piston', 'sticky_piston', 'sound_block', 'relay', 'redstone_block'];
export function isRedstone(b: BlockId): boolean { return REDSTONE_BLOCKS.includes(b); }
export function isPowerSource(b: BlockId): boolean { return b === 'lever' || b === 'button' || b === 'plate' || b === 'redstone_block'; }

export const ITEM_NAMES: Record<string, string> = {
  ...Object.fromEntries(Object.values(BLOCKS).map(b => [b.id, b.name])),
  stick: 'Stick',
  wood_pick: 'Wooden Pickaxe', stone_pick: 'Stone Pickaxe', iron_pick: 'Iron Pickaxe', diamond_pick: 'Diamond Pickaxe',
  wood_axe: 'Wooden Axe', stone_axe: 'Stone Axe', iron_axe: 'Iron Axe',
  wood_shovel: 'Wooden Shovel', stone_shovel: 'Stone Shovel', iron_shovel: 'Iron Shovel',
  wood_sword: 'Wooden Sword', stone_sword: 'Stone Sword', iron_sword: 'Iron Sword', diamond_sword: 'Diamond Sword',
  apple: 'Apple', meat: 'Cooked Meat',
  raft: 'Raft', skiff: 'Skiff', houseboat: 'Houseboat', galleon: 'Galleon',
};

export const SHIP_ITEMS = ['raft', 'skiff', 'houseboat', 'galleon'] as const;
export function isShipItem(id: string): id is 'raft' | 'skiff' | 'houseboat' | 'galleon' {
  return (SHIP_ITEMS as readonly string[]).includes(id);
}

// every craftable / obtainable id (for /give command autocomplete & validation)
export const ALL_IDS: string[] = [
  ...Object.keys(BLOCKS).filter(b => b !== 'air'),
  'stick', 'wood_pick', 'stone_pick', 'iron_pick', 'diamond_pick',
  'wood_axe', 'stone_axe', 'iron_axe', 'wood_shovel', 'stone_shovel', 'iron_shovel',
  'wood_sword', 'stone_sword', 'iron_sword', 'diamond_sword', 'apple', 'meat',
  'raft', 'skiff', 'houseboat', 'galleon',
];

export function toolClass(item: ItemId | null): ToolClass {
  if (!item) return 'none';
  if (item.endsWith('_pick')) return 'pick';
  if (item.endsWith('_axe')) return 'axe';
  if (item.endsWith('_shovel')) return 'shovel';
  if (item.endsWith('_sword')) return 'sword';
  return 'none';
}

function tierOf(item: ItemId | null): number {
  if (!item) return 0;
  if (item.startsWith('wood_')) return 2;
  if (item.startsWith('stone_')) return 3;
  if (item.startsWith('iron_')) return 4.5;
  if (item.startsWith('diamond_')) return 7;
  return 1;
}

// Mining speed multiplier given the held item vs a block's preferred tool.
export function miningMultiplier(item: ItemId | null, block: BlockDef): number {
  const base = tierOf(item);
  if (block.prefTool && block.prefTool !== 'none' && toolClass(item) === block.prefTool) return base;
  // wrong tool: only a fraction of the tier bonus
  return Math.max(1, base * 0.4);
}

export function swordDamage(item: ItemId | null): number {
  switch (item) {
    case 'wood_sword': return 5;
    case 'stone_sword': return 7;
    case 'iron_sword': return 10;
    case 'diamond_sword': return 14;
    case 'wood_axe': case 'stone_axe': case 'iron_axe': return 6;
    default: return 3;
  }
}

export function isPlaceable(item: ItemId): boolean {
  return (item in BLOCKS) && item !== 'air' && item !== 'water';
}

// give command / textures list of every "item_" icon id
export const ITEM_ICON_IDS = [
  'stick', 'wood_pick', 'stone_pick', 'iron_pick', 'diamond_pick',
  'wood_axe', 'stone_axe', 'iron_axe', 'wood_shovel', 'stone_shovel', 'iron_shovel',
  'wood_sword', 'stone_sword', 'iron_sword', 'diamond_sword',
  'apple', 'meat', 'coal', 'iron', 'gold', 'diamond',
  'raft', 'skiff', 'houseboat', 'galleon',
];
