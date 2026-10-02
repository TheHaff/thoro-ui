export type CanaryStrings = {
  cause: string
  copied: string
  copy: string
  details: string
  dismiss: string
  itAsk: string
  title: string
}

export const DEFAULT_STRINGS: Readonly<CanaryStrings> = {
  title: "Some features couldn't load",
  cause: 'This is usually caused by a browser extension or your network settings.',
  details: 'Details',
  itAsk: 'Ask your IT team to allow these addresses:',
  copy: 'Copy for IT',
  copied: 'Copied',
  dismiss: 'Dismiss',
}

/** The defaults overlaid with the caller's strings. Anything that is not a string is ignored. */
export function resolveStrings(overrides: Partial<CanaryStrings> | null | undefined): CanaryStrings {
  const strings: CanaryStrings = { ...DEFAULT_STRINGS }
  for (const key of Object.keys(strings) as Array<keyof CanaryStrings>) {
    const value = overrides?.[key]
    if (typeof value === 'string') strings[key] = value
  }
  return strings
}
