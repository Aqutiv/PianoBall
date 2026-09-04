/**
 * Drop whatever was scheduled from `at` onwards, without letting the parameter
 * jump back to where an earlier event had left it.
 *
 * This is all a `setTargetAtTime` needs. A target curve starts from whatever the
 * parameter is at when the curve begins, so it anchors itself wherever it is
 * put — including at a time still in the future. A ramp does not; see
 * `holdAtTime`.
 */
export function cancelFrom(param: AudioParam, at: number): void {
  const value = param.value;
  if (typeof param.cancelAndHoldAtTime === 'function') { param.cancelAndHoldAtTime(at); return; }
  // The blunt cancellation throws away a ramp that spans `at` and drops the
  // parameter back to where that ramp began, so pin it in that case.
  param.cancelScheduledValues(at);
  param.setValueAtTime(value, at);
}

/**
 * Cancel as above, and pin the parameter where it is, so that the ramp written
 * next starts from the sound that is actually there.
 *
 * The pin is the point, and the native hold does not provide it. It writes a
 * value back only where it truncates an event that is still running; once a
 * note's attack and decay have finished, the timeline is empty and it holds
 * nothing at all. A release ramp then anchors on the *last* event — the end of
 * the decay, however long ago the key went down — and so begins already spent:
 * the note is cut to silence within a sample instead of being let go, which is
 * the click. The longer the key was held, the more of the ramp is behind it.
 *
 * `at` must be now, because the pinned value is read from the parameter as it
 * stands and that is only the value at `at` if `at` is now. Anything holding a
 * parameter at a time still to come wants `cancelFrom`, which leaves the native
 * hold to work out the value there for itself.
 */
export function holdAtTime(param: AudioParam, at: number): void {
  const value = param.value;
  if (typeof param.cancelAndHoldAtTime === 'function') param.cancelAndHoldAtTime(at);
  else param.cancelScheduledValues(at);
  param.setValueAtTime(value, at);
}
