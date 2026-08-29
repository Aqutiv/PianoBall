import type { AudioEngine } from './engine';
import type { InputHub } from '../midi/inputHub';

/** Controller messages that mean the same thing whatever mode is running. */
export const CC = {
  MOD_WHEEL: 1,
  CHANNEL_VOLUME: 7,
  SUSTAIN: 64,
  ALL_NOTES_OFF: 123,
} as const;

/**
 * Wire the handful of MIDI controls that belong to the app rather than to a
 * mode. Returns an unsubscribe, though the shell holds these for the life of
 * the page.
 */
export function wireGlobalControls(input: InputHub, engine: AudioEngine): () => void {
  return input.on((e) => {
    if (e.type !== 'cc') return;
    if (e.controller === CC.CHANNEL_VOLUME) engine.setSettings({ master: e.value });
    else if (e.controller === CC.SUSTAIN) engine.setSustain(e.value >= 0.5);
    else if (e.controller === CC.ALL_NOTES_OFF) engine.allNotesOff();
  });
}
