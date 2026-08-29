import { clamp } from '../../core/math';
import { MAX_LEAD_BEATS, MIN_LEAD_BEATS } from './settings';

/**
 * Tempo above which a beat stops being allowed to shrink the approach.
 *
 * `leadBeats` is a count of beats, so without this the tempo decides how much
 * real time a player gets to read a note: at four beats the library ranged from
 * Gymnopedie's 4.0s down to Jesu, Joy's 1.36s — the least warning going to the
 * densest charts, which is backwards. Reading a note and moving a finger costs
 * about the same wherever the tune sits.
 *
 * 120 rather than something rounder: more lead on a quick chart means more
 * notes on screen at once, and the two trade directly. Measured over the
 * library at four beats, 120 is the lowest cap at which no tune puts more than
 * the eight simultaneous onsets Canon in D already asks to be read — so this
 * never draws a picture the game had not already shipped. At 100, Minuet in G
 * reaches ten, which is a busier screen than anything in the game, at
 * difficulty 4.
 */
export const APPROACH_BPM_CAP = 120;

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

  /**
   * Seconds of approach `leadBeats` buys at this tempo.
   *
   * Purely a display quantity: it is how far ahead an aura is drawn, and it
   * touches nothing that is judged. `beatSeconds`, `timeOf`, `beatAt` and
   * `judgeTime` are all untouched by the cap, so the chart, the hit windows,
   * the count-in and the bed run at the tune's real tempo.
   *
   * Still multiplied by the setting rather than floored at a flat number of
   * seconds, because a floor would collapse three, four and six beats onto the
   * same value on a quick tune and quietly retire the control.
   */
  approachSeconds(leadBeats: number): number {
    return clamp(leadBeats, MIN_LEAD_BEATS, MAX_LEAD_BEATS)
      * Math.max(this.beatSeconds, 60 / APPROACH_BPM_CAP);
  }

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
