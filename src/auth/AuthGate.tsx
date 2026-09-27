import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Center, Loader } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { LoginPage } from './LoginPage'
import { NewPasswordPage } from './NewPasswordPage'

/** Remove the one-time `?code=` Supabase adds to email links, so reloading doesn't try to use it again. */
function cleanAuthParams() {
  const url = new URL(window.location.href)
  if (!url.searchParams.has('code')) return
  url.searchParams.delete('code')
  window.history.replaceState(null, '', url.toString())
}

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null | undefined>(undefined)
  const [recovering, setRecovering] = useState(false)
  const qc = useQueryClient()
  const userId = useRef<string | null | undefined>(undefined)

  useEffect(() => {
    const track = (next: Session | null) => {
      // Different people can use the same browser: never show one account's cached data to another.
      const id = next?.user.id ?? null
      if (userId.current !== undefined && userId.current !== id) qc.clear()
      userId.current = id
      setSession(next)
    }
    supabase.auth.getSession().then(({ data }) => {
      track(data.session)
      cleanAuthParams()
    })
    const { data } = supabase.auth.onAuthStateChange((event, next) => {
      track(next)
      if (event === 'PASSWORD_RECOVERY') setRecovering(true)
      cleanAuthParams()
    })
    return () => data.subscription.unsubscribe()
  }, [qc])

  if (session === undefined) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }
  if (session && recovering) return <NewPasswordPage onDone={() => setRecovering(false)} />
  return session ? <>{children}</> : <LoginPage />
}
