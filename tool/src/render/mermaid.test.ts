import { describe, it, expect } from 'vitest';
import { toMermaid } from './mermaid.js';
import type { FocusedSubgraph } from './subgraph.js';

const sub: FocusedSubgraph = {
  nodes: [
    { id: 'T', label: 'T', kind: 'target', title: 'src/T.ts' },
    { id: 'A', label: 'A', kind: 'ancestor', title: 'src/A.ts' },
    { id: 'route:/x', label: '/x', kind: 'route', title: '' },
  ],
  edges: [
    { from: 'A', to: 'T', dynamic: false },
    { from: 'route:/x', to: 'A', dynamic: true },
  ],
};

describe('toMermaid', () => {
  it('emits a deterministic flowchart with classed nodes and styled edges', () => {
    const out = toMermaid(sub);
    expect(out.startsWith('flowchart TD')).toBe(true);
    expect(out).toContain(':::target');
    expect(out).toContain('-->');        // resolved
    expect(out).toContain('-.->');       // dynamic
    expect(out).toContain('classDef target');
    expect(out).not.toMatch(/route:\/x\b/);   // sanitized ids (no slashes/colons in tokens)
    expect(toMermaid(sub)).toBe(out);    // deterministic
  });
});
