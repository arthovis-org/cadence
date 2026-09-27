import { useState, type FormEvent } from 'react'
import { Alert, Anchor, Button, Center, Divider, Group, Paper, PasswordInput, SegmentedControl, Stack, Text, TextInput, Title } from '@mantine/core'
import { IconCircleCheck, IconClockHour4, IconFlask } from '@tabler/icons-react'
import { supabase } from '../lib/supabase'
import { startDemo, takeDemoError, takePreferSignUp } from '../demo/demo'

type Mode = 'signin' | 'signup' | 'reset'

/** Where Supabase sends people back to after they click a link in an email (confirm account, reset password). */
const redirectTo = () => window.location.origin + window.location.pathname

export function LoginPage() {
  const [mode, setMode] = useState<Mode>(() => (takePreferSignUp() ? 'signup' : 'signin'))
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(takeDemoError)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  function tryDemo() {
    setError(null)
    void startDemo() // errors come back through takeDemoError when this screen reappears
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
    setPassword('')
    setConfirm('')
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)

    if (mode === 'signup') {
      if (password.length < 8) return setError('Use at least 8 characters for your password.')
      if (password !== confirm) return setError("The passwords don't match.")
    }

    setLoading(true)
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) setError(error.message === 'Email not confirmed' ? 'Please confirm your email first. Check your inbox for the link.' : error.message)
    } else if (mode === 'signup') {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: redirectTo() } })
      if (error) setError(error.message)
      // With email confirmation off, Supabase signs the new user in right away (AuthGate takes over).
      else if (!data.session) {
        setNotice(`Almost there! We sent a confirmation link to ${email}. Open it to activate your account, then sign in.`)
        switchModeKeepNotice('signin')
      }
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirectTo() })
      if (error) setError(error.message)
      else setNotice(`If an account exists for ${email}, we sent a link to reset the password.`)
    }
    setLoading(false)
  }

  function switchModeKeepNotice(next: Mode) {
    setMode(next)
    setPassword('')
    setConfirm('')
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <Group gap="xs">
              <IconClockHour4 size={28} color="var(--mantine-color-indigo-6)" />
              <Title order={2}>Cadence</Title>
            </Group>

            {mode === 'reset' ? (
              <Text size="sm" c="dimmed">
                Enter your email and we'll send you a link to choose a new password.
              </Text>
            ) : (
              <SegmentedControl
                fullWidth
                value={mode}
                onChange={(v) => switchMode(v as Mode)}
                data={[
                  { value: 'signin', label: 'Sign in' },
                  { value: 'signup', label: 'Create account' },
                ]}
              />
            )}

            {error && <Alert color="red">{error}</Alert>}
            {notice && (
              <Alert color="teal" icon={<IconCircleCheck size={18} />}>
                {notice}
              </Alert>
            )}

            <TextInput
              label="Email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.currentTarget.value)}
            />
            {mode !== 'reset' && (
              <PasswordInput
                label="Password"
                description={mode === 'signup' ? 'At least 8 characters' : undefined}
                autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                required
                value={password}
                onChange={(e) => setPassword(e.currentTarget.value)}
              />
            )}
            {mode === 'signup' && (
              <PasswordInput
                label="Confirm password"
                autoComplete="new-password"
                required
                value={confirm}
                onChange={(e) => setConfirm(e.currentTarget.value)}
              />
            )}

            <Button type="submit" loading={loading}>
              {mode === 'signin' ? 'Sign in' : mode === 'signup' ? 'Create account' : 'Send reset link'}
            </Button>

            {mode === 'signin' && (
              <Anchor component="button" type="button" size="sm" ta="center" onClick={() => switchMode('reset')}>
                Forgot your password?
              </Anchor>
            )}
            {mode === 'reset' && (
              <Anchor component="button" type="button" size="sm" ta="center" onClick={() => switchMode('signin')}>
                Back to sign in
              </Anchor>
            )}

            {mode !== 'reset' && (
              <>
                <Divider label="or" labelPosition="center" />
                <Button variant="light" color="grape" leftSection={<IconFlask size={16} />} onClick={tryDemo}>
                  Try the demo
                </Button>
                <Text size="xs" c="dimmed" ta="center">
                  No account needed. Explore a workspace filled with sample projects, time and invoices.
                </Text>
              </>
            )}
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
