import { createContext, useContext, useSyncExternalStore } from 'react'
import { supabase } from '../lib/supabase'
import { seedDemoWorkspace } from './seed'

// "Try the demo": sign in anonymously (a private, temporary account) and fill its workspace with sample data.
// While that runs, the app shows a loading screen instead of an empty workspace.

let seeding = false
const listeners = new Set<() => void>()
const setSeeding = (value: boolean) => {
  seeding = value
  listeners.forEach((l) => l())
}

export function useDemoSeeding() {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l)
      return () => listeners.delete(l)
    },
    () => seeding,
  )
}

/** The sign-in screen is replaced by a loading screen while the demo starts, so keep any error for it. */
let lastError: string | null = null
export const takeDemoError = () => {
  const e = lastError
  lastError = null
  return e
}

export async function startDemo() {
  lastError = null
  setSeeding(true)
  try {
    const { error } = await supabase.auth.signInAnonymously()
    if (error) {
      throw new Error(
        /anonymous/i.test(error.message) ? 'The demo is not available right now (anonymous sign-ins are turned off).' : error.message,
      )
    }
    // Tidy up demo accounts older than two days. Not critical if it fails.
    void supabase.rpc('cleanup_demo_accounts').then(() => undefined, () => undefined)
    await seedDemoWorkspace()
  } catch (e) {
    lastError = (e as Error).message
    await supabase.auth.signOut()
  } finally {
    setSeeding(false)
  }
}

/** Leave the demo and delete its data right away. */
export async function exitDemo() {
  await supabase.rpc('delete_my_demo_account').then(() => undefined, () => undefined)
  await supabase.auth.signOut()
}

/** Lets the sign-in screen open on "Create account" after leaving the demo. */
let preferSignUp = false
export const takePreferSignUp = () => {
  const v = preferSignUp
  preferSignUp = false
  return v
}
export async function exitDemoToSignUp() {
  preferSignUp = true
  await exitDemo()
}

/** True when the signed-in session is a demo (anonymous) account. */
export const DemoContext = createContext(false)
export const useIsDemo = () => useContext(DemoContext)
