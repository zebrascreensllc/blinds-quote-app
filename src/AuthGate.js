import React, { useState, useEffect } from 'react';
import { subscribeToAuthState, logOut } from './services/authService';
import Login from './components/Login';
import App from './App';

export default function AuthGate() {
  const [user, setUser] = useState(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeToAuthState((firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
    });
    return () => unsubscribe();
  }, []);

  if (!authChecked) {
    return (
      <div style={{ background: '#1a1a1a', minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <p style={{ color: '#888', fontSize: '14px' }}>Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Login />;
  }

  return <App uid={user.uid} onLogout={logOut} />;
}
