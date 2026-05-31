export const OVERRIDE_SCHEMA_VERSION = 1;

export interface DynamicDep {
  target: string;
  reason?: string;
  stale?: boolean;
  waived?: boolean;   // intentionally dynamic — no static target; counts as covered, yields no edge
}
export interface CmapOverride {
  schemaVersion: number;
  componentId: string;
  dynamicDeps: DynamicDep[];
  notes?: string[];
}

export type ValidateResult =
  | { ok: true; value: CmapOverride }
  | { ok: false; errors: string[] };

export function validate(parsed: unknown): ValidateResult {
  if (typeof parsed !== 'object' || parsed === null) return { ok: false, errors: ['not an object'] };
  const o = parsed as Record<string, unknown>;
  const errors: string[] = [];
  if (typeof o.schemaVersion !== 'number') errors.push('schemaVersion must be a number');
  if (typeof o.componentId !== 'string' || o.componentId.length === 0) errors.push('componentId must be a non-empty string');
  if (!Array.isArray(o.dynamicDeps)) {
    errors.push('dynamicDeps must be an array');
  } else {
    o.dynamicDeps.forEach((d, i) => {
      if (typeof d !== 'object' || d === null || typeof (d as Record<string, unknown>).target !== 'string') {
        errors.push(`dynamicDeps[${i}].target must be a string`);
      }
    });
  }
  return errors.length ? { ok: false, errors } : { ok: true, value: parsed as CmapOverride };
}
