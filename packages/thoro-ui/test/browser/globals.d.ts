type HarnessProbe = { type: 'fetch' | 'image' | 'script' | 'style'; url: string }

declare global {
  var harness: {
    own: unknown[]
    violations: Array<{ blockedURI: string; directive: string }>
    start(options?: { banner?: boolean; probe?: HarnessProbe; probeTimeoutMs?: number }): void
    loadScript(path: string): void
    loadImage(path: string): void
    status(): string
    blockedIds(): string[]
    bannerText(): string | null
    bannerPadding(): string | null
  }
  var reactHarness: { bannerText(): string | null; rootPadding(): string | null; violations: string[] }
  var sheetCheck: { paddingLeft(): string; violations: string[] }
}

export {}
