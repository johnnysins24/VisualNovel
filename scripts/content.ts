import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { ContentSchema, type Content } from '../src/engine/schema';

function loadDir(dir: string): unknown[] {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'))
    .sort()
    .flatMap((f) => (parse(readFileSync(join(dir, f), 'utf8')) as unknown[]) ?? []);
}

export function loadContent(root = 'content'): Content {
  return ContentSchema.parse({
    events: loadDir(join(root, 'events')),
    items: loadDir(join(root, 'items')),
  });
}
