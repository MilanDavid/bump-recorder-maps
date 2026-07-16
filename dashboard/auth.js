// Supabase auth for the dashboard — reuses the mobile app's project + providers
// (Google, Apple, email/password). Gating the filter behind login is a UX
// choice; the map data is public either way. Requires the dashboard's Pages URL
// to be in Supabase Auth -> URL Configuration -> Redirect URLs for OAuth return.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

let _sb = null;

export function initAuth(sbUrl, anon) {
  _sb = createClient(sbUrl, anon, {
    auth: { persistSession: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  return _sb;
}

export async function currentSession() {
  const { data } = await _sb.auth.getSession();
  return data.session; // null when signed out
}

/// Fires on sign-in / sign-out with the new session (or null).
export function onAuth(cb) {
  _sb.auth.onAuthStateChange((_event, session) => cb(session));
}

// Return to this exact page (no hash/query) after the OAuth round-trip.
const redirectTo = () => location.href.split('#')[0].split('?')[0];

export function signInGoogle() {
  return _sb.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: redirectTo() },
  });
}

export function signInApple() {
  return _sb.auth.signInWithOAuth({
    provider: 'apple',
    options: { redirectTo: redirectTo() },
  });
}

/// Returns an error message string, or null on success.
export async function signInEmail(email, password) {
  const { error } = await _sb.auth.signInWithPassword({ email, password });
  return error ? error.message : null;
}

export function signOut() {
  return _sb.auth.signOut();
}
