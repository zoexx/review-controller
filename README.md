# review-controller

The **reviewer engine**. It consumes the [`review-dictionary`](../review-dictionary)
knowledge product and, for a given change, decides *what to look for* — then compiles
that into one organized review prompt and (optionally) runs the review.

```
diff / changed files
        │
   detect.mjs      map paths+extensions → languages + engaged layers   (+ security)
        │
   select.mjs      for each dictionary term: in scope? active? at what tier?
        │          profile promotes / demotes / floors; language-focus drops noise
        ▼
   compile.mjs     frame + terms grouped by tier + the diff  ──►  .review/compiled-prompt.md
        │                                                          ▲ the inspectable seam
   review.mjs      run the prompt against a model → findings + verdict
        ▼
   findings                                     (dry-run by default — prints the prompt)
```

Two stages on purpose:

- **compile** is deterministic assembly — golden-file testable, zero model calls.
- **review** is the single model call. Defaults to **dry-run** so the pipeline runs
  end-to-end without an API key or spend.

## The design rule

**All knowledge lives in the dictionary. All policy lives in profiles. The engine
code (`src/`) holds neither.** A selector is one of `domain:<name>`, `layer:<name>`,
or an `<id-glob>`, resolved against a term's own tags/id. `src/` never hard-codes a
domain opinion — so the reviewer stays forkable and testable, and improving a check
means editing the dictionary or a profile, never the engine.

## Profiles (policy-as-data)

A profile is the controller's answer to "focus this review." It promotes terms to
`always-on`, demotes noisy ones to `context-gated`, and sets a floor that can never be
gated off. See [`profiles/`](profiles): `default`, `payments`, `public-api`, `migration`.

```yaml
# profiles/payments.yaml
name: payments
extends: default
layers: [backend, database, security, performance]
promote: ["domain:payments", "shared.money-type-safety", "*.race*"]
demote:  ["domain:observability"]
never_off: ["domain:payments"]
```

Tiers, not on/off switches: `always-on` (safety net) · `default` (check where the diff
touches) · `context-gated` (only when a signal implicates it). A demoted term still
emits a finding if violated — priority steers attention, it does not suppress severity.

## Use

```bash
npm install
npm run sync                 # pin the dictionary bundle from ../review-dictionary/dist
npm test                     # deterministic select+compile tests

# compile a review prompt for the sample diff (dry-run prints the prompt):
node src/cli.mjs --profile payments --diff examples/sample.patch

# from a real branch diff on stdin:
git diff main...HEAD | node src/cli.mjs --profile default --diff -

# actually run the review (needs a key; makes one model call):
ANTHROPIC_API_KEY=sk-... node src/cli.mjs --profile payments --diff examples/sample.patch --run
```

### Flags

| Flag | Meaning |
| --- | --- |
| `--profile <name>` | profile in `profiles/` (default: `default`) |
| `--diff <file\|->` | unified diff from a file or stdin |
| `--files a,b,c` | explicit changed-file list instead of a diff |
| `--dictionary <path>` | dictionary bundle (default: `dictionary/dictionary.json`) |
| `--out <path>` | where to write the compiled prompt (default: `.review/compiled-prompt.md`) |
| `--run` | actually call the model (needs `ANTHROPIC_API_KEY`); otherwise dry-run |
| `--quiet` | don't echo the prompt to stdout on dry-run |

## Relationship to the dictionary

The dictionary is a standalone, shareable knowledge product with its own release
cadence. This repo **pins** a built bundle (`npm run sync` copies
`../review-dictionary/dist/dictionary.json`; in production, pin via git submodule or a
release artifact). The contract between them is the term schema — the controller reads
the bundle, never the YAML sources.
