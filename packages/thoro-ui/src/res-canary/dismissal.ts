import type { CanaryStorage } from './types.ts'

export type DismissalStore = {
  read(): string | null
  write(signature: string): void
}

function defaultStorage(): CanaryStorage | null {
  try {
    return globalThis.localStorage ?? null
  } catch {
    // Sandboxed iframes and some privacy modes throw on access.
    return null
  }
}

/**
 * `option` undefined → localStorage, resolved on first use so creating a canary on a server is safe.
 * `null` → memory only. A dismissal made on this page wins over whatever storage says.
 */
export function createDismissalStore(option: CanaryStorage | null | undefined, key: string): DismissalStore {
  let memory: string | null = null
  const storage = (): CanaryStorage | null => (option === undefined ? defaultStorage() : option)
  return {
    read() {
      if (memory !== null) return memory
      try {
        return storage()?.getItem(key) ?? null
      } catch {
        return null
      }
    },
    write(signature) {
      memory = signature
      try {
        storage()?.setItem(key, signature)
      } catch {
        // Quota or privacy mode: the in-memory copy still hides it for this page.
      }
    },
  }
}
