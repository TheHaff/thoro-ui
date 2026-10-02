// Copy buttons for every code block, and tabs for alternatives. Both enhance plain HTML: without
// JavaScript every tab panel shows and code can be selected by hand.
for (const pre of document.querySelectorAll('pre.code')) {
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'copy'
  button.textContent = 'Copy'
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(pre.querySelector('code')?.textContent ?? '')
      button.textContent = 'Copied'
    } catch {
      button.textContent = 'Select and copy'
    }
    setTimeout(() => {
      button.textContent = 'Copy'
    }, 2000)
  })
  pre.append(button)
}

for (const tabs of document.querySelectorAll('[data-tabs]')) {
  const buttons = [...tabs.querySelectorAll('[role="tab"]')]
  const panels = [...tabs.querySelectorAll('[role="tabpanel"]')]
  const select = index => {
    buttons.forEach((button, i) => {
      button.setAttribute('aria-selected', String(i === index))
      button.tabIndex = i === index ? 0 : -1
    })
    panels.forEach((panel, i) => {
      panel.hidden = i !== index
    })
  }
  buttons.forEach((button, i) => {
    button.addEventListener('click', () => select(i))
    button.addEventListener('keydown', event => {
      if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
      const next = (i + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length
      select(next)
      buttons[next].focus()
    })
  })
  tabs.dataset.ready = ''
  select(0)
}
