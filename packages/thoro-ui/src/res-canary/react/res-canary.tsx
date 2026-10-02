import { useRef, useState, useSyncExternalStore, type ReactElement } from 'react'
import type { BlockedFeature, Canary, Snapshot } from '../types.ts'
import type { CanaryCopyDetail, CanaryVariant } from '../ui/element.ts'
import { originsText, summaryText } from '../ui/render.ts'
import { selectContents } from '../ui/select.ts'
import { resolveStrings, type CanaryStrings } from '../ui/strings.ts'

export type ResCanaryProps = {
  canary?: Canary
  className?: string
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
  const { canary, className, items, lang, onCopy, onDismiss, strings: overrides, variant = 'inline' } = props
  // Controlled mode ignores the canary entirely, so it doesn't even subscribe.
  const source = items === undefined ? canary : undefined
  const snapshot = useSyncExternalStore<Snapshot | undefined>(
    source?.subscribe ?? noSubscription,
    source?.getSnapshot ?? noSnapshot,
    source?.getSnapshot ?? noSnapshot,
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

  return (
    <div className={[BLOCK, `${BLOCK}--${variant}`, className].filter(Boolean).join(' ')}>
      <div aria-label={strings.title} className={cls('root')} role="region">
        <svg aria-hidden="true" className={cls('icon')} viewBox="0 0 24 24">
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
          <p className={cls('summary')} role="status">
            <span className={cls('title')}>{summaryText(shown, strings, locale)}</span> {strings.cause}
            <span className={cls('visually-hidden')}>{copied ? strings.copied : ''}</span>
          </p>
          <details className={cls('details')}>
            <summary className={cls('toggle')}>{strings.details}</summary>
            <ul className={cls('list')}>
              {shown.map(item => (
                <li key={item.id}>{`${item.label} — ${item.impact}`}</li>
              ))}
            </ul>
            <p className={cls('ask')}>{strings.itAsk}</p>
            <pre className={cls('origins')} ref={origins}>
              {text}
            </pre>
            <button className={cls('button', 'copy')} onClick={() => void copy()} type="button">
              {copied ? strings.copied : strings.copy}
            </button>
          </details>
        </div>
        <button aria-label={strings.dismiss} className={cls('button', 'dismiss')} onClick={dismiss} type="button">
          ×
        </button>
      </div>
    </div>
  )
}
