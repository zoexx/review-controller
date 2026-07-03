// Golden-ish unit test for the deterministic half of the controller: selection +
// prioritization + compile. Uses a synthetic in-memory dictionary so it runs with
// zero model calls and is independent of the real dictionary's contents.
import assert from 'node:assert';
import { selectTerms } from '../src/select.mjs';
import { compilePrompt } from '../src/compile.mjs';

const dictionary = {
  dictionaryVersion: '0.0.0-test',
  frames: { _base: 'BASE FRAME', backend: 'BACKEND FRAME' },
  terms: [
    { id: 'backend.idempotent-retry', title: 'Idempotency key', tags: { layers: ['backend'], domains: ['payments'] }, default_tier: 'default', severity_ceiling: 'blocking', smell: 'retry without key', why: 'double charge on timeout', fix: 'thread idempotency key', applies_when: { languages: ['ts'] } },
    { id: 'backend.log-levels', title: 'Correct log levels', tags: { layers: ['backend'], domains: ['observability'] }, default_tier: 'default', severity_ceiling: 'nit', smell: 'wrong level', why: 'noisy alerts', fix: 'fix the level', applies_when: { languages: ['ts'] } },
    { id: 'frontend.layout-shift', title: 'No layout shift', tags: { layers: ['frontend'], domains: ['perf'] }, default_tier: 'default', severity_ceiling: 'important', smell: 'img without dims', why: 'CLS jank', fix: 'set width/height' },
    { id: 'security.idor', title: 'Ownership check', tags: { layers: ['security'], domains: ['authz', 'data-loss'] }, default_tier: 'always-on', severity_ceiling: 'blocking', smell: 'fetch by id, no owner check', why: 'any user reads any record', fix: 'scope query to session user' },
  ],
};

const profile = {
  name: 'payments',
  layers: ['backend'],
  promote: ['domain:payments'],
  demote: ['domain:observability'],
  never_off: ['layer:security', 'domain:data-loss'],
};

const context = { files: ['api/checkout.ts'], languages: ['ts'], layers: ['backend', 'security'], diff: '+ await charge()' };

const selected = selectTerms(dictionary, profile, context);
const tierOf = (id) => selected.find((s) => s.term.id === id)?.tier;
const ids = selected.map((s) => s.term.id);

assert.equal(tierOf('backend.idempotent-retry'), 'always-on', 'payments term is promoted to always-on');
assert.equal(tierOf('backend.log-levels'), 'context-gated', 'observability term is demoted');
assert.ok(ids.includes('security.idor'), 'never_off keeps security in scope even though profile.layers=[backend]');
assert.ok(!ids.includes('frontend.layout-shift'), 'out-of-scope frontend term is excluded');

// tier ordering: always-on terms sort before default/gated
assert.ok(selected[0].tier === 'always-on', 'always-on sorts first');

const prompt = compilePrompt({ dictionary, selected, context, profile });
assert.ok(prompt.includes('BASE FRAME'), 'prompt includes base frame');
assert.ok(prompt.includes('BACKEND FRAME'), 'prompt includes engaged-layer frame');
assert.ok(/## ALWAYS-ON/.test(prompt), 'prompt has an always-on section');
assert.ok(prompt.includes('[backend.idempotent-retry]'), 'prompt lists the promoted term');
assert.ok(!prompt.includes('[frontend.layout-shift]'), 'prompt omits out-of-scope term');

console.log('✓ controller select + compile tests pass (4 terms, payments profile)');
