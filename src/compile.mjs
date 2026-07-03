// Compile the selected terms + the layer frames + the diff into one organized
// review prompt. This is deterministic assembly — the inspectable seam. The prompt
// it emits is the artifact you debug when a review misses something: term absent =>
// selection bug here; term present but ignored => a reviewer/model issue.
import { resolveScope } from './select.mjs';

const SEV = { blocking: 'blocking', important: 'important', nit: 'nit', suggestion: 'suggestion' };
const oneLine = (x) => String(x ?? '').replace(/\s+/g, ' ').trim();

function renderTerm({ term }, withExample) {
  const out = [
    `- [${term.id}] ${term.title}`,
    `    smell: ${oneLine(term.smell)}`,
    `    why:   ${oneLine(term.why)}  (ceiling: ${SEV[term.severity_ceiling]})`,
    `    fix:   ${oneLine(term.fix)}`,
  ];
  if (withExample && term.example && (term.example.before || term.example.after)) {
    if (term.example.before) out.push(`    before: ${oneLine(term.example.before)}`);
    if (term.example.after) out.push(`    after:  ${oneLine(term.example.after)}`);
  }
  return out.join('\n');
}

export function compilePrompt({ dictionary, selected, context, profile }) {
  const engaged = resolveScope(profile, context);
  const frames = [dictionary.frames?._base].filter(Boolean);
  for (const l of engaged) if (dictionary.frames?.[l]) frames.push(dictionary.frames[l]);

  const byTier = { 'always-on': [], default: [], 'context-gated': [] };
  for (const s of selected) byTier[s.tier].push(s);

  const L = [];
  L.push('# Code review — compiled by review-controller');
  L.push(`# profile: ${profile.name} · layers: ${engaged.join('·')} · languages: ${context.languages.join(',') || 'n/a'} · terms: ${selected.length} · dictionary v${dictionary.dictionaryVersion}`);
  L.push('');
  L.push('You are a senior reviewer. Apply the frame below, then review the change against the selected terms. A term is a check to run, not a finding — only report it where the code actually violates it. Never exceed a term\'s severity ceiling.');
  L.push('');
  L.push('## FRAME');
  L.push(frames.join('\n\n---\n\n'));
  L.push('');

  const section = (title, arr, withExample) => {
    if (!arr.length) return;
    L.push(`## ${title} (${arr.length})`);
    for (const t of arr) L.push(renderTerm(t, withExample));
    L.push('');
  };
  section('ALWAYS-ON — check these no matter what', byTier['always-on'], true);
  section('DEFAULT — check where the diff touches', byTier.default, false);
  section('CONTEXT-GATED — only if the change clearly implicates them', byTier['context-gated'], false);

  L.push('## CHANGE UNDER REVIEW');
  if (context.files.length) L.push(`Changed files: ${context.files.join(', ')}`);
  L.push('');
  L.push('```diff');
  L.push(context.diff || '(no diff provided)');
  L.push('```');
  L.push('');
  L.push('## OUTPUT');
  L.push('Emit each finding as: <severity> [layer] file:line — finding. Why: <concrete impact>. Fix: <concrete change>.');
  L.push('Group findings by severity (blocking first). Close with one verdict: approve · approve with comments · request changes · block.');
  return L.join('\n');
}
