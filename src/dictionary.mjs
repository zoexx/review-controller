// Load the pinned dictionary bundle (dist/dictionary.json from review-dictionary).
// Pure JSON — no YAML dependency on the runtime review path.
import { readFileSync } from 'node:fs';

export function loadDictionary(path) {
  const bundle = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(bundle.terms)) throw new Error(`${path}: not a dictionary bundle (missing terms[])`);
  return bundle;
}
