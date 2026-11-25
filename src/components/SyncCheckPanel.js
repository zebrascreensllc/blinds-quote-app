import React, { useEffect, useMemo, useState } from 'react';
import { subscribeToSyncChecks, saveSyncCheck } from '../services/syncCheckSync';
import { getDeviceId, deviceLabel, summarizeQuotes, describeOtherDevices } from '../utils/syncCheck';

// "Check sync" on the main menu (owner's request, 2026-11-25). Tap it on
// the phone, then on the laptop: each shows whether the cloud confirmed this
// device's check, and what the other device last saw. If both show the same
// number of quotes and the same newest save, they are in sync.
export default function SyncCheckPanel({ uid, quotes }) {
  const deviceId = useMemo(() => getDeviceId(), []);
  const [records, setRecords] = useState([]);
  const [status, setStatus] = useState(null); // null | 'checking' | {ok, queued, at} | {error}
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!uid || !open) return undefined;
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToSyncChecks(uid, list => setRecords(Array.isArray(list) ? list : []), () => setRecords([]));
    } catch (e) {
      setRecords([]);
    }
    return () => { try { unsubscribe(); } catch (e) { /* already closed */ } };
  }, [uid, open]);

  const mine = summarizeQuotes(quotes);
  const others = describeOtherDevices(records, deviceId, mine);

  const runCheck = async () => {
    if (status === 'checking') return;
    setStatus('checking');
    const at = new Date().toISOString();
    try {
      const result = await saveSyncCheck(uid, { id: deviceId, label: deviceLabel(navigator.userAgent), checkedAt: at, ...mine });
      setStatus({ ok: true, queued: !!(result && result.queued), at });
    } catch (e) {
      console.error('Sync check failed:', e);
      setStatus({ error: e?.message || String(e) });
    }
  };

  const fmt = (iso) => (iso ? new Date(iso).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'never');

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} style={{ marginTop: '10px', background: 'none', border: '1px solid #444', borderRadius: '6px', color: '#aaa', fontSize: '12px', padding: '6px 12px', cursor: 'pointer' }}>
        🔄 Check sync with my other devices
      </button>
    );
  }

  return (
    <div style={{ marginTop: '12px', textAlign: 'left', background: '#222', border: '1px solid #444', borderRadius: '8px', padding: '12px', fontSize: '13px', color: '#ccc' }}>
      <p style={{ margin: '0 0 8px 0', color: '#fff', fontWeight: 'bold' }}>Sync check</p>
      <p style={{ margin: '0 0 8px 0' }}>This {deviceLabel(navigator.userAgent)} has <b>{mine.quoteCount}</b> quote{mine.quoteCount === 1 ? '' : 's'}; newest saved {fmt(mine.newestQuoteAt)}.</p>
      <button type="button" disabled={status === 'checking'} onClick={runCheck} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: 'none', background: '#0e7490', color: '#fff', fontWeight: 'bold', fontSize: '14px', cursor: 'pointer', marginBottom: '8px' }}>
        {status === 'checking' ? 'Checking...' : 'Check now'}
      </button>
      {status && status.ok && !status.queued && <p style={{ margin: '0 0 8px 0', color: '#4ade80' }}>✅ The cloud confirmed this device at {fmt(status.at)}.</p>}
      {status && status.ok && status.queued && <p style={{ margin: '0 0 8px 0', color: '#fbbf24' }}>📶 No signal right now - saved on this device; it will reach the cloud when you're back online. Try again with signal.</p>}
      {status && status.error && <p style={{ margin: '0 0 8px 0', color: '#f87171' }}>❌ Could not reach the cloud: {status.error}</p>}
      {others.length === 0 ? (
        <p style={{ margin: 0, color: '#888' }}>No other device has checked in yet. Open the app on your other device and tap "Check now" there too.</p>
      ) : others.map(o => (
        <p key={o.id} style={{ margin: '6px 0 0 0' }}>
          {o.status === 'same' ? '✅' : '⚠️'} <b>{o.label}</b> (checked {fmt(o.checkedAt)}): {o.quoteCount} quote{o.quoteCount === 1 ? '' : 's'}
          {o.status === 'same' && ' - same as this device.'}
          {o.status === 'other-newer' && ' - it had a newer save than this device. Close and reopen the app here, then check again.'}
          {o.status === 'different' && ' - different from this device. Tap "Check now" on that device again to refresh.'}
        </p>
      ))}
    </div>
  );
}
