import React, { useState } from 'react';
import { formatMoney } from '../../utils/formatters';
import { JOB_STAGES, lineageJob, setJobStage, addPayment, removePayment, parsePaymentAmount } from '../../utils/jobProgress';

// "Job progress" card on the quote screen, shown once the quote is ordered
// (owner's request, 2026-11-25): tap each stage as it happens, and record
// payments received so the balance owed is always on the quote.
// Every change is one updateQuotes() call, awaited and checked (rule 3).
export default function JobProgressCard({ quote, quotes, updateQuotes, grandTotal, syncFailureMessage, busy, setBusy }) {
  const [adding, setAdding] = useState(false);
  const [amountText, setAmountText] = useState('');
  const [noteText, setNoteText] = useState('');
  const job = lineageJob(quotes, quote.lineageId || quote.id);
  if (!job.orderedAt && !quote.orderedAt) return null;

  const save = async (nextQuotes) => {
    if (busy) return false;
    setBusy(true);
    try {
      const result = await updateQuotes(nextQuotes);
      if (!result.success) { alert(syncFailureMessage(result.errors)); return false; }
      return true;
    } finally {
      setBusy(false);
    }
  };

  const toggleStage = async (stage) => {
    const on = !job[stage.key];
    if (!on && !window.confirm(`Undo "${stage.label}"?`)) return;
    await save(setJobStage(quotes, quote, stage.key, on));
  };

  const amount = parsePaymentAmount(amountText);
  const submitPayment = async () => {
    if (amount === null) { alert('Enter the amount received, e.g. 900 or 1,250.50'); return; }
    const payment = {
      id: `pay-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      amount,
      date: new Date().toISOString(),
      note: noteText.trim()
    };
    if (await save(addPayment(quotes, quote, payment))) {
      setAmountText(''); setNoteText(''); setAdding(false);
    }
  };

  const deletePayment = async (p) => {
    if (!window.confirm(`Remove the payment of $${formatMoney(p.amount)}${p.note ? ` (${p.note})` : ''}?`)) return;
    await save(removePayment(quotes, quote, p.id));
  };

  const balance = Math.round((grandTotal - job.received) * 100) / 100;
  const box = { background: '#1f2a1f', border: '1px solid #15803d', borderRadius: '8px', padding: '12px', marginBottom: '12px' };
  const input = { padding: '10px', borderRadius: '6px', background: '#1a1a1a', border: '1px solid #444', color: '#fff', fontSize: '16px', boxSizing: 'border-box' };

  return (
    <div style={box}>
      <p style={{ color: '#4ade80', fontWeight: 'bold', margin: '0 0 10px 0', fontSize: '14px' }}>Job progress</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '14px' }}>
        {JOB_STAGES.map(stage => {
          const doneAt = job[stage.key];
          return (
            <button
              key={stage.key}
              type="button"
              disabled={busy}
              onClick={() => toggleStage(stage)}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', borderRadius: '8px', border: doneAt ? '1px solid #15803d' : '1px dashed #666', background: doneAt ? '#14532d' : 'transparent', color: doneAt ? '#fff' : '#ccc', fontSize: '14px', cursor: busy ? 'default' : 'pointer', textAlign: 'left' }}
            >
              <span>{doneAt ? '✅' : '⬜'} {stage.label}</span>
              <span style={{ fontSize: '12px', color: doneAt ? '#bbf7d0' : '#888' }}>{doneAt ? new Date(doneAt).toLocaleDateString() : 'Tap when done'}</span>
            </button>
          );
        })}
      </div>

      <p style={{ color: '#fff', fontWeight: 'bold', margin: '0 0 6px 0', fontSize: '13px' }}>Payments received</p>
      {job.payments.length === 0 && <p style={{ color: '#888', fontSize: '13px', margin: '0 0 8px 0' }}>None yet.</p>}
      {job.payments.map(p => (
        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 0', borderBottom: '1px solid #2f3f2f', fontSize: '13px', color: '#ddd' }}>
          <span style={{ flex: 1, minWidth: 0 }}>{new Date(p.date).toLocaleDateString()}{p.note ? ` · ${p.note}` : ''}</span>
          <span style={{ fontWeight: 'bold' }}>${formatMoney(p.amount)}</span>
          <button type="button" aria-label="Remove payment" disabled={busy} onClick={() => deletePayment(p)} style={{ background: 'none', border: 'none', color: '#f87171', fontSize: '16px', cursor: 'pointer', padding: '2px 6px' }}>×</button>
        </div>
      ))}

      {adding ? (
        <div style={{ marginTop: '10px', display: 'grid', gridTemplateColumns: '1fr 1.4fr', gap: '8px' }}>
          <input aria-label="Amount received" placeholder="Amount $" inputMode="decimal" value={amountText} onChange={e => setAmountText(e.target.value)} style={input} autoFocus />
          <input aria-label="Payment note" placeholder="Note (e.g. Advance, Zelle)" value={noteText} onChange={e => setNoteText(e.target.value.slice(0, 60))} style={input} />
          <button type="button" disabled={busy} onClick={() => { setAdding(false); setAmountText(''); setNoteText(''); }} style={{ padding: '10px', borderRadius: '6px', background: '#444', color: '#fff', border: 'none' }}>Cancel</button>
          <button type="button" disabled={busy || amount === null} onClick={submitPayment} style={{ padding: '10px', borderRadius: '6px', background: amount === null ? '#335533' : '#15803d', color: '#fff', border: 'none', fontWeight: 'bold' }}>{busy ? 'Saving...' : 'Save payment'}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)} style={{ marginTop: '10px', width: '100%', padding: '10px', borderRadius: '6px', border: '1px dashed #4ade80', background: 'none', color: '#4ade80', fontSize: '13px', cursor: 'pointer' }}>+ Add a payment received</button>
      )}

      <div style={{ marginTop: '12px', display: 'grid', gridTemplateColumns: '1fr auto', rowGap: '4px', fontSize: '13px', color: '#ccc' }}>
        <span>Grand Total</span><span>${formatMoney(grandTotal)}</span>
        <span>Received</span><span>${formatMoney(job.received)}</span>
        <span style={{ fontWeight: 'bold', color: balance > 0.005 ? '#fbbf24' : '#4ade80' }}>{balance > 0.005 ? 'Balance owed' : balance < -0.005 ? 'Overpaid' : 'Fully paid'}</span>
        <span style={{ fontWeight: 'bold', color: balance > 0.005 ? '#fbbf24' : '#4ade80' }}>${formatMoney(Math.abs(balance))}</span>
      </div>
    </div>
  );
}
