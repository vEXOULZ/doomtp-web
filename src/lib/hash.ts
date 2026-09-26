// Anchors (#grammar, #variables) on pages that render after their data loads: the router can't scroll to them on
// arrival, so it leaves the hash here and useLoad scrolls there once the data is on the page.
import { nextTick } from 'vue'

/** The sticky header's height, kept clear above the anchor. */
const HEAD = 64
let pending: string | null = null

const target = (hash: string) => document.getElementById(decodeURIComponent(hash.slice(1)))

/** For the router's scrollBehavior: the anchor's position if it's on the page yet, else no scroll (for now). */
export function hashPosition(hash: string): { el: HTMLElement; top: number } | false {
  const el = target(hash)
  pending = el ? null : hash
  return el ? { el, top: HEAD } : false
}

/** Scrolls to an anchor the router couldn't find yet, once it has rendered. */
export async function revealPendingHash(): Promise<void> {
  if (!pending) return
  await nextTick()
  const el = pending && target(pending)
  if (!el) return
  pending = null
  window.scrollTo({ top: el.getBoundingClientRect().top + window.scrollY - HEAD })
}
