// Loads a page's data, and again whenever `source` changes (a route param). Keeps the error for a callout.
import { ref, type Ref, watch, type WatchSource } from 'vue'
import { ApiError } from './api'

export function useLoad<T>(load: () => Promise<T>, source?: WatchSource) {
  const data = ref<T | null>(null) as Ref<T | null>
  const error = ref<string | null>(null)
  const status = ref<number | null>(null)
  const loading = ref(false)
  let run = 0

  async function reload() {
    const mine = ++run
    loading.value = true
    error.value = null
    status.value = null
    try {
      const value = await load()
      if (mine === run) data.value = value
    } catch (e) {
      if (mine !== run) return
      data.value = null
      error.value = e instanceof Error ? e.message : String(e)
      status.value = e instanceof ApiError ? e.status : null
    } finally {
      if (mine === run) loading.value = false
    }
  }

  if (source) watch(source, reload, { immediate: true })
  else void reload()
  return { data, error, status, loading, reload }
}
