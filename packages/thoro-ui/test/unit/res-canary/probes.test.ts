import { runProbe } from '../../../src/res-canary/probes.ts'

const signal = new AbortController().signal

function preloadLink(): HTMLLinkElement {
  const link = document.head.querySelector<HTMLLinkElement>('link[rel="preload"]')
  if (!link) throw new Error('no preload link in <head>')
  return link
}

afterEach(() => {
  vi.useRealTimers()
  document.head.replaceChildren()
})

describe('runProbe', () => {
  it.each(['script', 'style'] as const)('preloads a %s without running it, then removes the link', async type => {
    const result = runProbe({ type, url: 'https://cdn.example/asset' }, 0, signal)
    const link = preloadLink()
    expect(link.as).toBe(type)
    expect(link.href).toBe('https://cdn.example/asset')
    link.dispatchEvent(new Event('load'))
    await expect(result).resolves.toBe(true)
    expect(document.head.querySelector('link')).toBeNull()
  })

  it('reports a failed preload', async () => {
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal)
    preloadLink().dispatchEvent(new Event('error'))
    await expect(result).resolves.toBe(false)
  })

  it('loads a detached image', async () => {
    const images: HTMLImageElement[] = []
    vi.stubGlobal('Image', function FakeImage() {
      const image = document.createElement('img')
      images.push(image)
      return image
    })
    const ok = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal)
    images[0].dispatchEvent(new Event('load'))
    await expect(ok).resolves.toBe(true)
    expect(images[0].src).toBe('https://cdn.example/p.png')
    expect(images[0].isConnected).toBe(false)

    const failed = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal)
    images[1].dispatchEvent(new Event('error'))
    await expect(failed).resolves.toBe(false)
  })

  it('treats a resolved no-cors fetch as reachable and a rejected one as blocked', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal)).resolves.toBe(true)
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal)).resolves.toBe(false)
    expect(fetch).toHaveBeenCalledWith('https://api.example/ping', { mode: 'no-cors', signal })
  })

  const customs: Array<[string, (signal: AbortSignal) => Promise<boolean>, boolean]> = [
    ['true', async () => true, true],
    ['false', async () => false, false],
    ['a non-boolean', async () => 'yes' as unknown as boolean, false],
    [
      'a rejection',
      async () => {
        throw new Error('nope')
      },
      false,
    ],
    [
      'a synchronous throw',
      () => {
        throw new Error('sync')
      },
      false,
    ],
  ]

  it.each(customs)('maps a custom probe returning %s', async (_name, run, expected) => {
    await expect(runProbe({ run, type: 'custom' }, 0, signal)).resolves.toBe(expected)
  })

  it('fails a probe that does not settle within the timeout, and ignores a late answer', async () => {
    vi.useFakeTimers()
    const settled = vi.fn()
    void runProbe({ type: 'script', url: 'https://cdn.example/hang.js' }, 500, signal).then(settled)
    await vi.advanceTimersByTimeAsync(499)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledWith(false)
    preloadLink().dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledTimes(1)
  })
})
