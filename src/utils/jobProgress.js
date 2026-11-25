// Job progress after "Mark as Ordered" (owner's request, 2026-11-25):
// Ordered from supplier -> Installed -> Paid in full, plus the payments
// received (advance, balance...). A quote can have several versions, and a
// new version is a new document, so this is read across the WHOLE lineage
// (every non-trashed version): recording a payment on v2 still shows after v3
// is saved. Writes go on the version being viewed; undoing a stage or
// removing a payment clears it wherever it was recorded.

export const JOB_STAGES = [
  { key: 'supplierOrderedAt', label: 'Ordered from supplier', short: '🚚 With supplier' },
  { key: 'installedAt', label: 'Installed', short: '🔧 Installed' },
  { key: 'paidAt', label: 'Paid in full', short: '💰 Paid' }
];

const lineageOf = (q) => q.lineageId || q.id;
const versionsOf = (quotes, lineageId) => (quotes || []).filter(q => (lineageId == null || lineageOf(q) === lineageId) && !q.trashedAt);

/** { orderedAt, supplierOrderedAt, installedAt, paidAt, payments, received } for a lineage (lineageId null = every quote passed in, e.g. one History group). */
export function lineageJob(quotes, lineageId) {
  const versions = versionsOf(quotes, lineageId);
  const latest = (key) => versions.map(v => v[key]).filter(Boolean).sort().pop() || null;
  const seen = new Set();
  const payments = [];
  versions.forEach(v => (Array.isArray(v.payments) ? v.payments : []).forEach(p => {
    if (!p || !p.id || seen.has(p.id) || !(typeof p.amount === 'number' && p.amount > 0)) return;
    seen.add(p.id);
    payments.push(p);
  }));
  payments.sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));
  const received = Math.round(payments.reduce((s, p) => s + p.amount, 0) * 100) / 100;
  const job = { orderedAt: latest('orderedAt'), payments, received };
  JOB_STAGES.forEach(st => { job[st.key] = latest(st.key); });
  return job;
}

/** Furthest stage reached, for History: '' when not ordered. */
export function jobStageLabel(job) {
  if (!job || !job.orderedAt) return '';
  for (let i = JOB_STAGES.length - 1; i >= 0; i -= 1) if (job[JOB_STAGES[i].key]) return JOB_STAGES[i].short;
  return '✅ Ordered';
}

/** New quotes list with a stage set on `quote` (on = true) or cleared from every version (on = false). */
export function setJobStage(quotes, quote, stageKey, on, now = new Date().toISOString()) {
  const lineageId = lineageOf(quote);
  return (quotes || []).map(q => {
    if (on) return q.id === quote.id ? { ...q, [stageKey]: now } : q;
    return lineageOf(q) === lineageId && q[stageKey] ? { ...q, [stageKey]: null } : q;
  });
}

/** New quotes list with a payment added to `quote`. */
export function addPayment(quotes, quote, payment) {
  return (quotes || []).map(q => (q.id === quote.id ? { ...q, payments: [...(Array.isArray(q.payments) ? q.payments : []), payment] } : q));
}

/** New quotes list with payment `paymentId` removed from whichever version holds it. */
export function removePayment(quotes, quote, paymentId) {
  const lineageId = lineageOf(quote);
  return (quotes || []).map(q => (
    lineageOf(q) === lineageId && Array.isArray(q.payments) && q.payments.some(p => p && p.id === paymentId)
      ? { ...q, payments: q.payments.filter(p => !p || p.id !== paymentId) }
      : q
  ));
}

/** Money typed by hand ("$1,800", "900.50"): a positive amount, else null. */
export function parsePaymentAmount(text) {
  const cleaned = String(text ?? '').replace(/[$,\s]/g, '');
  if (!/^\d*\.?\d+$/.test(cleaned)) return null;
  const v = Math.round(parseFloat(cleaned) * 100) / 100;
  return Number.isFinite(v) && v > 0 && v < 1000000 ? v : null;
}
