/**
 * A bar-and-beat clock riding the audio clock.
 *
 * The game clock is driven by requestAnimationFrame and multiplied by
 * slow-motion; the audio clock is a hardware sample counter. They drift, so
 * every timing decision in PlayTune is made against this and never against
 * `performance.now()`.
 */
export class Transport {
  bpm = 96;
  beatsPerBar = 4;
  /**
   * Seconds subtracted from the moment a press is judged.
   *
   * Output latency means the note the player hears has already happened by the
   * time it reaches the speakers, so a player in time with what they hear lands
   * consistently late. Subtracting pulls the press back to where they meant it.
   *
   * The direction follows from that: **raising the offset compensates for
   * landing late**, lowering it for landing early. Both the device's own
   * reported latency and the manual trim mean the same thing, which is why they
   * simply add.
   */
  offset = 0;
  running = false;

  /** Audio time of beat 0. Count-in beats are negative. */
  private zero = 0;

  get beatSeconds(): number { return 60 / this.bpm; }
  get barSeconds(): number { return this.beatSeconds * this.beatsPerBar; }

  /** Start such that beat 0 falls `countIn` beats after `now`. */
  start(now: number, countIn = 4): void {
    this.zero = now + countIn * this.beatSeconds;
    this.running = true;
  }

  stop(): void { this.running = false; }

  /** Beat position at an audio time. Negative during the count-in. */
  beatAt(now: number): number {
    return (now - this.zero) / this.beatSeconds;
  }

  /** Audio time a beat falls on. */
  timeOf(beat: number): number {
    return this.zero + beat * this.beatSeconds;
  }

  /** When the player pressed, in chart time. */
  judgeTime(now: number): number {
    return now - this.offset;
  }
}
