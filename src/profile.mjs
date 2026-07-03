// Load a profile (policy-as-data) and resolve `extends` inheritance.
// Profiles are the ONLY place term ids / domains / layers appear on the controller
// side — the engine code below never hard-codes a domain opinion.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import yaml from 'js-yaml';

export function loadProfile(dir, name, seen = new Set()) {
  if (seen.has(name)) throw new Error(`profile inheritance cycle at '${name}'`);
  seen.add(name);
  const prof = yaml.load(readFileSync(join(dir, name + '.yaml'), 'utf8')) || {};
  let base = { layers: null, promote: [], demote: [], never_off: [] };
  if (prof.extends) base = loadProfile(dir, prof.extends, seen);
  return {
    name: prof.name || name,
    layers: prof.layers ?? base.layers,
    promote: [...(base.promote || []), ...(prof.promote || [])],
    demote: [...(base.demote || []), ...(prof.demote || [])],
    never_off: [...(base.never_off || []), ...(prof.never_off || [])],
  };
}

export function loadRouting(dir) {
  return yaml.load(readFileSync(join(dir, '_routing.yaml'), 'utf8')) || {};
}
