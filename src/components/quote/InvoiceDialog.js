import React, { useMemo, useState } from 'react';
import { formatMoney } from '../../utils/formatters';
import { INVOICE_COLUMNS, DEFAULT_INVOICE_COLUMN_KEYS, normalizeInvoiceColumns, generateInvoiceDocx, invoiceFileName, buildInvoiceModel } from '../../utils/invoiceExport';
import { generateInvoicePdf } from '../../utils/invoicePdf';

// "Create Invoice" options, shown as one sheet instead of a chain of
// pop-up prompts: which columns go in the item table, the advance payment,
// the discount, then Download PDF or Download Word. Both buttons build the
// same invoice (same columns, rows and totals) - only the file type differs.

const COLUMNS_STORAGE_KEY = 'invoiceColumns';

// The last column choice is remembered on this phone only, as a
// convenience. Storage can be blocked (private browsing) - then we just
// start from the default columns.
function loadSavedColumns() {
  try {
    const raw = window.localStorage.getItem(COLUMNS_STORAGE_KEY);
    return raw ? normalizeInvoiceColumns(JSON.parse(raw)) : [...DEFAULT_INVOICE_COLUMN_KEYS];
  } catch (e) {
    return [...DEFAULT_INVOICE_COLUMN_KEYS];
  }
}

function saveColumns(keys) {
  try {
    window.localStorage.setItem(COLUMNS_STORAGE_KEY, JSON.stringify(keys));
  } catch (e) {
    // Not saving the preference is harmless.
  }
}

// Money typed by hand: "$1,800", "1800.50", " 900 " all work. Blank = 0.
// Returns null for anything that isn't a sensible amount.
export function parseMoneyInput(text) {
  const cleaned = String(text ?? '').replace(/[$,\s]/g, '');
  if (cleaned === '') return 0;
  if (!/^\d*\.?\d+$|^\d+\.$/.test(cleaned)) return null;
  const value = parseFloat(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function downloadBlob(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InvoiceDialog({ quote, grandMin, onClose }) {
  const [columns, setColumns] = useState(loadSavedColumns);
  const [advanceText, setAdvanceText] = useState(formatMoney(grandMin / 2));
  // Once the owner types an advance, it's theirs - changing the final price
  // no longer re-fills it with "half".
  const [advanceTouched, setAdvanceTouched] = useState(false);
  const [discountText, setDiscountText] = useState('0');
  // 'keep' = the calculated Grand Total; 'change' = a final price agreed
  // with the client (then only Grand Total / Advance / Remaining show).
  const [priceMode, setPriceMode] = useState('keep');
  const [finalText, setFinalText] = useState('');
  const [busy, setBusy] = useState(null); // 'pdf' | 'docx' while creating

  const toggleColumn = (key) => {
    setColumns(prev => (prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]));
  };

  const advanceAmount = parseMoneyInput(advanceText);
  const discountAmount = parseMoneyInput(discountText);
  const changingPrice = priceMode === 'change';
  const finalPrice = changingPrice ? parseMoneyInput(finalText) : null;
  const ordered = INVOICE_COLUMNS.filter(c => columns.includes(c.key)).map(c => c.key);

  // The Grand Total the invoice would print with the calculated prices
  // (same function the invoice uses, so this number always matches it).
  const calculatedGrandTotal = useMemo(() => {
    try {
      return buildInvoiceModel(quote, { discountAmount: discountAmount || 0 }).grandTotal;
    } catch (e) {
      return grandMin;
    }
  }, [quote, discountAmount, grandMin]);

  const onFinalTextChange = (text) => {
    setFinalText(text);
    const value = parseMoneyInput(text);
    if (!advanceTouched && value !== null && value > 0) setAdvanceText(formatMoney(value / 2));
  };

  const choosePriceMode = (mode) => {
    setPriceMode(mode);
    if (mode === 'change' && finalText === '') setFinalText(formatMoney(calculatedGrandTotal));
    if (mode === 'keep' && !advanceTouched) setAdvanceText(formatMoney(calculatedGrandTotal / 2));
  };

  let problem = '';
  if (ordered.length < 2) problem = 'Pick at least 2 columns.';
  else if (changingPrice && (finalPrice === null || finalPrice <= 0)) problem = 'Enter the final price, e.g. 5500.';
  else if (advanceAmount === null) problem = 'Advance Payment must be a number, e.g. 1800.';
  else if (!changingPrice && discountAmount === null) problem = 'Discount must be a number, e.g. 0 or 150.';
  else if (advanceAmount > (changingPrice ? finalPrice : calculatedGrandTotal) + 0.005) problem = 'Advance Payment is more than the Grand Total.';

  const create = async (format) => {
    if (problem || busy) return;
    setBusy(format);
    saveColumns(ordered);
    const options = changingPrice
      ? { advanceAmount, discountAmount: 0, finalPrice, columns: ordered }
      : { advanceAmount, discountAmount, columns: ordered };
    try {
      const blob = format === 'pdf' ? await generateInvoicePdf(quote, options) : await generateInvoiceDocx(quote, options);
      downloadBlob(blob, invoiceFileName(quote, format));
      onClose();
    } catch (err) {
      console.error('Invoice generation failed:', err);
      alert('❌ Could not create the invoice. Please try again.');
    } finally {
      setBusy(null);
    }
  };

  const inputStyle = { width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid #555', background: '#1a1a1a', color: '#fff', fontSize: '16px', boxSizing: 'border-box' };
  const labelStyle = { display: 'block', fontSize: '13px', color: '#ccc', marginBottom: '6px', fontWeight: 'bold' };
  const buttonBase = { flex: 1, padding: '14px', borderRadius: '8px', border: 'none', fontWeight: 'bold', fontSize: '15px' };
  const disabled = !!problem || !!busy;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create invoice"
      onClick={() => { if (!busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#2a2a2a', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: '20px 16px 28px', boxSizing: 'border-box', color: '#fff' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>🧾 Create Invoice</h3>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer', padding: '4px 8px' }}>×</button>
        </div>

        <span style={labelStyle}>Columns in the table</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {INVOICE_COLUMNS.map(c => {
            const on = columns.includes(c.key);
            return (
              <label
                key={c.key}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px 10px', borderRadius: '8px', border: `1px solid ${on ? '#0e7490' : '#444'}`, background: on ? '#0e749033' : '#1f1f1f', cursor: 'pointer', fontSize: '14px', minHeight: '44px', boxSizing: 'border-box' }}
              >
                <input type="checkbox" checked={on} onChange={() => toggleColumn(c.key)} style={{ width: '18px', height: '18px', flexShrink: 0 }} />
                {c.label}
              </label>
            );
          })}
        </div>

        <span style={labelStyle}>Final price</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          {[
            { mode: 'keep', label: `Keep $${formatMoney(calculatedGrandTotal)}` },
            { mode: 'change', label: 'Change it' }
          ].map(opt => {
            const on = priceMode === opt.mode;
            return (
              <button
                key={opt.mode}
                type="button"
                onClick={() => choosePriceMode(opt.mode)}
                aria-pressed={on}
                style={{ padding: '12px 10px', borderRadius: '8px', border: `1px solid ${on ? '#0e7490' : '#444'}`, background: on ? '#0e749033' : '#1f1f1f', color: '#fff', fontSize: '14px', fontWeight: on ? 'bold' : 'normal', minHeight: '44px', cursor: 'pointer' }}
              >
                {on ? '● ' : '○ '}{opt.label}
              </button>
            );
          })}
        </div>
        {changingPrice ? (
          <>
            <input id="invoice-final" type="text" inputMode="decimal" aria-label="Final price" value={finalText} onChange={(e) => onFinalTextChange(e.target.value)} style={{ ...inputStyle, marginBottom: '4px' }} />
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>The invoice will show only Grand Total, Advance Payment and Remaining Balance (no Total, Sales Tax or Motor lines).</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>Grand Total from the quote, including tax.</div>
            <label style={labelStyle} htmlFor="invoice-discount">Discount ($)</label>
            <input id="invoice-discount" type="text" inputMode="decimal" value={discountText} onChange={(e) => setDiscountText(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />
          </>
        )}

        <label style={labelStyle} htmlFor="invoice-advance">Advance Payment ($)</label>
        <input id="invoice-advance" type="text" inputMode="decimal" value={advanceText} onChange={(e) => { setAdvanceTouched(true); setAdvanceText(e.target.value); }} style={{ ...inputStyle, marginBottom: '4px' }} />
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Starts at half of the Grand Total - change it if different.</div>

        {problem && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{problem}</div>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => create('pdf')}
            disabled={disabled}
            style={{ ...buttonBase, background: '#b91c1c', color: '#fff', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}
          >
            {busy === 'pdf' ? 'Creating...' : '📄 Download PDF'}
          </button>
          <button
            onClick={() => create('docx')}
            disabled={disabled}
            style={{ ...buttonBase, background: '#1d4ed8', color: '#fff', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}
          >
            {busy === 'docx' ? 'Creating...' : '📝 Download Word'}
          </button>
        </div>
      </div>
    </div>
  );
}
