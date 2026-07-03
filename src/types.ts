// Shared shapes for the controller. These describe the data the engine reads
// (dictionary terms, profiles, detected context) — they encode no domain opinion,
// only the structure the pure logic operates over.

export type Layer =
  | 'frontend'
  | 'backend'
  | 'database'
  | 'security'
  | 'mobile'
  | 'infra'
  | 'performance';

export type Tier = 'always-on' | 'default' | 'context-gated';

export type Severity = 'blocking' | 'important' | 'nit' | 'suggestion';

export interface TermExample {
  lang?: string;
  before?: string;
  after?: string;
}

export interface Term {
  id: string;
  title: string;
  tags: {
    layers: Layer[];
    domains?: string[];
  };
  default_tier: Tier;
  severity_ceiling: Severity;
  smell: string;
  why: string;
  fix: string;
  applies_when?: {
    languages?: string[];
    paths?: string[];
    signals?: string[];
  };
  example?: TermExample;
}

export interface Dictionary {
  dictionaryVersion: string;
  frames?: Record<string, string>;
  terms: Term[];
}

export interface Profile {
  name: string;
  extends?: string;
  layers?: Layer[] | null;
  promote: string[];
  demote: string[];
  never_off: string[];
}

export interface RoutingRule {
  ext?: string[];
  paths?: string[];
}

export type Routing = Record<string, RoutingRule>;

export interface Context {
  files: string[];
  languages: string[];
  layers: Layer[];
  diff: string;
}

export interface Selected {
  term: Term;
  tier: Tier;
}
