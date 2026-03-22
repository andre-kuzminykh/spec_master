/**
 * ID generator for canonical model entities.
 * Produces hierarchical IDs like FTR-001, USR-001-001, FLW-001-001-001, etc.
 */

const counters: Record<string, number> = {};

export function resetCounters(): void {
  for (const key of Object.keys(counters)) {
    delete counters[key];
  }
}

function nextCounter(prefix: string): number {
  counters[prefix] = (counters[prefix] || 0) + 1;
  return counters[prefix];
}

function pad(n: number): string {
  return String(n).padStart(3, '0');
}

export function featureId(): string {
  return `FTR-${pad(nextCounter('FTR'))}`;
}

export function storyId(featureId: string): string {
  const key = `USR-${featureId}`;
  return `USR-${featureId.replace('FTR-', '')}-${pad(nextCounter(key))}`;
}

export function flowId(storyId: string): string {
  const key = `FLW-${storyId}`;
  return `FLW-${storyId.replace('USR-', '')}-${pad(nextCounter(key))}`;
}

export function useCaseId(flowId: string): string {
  const key = `UC-${flowId}`;
  return `UC-${flowId.replace('FLW-', '')}-${pad(nextCounter(key))}`;
}

export function frId(useCaseId: string): string {
  const key = `FR-${useCaseId}`;
  return `FR-${useCaseId.replace('UC-', '')}-${pad(nextCounter(key))}`;
}

export function nfrId(useCaseId: string): string {
  const key = `NFR-${useCaseId}`;
  return `NFR-${useCaseId.replace('UC-', '')}-${pad(nextCounter(key))}`;
}
