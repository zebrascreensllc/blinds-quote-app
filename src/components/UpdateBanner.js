import React, { useEffect, useState } from 'react';

// Shows "New version ready - Update" when a newer build has been deployed.
//
// Why: on an iPhone, an app saved to the home screen (or a Safari tab left
// open) often resumes the copy already in memory instead of loading the
// page again, so after a deploy the owner kept seeing the old app even after
// "closing" it. This checks the live page for a different main script and
// offers a one-tap reload. It never reloads by itself, so nothing typed on
// a half-finished quote is lost. Offline, the check just fails quietly.

const MAIN_SCRIPT_RE = /\/static\/js\/main\.[a-z0-9]+\.js/i;
const CHECK_EVERY_MS = 5 * 60 * 1000;

function currentMainScript() {
  const el = Array.from(document.scripts).find(s => MAIN_SCRIPT_RE.test(s.src || ''));
  const m = el && el.src.match(MAIN_SCRIPT_RE);
  return m ? m[0] : null;
}

export async function fetchLiveMainScript() {
  const res = await fetch(`/?v=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) return null;
  const html = await res.text();
  const m = html.match(MAIN_SCRIPT_RE);
  return m ? m[0] : null;
}

export default function UpdateBanner() {
  const [updateReady, setUpdateReady] = useState(false);

  useEffect(() => {
    const running = currentMainScript();
    // Dev server (no hashed bundle) - nothing to compare against.
    if (!running) return undefined;

    let cancelled = false;
    const check = async () => {
      try {
        const live = await fetchLiveMainScript();
        if (!cancelled && live && live !== running) setUpdateReady(true);
      } catch (e) {
        // Offline or a flaky connection - try again next time.
      }
    };
    const onVisible = () => { if (document.visibilityState === 'visible') check(); };

    check();
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = setInterval(check, CHECK_EVERY_MS);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(timer);
    };
  }, []);

  if (!updateReady) return null;

  return (
    <div
      role="status"
      style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 2000, background: '#0e7490', color: '#fff', padding: '12px 16px calc(12px + env(safe-area-inset-bottom))', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', boxShadow: '0 -2px 10px rgba(0,0,0,0.4)', fontSize: '14px' }}
    >
      <span>A new version of the app is ready. Save anything you're typing first.</span>
      <button
        onClick={() => window.location.reload()}
        style={{ flexShrink: 0, padding: '10px 16px', borderRadius: '8px', border: 'none', background: '#fff', color: '#0e7490', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer' }}
      >
        Update
      </button>
    </div>
  );
}
