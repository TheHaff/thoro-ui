const CSS = `
:host {
  --_bg: var(--thoro-bg, #fffbeb);
  --_fg: var(--thoro-fg, #422006);
  --_border: var(--thoro-border, #f59e0b);
  --_accent: var(--thoro-accent, #b45309);
  display: block;
  font-family: var(--thoro-font, system-ui, sans-serif);
  font-size: 14px;
  line-height: 1.45;
}
:host([hidden]) {
  display: none;
}
@media (prefers-color-scheme: dark) {
  :host {
    --_bg: var(--thoro-bg, #2b1d0e);
    --_fg: var(--thoro-fg, #fdecc8);
    --_border: var(--thoro-border, #b45309);
    --_accent: var(--thoro-accent, #f59e0b);
  }
}
.root {
  position: relative;
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: start;
  padding: 12px 16px;
  color: var(--_fg);
  background: var(--_bg);
  border: 1px solid var(--_border);
  border-radius: var(--thoro-radius, 8px);
}
:host([variant='banner']) .root {
  border-width: 0 0 1px;
  border-radius: 0;
}
.icon {
  width: 20px;
  height: 20px;
  color: var(--_accent);
}
.body {
  min-width: 0;
}
p {
  margin: 0;
}
.title {
  font-weight: 600;
}
details {
  margin-top: 6px;
}
summary {
  width: fit-content;
  cursor: pointer;
}
ul {
  margin: 8px 0;
  padding-left: 20px;
}
pre {
  margin: 6px 0 8px;
  padding: 8px;
  overflow-x: auto;
  font-size: 13px;
  background: color-mix(in srgb, var(--_fg) 6%, transparent);
  border-radius: 4px;
}
button {
  font: inherit;
  color: inherit;
  cursor: pointer;
  background: transparent;
}
.copy {
  padding: 4px 10px;
  border: 1px solid var(--_border);
  border-radius: 6px;
}
.dismiss {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  font-size: 18px;
  line-height: 1;
  border: 0;
  border-radius: 6px;
}
button:focus-visible,
summary:focus-visible {
  outline: 2px solid var(--_accent);
  outline-offset: 2px;
}
.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
  white-space: nowrap;
}
`

let sheet: CSSStyleSheet | undefined

/** One constructed sheet shared by every instance; created on first use, never at import. */
export function canarySheet(): CSSStyleSheet {
  if (!sheet) {
    sheet = new CSSStyleSheet()
    sheet.replaceSync(CSS)
  }
  return sheet
}
