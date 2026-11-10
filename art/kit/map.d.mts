// Types for the test suite (the map kit itself is plain JS run by Node).
export interface MapPlace { id: string; th?: string; tag?: string; at: [number, number]; sprite?: string; label?: unknown; [k: string]: unknown }
export interface MapData { world: Record<string, any>; places: MapPlace[]; sprites: Record<string, string>; legend: Record<string, string>; materials: Record<string, any>; times: Record<string, any> }
export interface MapLabel { id: string; th: string; cls: string; x: number; y: number; tag?: string; at?: [number, number] }
export interface BuiltMap { W: number; H: number; mat: Int16Array; lvl: Float32Array; names: string[]; labels: MapLabel[]; land: Uint8Array; routes: unknown[]; obstacles: number[][] }
export function loadMap(): MapData;
export function buildMap(M: MapData): BuiltMap;
export function paintMap(M: MapData, B: BuiltMap, time?: string): { w: number; h: number; rgba: Uint8ClampedArray };
