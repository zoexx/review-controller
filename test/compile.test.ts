// Golden-ish unit test for the deterministic half of the controller: selection +
// prioritization + compile. Uses a synthetic in-memory dictionary so it runs with
// zero model calls and is independent of the real dictionary's contents.
import { test, expect } from 'bun:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { selectTerms, resolveScope } from '../src/select.ts';
import { compilePrompt } from '../src/compile.ts';
import { loadDictionary } from '../src/dictionary.ts';
import { loadProfile, loadRouting } from '../src/profile.ts';
import { detectContext } from '../src/detect.ts';
import type { Context, Dictionary, Profile } from '../src/types.ts';

const dictionary: Dictionary = {
  dictionaryVersion: '0.0.0-test',
  frames: { _base: 'BASE FRAME', backend: 'BACKEND FRAME' },
  terms: [
    { id: 'backend.idempotent-retry', title: 'Idempotency key', tags: { layers: ['backend'], domains: ['payments'] }, default_tier: 'default', severity_ceiling: 'blocking', smell: 'retry without key', why: 'double charge on timeout', fix: 'thread idempotency key', applies_when: { languages: ['ts'] } },
    { id: 'backend.log-levels', title: 'Correct log levels', tags: { layers: ['backend'], domains: ['observability'] }, default_tier: 'default', severity_ceiling: 'nit', smell: 'wrong level', why: 'noisy alerts', fix: 'fix the level', applies_when: { languages: ['ts'] } },
    { id: 'frontend.layout-shift', title: 'No layout shift', tags: { layers: ['frontend'], domains: ['perf'] }, default_tier: 'default', severity_ceiling: 'important', smell: 'img without dims', why: 'CLS jank', fix: 'set width/height' },
    { id: 'security.idor', title: 'Ownership check', tags: { layers: ['security'], domains: ['authz', 'data-loss'] }, default_tier: 'always-on', severity_ceiling: 'blocking', smell: 'fetch by id, no owner check', why: 'any user reads any record', fix: 'scope query to session user' },
  ],
};

const profile: Profile = {
  name: 'payments',
  layers: ['backend'],
  promote: ['domain:payments'],
  demote: ['domain:observability'],
  never_off: ['layer:security', 'domain:data-loss'],
};

const context: Context = { files: ['api/checkout.ts'], languages: ['ts'], layers: ['backend', 'security'], diff: '+ await charge()' };

test('controller select + compile (4 terms, payments profile)', () => {
  const selected = selectTerms(dictionary, profile, context);
  const tierOf = (id: string) => selected.find((s) => s.term.id === id)?.tier;
  const ids = selected.map((s) => s.term.id);

  expect(tierOf('backend.idempotent-retry')).toBe('always-on'); // payments term is promoted to always-on
  expect(tierOf('backend.log-levels')).toBe('context-gated'); // observability term is demoted
  expect(ids.includes('security.idor')).toBe(true); // security is always swept (resolveScope keeps it even though profile.layers=[backend])
  expect(ids.includes('frontend.layout-shift')).toBe(false); // out-of-scope frontend term is excluded — never_off does not admit it

  // Core invariant: every selected term carries at least one in-scope layer.
  // never_off floors tiers WITHIN scope; it must never expand scope to admit a
  // term whose layers are all out of scope.
  const scope = resolveScope(profile, context);
  for (const s of selected) {
    expect(s.term.tags.layers.some((l) => scope.includes(l))).toBe(true);
  }

  // tier ordering: always-on terms sort before default/gated
  expect(selected[0].tier).toBe('always-on'); // always-on sorts first

  const prompt = compilePrompt({ dictionary, selected, context, profile });
  expect(prompt.includes('BASE FRAME')).toBe(true); // prompt includes base frame
  expect(prompt.includes('BACKEND FRAME')).toBe(true); // prompt includes engaged-layer frame
  expect(/## ALWAYS-ON/.test(prompt)).toBe(true); // prompt has an always-on section
  expect(prompt.includes('[backend.idempotent-retry]')).toBe(true); // prompt lists the promoted term
  expect(prompt.includes('[frontend.layout-shift]')).toBe(false); // prompt omits out-of-scope term
});

// Regression test against the REAL pinned dictionary + real profiles, on the sample
// payments diff. Guards the never_off scope-fix: before it, a cross-cutting
// never_off domain (domain:data-loss, domain:payments) dragged 48 out-of-scope-layer
// terms (mobile/infra/performance/database) into a backend+security review, inflating
// the prompt to 153 terms. After the fix, scope is the sole admission gate.
const ROOT = join(import.meta.dir, '..');

test('payments/sample-diff selects only in-scope-layer terms and rides the credential-leak check in always-on', () => {
  const dictionary = loadDictionary(join(ROOT, 'dictionary', 'dictionary.json'));
  const routing = loadRouting(join(ROOT, 'profiles'));
  const profile = loadProfile(join(ROOT, 'profiles'), 'payments');
  const diffText = readFileSync(join(ROOT, 'examples', 'sample.patch'), 'utf8');
  const context = detectContext({ diffText, files: null, routing });
  const scope = resolveScope(profile, context);
  const selected = selectTerms(dictionary, profile, context);
  const tierOf = (id: string) => selected.find((s) => s.term.id === id)?.tier;

  // The security layer is always swept.
  expect(scope).toContain('security');

  // The fix's core invariant: no selected term has a layer set disjoint from scope.
  // (This is what a cross-cutting never_off selector used to violate.)
  const offenders = selected.filter((s) => !s.term.tags.layers.some((l) => scope.includes(l)));
  expect(offenders.map((s) => s.term.id)).toEqual([]);

  // Regression anchor: the cut took the prompt from 153 to 105 terms. Tracks the
  // pinned bundle — a deliberate `bun run sync` that changes term counts updates it.
  expect(selected.length).toBe(105);

  // All five planted-bug catchers survive the cut; the logged-Authorization-header
  // check rides in the always-on floor instead of being buried in default by the
  // payments profile's observability demote.
  expect(tierOf('security.sql-injection')).toBe('always-on');
  expect(tierOf('backend.idempotent-retry')).toBe('always-on');
  expect(tierOf('shared.money-type-safety')).toBe('always-on');
  expect(tierOf('shared.secrets-in-logs')).toBe('always-on');
  expect(tierOf('shared.select-only-needed-columns')).toBe('default');
  expect(tierOf('shared.unbounded-read-limit')).toBe('default');
});
