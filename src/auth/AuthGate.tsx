import { useEffect, useRef, useState, type ReactNode } from 'react'
import { Center, Loader, Stack, Text } from '@mantine/core'
import { useQueryClient } from '@tanstack/react-query'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { LoginPage } from './LoginPage'
import { NewPasswordPage } from './NewPasswordPage'
import { DemoContext, useDemoSeeding } from '../demo/demo'

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
  const seeding = useDemoSeeding()

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

  if (seeding) {
    return (
      <Center h="100vh">
        <Stack align="center" gap="sm">
          <Loader />
          <Text c="dimmed">Setting up your demo workspace…</Text>
        </Stack>
      </Center>
    )
  }
  if (session === undefined) {
    return (
      <Center h="100vh">
        <Loader />
      </Center>
    )
  }
  if (session && recovering) return <NewPasswordPage onDone={() => setRecovering(false)} />
  return session ? <DemoContext.Provider value={!!session.user.is_anonymous}>{children}</DemoContext.Provider> : <LoginPage />
}
