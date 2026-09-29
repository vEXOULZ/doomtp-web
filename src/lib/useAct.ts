// One helper for every change on a Manage page: run it, say so in a toast, then reload. A failure is a toast too,
// and the form that asked keeps what was typed. `busy` holds the keys of the changes still running.
import { useToast } from '@vexoulz/ui'
import { reactive } from 'vue'
import { errorMessage } from './api'

export function useAct(reload: () => Promise<unknown> | void) {
  const toast = useToast()
  const busy = reactive(new Set<string>())

  /** Whether it worked. */
  async function act(key: string, run: () => Promise<unknown>, done: string): Promise<boolean> {
    busy.add(key)
    try {
      await run()
      toast.show(done)
      await reload()
      return true
    } catch (e) {
      toast.show(errorMessage(e), { kind: 'error', duration: 5000 })
      return false
    } finally {
      busy.delete(key)
    }
  }
  return { busy, act }
}

export const onOff = (on: boolean) => (on ? 'on' : 'off')
