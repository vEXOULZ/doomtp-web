// What every page's chrome needs from the bot (version, default sign, whether admin exists), loaded once.
import { reactive } from 'vue'
import { api, errorMessage, type Site } from './api'

export const site = reactive<{ info: Site | null; error: string | null }>({ info: null, error: null })

let loading: Promise<Site | null> | null = null

/** Loads /api/v1/site once; later calls share the same answer. */
export function loadSite(): Promise<Site | null> {
  loading ??= api.site().then(
    (info) => (site.info = info),
    (e: unknown) => {
      site.error = errorMessage(e)
      loading = null // let the next page try again
      return null
    },
  )
  return loading
}

/** The bot's default command sign, or its long-standing default while /site loads. */
export const defaultSign = () => site.info?.default_prefix ?? '🏜'
