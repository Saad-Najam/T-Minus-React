import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DataRegistry } from '../src/engine/data.js';

const dir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../public/data');
export function loadData() {
  const read = (n) => JSON.parse(fs.readFileSync(path.join(dir, `${n}.json`), 'utf8'));
  return new DataRegistry({ parts: read('parts'), rockets: read('rockets'), missions: read('missions'), codex: read('codex'), rules: read('rules'), quiz: read('quiz'), strings: read('strings') });
}
