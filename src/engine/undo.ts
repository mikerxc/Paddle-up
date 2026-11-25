import type { UndoStep } from "../model.ts";

/**
 * Reverse diff. Applying it to the next value restores the previous one.
 * Unchanged array slots are null so a score tap does not copy the skill log
 * or the rest of the session.
 */
export type Patch =
  | { t: "s"; v: unknown }
  | { t: "d" }
  | { t: "o"; v: Record<string, Patch> }
  | { t: "a"; n: number; v: Array<Patch | null> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export function diffValue(before: unknown, after: unknown): Patch | null {
  if (Object.is(before, after)) return null;
  if (Array.isArray(before) && Array.isArray(after)) {
    const items: Array<Patch | null> = [];
    let changed = before.length !== after.length;
    for (let index = 0; index < before.length; index += 1) {
      const child = diffValue(before[index], after[index]);
      items.push(child);
      if (child) changed = true;
    }
    if (!changed) return null;
    return { t: "a", n: before.length, v: items };
  }
  if (isRecord(before) && isRecord(after)) {
    const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
    const patch: Record<string, Patch> = {};
    let changed = false;
    for (const key of keys) {
      const hasBefore = Object.prototype.hasOwnProperty.call(before, key);
      const hasAfter = Object.prototype.hasOwnProperty.call(after, key);
      if (hasBefore && !hasAfter) {
        patch[key] = { t: "s", v: structuredClone(before[key]) };
        changed = true;
      } else if (!hasBefore && hasAfter) {
        patch[key] = { t: "d" };
        changed = true;
      } else {
        const child = diffValue(before[key], after[key]);
        if (child) {
          patch[key] = child;
          changed = true;
        }
      }
    }
    return changed ? { t: "o", v: patch } : null;
  }
  return { t: "s", v: structuredClone(before) };
}

export function applyPatch(current: unknown, patch: Patch): unknown {
  if (patch.t === "s") return structuredClone(patch.v);
  if (patch.t === "d") return undefined;
  if (patch.t === "o") {
    const base: Record<string, unknown> = isRecord(current) ? { ...current } : {};
    for (const [key, child] of Object.entries(patch.v)) {
      if (child.t === "d") delete base[key];
      else base[key] = applyPatch(base[key], child);
    }
    return base;
  }
  const source = Array.isArray(current) ? current : [];
  const next: unknown[] = [];
  for (let index = 0; index < patch.n; index += 1) {
    const child = patch.v[index];
    next.push(child ? applyPatch(source[index], child) : source[index]);
  }
  return next;
}

export function isUndoStep(value: unknown): value is UndoStep {
  if (!value || typeof value !== "object") return false;
  const step = value as UndoStep;
  return (step.round === null || typeof step.round === "number") && !!step.patch && typeof step.patch === "object";
}
