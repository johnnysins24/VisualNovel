// Types for the Node side of the kit (reads the YAML from disk); see kit.mjs.
import type { Kit } from './core.mjs';
export * from './core.mjs';
export const ART: string;
export function readYaml(rel: string): any;
export function loadKit(): Kit;
