import type { InputEvent, RawMessage } from './types';
import { load, save } from '../core/storage';

export type MidiStatus = 'unsupported' | 'idle' | 'requesting' | 'denied' | 'ready';

const CC_NAMES: Record<number, string> = {
  1: 'Mod', 7: 'Volume', 10: 'Pan', 11: 'Expression', 64: 'Sustain', 123: 'All notes off',
};

/**
 * Web MIDI plumbing.
 *
 * Nothing here assumes anything about the controller: what its pitch bend,
 * octave and sustain controls actually transmit is discovered by watching the
 * raw stream, which the monitor panel shows.
 */
export class MidiInput {
  status: MidiStatus = 'idle';
  error: string | null = null;
  devices: { id: string; name: string; manufacturer: string }[] = [];
  selectedId: string | null = load<string | null>('midiDevice', null);

  onEvent: ((e: InputEvent) => void) | null = null;
  onRaw: ((m: RawMessage) => void) | null = null;
  onDevicesChanged: (() => void) | null = null;

  private access: MIDIAccess | null = null;
  private bound = new Set<MIDIInput>();
  private preferredId: string | null = this.selectedId;

  static get supported(): boolean {
    return typeof navigator !== 'undefined' && typeof navigator.requestMIDIAccess === 'function';
  }

  async init(): Promise<MidiStatus> {
    if (!MidiInput.supported) {
      this.status = 'unsupported';
      this.error = 'This browser has no Web MIDI. Chrome or Edge support it; Safari does not.';
      return this.status;
    }
    this.status = 'requesting';
    try {
      this.access = await navigator.requestMIDIAccess({ sysex: false });
      this.status = 'ready';
      this.access.onstatechange = () => this.refresh();
      this.refresh();
    } catch (err) {
      this.status = 'denied';
      this.error = err instanceof Error ? err.message : String(err);
    }
    return this.status;
  }

  /** Re-enumerate ports and (re)attach handlers. Safe to call on hot-plug. */
  refresh(): void {
    if (!this.access) return;
    this.devices = [];
    for (const input of this.access.inputs.values()) {
      this.devices.push({
        id: input.id,
        name: input.name ?? 'Unknown device',
        manufacturer: input.manufacturer ?? '',
      });
      if (!this.bound.has(input)) {
        input.onmidimessage = (msg) => this.handle(input, msg);
        this.bound.add(input);
      }
    }
    if (this.preferredId && this.devices.some((d) => d.id === this.preferredId)) {
      this.selectedId = this.preferredId;
    } else if (!this.selectedId || !this.devices.some((d) => d.id === this.selectedId)) {
      this.selectedId = this.devices.length ? this.devices[0].id : null;
    }
    this.onDevicesChanged?.();
  }

  select(id: string | null): void {
    this.selectedId = id;
    this.preferredId = id;
    save('midiDevice', id);
  }

  resetSettings(): void {
    this.preferredId = null;
    this.selectedId = this.devices.length ? this.devices[0].id : null;
    save('midiDevice', null);
  }

  private handle(port: MIDIInput, msg: MIDIMessageEvent): void {
    const data = msg.data;
    if (!data || data.length === 0) return;
    // Active sensing and clock would drown the monitor in noise.
    if (data[0] >= 0xf8) return;
    if (this.selectedId && port.id !== this.selectedId) return;

    const time = msg.timeStamp;
    this.onRaw?.({ time, data: Array.from(data), device: port.name ?? '?', label: describe(data) });

    const status = data[0] & 0xf0;
    switch (status) {
      case 0x90: {
        const note = data[1], vel = data[2] ?? 0;
        // Running-status keyboards send note-on with velocity 0 for note-off.
        if (vel === 0) this.onEvent?.({ type: 'noteoff', note, time, source: 'midi' });
        else this.onEvent?.({ type: 'noteon', note, velocity: vel, raw: vel, time, source: 'midi' });
        break;
      }
      case 0x80:
        this.onEvent?.({ type: 'noteoff', note: data[1], time, source: 'midi' });
        break;
      case 0xe0: {
        const raw = ((data[2] ?? 64) << 7) | (data[1] ?? 0);
        this.onEvent?.({ type: 'bend', value: (raw - 8192) / 8192, time, source: 'midi' });
        break;
      }
      case 0xb0:
        this.onEvent?.({ type: 'cc', controller: data[1], value: (data[2] ?? 0) / 127, time, source: 'midi' });
        break;
      default:
        break;
    }
  }

  dispose(): void {
    for (const input of this.bound) input.onmidimessage = null;
    this.bound.clear();
    if (this.access) this.access.onstatechange = null;
  }
}

/** Human-readable one-liner for the monitor panel. */
export function describe(data: Uint8Array | number[]): string {
  const d = Array.from(data);
  const status = d[0] & 0xf0;
  const ch = (d[0] & 0x0f) + 1;
  switch (status) {
    case 0x80: return `ch${ch} note off  ${d[1]}`;
    case 0x90: return d[2] ? `ch${ch} note on   ${d[1]}  vel ${d[2]}` : `ch${ch} note off  ${d[1]}`;
    case 0xa0: return `ch${ch} aftertouch ${d[1]} ${d[2]}`;
    case 0xb0: return `ch${ch} CC ${d[1]}${CC_NAMES[d[1]] ? ` (${CC_NAMES[d[1]]})` : ''} = ${d[2]}`;
    case 0xc0: return `ch${ch} program ${d[1]}`;
    case 0xd0: return `ch${ch} pressure ${d[1]}`;
    case 0xe0: return `ch${ch} pitch bend ${(((d[2] << 7) | d[1]) - 8192)}`;
    default: return d.map((v) => v.toString(16).padStart(2, '0')).join(' ');
  }
}
