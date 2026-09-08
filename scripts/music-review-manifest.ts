interface ArrangementKey { id: string; role: string }
interface RateEvidence {
  sampleRate: number;
  entries: readonly { stems: readonly { sampleRate: number }[] }[];
}

/** A filtered run must not advertise one rate for WAVs produced at another. */
export function validateReviewSampleRate(prior: RateEvidence | null, sampleRate: number): void {
  if (!prior) return;
  if (prior.sampleRate !== sampleRate || prior.entries.some(entry => entry.stems.some(stem => stem.sampleRate !== sampleRate))) {
    throw new Error('Cannot merge review manifests across sample rates; use a different supported label or an unfiltered full render.');
  }
}

/** Repeat evidence belongs to the exact retained role, not to a rewritten file. */
export function retainRepeatCheck<T extends ArrangementKey>(check: T | undefined, retained: readonly ArrangementKey[]): T | undefined {
  return check && retained.some(entry => entry.id === check.id && entry.role === check.role) ? check : undefined;
}
