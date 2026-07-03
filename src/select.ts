// Selection + prioritization — the heart of the controller.
// Given the dictionary, a resolved profile, and the detected context, decide which
// terms are active and at what tier. Pure logic over data: a selector is one of
//   domain:<name>  layer:<name>  <id-glob>
// and the engine resolves it against the term's own tags/id. It never encodes a
// domain opinion of its own — those all live in the profile (policy) or the
// dictionary (knowledge).
import { globMatch } from './glob.ts';
import type { Context, Dictionary, Layer, Profile, Selected, Severity, Term, Tier } from './types.ts';

const TIER_RANK: Record<Tier, number> = { 'context-gated': 0, default: 1, 'always-on': 2 };
const SEV_RANK: Record<Severity, number> = { blocking: 0, important: 1, nit: 2, suggestion: 3 };

function matchSelector(term: Term, sel: string): boolean {
  if (sel.startsWith('domain:')) return (term.tags.domains || []).includes(sel.slice(7));
  if (sel.startsWith('layer:')) return term.tags.layers.includes(sel.slice(6) as Layer);
  return globMatch(term.id, sel);
}
const matchesAny = (term: Term, sels: string[] | undefined): boolean =>
  (sels || []).some((s) => matchSelector(term, s));

// Scope = the layers the DIFF touches. A profile's `layers` is a FILTER (review only
// these of the touched layers), never an expander — you can't review a layer that
// isn't in the diff. If the filter would exclude everything touched, it's a mismatch
// for this diff and is ignored.
export function resolveScope(profile: Profile, context: Context): Layer[] {
  const detected = context.layers;
  const layers = profile.layers;
  if (layers && layers.length) {
    const filtered = detected.filter((l) => layers.includes(l));
    return filtered.length ? filtered : detected;
  }
  return detected;
}

export function selectTerms(dictionary: Dictionary, profile: Profile, context: Context): Selected[] {
  const scope = resolveScope(profile, context);
  const selected: Array<Selected & { reasons: string[] }> = [];

  for (const term of dictionary.terms) {
    const inScope = term.tags.layers.some((l) => scope.includes(l));
    const forced = matchesAny(term, profile.never_off);
    if (!inScope && !forced) continue;

    let tier: Tier = term.default_tier;
    const reasons: string[] = [];
    if (matchesAny(term, profile.demote)) { tier = 'context-gated'; reasons.push('profile:demote'); }
    if (matchesAny(term, profile.promote)) { tier = 'always-on'; reasons.push('profile:promote'); }
    if (forced && TIER_RANK[tier] < TIER_RANK.default) { tier = 'default'; reasons.push('profile:never_off floor'); }

    // Language focus: a term whose declared languages don't overlap the diff's
    // languages is dropped — unless it's always-on (the safety net) or never_off.
    const langs = term.applies_when?.languages;
    const langMismatch =
      langs && langs.length && context.languages.length && !langs.some((l) => context.languages.includes(l));
    if (tier !== 'always-on' && langMismatch && !forced) continue;

    selected.push({ term, tier, reasons });
  }

  selected.sort(
    (a, b) =>
      TIER_RANK[b.tier] - TIER_RANK[a.tier] ||
      SEV_RANK[a.term.severity_ceiling] - SEV_RANK[b.term.severity_ceiling] ||
      a.term.id.localeCompare(b.term.id),
  );
  return selected;
}
