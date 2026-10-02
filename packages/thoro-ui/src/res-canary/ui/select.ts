/** Selects a node's text so the user can copy it by hand when the clipboard is unavailable. */
export function selectContents(node: Node): void {
  try {
    const range = document.createRange()
    range.selectNodeContents(node)
    const selection = document.getSelection()
    selection?.removeAllRanges()
    selection?.addRange(range)
  } catch {
    // Best-effort: some engines refuse to select inside a shadow root.
  }
}
