// Minimal glob matcher — the only "matching" primitive the engine needs.
// Supports `**` (any path segments), `*` (any run of non-slash), literal rest.
// Knowledge-free: it matches strings, it knows nothing about review domains.
export function globToRegExp(glob: string): RegExp {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*') {
      if (glob[i + 1] === '*') {
        if (glob[i + 2] === '/') { re += '(?:.*/)?'; i += 2; }
        else { re += '.*'; i += 1; }
      } else {
        re += '[^/]*';
      }
    } else if ('\\^$+?.()|[]{}'.includes(c)) {
      re += '\\' + c;
    } else {
      re += c;
    }
  }
  return new RegExp('^' + re + '$');
}

export function globMatch(str: string, glob: string): boolean {
  return globToRegExp(glob).test(str);
}
