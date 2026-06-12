import { emptySlots, type Slot } from './slots';

export type ShipKind = 'raft' | 'skiff' | 'houseboat' | 'galleon';

export interface ShipCap {
  drive: boolean;
  storage: number;   // number of storage slots (0 = none)
  enter: boolean;    // has a walkable interior
}

export interface ShipDef {
  kind: ShipKind;
  name: string;
  caps: ShipCap;
  speed: number;     // drive speed (px/s)
  turn: number;      // turn rate (rad/s)
  // visual size of the outside sprite in tiles
  w: number; h: number;
  // interior dimensions in tiles (if enterable)
  interiorW?: number; interiorH?: number;
  rooms?: { name: string; x: number; y: number; w: number; h: number; color: number }[];
  color: number;
  accent: number;
}

export const SHIP_DEFS: Record<ShipKind, ShipDef> = {
  raft: {
    kind: 'raft', name: 'Raft', caps: { drive: true, storage: 0, enter: false },
    speed: 150, turn: 2.6, w: 2, h: 2, color: 0x9a6c3e, accent: 0x7a5230,
  },
  skiff: {
    kind: 'skiff', name: 'Skiff', caps: { drive: true, storage: 9, enter: false },
    speed: 135, turn: 2.2, w: 2, h: 3, color: 0xb9854e, accent: 0x8f6238,
  },
  houseboat: {
    kind: 'houseboat', name: 'Houseboat', caps: { drive: true, storage: 18, enter: true },
    speed: 105, turn: 1.6, w: 3, h: 4, color: 0xc79a5e, accent: 0x8f6238,
    interiorW: 11, interiorH: 9,
    rooms: [
      { name: 'Living Room', x: 1, y: 1, w: 6, h: 4, color: 0x8a6440 },
      { name: 'Storage', x: 7, y: 1, w: 3, h: 4, color: 0x6b4d2e },
      { name: 'Deck', x: 1, y: 5, w: 9, h: 3, color: 0x9a7450 },
    ],
  },
  galleon: {
    kind: 'galleon', name: 'Galleon', caps: { drive: true, storage: 45, enter: true },
    speed: 85, turn: 1.1, w: 4, h: 6, color: 0xa8743e, accent: 0x6e4a26,
    interiorW: 15, interiorH: 13,
    rooms: [
      { name: 'Captain Quarters', x: 1, y: 1, w: 5, h: 4, color: 0x8a6440 },
      { name: 'Cargo Hold', x: 6, y: 1, w: 8, h: 4, color: 0x6b4d2e },
      { name: 'Crew Bunks', x: 1, y: 5, w: 5, h: 4, color: 0x9a7450 },
      { name: 'Galley', x: 6, y: 5, w: 4, h: 4, color: 0x7a5733 },
      { name: 'Armory', x: 10, y: 5, w: 4, h: 4, color: 0x5c4326 },
      { name: 'Main Deck', x: 1, y: 9, w: 13, h: 3, color: 0xb9854e },
    ],
  },
};

export interface ShipInstance {
  id: string;
  kind: ShipKind;
  x: number; y: number;   // world pixel position (centre)
  angle: number;          // radians, 0 = facing right
  storage: Slot[];
}

let shipCounter = 0;
export function makeShip(kind: ShipKind, x: number, y: number): ShipInstance {
  const def = SHIP_DEFS[kind];
  return { id: 'ship_' + (shipCounter++) + '_' + Date.now().toString(36), kind, x, y, angle: -Math.PI / 2, storage: emptySlots(def.caps.storage) };
}
