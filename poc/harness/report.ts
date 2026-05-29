import { multisetEqual } from './diff.js';
import type { CaseResult, TaskReport } from '../types.js';

// parseErrors defaults 0 for spikes (component/routing) that don't parse templates.
export function scoreCase(
  fixture: string,
  actual: unknown,
  expected: unknown,
  parseErrors = 0,
): CaseResult {
  if (parseErrors > 0) {
    return { fixture, pass: false, notes: `parse error: ${parseErrors} error(s) from parseTemplate`, borderline: false };
  }
  const pass = multisetEqual(actual, expected);
  return {
    fixture,
    pass,
    notes: pass ? 'ok' : 'mismatch: actual != expected',
    borderline: false,
  };
}

export function scoreTask(task: TaskReport['task'], cases: CaseResult[]): TaskReport {
  const total = cases.length;
  const passed = cases.filter((c) => c.pass).length;
  return { task, total, passed, rate: total === 0 ? 0 : passed / total, cases };
}
