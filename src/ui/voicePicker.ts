import { artUrl } from './voiceArt';

export interface PickerItem {
  id: string;
  name: string;
  family: string;
}

/**
 * The instrument picker, with a picture of what you are about to pick.
 *
 * This exists because a native `<select>` cannot do it. An open select is
 * drawn by the operating system, not by the page: its `<option>`s take no
 * hover, no styling and no measurement, so there is nowhere to hang a preview.
 * Replacing it means taking back the things the native control gave away for
 * free — keyboard, type-ahead, ARIA — which is what most of this file is.
 *
 * On a device without a pointer there is no hover to preview on, so the art
 * moves inline: every row carries its own thumbnail and no card is built. That
 * is also the only layout that fits, since the card wants ~220px beside a
 * dropdown that is already most of a phone's width.
 */
export class VoicePicker {
  readonly el: HTMLElement;

  private readonly button: HTMLButtonElement;
  private readonly label: HTMLElement;
  private readonly list: HTMLElement;
  private readonly card: HTMLElement | null;
  private readonly rows: HTMLElement[] = [];

  private open = false;
  private activeIndex = -1;
  /** Type-ahead buffer, cleared once the player stops typing. */
  private typed = '';
  private typedAt = 0;

  private readonly onDocPointer = (e: PointerEvent) => {
    if (!this.el.contains(e.target as Node)) this.close(false);
  };

  constructor(
    items: readonly PickerItem[],
    families: readonly string[],
    private selected: string,
    private readonly ariaLabel: string,
    private readonly onPick: (id: string) => void,
  ) {
    // No hover to preview on, and no room for the card: show art in the rows.
    const inline = typeof matchMedia === 'function'
      && matchMedia('(hover: none), (pointer: coarse)').matches;

    this.el = document.createElement('div');
    this.el.className = 'voice-picker' + (inline ? ' inline-art' : '');

    this.button = document.createElement('button');
    this.button.type = 'button';
    this.button.className = 'hud-select voice-button';
    this.button.setAttribute('aria-haspopup', 'listbox');
    this.button.setAttribute('aria-expanded', 'false');
    this.button.setAttribute('aria-label', ariaLabel);
    this.label = document.createElement('span');
    this.label.className = 'voice-name';
    const caret = document.createElement('span');
    caret.className = 'voice-caret';
    caret.setAttribute('aria-hidden', 'true');
    caret.textContent = '▾';
    this.button.append(this.label, caret);

    this.list = document.createElement('div');
    this.list.className = 'voice-list';
    this.list.setAttribute('role', 'listbox');
    this.list.setAttribute('aria-label', ariaLabel);
    this.list.hidden = true;

    for (const family of families) {
      const head = document.createElement('div');
      head.className = 'voice-family';
      head.textContent = family;
      // A group heading is decoration to a screen reader that is already told
      // the group by the row itself.
      head.setAttribute('aria-hidden', 'true');
      this.list.append(head);
      for (const item of items.filter((i) => i.family === family)) {
        this.list.append(this.buildRow(item, inline));
      }
    }

    // The card is a pointer affordance; on touch there is nothing to hover it.
    this.card = inline ? null : this.buildCard();
    this.el.append(this.button, this.list);
    if (this.card) this.el.append(this.card);

    this.button.addEventListener('click', () => this.toggle());
    this.button.addEventListener('keydown', (e) => this.onButtonKey(e));
    this.list.addEventListener('keydown', (e) => this.onListKey(e));
    // `pointerleave` rather than per-row, so sliding between rows never blinks
    // the card off and on again.
    this.list.addEventListener('pointerleave', () => this.hideCard());

    this.setValue(selected);
  }

  /** The id currently shown, so the HUD can read it back like a select's value. */
  get value(): string { return this.selected; }

  /** Point the picker at an id without telling anyone — the engine already knows. */
  setValue(id: string): void {
    this.selected = id;
    const row = this.rows.find((r) => r.dataset.id === id) ?? this.rows[0];
    if (!row) return;
    this.selected = row.dataset.id!;
    this.label.textContent = row.dataset.name!;
    for (const r of this.rows) {
      const on = r === row;
      r.classList.toggle('picked', on);
      r.setAttribute('aria-selected', String(on));
    }
  }

  destroy(): void {
    document.removeEventListener('pointerdown', this.onDocPointer);
  }

  // ---------------------------------------------------------------- build ---

  private buildRow(item: PickerItem, inline: boolean): HTMLElement {
    const row = document.createElement('div');
    row.className = 'voice-row';
    row.id = `voice-${this.ariaLabel.replace(/\W+/g, '-').toLowerCase()}-${item.id}`;
    row.setAttribute('role', 'option');
    row.setAttribute('aria-selected', 'false');
    row.dataset.id = item.id;
    row.dataset.name = item.name;
    row.dataset.family = item.family;

    const url = artUrl(item.id);
    if (inline && url) {
      const thumb = document.createElement('img');
      thumb.className = 'voice-thumb';
      thumb.loading = 'lazy';
      thumb.decoding = 'async';
      thumb.alt = '';
      thumb.src = url;
      row.append(thumb);
    }
    const name = document.createElement('span');
    name.textContent = item.name;
    row.append(name);

    row.addEventListener('click', () => this.pick(item.id));
    row.addEventListener('pointerenter', () => {
      this.setActive(this.rows.indexOf(row), false);
      this.showCard(row);
    });
    this.rows.push(row);
    return row;
  }

  private buildCard(): HTMLElement {
    const card = document.createElement('div');
    card.className = 'voice-card';
    card.hidden = true;
    card.setAttribute('aria-hidden', 'true');
    card.innerHTML = '<img class="voice-art" alt="" decoding="async">'
      + '<div class="voice-cap"><div class="voice-cap-name"></div>'
      + '<div class="voice-cap-family"></div></div>';
    return card;
  }

  // ----------------------------------------------------------- open/close ---

  private toggle(): void { this.open ? this.close(true) : this.show(); }

  private show(): void {
    if (this.open) return;
    this.open = true;
    this.list.hidden = false;
    this.button.setAttribute('aria-expanded', 'true');
    this.el.classList.add('is-open');
    document.addEventListener('pointerdown', this.onDocPointer);
    const i = this.rows.findIndex((r) => r.dataset.id === this.selected);
    this.setActive(i < 0 ? 0 : i, true);
    this.list.tabIndex = -1;
    this.list.focus({ preventScroll: true });
  }

  private close(focusButton: boolean): void {
    if (!this.open) return;
    this.open = false;
    this.list.hidden = true;
    this.button.setAttribute('aria-expanded', 'false');
    this.el.classList.remove('is-open');
    this.hideCard();
    document.removeEventListener('pointerdown', this.onDocPointer);
    if (focusButton) this.button.focus();
  }

  private pick(id: string): void {
    this.setValue(id);
    this.close(true);
    this.onPick(id);
  }

  // -------------------------------------------------------------- keyboard --

  private onButtonKey(e: KeyboardEvent): void {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.show();
    }
  }

  private onListKey(e: KeyboardEvent): void {
    const last = this.rows.length - 1;
    switch (e.key) {
      case 'ArrowDown': e.preventDefault(); this.setActive(Math.min(this.activeIndex + 1, last), true); return;
      case 'ArrowUp': e.preventDefault(); this.setActive(Math.max(this.activeIndex - 1, 0), true); return;
      case 'Home': e.preventDefault(); this.setActive(0, true); return;
      case 'End': e.preventDefault(); this.setActive(last, true); return;
      case 'PageDown': e.preventDefault(); this.setActive(Math.min(this.activeIndex + 8, last), true); return;
      case 'PageUp': e.preventDefault(); this.setActive(Math.max(this.activeIndex - 8, 0), true); return;
      case 'Enter':
      case ' ': {
        e.preventDefault();
        const row = this.rows[this.activeIndex];
        if (row) this.pick(row.dataset.id!);
        return;
      }
      case 'Escape': e.preventDefault(); this.close(true); return;
      case 'Tab': this.close(false); return;
      default: break;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      this.typeAhead(e.key);
      e.preventDefault();
    }
  }

  /** Jump to the next voice whose name starts with what is being typed. */
  private typeAhead(ch: string): void {
    const now = Date.now();
    this.typed = now - this.typedAt > 700 ? ch : this.typed + ch;
    this.typedAt = now;
    const want = this.typed.toLowerCase();
    // Start past the current row so repeating one letter cycles the matches.
    const from = this.typed.length === 1 ? this.activeIndex + 1 : this.activeIndex;
    for (let n = 0; n < this.rows.length; n++) {
      const i = (from + n + this.rows.length) % this.rows.length;
      if (this.rows[i].dataset.name!.toLowerCase().startsWith(want)) {
        this.setActive(i, true);
        return;
      }
    }
  }

  // ------------------------------------------------------------- highlight --

  private setActive(i: number, scroll: boolean): void {
    if (i < 0 || i >= this.rows.length) return;
    this.activeIndex = i;
    const row = this.rows[i];
    for (const r of this.rows) r.classList.toggle('active', r === row);
    this.list.setAttribute('aria-activedescendant', row.id);
    if (scroll) {
      row.scrollIntoView({ block: 'nearest' });
      this.showCard(row);
    }
  }

  // ------------------------------------------------------------------ card --

  private showCard(row: HTMLElement): void {
    const card = this.card;
    if (!card || !this.open) return;
    const url = artUrl(row.dataset.id!);
    const img = card.querySelector<HTMLImageElement>('.voice-art')!;
    if (url) {
      if (img.getAttribute('src') !== url) img.src = url;
      img.hidden = false;
    } else {
      img.hidden = true;
    }
    card.querySelector('.voice-cap-name')!.textContent = row.dataset.name!;
    card.querySelector('.voice-cap-family')!.textContent = row.dataset.family!;
    card.hidden = false;

    // Sit the card beside its row, then pull it back inside the viewport. The
    // list is anchored to a HUD corner, so near the bottom of a short window
    // an un-clamped card would hang off the screen.
    const rowBox = row.getBoundingClientRect();
    const hostBox = this.el.getBoundingClientRect();
    const height = card.offsetHeight;
    const wanted = rowBox.top - hostBox.top - height / 2 + rowBox.height / 2;
    const min = 8 - hostBox.top;
    const max = window.innerHeight - hostBox.top - height - 8;
    card.style.top = `${Math.round(Math.max(min, Math.min(wanted, max)))}px`;
  }

  private hideCard(): void {
    if (this.card) this.card.hidden = true;
  }
}
