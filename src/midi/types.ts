export type InputSource = 'midi' | 'keyboard' | 'pointer' | 'debug';

export type InputEvent =
  | { type: 'noteon'; note: number; velocity: number; raw: number; time: number; source: InputSource }
  | { type: 'noteoff'; note: number; time: number; source: InputSource }
  | { type: 'bend'; value: number; time: number; source: InputSource }
  | { type: 'cc'; controller: number; value: number; time: number; source: InputSource }
  | { type: 'pitchreset'; time: number; source: InputSource };

export type InputListener = (e: InputEvent) => void;

export interface RawMessage {
  time: number;
  data: number[];
  device: string;
  label: string;
}
