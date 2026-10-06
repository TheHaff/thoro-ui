import { checkOrigin, runProbe, type OwnBlocked } from '../../../src/res-canary/probes.ts'

const signal = new AbortController().signal
const notBlocked: OwnBlocked = () => false
const CHECK = { credentials: 'omit', method: 'HEAD', mode: 'no-cors', referrerPolicy: 'no-referrer', signal }

const reachable = async (): Promise<Response> => new Response(null)
const refused = async (): Promise<Response> => {
  throw new TypeError('Failed to fetch')
}

function stubFetch(answer: () => Promise<Response>): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(answer)
  vi.stubGlobal('fetch', fetch)
  return fetch
}

function link(rel: string): HTMLLinkElement {
  const found = document.head.querySelector<HTMLLinkElement>(`link[rel="${rel}"]`)
  if (!found) throw new Error(`no ${rel} link in <head>`)
  return found
}

afterEach(() => {
  vi.useRealTimers()
  document.head.replaceChildren()
})

describe('runProbe', () => {
  it('preloads a script without running it and fetches it too, then removes the link', async () => {
    const fetch = stubFetch(reachable)
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal, notBlocked)
    expect(link('preload').as).toBe('script')
    expect(link('preload').href).toBe('https://cdn.example/a.js')
    link('preload').dispatchEvent(new Event('load'))
    await expect(result).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith('https://cdn.example/a.js', CHECK)
    expect(document.head.querySelector('link')).toBeNull()
  })

  it.each([
    ['its preload fails', 'error', reachable],
    ['its fetch is refused, as in Firefox, whose preload fires load anyway', 'load', refused],
  ] as const)('fails a script probe when %s', async (_name, event, answer) => {
    stubFetch(answer)
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal, notBlocked)
    link('preload').dispatchEvent(new Event(event))
    await expect(result).resolves.toBe(false)
  })

  it('leaves a script probe to its preload when your own CSP blocked the fetch', async () => {
    stubFetch(refused)
    const result = runProbe({ type: 'script', url: 'https://cdn.example/a.js' }, 0, signal, () => true)
    link('preload').dispatchEvent(new Event('load'))
    await expect(result).resolves.toBe(true)
  })

  it('loads a style probe as a stylesheet that never applies, then removes it', async () => {
    const ok = runProbe({ type: 'style', url: 'https://cdn.example/s.css' }, 0, signal, notBlocked)
    expect(link('stylesheet').media).toBe('not all')
    expect(link('stylesheet').href).toBe('https://cdn.example/s.css')
    link('stylesheet').dispatchEvent(new Event('load'))
    await expect(ok).resolves.toBe(true)
    expect(document.head.querySelector('link')).toBeNull()

    const failed = runProbe({ type: 'style', url: 'https://cdn.example/s.css' }, 0, signal, notBlocked)
    link('stylesheet').dispatchEvent(new Event('error'))
    await expect(failed).resolves.toBe(false)
  })

  it('loads a detached image', async () => {
    const images: HTMLImageElement[] = []
    vi.stubGlobal('Image', function FakeImage() {
      const image = document.createElement('img')
      images.push(image)
      return image
    })
    const ok = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal, notBlocked)
    images[0].dispatchEvent(new Event('load'))
    await expect(ok).resolves.toBe(true)
    expect(images[0].src).toBe('https://cdn.example/p.png')
    expect(images[0].isConnected).toBe(false)

    const failed = runProbe({ type: 'image', url: 'https://cdn.example/p.png' }, 0, signal, notBlocked)
    images[1].dispatchEvent(new Event('error'))
    await expect(failed).resolves.toBe(false)
  })

  it('keeps a fetch probe as you configured it: no-cors GET, own-CSP blocks count as blocked', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(new Response(null))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
    vi.stubGlobal('fetch', fetch)
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal, () => true)).resolves.toBe(
      true,
    )
    await expect(runProbe({ type: 'fetch', url: 'https://api.example/ping' }, 0, signal, () => true)).resolves.toBe(
      false,
    )
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
    await expect(runProbe({ run, type: 'custom' }, 0, signal, notBlocked)).resolves.toBe(expected)
  })

  it('fails a probe that does not settle within the timeout, and ignores a late answer', async () => {
    vi.useFakeTimers()
    stubFetch(() => new Promise<Response>(() => {}))
    const settled = vi.fn()
    void runProbe({ type: 'script', url: 'https://cdn.example/hang.js' }, 500, signal, notBlocked).then(settled)
    await vi.advanceTimersByTimeAsync(499)
    expect(settled).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(settled).toHaveBeenCalledWith(false)
    link('preload').dispatchEvent(new Event('load'))
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toHaveBeenCalledTimes(1)
  })
})

describe('checkOrigin', () => {
  it('sends HEAD, no cookies and no referrer, and counts any answer as reachable', async () => {
    const fetch = stubFetch(async () => new Response(null, { status: 404 }))
    await expect(checkOrigin('https://widget.chat.example/', 0, signal, notBlocked)).resolves.toBe(true)
    expect(fetch).toHaveBeenCalledWith('https://widget.chat.example/', CHECK)
  })

  it('counts a refused check as blocked, unless your own CSP blocked it', async () => {
    stubFetch(refused)
    await expect(checkOrigin('https://widget.chat.example/', 0, signal, notBlocked)).resolves.toBe(false)
    await expect(checkOrigin('https://widget.chat.example/', 0, signal, () => true)).resolves.toBeNull()
  })

  it('waits one task after a refusal, so a violation that arrives just after it still counts', async () => {
    stubFetch(refused)
    let blocked = false
    const result = checkOrigin('https://widget.chat.example/', 0, signal, () => blocked)
    queueMicrotask(() => queueMicrotask(() => queueMicrotask(() => (blocked = true))))
    await expect(result).resolves.toBeNull()
  })

  it('fails a check that does not answer within the timeout', async () => {
    vi.useFakeTimers()
    stubFetch(() => new Promise<Response>(() => {}))
    const settled = vi.fn()
    void checkOrigin('https://widget.chat.example/', 500, signal, notBlocked).then(settled)
    await vi.advanceTimersByTimeAsync(500)
    expect(settled).toHaveBeenCalledWith(false)
  })
})
