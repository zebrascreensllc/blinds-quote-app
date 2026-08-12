import React, { useState } from 'react';
import { signUp, logIn } from '../services/authService';

// Friendlier text for the Firebase error codes actually likely to show up here.
function friendlyError(err) {
  const code = err?.code || '';
  if (code.includes('email-already-in-use')) return 'An account already exists for that email - try Log In instead.';
  if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) return 'Incorrect email or password.';
  if (code.includes('weak-password')) return 'Password should be at least 6 characters.';
  if (code.includes('invalid-email')) return 'That email address doesn\u2019t look right.';
  if (code.includes('network-request-failed')) return 'No connection right now - this first sign-in needs signal. Try again once you have it.';
  return 'Something went wrong. Please try again.';
}

export default function Login() {
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async () => {
    setError('');
    if (!email.trim() || !password) {
      setError('Enter both email and password.');
      return;
    }
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signUp(email.trim(), password);
      } else {
        await logIn(email.trim(), password);
      }
      // No further action needed here - the app's auth-state subscription
      // (wherever it's wired in) picks up the signed-in user automatically.
    } catch (err) {
      setError(friendlyError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px 16px' }}>
      <div style={{ width: '100%', maxWidth: '360px' }}>
        <h1 style={{ color: '#d4af37', fontSize: '22px', fontWeight: 'bold', fontFamily: 'Georgia, serif', textAlign: 'center', marginBottom: '8px' }}>
          Zebra Screens & Rollers
        </h1>
        <p style={{ color: '#888', fontSize: '13px', textAlign: 'center', marginBottom: '28px' }}>
          {mode === 'signup' ? 'Create your account' : 'Sign in to sync across your devices'}
        </p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoCapitalize="none"
          style={{ width: '100%', padding: '14px', borderRadius: '8px', marginBottom: '12px', fontSize: '15px', background: '#0a0a0a', border: '1px solid #444', color: 'white', boxSizing: 'border-box' }}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSubmit(); }}
          style={{ width: '100%', padding: '14px', borderRadius: '8px', marginBottom: '12px', fontSize: '15px', background: '#0a0a0a', border: '1px solid #444', color: 'white', boxSizing: 'border-box' }}
        />

        {error && (
          <p style={{ color: '#ef4444', fontSize: '13px', marginBottom: '12px' }}>{error}</p>
        )}

        <button
          onClick={handleSubmit}
          disabled={busy}
          style={{ width: '100%', padding: '14px', borderRadius: '8px', background: '#d4af37', color: '#000', border: 'none', fontWeight: 'bold', fontSize: '15px', cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1, marginBottom: '16px' }}
        >
          {busy ? 'Please wait...' : (mode === 'signup' ? 'Create Account' : 'Log In')}
        </button>

        <button
          onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}
          style={{ width: '100%', background: 'none', border: 'none', color: '#7dd3fc', fontSize: '13px', cursor: 'pointer', textAlign: 'center' }}
        >
          {mode === 'signup' ? 'Already have an account? Log In' : 'New here? Create an account'}
        </button>
      </div>
    </div>
  );
}
