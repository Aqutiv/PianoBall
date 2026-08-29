type Handler<T> = (payload: T) => void;

/**
 * Minimal typed pub/sub. The game layer publishes; render and audio subscribe.
 * Keeping this one-directional is what lets the simulation run headless.
 */
export class EventBus<M extends object> {
  private readonly map = new Map<keyof M, Set<Handler<never>>>();

  on<K extends keyof M>(key: K, fn: Handler<M[K]>): () => void {
    let set = this.map.get(key);
    if (!set) { set = new Set(); this.map.set(key, set); }
    set.add(fn as Handler<never>);
    return () => { set!.delete(fn as Handler<never>); };
  }

  once<K extends keyof M>(key: K, fn: Handler<M[K]>): () => void {
    const off = this.on(key, (p) => { off(); fn(p); });
    return off;
  }

  emit<K extends keyof M>(key: K, payload: M[K]): void {
    const set = this.map.get(key);
    if (!set) return;
    for (const fn of set) (fn as Handler<M[K]>)(payload);
  }

  clear(): void { this.map.clear(); }

  /** Total live handlers. The mode teardown test asserts on this. */
  get handlerCount(): number {
    let n = 0;
    for (const set of this.map.values()) n += set.size;
    return n;
  }
}
