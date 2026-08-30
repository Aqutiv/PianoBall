import type { Hud } from '../../ui/hud';
import type { Judge } from './judge';
import type { Tune } from './chart';

/** What the bed is playing, and what it moves to next. */
export interface Harmony {
  now: string | null;
  next: string | null;
}

/** Title, progress, the chord underneath, accuracy and the running tally. */
export class TuneHud {
  private titleEl!: HTMLElement;
  private subEl!: HTMLElement;
  private barEl!: HTMLElement;
  private chordEl!: HTMLElement;
  private nextEl!: HTMLElement;
  private accEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private tallyEl!: HTMLElement;
  /**
   * Whether the elements below exist yet.
   *
   * The panel belongs to the mode's time on screen, but the things that write
   * to it do not: changing role resets the title, and that can be asked for
   * before the first `enter` has built anything. Writing to nothing is the
   * right answer there — there is no panel to be wrong.
   */
  private mounted = false;

  constructor(private readonly hud: Hud) {}

  mount(): void {
    // The chord sits under the title rather than beside the accuracy: it is
    // something to play *over*, which puts it with the tune rather than with
    // the score. Freestyle's `.chord` styling already says exactly this.
    this.hud.left.innerHTML = `
      <div class="score-block">
        <div class="tune-title" id="pt-title">&nbsp;</div>
        <div class="score-sub" id="pt-sub"></div>
        <div class="tune-bar"><i id="pt-bar"></i></div>
      </div>
      <div class="score-block tune-harmony">
        <div class="chord" id="pt-chord">&nbsp;</div>
        <div class="score-sub" id="pt-next"></div>
      </div>
    `;
    this.hud.right.innerHTML = `
      <div class="accuracy" id="pt-acc">100%</div>
      <div class="mult" id="pt-combo"></div>
      <div class="tally" id="pt-tally"></div>
    `;
    const q = (sel: string) => (this.hud.left.querySelector(sel) ?? this.hud.right.querySelector(sel)) as HTMLElement;
    this.titleEl = q('#pt-title');
    this.subEl = q('#pt-sub');
    this.barEl = q('#pt-bar');
    this.chordEl = q('#pt-chord');
    this.nextEl = q('#pt-next');
    this.accEl = q('#pt-acc');
    this.comboEl = q('#pt-combo');
    this.tallyEl = q('#pt-tally');
    this.mounted = true;
  }

  setTune(tune: Tune | null): void {
    if (!this.mounted) return;
    this.titleEl.textContent = tune?.title ?? ' ';
    this.subEl.textContent = tune ? `${tune.composer} · ${tune.bpm} bpm` : 'Choose a tune';
  }

  update(judge: Judge | null, progress: number, harmony: Harmony = { now: null, next: null }): void {
    if (!this.mounted) return;
    this.barEl.style.width = `${Math.round(progress * 100)}%`;
    this.setHarmony(harmony);
    if (!judge) {
      this.accEl.textContent = '—';
      this.comboEl.textContent = '';
      this.tallyEl.innerHTML = '';
      return;
    }
    // Accuracy over what has been judged so far, not over the whole tune:
    // showing 4% two bars in would be true and useless.
    this.accEl.textContent = `${Math.round(judge.accuracySoFar * 100)}%`;
    this.comboEl.textContent = judge.combo > 2 ? `${judge.combo} in a row` : '';
    this.comboEl.style.opacity = judge.combo > 2 ? '1' : '0';
    const t = judge.tally;
    this.tallyEl.innerHTML =
      `<span class="t-perfect">${t.perfect}</span>`
      + `<span class="t-good">${t.good}</span>`
      + `<span class="t-ok">${t.ok}</span>`
      + `<span class="t-miss">${t.miss}</span>`
      // Only once there is one to show: a zero here would read as a fifth
      // thing being counted rather than as a mistake that has not happened.
      + (t.wrong ? `<span class="t-wrong">${t.wrong}</span>` : '');
  }

  private setHarmony(h: Harmony): void {
    this.chordEl.textContent = h.now ?? h.next ?? ' ';
    // A chord that has not started yet is shown in the same place, dimmed, so
    // the readout does not jump around between the count-in and the first bar.
    this.chordEl.style.opacity = h.now ? '1' : h.next ? '0.4' : '0.22';
    this.nextEl.textContent = h.now && h.next ? `next ${h.next}` : '';
  }
}
