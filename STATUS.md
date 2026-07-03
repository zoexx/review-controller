# Status — review-controller

Built 2026-07-03. The reviewer engine over [review-dictionary](../review-dictionary).

## Verified working

`detect → select → compile → review`, end-to-end, on the 393-term dictionary:

```
$ node src/cli.mjs --profile payments --diff examples/sample.patch
profile=payments  layers=[backend,security]  languages=[ts]  terms=153 (always-on:28 default:107 gated:18)
compiled prompt → .review/compiled-prompt.md
```

On the sample payment diff, the compiled prompt correctly surfaced every planted bug:
`security.sql-injection` (template-string query), `shared.secrets-in-logs` +
`security.secrets-in-process-args` (logged auth header), `shared.unbounded-read-limit`
+ `shared.select-only-needed-columns` (`SELECT *`), `backend.idempotent-retry` (keyless
retry), and `shared.money-type-safety` (`total: number`). The security floor
(`never_off`) and the cross-layer `shared.*` terms both fired as designed.

- `npm test` — deterministic select+compile unit tests pass.
- Selection is tiered: `always-on` (safety net) → `default` → `context-gated`. Priority
  steers attention; it never suppresses a finding's severity.

## Design invariants held

- **Zero knowledge in engine code.** Every term id / domain / layer opinion lives in
  `profiles/*.yaml` (policy) or the dictionary (knowledge). `src/` only matches
  `domain:` / `layer:` / id-globs.
- **`profile.layers` filters, never expands.** Scope is what the diff touches; a profile
  can narrow and prioritize within that, not pull in untouched layers.
- **compile is deterministic** (golden-testable); **review** is the one model call
  (dry-run by default — no key, no spend).

## Profiles

`default` · `payments` · `public-api` · `migration`. Each is promote/demote/never_off
selectors over term ids/domains/layers.

## Next

- [ ] Wire a real review run: `ANTHROPIC_API_KEY=… node src/cli.mjs … --run` (uses the
      Messages API via fetch; defaults to model `claude-opus-4-8`).
- [ ] Sharpen focus further: filter `default`-tier terms by `applies_when.paths` so a
      153-term prompt shrinks to the genuinely-touched checks. (Tiering already focuses
      it; this is the next lever.)
- [ ] Add golden-file snapshots of compiled prompts per profile to `test/`.
- [ ] Optional LLM-triage compile mode (read the diff → pick/weight terms) alongside the
      current static mode.
- [ ] Real dictionary pin (git submodule / release artifact) instead of the vendored
      `dictionary/dictionary.json` copy; refresh today via `npm run sync`.
