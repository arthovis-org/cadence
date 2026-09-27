import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    // Email links (confirm account, reset password) come back with ?code=... instead of #tokens,
    // which would clash with the app's #/ routes.
    flowType: 'pkce',
    detectSessionInUrl: true,
  },
})
