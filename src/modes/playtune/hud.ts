import type { Hud } from '../../ui/hud';
import type { Judge } from './judge';
import type { Tune } from './chart';

/** Title, progress, accuracy and the running tally. */
export class TuneHud {
  private titleEl!: HTMLElement;
  private subEl!: HTMLElement;
  private barEl!: HTMLElement;
  private accEl!: HTMLElement;
  private comboEl!: HTMLElement;
  private tallyEl!: HTMLElement;

  constructor(private readonly hud: Hud) {}

  mount(): void {
    this.hud.left.innerHTML = `
      <div class="score-block">
        <div class="tune-title" id="pt-title">&nbsp;</div>
        <div class="score-sub" id="pt-sub"></div>
        <div class="tune-bar"><i id="pt-bar"></i></div>
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
    this.accEl = q('#pt-acc');
    this.comboEl = q('#pt-combo');
    this.tallyEl = q('#pt-tally');
  }

  setTune(tune: Tune | null): void {
    this.titleEl.textContent = tune?.title ?? ' ';
    this.subEl.textContent = tune ? `${tune.composer} · ${tune.bpm} bpm` : 'Choose a tune';
  }

  update(judge: Judge | null, progress: number): void {
    this.barEl.style.width = `${Math.round(progress * 100)}%`;
    if (!judge) {
      this.accEl.textContent = '—';
      this.comboEl.textContent = '';
      this.tallyEl.innerHTML = '';
      return;
    }
    // Accuracy over what has been judged so far, not over the whole tune:
    // showing 4% two bars in would be true and useless.
    const seen = judge.judged;
    const acc = seen ? (judge.accuracy * judge.total) / seen : 1;
    this.accEl.textContent = `${Math.round(acc * 100)}%`;
    this.comboEl.textContent = judge.combo > 2 ? `${judge.combo} in a row` : '';
    this.comboEl.style.opacity = judge.combo > 2 ? '1' : '0';
    const t = judge.tally;
    this.tallyEl.innerHTML =
      `<span class="t-perfect">${t.perfect}</span>`
      + `<span class="t-good">${t.good}</span>`
      + `<span class="t-ok">${t.ok}</span>`
      + `<span class="t-miss">${t.miss}</span>`;
  }
}
