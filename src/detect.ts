// Detect review context from a diff or an explicit file list: which languages and
// which layers the change touches. Pure path/extension matching against routing
// data — no domain knowledge lives here.
import { extname } from 'node:path';
import { globMatch } from './glob.ts';
import type { Context, Layer, Routing } from './types.ts';

const EXT_LANG: Record<string, string> = {
  '.ts': 'ts', '.tsx': 'ts', '.js': 'js', '.jsx': 'js', '.mjs': 'js', '.cjs': 'js',
  '.vue': 'vue', '.svelte': 'svelte', '.py': 'py', '.rb': 'rb', '.go': 'go',
  '.java': 'java', '.kt': 'kt', '.swift': 'swift', '.cs': 'cs', '.php': 'php', '.rs': 'rs',
  '.sql': 'sql', '.prisma': 'prisma', '.css': 'css', '.scss': 'css', '.less': 'css',
  '.html': 'html', '.tf': 'tf', '.yaml': 'yaml', '.yml': 'yaml',
};

export function filesFromDiff(diffText: string): string[] {
  const files = new Set<string>();
  for (const line of diffText.split('\n')) {
    let m = line.match(/^diff --git a\/(.+) b\/(.+)$/);
    if (m) { files.add(m[2]); continue; }
    m = line.match(/^\+\+\+ b\/(.+)$/);
    if (m && m[1] !== '/dev/null') files.add(m[1].replace(/\t.*$/, ''));
  }
  return [...files];
}

export function detectContext(
  { diffText = '', files = null, routing = {} }:
    { diffText?: string; files?: string[] | null; routing?: Routing },
): Context {
  const changed = files && files.length ? files : (diffText ? filesFromDiff(diffText) : []);
  const languages = [...new Set(changed.map((f) => EXT_LANG[extname(f)]).filter(Boolean))];

  const layers = new Set<Layer>();
  for (const f of changed) {
    const ext = extname(f);
    for (const [layer, rule] of Object.entries(routing)) {
      const byExt = (rule.ext || []).includes(ext);
      const byPath = (rule.paths || []).some((g) => globMatch(f, g));
      if (byExt || byPath) layers.add(layer as Layer);
    }
  }
  layers.add('security'); // security always gets a light pass
  return { files: changed, languages, layers: [...layers], diff: diffText };
}
