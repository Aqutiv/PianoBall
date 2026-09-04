/**
 * Pin a parameter where it is and drop whatever was scheduled after it, so that
 * the ramp written next starts from the sound that is actually there.
 *
 * The pin is the point, and the native hold does not provide it. It only writes
 * a value back when it truncates an event that is still running; once a note's
 * attack and decay have finished, the timeline is empty and it holds nothing at
 * all. A release ramp then anchors on the *last* event — the end of the decay,
 * however long ago the key went down — and so begins already spent: the note is
 * cut to silence within a sample instead of being let go, which is the click.
 * The longer the key was held, the more of the ramp is already behind it.
 *
 * `at` is meant to be now. The cancellation still wants the native operation
 * where there is one, because the blunt one throws away a ramp that spans `at`
 * and drops the parameter back to where that ramp began.
 */
export function holdAtTime(param: AudioParam, at: number): void {
  const value = param.value;
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else param.cancelScheduledValues(at);
  param.setValueAtTime(value, at);
}
