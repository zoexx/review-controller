#!/usr/bin/env bun
// review-controller — the whole function acting as a reviewer.
//   detect context → select+prioritize terms → compile prompt → (optionally) review
//
// Usage:
//   bun run src/cli.ts --profile payments --diff examples/sample.patch
//   git diff main...HEAD | bun run src/cli.ts --profile default --diff -
//   bun run src/cli.ts --profile migration --files migrations/003.sql --run
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadDictionary } from './dictionary.ts';
import { loadProfile, loadRouting } from './profile.ts';
import { detectContext } from './detect.ts';
import { selectTerms, resolveScope } from './select.ts';
import { compilePrompt } from './compile.ts';
import { runReview } from './review.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const argv = process.argv.slice(2);
function arg<T extends string | null>(name: string, def: T): string | T {
  const i = argv.indexOf(name);
  return i >= 0 ? argv[i + 1] : def;
}
const has = (name: string): boolean => argv.includes(name);

const profileName = arg('--profile', 'default');
const diffPath = arg('--diff', null);
const filesArg = arg('--files', null);
const dictPath = arg('--dictionary', join(ROOT, 'dictionary', 'dictionary.json'));
const outPath = arg('--out', join(ROOT, '.review', 'compiled-prompt.md'));
const doRun = has('--run');
const quiet = has('--quiet');

if (!existsSync(dictPath)) {
  console.error(`[fail] no dictionary bundle at ${dictPath}\n  build it in review-dictionary (npm run build), then: npm run sync`);
  process.exit(1);
}

const dictionary = loadDictionary(dictPath);
const routing = loadRouting(join(ROOT, 'profiles'));
const profile = loadProfile(join(ROOT, 'profiles'), profileName);

let diffText = '';
if (diffPath === '-') diffText = readFileSync(0, 'utf8');
else if (diffPath) diffText = readFileSync(diffPath, 'utf8');
const files = filesArg ? filesArg.split(',').map((s) => s.trim()).filter(Boolean) : null;

const context = detectContext({ diffText, files, routing });
const selected = selectTerms(dictionary, profile, context);
const prompt = compilePrompt({ dictionary, selected, context, profile });

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, prompt + '\n');

const tiers = selected.reduce<Record<string, number>>((a, s) => {
  a[s.tier] = (a[s.tier] || 0) + 1;
  return a;
}, {});
const scope = resolveScope(profile, context);
console.error(
  `profile=${profile.name}  layers=[${scope.join(',')}]  languages=[${context.languages.join(',') || 'n/a'}]  ` +
  `terms=${selected.length} (always-on:${tiers['always-on'] || 0} default:${tiers.default || 0} gated:${tiers['context-gated'] || 0})`,
);
console.error(`compiled prompt → ${outPath}`);

const result = await runReview(prompt, { run: doRun });
if (result.mode.startsWith('dry-run')) {
  if (!quiet) { console.error(`\n(${result.mode}) compiled prompt follows:\n`); console.log(prompt); }
} else {
  console.error(`\n(review via ${result.model})\n`);
  console.log(result.findings);
}
