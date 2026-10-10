// Loads a page's data, and again whenever `source` changes (a route param). Keeps the error for a callout. The data
// is replaced whole, never changed in place, so it isn't made deeply reactive.
import { ref, shallowRef, type Ref, watch, type WatchSource } from 'vue'
import { ProblemError, errorText } from '@vexoulz/platform-web'
import { revealPendingHash } from './hash'

export function useLoad<T>(load: () => Promise<T>, source?: WatchSource) {
  const data = shallowRef<T | null>(null) as Ref<T | null>
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
      if (mine !== run) return
      data.value = value
      void revealPendingHash()
    } catch (e) {
      if (mine !== run) return
      data.value = null
      error.value = errorText(e)
      status.value = e instanceof ProblemError ? e.status : null
    } finally {
      if (mine === run) loading.value = false
    }
  }

  if (source) watch(source, reload, { immediate: true })
  else void reload()
  return { data, error, status, loading, reload }
}
