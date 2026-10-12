// Anchors (#grammar, #variables) on pages that render after their data loads: the router can't scroll to them on
// arrival, so this watches the page until the anchor appears and scrolls there then. The clearance above an anchor
// is html's scroll-padding-top (styles.css): scrollIntoView honours it, the router is handed it.

/** How long to wait for an anchor before giving up on it (a page whose load failed never renders it). */
const PATIENCE = 10_000
let watching: MutationObserver | null = null

const target = (hash: string) => document.getElementById(decodeURIComponent(hash.slice(1)))

/** html's scroll-padding-top, read at scroll time; the router's own scroll (window.scrollTo) doesn't apply it. */
const clearance = () => parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0

/** For the router's scrollBehavior: the anchor's position if it's on the page yet, else no scroll (for now). */
export function hashPosition(hash: string): { el: HTMLElement; top: number } | false {
  watching?.disconnect()
  watching = null
  const el = target(hash)
  if (!el) reveal(hash)
  return el ? { el, top: clearance() } : false
}

/** Scrolls to the anchor once it renders. */
function reveal(hash: string) {
  const observer = new MutationObserver(() => {
    const el = target(hash)
    if (!el) return
    stop()
    el.scrollIntoView()
  })
  const stop = () => {
    observer.disconnect()
    if (watching === observer) watching = null
  }
  watching = observer
  observer.observe(document.body, { childList: true, subtree: true })
  setTimeout(stop, PATIENCE)
}
