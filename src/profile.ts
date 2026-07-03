// Load a profile (policy-as-data) and resolve `extends` inheritance.
// Profiles are the ONLY place term ids / domains / layers appear on the controller
// side — the engine code below never hard-codes a domain opinion.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { Profile, Routing } from './types.ts';

export function loadProfile(dir: string, name: string, seen = new Set<string>()): Profile {
  if (seen.has(name)) throw new Error(`profile inheritance cycle at '${name}'`);
  seen.add(name);
  const prof = (Bun.YAML.parse(readFileSync(join(dir, name + '.yaml'), 'utf8')) ?? {}) as Partial<Profile>;
  let base: Profile = { name, layers: null, promote: [], demote: [], never_off: [] };
  if (prof.extends) base = loadProfile(dir, prof.extends, seen);
  return {
    name: prof.name || name,
    layers: prof.layers ?? base.layers,
    promote: [...(base.promote || []), ...(prof.promote || [])],
    demote: [...(base.demote || []), ...(prof.demote || [])],
    never_off: [...(base.never_off || []), ...(prof.never_off || [])],
  };
}

export function loadRouting(dir: string): Routing {
  return (Bun.YAML.parse(readFileSync(join(dir, '_routing.yaml'), 'utf8')) ?? {}) as Routing;
}
