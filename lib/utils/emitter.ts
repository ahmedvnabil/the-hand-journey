/** Minimal typed event emitter. Every engine module communicates through one of these. */
export type Listener<T> = (payload: T) => void

export class Emitter<Events extends Record<string, unknown>> {
  private listeners = new Map<keyof Events, Set<Listener<never>>>()

  on<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    const set = this.listeners.get(event) ?? new Set()
    set.add(fn as Listener<never>)
    this.listeners.set(event, set)
    return () => this.off(event, fn)
  }

  once<K extends keyof Events>(event: K, fn: Listener<Events[K]>): () => void {
    const off = this.on(event, (payload) => {
      off()
      fn(payload)
    })
    return off
  }

  off<K extends keyof Events>(event: K, fn: Listener<Events[K]>): void {
    this.listeners.get(event)?.delete(fn as Listener<never>)
  }

  emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    this.listeners.get(event)?.forEach((fn) => (fn as Listener<Events[K]>)(payload))
  }

  clear(): void {
    this.listeners.clear()
  }
}
