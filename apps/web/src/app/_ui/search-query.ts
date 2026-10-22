let query = "";
const listeners = new Set<() => void>();

export const searchQuery = {
  get: (): string => query,
  getServer: (): string => "",
  set(next: string): void {
    if (next === query) return;
    query = next;
    for (const listener of [...listeners]) listener();
  },
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};
