import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { BlockedFeature, Canary, Snapshot } from '../types.ts'
import type { CanaryCopyDetail, CanaryVariant } from '../ui/element.ts'
import { originsText, summaryText } from '../ui/render.ts'
import { selectContents } from '../ui/select.ts'
import { resolveStrings, type CanaryStrings } from '../ui/strings.ts'

/** Added to the part's own classes, so utility classes and CSS modules can style it. Keys match the element's parts. */
type ClassNames = Partial<
  Record<
    'ask' | 'copy' | 'details' | 'dismiss' | 'icon' | 'list' | 'origins' | 'root' | 'summary' | 'title' | 'toggle',
    string
  >
>

export type ResCanaryProps = {
  canary?: Canary
  className?: string
  classNames?: ClassNames
  items?: readonly BlockedFeature[]
  lang?: string
  onCopy?: (detail: CanaryCopyDetail) => void
  onDismiss?: (ids: string[]) => void
  strings?: Partial<CanaryStrings>
  variant?: CanaryVariant
}

const BLOCK = 'thoro-res-canary'
const NOTHING: readonly BlockedFeature[] = []
const noSubscription = (): (() => void) => () => {}
const noSnapshot = (): undefined => undefined

/** `thoro-res-canary__<name>` for each name: the classes react.css derives from the element's CSS. */
const cls = (...names: string[]): string => names.map(name => `${BLOCK}__${name}`).join(' ')

/** Native React rendering of the canary: the element's structure and text, without a custom element. */
export function ResCanary(props: ResCanaryProps): ReactElement | null {
  const {
    canary,
    className,
    classNames,
    items,
    lang,
    onCopy,
    onDismiss,
    strings: overrides,
    variant = 'inline',
  } = props
  // Controlled mode ignores the canary entirely, so it doesn't even subscribe.
  const source = items === undefined ? canary : undefined
  // The server snapshot is always empty: a block can reach the canary while the HTML is still parsing,
  // so hydrating with the live snapshot would not match the server's markup. React re-renders with the
  // live snapshot straight after hydrating.
  const snapshot = useSyncExternalStore<Snapshot | undefined>(
    source?.subscribe ?? noSubscription,
    source?.getSnapshot ?? noSnapshot,
    noSnapshot,
  )
  const origins = useRef<HTMLPreElement>(null)
  // The text that was last copied: "Copied" shows only while the list still produces that text.
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const shown = items ?? (snapshot && !snapshot.dismissed ? snapshot.blocked : NOTHING)
  if (shown.length === 0) return null

  const strings = resolveStrings(overrides)
  const locale = lang ?? ((typeof document === 'undefined' ? '' : document.documentElement.lang) || 'en')
  const text = originsText(shown)
  const copied = copiedText === text

  const copy = async (): Promise<void> => {
    let ok = false
    try {
      await navigator.clipboard.writeText(text)
      ok = true
    } catch {
      // No clipboard (insecure context, denied permission): select the list so it can be copied by hand.
    }
    if (ok) setCopiedText(text)
    else if (origins.current) selectContents(origins.current)
    onCopy?.({ copied: ok, text })
  }

  const dismiss = (): void => {
    onDismiss?.(shown.map(item => item.id))
    if (items === undefined) canary?.dismiss()
  }

  // The part's own classes come first, then the app's from classNames.
  const part = (name: keyof ClassNames, ...more: string[]): string =>
    [cls(...more, name), classNames?.[name]].filter(Boolean).join(' ')

  return (
    <div className={[BLOCK, `${BLOCK}--${variant}`, className].filter(Boolean).join(' ')}>
      <div aria-label={strings.title} className={part('root')} role="region">
        <svg aria-hidden="true" className={part('icon')} viewBox="0 0 24 24">
          <path
            d="M12 3 2 21h20L12 3Zm0 6v5m0 3v.01"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="2"
          />
        </svg>
        <div className={cls('body')}>
          <p className={part('summary')} role="status">
            <span className={part('title')}>{summaryText(shown, strings, locale)}</span> {strings.cause}
            <span className={cls('visually-hidden')}>{copied ? strings.copied : ''}</span>
          </p>
          <details className={part('details')}>
            <summary className={part('toggle')}>{strings.details}</summary>
            <ul className={part('list')}>
              {shown.map(item => (
                <li key={item.id}>{`${item.label} — ${item.impact}`}</li>
              ))}
            </ul>
            <p className={part('ask')}>{strings.itAsk}</p>
            <pre className={part('origins')} ref={origins}>
              {text}
            </pre>
            <button className={part('copy', 'button')} onClick={() => void copy()} type="button">
              {copied ? strings.copied : strings.copy}
            </button>
          </details>
        </div>
        <button aria-label={strings.dismiss} className={part('dismiss', 'button')} onClick={dismiss} type="button">
          ×
        </button>
      </div>
    </div>
  )
}
