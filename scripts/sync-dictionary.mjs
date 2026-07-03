// Pin the dictionary: copy the built bundle from a sibling review-dictionary
// checkout (or an explicit path) into ./dictionary/dictionary.json.
// In production you'd pin via git submodule or an npm/release artifact; this keeps
// the two repos decoupled while making the bundle available to the runtime.
import { copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const src = process.argv[2] || join(ROOT, '..', 'review-dictionary', 'dist', 'dictionary.json');

if (!existsSync(src)) {
  console.error(`✗ dictionary bundle not found at:\n    ${src}\n  Build it first: (cd ../review-dictionary && npm run build)`);
  process.exit(1);
}
mkdirSync(join(ROOT, 'dictionary'), { recursive: true });
copyFileSync(src, join(ROOT, 'dictionary', 'dictionary.json'));
console.log(`✓ synced dictionary ← ${src}`);
