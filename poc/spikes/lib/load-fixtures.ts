import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface FixturePair<E> {
  name: string;          // base name without extension
  sourcePath: string;    // absolute path to the .ts/.html source
  expected: E;           // parsed expected.json
}

// Pairs every `<name>.<ext>` with `<name>.expected.json` in `dir`.
export function loadFixtures<E>(dir: string, sourceExt: string): FixturePair<E>[] {
  const files = readdirSync(dir);
  const sources = files.filter((f) => f.endsWith(sourceExt) && !f.endsWith('.expected.json'));
  return sources.map((src) => {
    const name = src.slice(0, -sourceExt.length);
    const expectedFile = join(dir, `${name}.expected.json`);
    const expected = JSON.parse(readFileSync(expectedFile, 'utf8')) as E;
    return { name, sourcePath: join(dir, src), expected };
  });
}
