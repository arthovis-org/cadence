import { useState, type FormEvent } from 'react'
import { Alert, Button, Center, Paper, PasswordInput, Stack, Text, Title } from '@mantine/core'
import { notifications } from '@mantine/notifications'
import { supabase } from '../lib/supabase'

/** Shown after opening a password-reset link: the user is signed in and picks a new password. */
export function NewPasswordPage({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (password.length < 8) return setError('Use at least 8 characters.')
    if (password !== confirm) return setError("The passwords don't match.")
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password })
    setLoading(false)
    if (error) return setError(error.message)
    notifications.show({ color: 'green', message: 'Password updated' })
    onDone()
  }

  return (
    <Center mih="100vh" p="md">
      <Paper withBorder shadow="sm" p="xl" w="100%" maw={400}>
        <form onSubmit={submit}>
          <Stack>
            <Title order={3}>Choose a new password</Title>
            <Text size="sm" c="dimmed">
              You're signed in from the reset link. Pick a new password to finish.
            </Text>
            {error && <Alert color="red">{error}</Alert>}
            <PasswordInput label="New password" description="At least 8 characters" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.currentTarget.value)} data-autofocus />
            <PasswordInput label="Confirm new password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.currentTarget.value)} />
            <Button type="submit" loading={loading}>
              Save password
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  )
}
