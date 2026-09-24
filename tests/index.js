// Entry for `node --test tests/`: Node resolves the directory to this file, which loads every *.test.mjs.
// (`node --test tests/*.test.mjs` also works and runs each file in its own process.)
import { readdirSync } from 'node:fs';
const dir = new URL('./', import.meta.url);
for (const f of readdirSync(dir).filter(f => f.endsWith('.test.mjs')).sort()) await import(new URL(f, dir));
