import { DEFAULT_STRINGS, resolveStrings } from '../../../src/res-canary/ui/strings.ts'

describe('resolveStrings', () => {
  it('overlays the given strings on the defaults', () => {
    expect(resolveStrings({ copy: 'Kopieren' })).toEqual({ ...DEFAULT_STRINGS, copy: 'Kopieren' })
  })

  it('ignores non-string values and unknown keys', () => {
    const overrides = { extra: 'x', title: undefined, dismiss: 42 } as unknown as Record<string, string>
    expect(resolveStrings(overrides)).toEqual(DEFAULT_STRINGS)
    expect(resolveStrings(null)).toEqual(DEFAULT_STRINGS)
  })
})
