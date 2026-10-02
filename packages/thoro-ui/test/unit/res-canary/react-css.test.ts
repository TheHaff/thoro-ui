import { reactCss } from '../../../scripts/react-css.ts'
import { CANARY_CSS } from '../../../src/res-canary/ui/styles.ts'

const css = reactCss(CANARY_CSS, 'thoro-res-canary')

describe('reactCss', () => {
  it('turns :host into the React root class and the banner host selector into a modifier', () => {
    expect(css).toContain('.thoro-res-canary {')
    expect(css).toContain('.thoro-res-canary--banner .thoro-res-canary__root {')
    expect(css).not.toContain(':host')
  })

  it('drops the hidden rule, because the React component renders nothing instead of hiding', () => {
    expect(css).not.toContain('[hidden]')
  })

  it('prefixes every class with the block name', () => {
    const classes = [...css.matchAll(/\.([a-z][a-z_-]*)/g)].map(match => match[1])
    expect(classes.length).toBeGreaterThan(10)
    expect(classes.filter(name => name !== 'thoro-res-canary' && !/^thoro-res-canary(__|--)/.test(name))).toEqual([])
  })

  it('rewrites classes in selectors only, never dots inside values', () => {
    const source = ".icon {\n  background: url(warning.svg);\n  content: 'see docs.example';\n}\n"
    expect(reactCss(source, 'blk')).toBe(
      ".blk__icon {\n  background: url(warning.svg);\n  content: 'see docs.example';\n}\n",
    )
  })

  it('drops the hidden rule however it is spaced', () => {
    expect(reactCss(':host([hidden]){display:none}\n.root {\n}\n', 'blk')).toBe('.blk__root {\n}\n')
  })

  it('keeps the theme variables and the dark-mode block', () => {
    expect(css).toContain('--_bg: var(--thoro-bg, #fffbeb);')
    expect(css).toContain('@media (prefers-color-scheme: dark) {\n  .thoro-res-canary {')
  })
})
