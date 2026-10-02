import { createDismissalStore } from '../../../src/res-canary/dismissal.ts'
import type { CanaryStorage } from '../../../src/res-canary/types.ts'

function mapStorage(): CanaryStorage {
  const data = new Map<string, string>()
  return {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

describe('createDismissalStore', () => {
  beforeEach(() => localStorage.clear())

  it('defaults to localStorage', () => {
    createDismissalStore(undefined, 'k').write('a,b')
    expect(localStorage.getItem('k')).toBe('a,b')
    expect(createDismissalStore(undefined, 'k').read()).toBe('a,b')
  })

  it('persists through a custom storage', () => {
    const storage = mapStorage()
    createDismissalStore(storage, 'k').write('a')
    expect(createDismissalStore(storage, 'k').read()).toBe('a')
  })

  it('keeps the dismissal in memory only when storage is null', () => {
    const store = createDismissalStore(null, 'k')
    expect(store.read()).toBeNull()
    store.write('a')
    expect(store.read()).toBe('a')
    expect(localStorage.getItem('k')).toBeNull()
  })

  it('treats a storage that throws on read as not dismissed', () => {
    const storage: CanaryStorage = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => {},
    }
    expect(createDismissalStore(storage, 'k').read()).toBeNull()
  })

  it('still dismisses for this page when storage throws on write', () => {
    const storage: CanaryStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    }
    const store = createDismissalStore(storage, 'k')
    store.write('a')
    expect(store.read()).toBe('a')
  })
})
