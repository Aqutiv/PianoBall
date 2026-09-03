/**
 * Cancel future automation without jumping the parameter back to an earlier
 * scheduled value. Older Web Audio implementations do not expose the native
 * hold operation, so capture the value before cancelling and pin it back at
 * the same audio time in that case.
 */
export function holdAtTime(param: AudioParam, at: number): void {
  const value = param.value;
  if (typeof param.cancelAndHoldAtTime === 'function') {
    param.cancelAndHoldAtTime(at);
    return;
  }
  param.cancelScheduledValues(at);
  param.setValueAtTime(value, at);
}
