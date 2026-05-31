// Shared data contracts for the Component Map Tool (Phase 1).
// Bump SCHEMA_VERSION on any shape change; a graph.json whose version != this forces a full rebuild.
export const SCHEMA_VERSION = 2;

// ---- Component I/O ----
export type IoKind = 'decorator' | 'signal';
export interface IoPort {
  name: string;          // class property name
  alias: string | null;  // public binding name if aliased, else null
  kind: IoKind;
  required: boolean;
}

// Raw extraction from the indexer (Plan 2), before graph-level fields are added.
export interface ComponentRecord {
  className: string;
  selector: string | null;
  filePath: string;                          // repo-relative, forward-slash
  standalone: boolean;                       // resolved (STND-01)
  module: string | null;                     // NgModule that declares it, else null
  templateKind: 'inline' | 'templateUrl' | 'none';
  inputs: IoPort[];
  outputs: IoPort[];
}

// Graph node: a ComponentRecord plus identity + MD-derived fields.
export interface ComponentNode extends ComponentRecord {
  id: string;                                // canonical: className, or `relPath#ClassName` on collision
  componentId: string | null;                // from MD (Plan 8), else null
  docPath: string | null;                    // linked .md path, else null
  images: { caption: string | null; path: string }[];  // representative images from MD
  description: string | null;  // from project MD 機能概要 (read-only), else null
}

// ---- Edges ----
export type DepKind = 'resolved' | 'indirect' | 'unresolved-static';
export interface Edge {
  from: string;              // ComponentNode.id
  to: string | null;         // ComponentNode.id, or null when not statically knowable
  kind: DepKind;
  via: 'template' | 'route' | 'override';
  reason: string | null;     // e.g. 'ng-content', 'ngTemplateOutlet', 'ngComponentOutlet'
}

// ---- Routes ----
export interface LazyTarget {
  importPath: string;        // literal specifier from import('...')
  symbol: string | null;     // member from .then(m => m.X), or null
}
export interface RouteNode {
  fullPath: string;          // resolved full URL path (parent segments concatenated)
  component: string | null;  // eager component class name
  redirectTo: string | null;
  loadChildren: LazyTarget | null;
  loadComponent: LazyTarget | null;
  outlet: string | null;     // named outlet, null = primary
  pathMatch: string | null;  // 'full' | 'prefix' | null
  guards: string[];
  children: RouteNode[];     // ORDER PRESERVED
}

// ---- Graph artifact ----
export interface Graph {
  schemaVersion: number;
  components: ComponentNode[];
  edges: Edge[];
  routes: RouteNode[];
}
