'use client';
import { FormEvent, useEffect, useState } from 'react';
import Link from 'next/link';
import { AppShell } from './app-shell';

export function VerifyEmailView() {
  const [token, setToken] = useState('');
  const [status, setStatus] = useState<'loading' | 'ready' | 'busy' | 'done' | 'error'>('loading');
  const [message, setMessage] = useState('');
  useEffect(() => { const value = new URLSearchParams(location.search).get('token') || ''; setToken(value); setStatus(value ? 'ready' : 'error'); if (!value) setMessage('This verification link is incomplete.'); }, []);
  return <AppShell><section className="account-token-card"><p className="eyebrow">WOW RIGHT account</p><h1>Verify your email</h1><p>Confirm your email before placing an order.</p>{status === 'done' ? <><p className="form-success">Your email is verified.</p><Link className="button primary" href="/account">Continue to your account</Link></> : <><button className="button primary" disabled={status !== 'ready'} onClick={async () => { setStatus('busy'); const r = await fetch('/api/account/verify-email', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) }); const body = await r.json() as { error?: string }; if (r.ok) setStatus('done'); else { setStatus('error'); setMessage(body.error || 'Email could not be verified.'); } }}>{status === 'busy' ? 'Verifying…' : 'Verify email'}</button>{status === 'error' && <p className="form-error">{message}</p>}</>}</section></AppShell>;
}

export function ResetPasswordView() {
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false), [done, setDone] = useState(false), [error, setError] = useState('');
  useEffect(() => { const value = new URLSearchParams(location.search).get('token') || ''; setToken(value); if (!value) setError('This reset link is incomplete.'); }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError(''); const values = Object.fromEntries(new FormData(event.currentTarget));
    if (values.password !== values.confirmPassword) { setError('Passwords do not match.'); setBusy(false); return; }
    const r = await fetch('/api/account/reset-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, password: values.password }) });
    const body = await r.json() as { error?: string }; setBusy(false); if (r.ok) setDone(true); else setError(body.error || 'Password could not be reset.');
  }
  return <AppShell><section className="account-token-card"><p className="eyebrow">WOW RIGHT account</p><h1>Choose a new password</h1>{done ? <><p className="form-success">Your password has been changed. Other sessions were signed out.</p><Link className="button primary" href="/account">Log in</Link></> : <form onSubmit={submit}><label>New password<input name="password" type="password" required minLength={10} autoComplete="new-password" /><small>Use at least 10 characters.</small></label><label>Confirm password<input name="confirmPassword" type="password" required minLength={10} autoComplete="new-password" /></label>{error && <p className="form-error">{error}</p>}<button className="button primary full" disabled={busy || !token}>{busy ? 'Saving…' : 'Set new password'}</button></form>}</section></AppShell>;
}
