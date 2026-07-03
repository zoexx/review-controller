// Golden-ish unit test for the deterministic half of the controller: selection +
// prioritization + compile. Uses a synthetic in-memory dictionary so it runs with
// zero model calls and is independent of the real dictionary's contents.
import { test, expect } from 'bun:test';
import { selectTerms } from '../src/select.ts';
import { compilePrompt } from '../src/compile.ts';
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
  expect(ids.includes('security.idor')).toBe(true); // never_off keeps security in scope even though profile.layers=[backend]
  expect(ids.includes('frontend.layout-shift')).toBe(false); // out-of-scope frontend term is excluded

  // tier ordering: always-on terms sort before default/gated
  expect(selected[0].tier).toBe('always-on'); // always-on sorts first

  const prompt = compilePrompt({ dictionary, selected, context, profile });
  expect(prompt.includes('BASE FRAME')).toBe(true); // prompt includes base frame
  expect(prompt.includes('BACKEND FRAME')).toBe(true); // prompt includes engaged-layer frame
  expect(/## ALWAYS-ON/.test(prompt)).toBe(true); // prompt has an always-on section
  expect(prompt.includes('[backend.idempotent-retry]')).toBe(true); // prompt lists the promoted term
  expect(prompt.includes('[frontend.layout-shift]')).toBe(false); // prompt omits out-of-scope term
});
