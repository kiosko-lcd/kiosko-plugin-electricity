/** For the tests: a saved answer of REE's, from src/fixtures (see its README). */
import { readFileSync } from 'node:fs';

export const fixture = (name: string): unknown => JSON.parse(readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8'));
