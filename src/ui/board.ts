import { clamp01 } from '../core/math';
import {
  Reveal, TIMING, formatCount, formatShare,
  type Hero, type HeroMark, type ModeResult, type Split, type Stat, type StatTone,
  type VerdictTone,
} from './scoreboard';

/**
 * The scoreboard as markup, and the per-frame pass over it.
 *
 * Split from the model so the model stays free of the DOM and can be tested in
 * the node environment the rest of the suite runs in. The division of labour
 * here is the one `overlay.ts:513` paid for: the markup is written **once**, and
 * from then on nothing is created, destroyed or re-parsed. Rebuilding a panel
 * mid-gesture replaced the button between mousedown and mouseup, and a click
 * could never complete on it — a results screen that animates for two seconds
 * would have made that permanent rather than momentary.
 */

/** Ring geometry. The stroke is centred on the radius, so a mark spans it. */
const RING_R = 62;
const RING_C = 2 * Math.PI * RING_R;

/**
 * Where each verdict sits in the run map, as `[y, height]` in a 34-high strip.
 *
 * Hits grow up from a baseline at 22 and a miss grows down from it, so the two
 * are told apart by shape before colour. That is what carries the strip under
 * the colour-blind palette, and it is also what makes a clean run look like
 * something: a better hit is a taller bar, so a good run is a skyline rather
 * than an absence.
 */
const TICK: Record<VerdictTone, [number, number]> = {
  perfect: [4, 18],
  good: [9, 13],
  ok: [14, 8],
  miss: [22, 12],
  wrong: [22, 12],
};

/** Unique per panel: two gradients may not share an id. */
let serial = 0;

/** The two ways to move a bound board: by a frame, or straight to a moment. */
export interface Frames {
  tick(dt: number): void;
  /**
   * Put the reveal at `seconds` and repaint.
   *
   * Reduced motion is this at the end, and it is also how the screen can be
   * caught mid-gesture for a screenshot — an animation verified with a
   * stopwatch is an animation nobody checks twice.
   */
  seek(seconds: number): void;
}

export interface Scoreboard {
  /** Markup for the panel to drop in, once. */
  readonly html: string;
  /** Find the pieces and hand back the ways to move them. */
  bind(root: HTMLElement): Frames;
}

const toneClass = (t: StatTone | undefined): string =>
  (t && t !== 'plain' ? ` sb-${t}` : '');

// ----------------------------------------------------------------- markup ---

function markLines(marks: readonly HeroMark[]): string {
  return marks.map((m) => `
        <line class="sb-mark sb-mark-${m.kind}" data-at="${m.at}"
          x1="80" y1="${80 - RING_R - 10}" x2="80" y2="${80 - RING_R + 10}"
          transform="rotate(${(m.at * 360).toFixed(2)} 80 80)"></line>`).join('');
}

/**
 * What the dial says, written once from the final figures.
 *
 * The counting text is hidden from assistive tech and this stands in for it:
 * a screen reader handed a number that changes sixty times a second reads the
 * run as a stutter, and the point was never the counting.
 */
/** What the readout will say once it has finished counting. */
function finalFigure(hero: Hero): string {
  const r = hero.readout;
  return r.kind === 'text' ? r.text
    : r.kind === 'percent' ? formatShare(hero.value)
      : formatCount(hero.total ?? 0, r.format);
}

function dialLabel(hero: Hero): string {
  const figure = finalFigure(hero);
  const marks = (hero.marks ?? []).map((m) => m.label).join('. ');
  return `${hero.badge ? `${figure}, graded ${hero.badge}` : figure}${marks ? `. ${marks}` : ''}`;
}

function dialHtml(hero: Hero, id: string): string {
  const marks = hero.marks ?? [];
  // A grade is one glyph and can take the middle of the ring, pushing the
  // figure out of the way. A word cannot: "NEW" set at that size runs off both
  // sides of the dial, and it would be covering the score — which is the one
  // thing a pinball player came to this screen to read. So a word is set small,
  // beneath the number, and the number stays.
  const stamped = (hero.badge ?? '').length <= 1;
  // Sized to what it will end up saying, not to what it says now: the figure
  // counts from "0" to "486,200", and a size chosen for the first would have
  // the last running out through both sides of the ring. Measured once, from
  // the end, because that is the only length that has to fit.
  const wide = finalFigure(hero).length;
  const fit = wide >= 7 ? ' sb-read-long' : wide >= 5 ? ' sb-read-mid' : '';
  // The legend names the notches beneath the dial rather than beside them. Text
  // set at an angle is unreadable at this size, and turning it upright puts it
  // exactly where the sweep is about to arrive.
  const keys = marks.map((m) =>
    `<span class="sb-key sb-key-${m.kind}">${m.label}</span>`).join('');
  return `
      <div class="sb-dial">
        <svg class="sb-ring" viewBox="0 0 160 160" role="img" aria-label="${dialLabel(hero)}">
          <defs>
            <linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stop-color="var(--neon)"></stop>
              <stop offset="0.55" stop-color="var(--neon2)"></stop>
              <stop offset="1" stop-color="var(--accent)"></stop>
            </linearGradient>
          </defs>
          <circle class="sb-track" cx="80" cy="80" r="${RING_R}"></circle>
          <circle class="sb-sweep" cx="80" cy="80" r="${RING_R}" stroke="url(#${id})"
            transform="rotate(-90 80 80)"
            stroke-dasharray="${RING_C.toFixed(2)}"
            stroke-dashoffset="${RING_C.toFixed(2)}"></circle>${markLines(marks)}
          <text class="sb-read${stamped ? '' : ' sb-read-alone'}${fit}" x="80" y="${stamped ? 90 : 88}"
            aria-hidden="true">&#160;</text>
          <text class="sb-badge${stamped ? '' : ' sb-word'}${toneClass(hero.tone)}"
            x="80" y="${stamped ? 94 : 116}" opacity="0" aria-hidden="true">${hero.badge ?? ''}</text>
        </svg>
        ${keys ? `<div class="sb-keys">${keys}</div>` : ''}
      </div>`;
}

function mapHtml(run: readonly VerdictTone[], id: string): string {
  const ticks = run.map((v, i) => {
    const [y, h] = TICK[v];
    return `<rect x="${i + 0.14}" y="${y}" width="0.72" height="${h}" fill="var(--v-${v})"></rect>`;
  }).join('');
  return `
        <div class="sb-cap">Where the run went</div>
        <svg class="sb-map" viewBox="0 0 ${run.length} 34" preserveAspectRatio="none"
          aria-hidden="true">
          <clipPath id="${id}"><rect class="sb-clip" x="0" y="0" width="0" height="34"></rect></clipPath>
          <g clip-path="url(#${id})">${ticks}</g>
        </svg>`;
}

/**
 * The stacked bar, and beneath it the HUD's own tally.
 *
 * The counts reuse `.tally` and `.t-*` verbatim rather than growing a parallel
 * set: the player has been watching those five colours all the way through the
 * tune, and the results screen should read as the last frame of that rather
 * than as a different instrument.
 *
 * Shares are over every verdict including wrong presses, so the bar always ends
 * full and a run full of wrong keys is visibly stealing width from the rest.
 */
function splitHtml(split: readonly Split[]): string {
  const total = split.reduce((n, s) => n + s.count, 0) || 1;
  const bar = split.map((s) =>
    `<i class="sb-seg" style="background:var(--v-${s.tone});--to:${((s.count / total) * 100).toFixed(3)}%"></i>`).join('');
  const counts = split.map((s) => `<span class="t-${s.tone}">${s.count}</span>`).join('');
  return `
        <div class="sb-split" aria-hidden="true">${bar}</div>
        <div class="tally sb-tally">${counts}</div>`;
}

function rowHtml(stat: Stat): string {
  // A track with no denominator is decoration pretending to be information, so
  // only a share gets one.
  const track = stat.kind === 'share'
    ? `<span class="sb-fill"><i></i>${stat.mark === undefined ? ''
      : `<b style="left:${(clamp01(stat.mark) * 100).toFixed(2)}%"></b>`}</span>`
    : '';
  return `
        <div class="sb-row">
          <span class="sb-label">${stat.label}</span>
          <span class="sb-value${toneClass(stat.tone)}">&#160;</span>${track}
        </div>`;
}

export function scoreboard(result: ModeResult): Scoreboard {
  const n = serial++;
  const arcId = `sb-arc-${n}`;
  const clipId = `sb-clip-${n}`;
  const { hero } = result;
  const hasDetail = Boolean(result.run?.length || result.split?.length);
  // The rows sit beside the dial when nothing else wants that side, and beneath
  // it when the map has taken it. Pinball has no chart and so no map, and two
  // thirds of an empty panel next to a dial reads as a layout fault.
  const rows = result.stats.map(rowHtml).join('');
  const detail = hasDetail
    ? `${result.run?.length ? mapHtml(result.run, clipId) : ''}${result.split?.length ? splitHtml(result.split) : ''}`
    : rows;

  const html = `
    <div class="sb${hasDetail ? '' : ' sb-lean'}">
      <div class="sb-head">${dialHtml(hero, arcId)}
        <div class="sb-detail">${detail}</div>
      </div>
      ${hasDetail ? `<div class="sb-rows">${rows}</div>` : ''}
      ${result.banner
    ? `<div class="sb-banner${toneClass(result.banner.tone)}">${result.banner.text}</div>`
    : ''}
    </div>`;

  return { html, bind: (root) => bindBoard(root, result) };
}

// ------------------------------------------------------------------ frames ---

interface Row {
  el: HTMLElement;
  value: HTMLElement;
  fill: HTMLElement | null;
  stat: Stat | undefined;
}

/**
 * A frame is at most a few dozen attribute writes, and `textContent` only when
 * the string actually changed.
 *
 * The guard is not a micro-optimisation. A sweep to 87% over 1.1 s crosses 88
 * distinct percentages in 66 frames, so two thirds of the writes would set a
 * node to what it already said — and every one of them invalidates layout on a
 * panel that is also being read by assistive tech.
 */
function bindBoard(root: HTMLElement, result: ModeResult): Frames {
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T | null;
  const all = <T extends Element>(sel: string) => Array.from(root.querySelectorAll<T>(sel));

  const { hero } = result;
  const stamped = (hero.badge ?? '').length <= 1;
  const sweep = q<SVGCircleElement>('.sb-sweep');
  const read = q<SVGTextElement>('.sb-read');
  const badge = q<SVGTextElement>('.sb-badge');
  const clip = q<SVGRectElement>('.sb-clip');
  const banner = q<HTMLElement>('.sb-banner');
  const marks = all<SVGLineElement>('.sb-mark');
  const keys = all<HTMLElement>('.sb-key');
  const segs = all<HTMLElement>('.sb-seg');
  const rows: Row[] = all<HTMLElement>('.sb-row').map((el, i) => ({
    el,
    value: el.querySelector('.sb-value') as HTMLElement,
    fill: el.querySelector('.sb-fill > i') as HTMLElement | null,
    stat: result.stats[i],
  }));

  const reveal = new Reveal();
  const printed: string[] = [];
  const say = (el: Element | null, i: number, text: string) => {
    if (!el || printed[i] === text) return;
    printed[i] = text;
    el.textContent = text;
  };
  const cells = result.run?.length ?? 0;
  let spent = -1;

  const paint = () => {
    // One pass after it settles, then nothing at all. A results screen left
    // open should cost no frames.
    if (reveal.t === spent) return;
    spent = reveal.t;

    const climb = reveal.phase(TIMING.ring.at, TIMING.ring.len);
    const swept = clamp01(hero.value * climb);
    sweep?.setAttribute('stroke-dashoffset', (RING_C * (1 - swept)).toFixed(2));
    const r = hero.readout;
    say(read, 0, r.kind === 'text' ? r.text
      : r.kind === 'percent' ? formatShare(swept)
        : formatCount((hero.total ?? 0) * climb, r.format));

    // A notch lights the moment the sweep reaches it. That crossing is the
    // entire reason the notch exists: it is how the screen says you passed, or
    // beat what you had, without writing the sentence out.
    for (let i = 0; i < marks.length; i++) {
      const hit = swept >= Number(marks[i].dataset.at);
      marks[i].classList.toggle('on', hit);
      keys[i]?.classList.toggle('on', hit);
    }

    const stamp = reveal.phase(TIMING.badge.at, TIMING.badge.len);
    if (badge && hero.badge) {
      const y = stamped ? 94 : 116;
      badge.setAttribute('opacity', stamp.toFixed(3));
      badge.setAttribute('transform',
        `translate(80 ${y}) scale(${(1.6 - 0.6 * stamp).toFixed(3)}) translate(-80 -${y})`);
      // A grade takes the middle, so the figure gets out of its way. A word
      // sits under the figure and takes nothing.
      if (stamped) read?.setAttribute('opacity', (1 - stamp).toFixed(3));
    }

    clip?.setAttribute('width', (cells * reveal.phase(TIMING.map.at, TIMING.map.len)).toFixed(3));

    for (let i = 0; i < segs.length; i++) {
      const t = reveal.phase(TIMING.split.at + i * TIMING.split.step, TIMING.split.len);
      segs[i].style.width = `calc(var(--to) * ${t.toFixed(4)})`;
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const s = row.stat;
      if (!s) continue;
      const t = reveal.phase(TIMING.rows.at + i * TIMING.rows.step, TIMING.rows.len);
      row.el.style.opacity = t.toFixed(3);
      row.el.style.transform = `translateY(${((1 - t) * 7).toFixed(2)}px)`;
      say(row.value, i + 1, s.kind === 'note' ? s.value
        : s.kind === 'share' ? formatShare(s.value * t)
          : formatCount(s.value * t, s.format));
      if (row.fill && s.kind === 'share') {
        row.fill.style.width = `${(clamp01(s.value) * t * 100).toFixed(2)}%`;
      }
    }

    if (banner) banner.style.opacity = reveal.phase(TIMING.banner.at, TIMING.banner.len).toFixed(3);
  };

  return {
    tick(dt: number) {
      // Clamped, because the frame that builds this panel is the one that also
      // parsed it: the loop caps `frameDt` at a quarter second, and handing
      // that straight in would open the screen already a fifth of the way
      // through its own reveal.
      reveal.advance(Math.min(dt, 0.05));
      paint();
    },
    seek(seconds: number) {
      reveal.t = Math.max(0, seconds);
      paint();
    },
  };
}
