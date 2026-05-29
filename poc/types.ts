// Shared data contracts for Phase 0 POC spikes + harness.

// ---- Component spike (POC-01) ----
export type IoKind = 'decorator' | 'signal';
export interface IoPort {
  name: string;         // class property name
  alias: string | null; // public name if aliased, else null
  kind: IoKind;
  required: boolean;    // true for input.required()/model.required(); false otherwise
}
export interface ComponentRecord {
  className: string;
  selector: string | null;
  standalone: boolean;                       // v19: true unless `standalone: false` present
  templateKind: 'inline' | 'templateUrl' | 'none';
  inputs: IoPort[];
  outputs: IoPort[];
  module: string | null;                     // NgModule class that declares it, else null
}

// ---- Routing spike (POC-02) ----
export interface LazyTarget {
  importPath: string;     // literal specifier from import('...')
  symbol: string | null;  // member name from .then(m => m.X), or null (default export / unresolved)
}
export interface RouteRecord {
  path: string | null;
  component: string | null;
  redirectTo: string | null;
  loadChildren: LazyTarget | null;
  loadComponent: LazyTarget | null;
  guards: string[];           // names only, from canActivate/canMatch/etc.
  children: RouteRecord[];
  unresolvedLazy: boolean;    // true when a load* was present but path/symbol not statically recoverable
}

// ---- Template spike (POC-03 / POC-04) ----
export type DepKind = 'resolved' | 'indirect' | 'unresolved-static';
export interface TemplateDep {
  tag: string;               // element tag or construct marker (e.g. 'ng-content', 'ngComponentOutlet')
  component: string | null;  // matched component className if resolved, else null
  kind: DepKind;
  reason: string | null;     // why indirect/unresolved (e.g. 'ng-content', 'ngTemplateOutlet')
}
export interface TemplateResult {
  deps: TemplateDep[];
  parseErrors: number;       // count from parseTemplate(...).errors; MUST be 0 to pass
}

// ---- Harness ----
export interface CaseResult {
  fixture: string;
  pass: boolean;
  notes: string;
  borderline: boolean;       // surfaced explicitly in the report
}
export interface TaskReport {
  task: 'component' | 'routing' | 'template';
  total: number;
  passed: number;
  rate: number;              // passed/total, 0..1
  cases: CaseResult[];
  // Optional per-task extra counts. The component spike sets
  // { standalonePassed, ngModulePassed } so the report can apply the
  // spec §5 component gate (≥5 correct of EACH type), not the rate band.
  meta?: Record<string, number>;
}
