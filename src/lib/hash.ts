// Anchors (#grammar, #variables) on pages that render after their data loads: the router can't scroll to them on
// arrival, so this watches the page until the anchor appears and scrolls there then.

/** The sticky header's height, kept clear above the anchor. */
const HEAD = 64
/** How long to wait for an anchor before giving up on it (a page whose load failed never renders it). */
const PATIENCE = 10_000
let watching: MutationObserver | null = null

const target = (hash: string) => document.getElementById(decodeURIComponent(hash.slice(1)))

/** For the router's scrollBehavior: the anchor's position if it's on the page yet, else no scroll (for now). */
export function hashPosition(hash: string): { el: HTMLElement; top: number } | false {
  watching?.disconnect()
  watching = null
  const el = target(hash)
  if (!el) reveal(hash)
  return el ? { el, top: HEAD } : false
}

/** Scrolls to the anchor once it renders. */
function reveal(hash: string) {
  const observer = new MutationObserver(() => {
    const el = target(hash)
    if (!el) return
    stop()
    window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEAD })
  })
  const stop = () => {
    observer.disconnect()
    if (watching === observer) watching = null
  }
  watching = observer
  observer.observe(document.body, { childList: true, subtree: true })
  setTimeout(stop, PATIENCE)
}
