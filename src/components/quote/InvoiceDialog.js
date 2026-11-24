import React, { useEffect, useMemo, useState } from 'react';
import { formatMoney, formatPrice } from '../../utils/formatters';
import { INVOICE_COLUMNS, DEFAULT_INVOICE_COLUMN_KEYS, normalizeInvoiceColumns, generateInvoiceDocx, invoiceFileName, buildInvoiceModel, loadLogoBytes } from '../../utils/invoiceExport';
import { generateInvoicePdf } from '../../utils/invoicePdf';
import { invoiceMotorLabels } from '../../utils/invoiceMotorTypes';
import { subscribeToBulkSheets } from '../../services/bulkMeasurementSync';

// "Create Invoice" options, shown as one sheet instead of a chain of
// pop-up prompts: which columns go in the item table, the advance payment,
// the discount, then Download PDF or Download Word (on a phone: the share
// sheet with just the file, no link). Both buttons build the
// same invoice (same columns, rows and totals) - only the file type differs.

// kind="quote" (Download Quote, 2026-11-24) reuses this same sheet for the
// client QUOTE document: same columns and PDF/Word buttons, plus an optional
// discount, but no final price / advance payment (a quote isn't a bill).
// Its column choice is remembered separately from the invoice's.
const COLUMNS_STORAGE_KEY = 'invoiceColumns';
const QUOTE_COLUMNS_STORAGE_KEY = 'quoteDocColumns';

// The last column choice is remembered on this phone only, as a
// convenience. Storage can be blocked (private browsing) - then we just
// start from the default columns.
function loadSavedColumns(storageKey = COLUMNS_STORAGE_KEY) {
  try {
    const raw = window.localStorage.getItem(storageKey);
    return raw ? normalizeInvoiceColumns(JSON.parse(raw)) : [...DEFAULT_INVOICE_COLUMN_KEYS];
  } catch (e) {
    return [...DEFAULT_INVOICE_COLUMN_KEYS];
  }
}

function saveColumns(keys, storageKey = COLUMNS_STORAGE_KEY) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(keys));
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

// The invoice as a File the phone's share sheet can send. Sharing ONLY the
// file (no title/text/url) is what keeps a link out of the client's message:
// the old way (download, then share from Safari's viewer) also pasted the
// viewer page's blob: link (owner's report, 2026-11-14).
const INVOICE_MIME = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};
function invoiceFile(blob, fileName, format) {
  try {
    return new File([blob], fileName, { type: INVOICE_MIME[format] || blob.type });
  } catch (e) {
    return null; // very old browsers without the File constructor
  }
}
function canShareFile(file) {
  try {
    // Phones/tablets only - a computer keeps the normal download.
    return !!file && navigator.maxTouchPoints > 0 && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare({ files: [file] });
  } catch (e) {
    return false;
  }
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

function quoteWindowCount(quote) {
  return (quote.rooms || []).reduce((n, r) => n + (r.windowGroups || []).reduce((m, g) => m + (parseInt(g.quantity) || 1), 0), 0);
}

export default function InvoiceDialog({ quote, quotes, uid, grandMin, onClose, kind = 'invoice' }) {
  const isQuoteDoc = kind === 'quote';
  const columnsKey = isQuoteDoc ? QUOTE_COLUMNS_STORAGE_KEY : COLUMNS_STORAGE_KEY;
  // Measurement sheets (read only), for the motor/chain type of each window:
  // undefined while loading, [] if none or they couldn't be read.
  const [sheets, setSheets] = useState(undefined);
  useEffect(() => {
    if (!uid) { setSheets([]); return undefined; }
    let unsubscribe = () => {};
    try {
      unsubscribe = subscribeToBulkSheets(uid, list => setSheets(Array.isArray(list) ? list : []), () => setSheets([]));
    } catch (e) {
      setSheets([]);
    }
    return () => { try { unsubscribe(); } catch (e) { /* already closed */ } };
  }, [uid]);
  const motorInfo = useMemo(() => {
    if (!sheets) return undefined;
    try {
      return invoiceMotorLabels(quote, sheets, quotes);
    } catch (e) {
      console.error('Could not read motor types from the measurement sheet:', e);
      return null;
    }
  }, [quote, sheets, quotes]);
  const [columns, setColumns] = useState(() => loadSavedColumns(columnsKey));
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
  const changingPrice = !isQuoteDoc && priceMode === 'change';
  const finalPrice = changingPrice ? parseMoneyInput(finalText) : null;
  // A dependent column (Fabric No) only counts while its parent (Blind
  // Type) is ticked - same rule as normalizeInvoiceColumns.
  const ordered = INVOICE_COLUMNS.filter(c => columns.includes(c.key) && (!c.needs || columns.includes(c.needs))).map(c => c.key);
  const showsBlindType = columns.includes('blindType');
  const showsFabric = ordered.includes('fabric');
  const setShowFabric = (yes) => {
    setColumns(prev => (yes ? (prev.includes('fabric') ? prev : [...prev, 'fabric']) : prev.filter(k => k !== 'fabric')));
  };

  // The Grand Total the invoice would print with the calculated prices
  // (same function the invoice uses, so this number always matches it).
  const calculatedGrandTotal = useMemo(() => {
    try {
      return buildInvoiceModel(quote, { discountAmount: discountAmount || 0 }).grandTotal;
    } catch (e) {
      return grandMin;
    }
  }, [quote, discountAmount, grandMin]);
  // The quote document's Grand Total, as a range while any window is still
  // an estimate - shown on the sheet so the owner sees what will print.
  const quoteGrandText = useMemo(() => {
    if (!isQuoteDoc) return '';
    try {
      const m = buildInvoiceModel(quote, { docType: 'quote', discountAmount: discountAmount || 0 });
      return Math.abs(m.grandTotalMax - m.grandTotal) >= 0.005 ? formatPrice(m.grandTotal, m.grandTotalMax) : `$${formatMoney(m.grandTotal)}`;
    } catch (e) {
      return '';
    }
  }, [isQuoteDoc, quote, discountAmount]);

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
  else if (isQuoteDoc) {
    if (discountAmount === null) problem = 'Discount must be a number, e.g. 0 or 150.';
  }
  else if (advanceAmount === null) problem = 'Advance Payment must be a number, e.g. 1800.';
  else if (!changingPrice && discountAmount === null) problem = 'Discount must be a number, e.g. 0 or 150.';
  else if (advanceAmount > (changingPrice ? finalPrice : calculatedGrandTotal) + 0.005) problem = 'Advance Payment is more than the Grand Total.';

  const [downloaded, setDownloaded] = useState({});
  // A created file waiting for a tap on "Send", used when the phone won't
  // open the share sheet straight after creating (it needs a fresh tap).
  const [pendingShare, setPendingShare] = useState(null);

  // Preload the logo so creating the file right after a tap is instant.
  useEffect(() => { loadLogoBytes().catch(() => {}); }, []);

  const shareFile = async (file, format) => {
    try {
      await navigator.share({ files: [file] });
      setPendingShare(null);
      setDownloaded(prev => ({ ...prev, [format]: true }));
    } catch (err) {
      if (err && err.name === 'AbortError') { setPendingShare(null); return; } // closed the share sheet
      if (err && err.name === 'NotAllowedError') { setPendingShare({ file, format }); return; } // needs a fresh tap
      console.error('Invoice share failed:', err);
      setPendingShare(null);
      downloadBlob(file, file.name);
      setDownloaded(prev => ({ ...prev, [format]: true }));
    }
  };

  const create = async (format) => {
    if (problem || busy) return;
    setBusy(format);
    saveColumns(ordered, columnsKey);
    const motorLabels = motorInfo ? motorInfo.labels : null;
    const options = isQuoteDoc
      ? { docType: 'quote', discountAmount, columns: ordered, motorLabels }
      : changingPrice
      ? { advanceAmount, discountAmount: 0, finalPrice, columns: ordered, motorLabels }
      : { advanceAmount, discountAmount, columns: ordered, motorLabels };
    try {
      const blob = format === 'pdf' ? await generateInvoicePdf(quote, options) : await generateInvoiceDocx(quote, options);
      const fileName = invoiceFileName(quote, format, kind);
      const file = invoiceFile(blob, fileName, format);
      if (canShareFile(file)) {
        // Phone: open the share sheet with just the file (no link).
        await shareFile(file, format);
        return;
      }
      downloadBlob(blob, fileName);
      // Stay open so the other format can be downloaded too without
      // re-entering the advance/discount; × closes it.
      setDownloaded(prev => ({ ...prev, [format]: true }));
    } catch (err) {
      console.error(`${isQuoteDoc ? 'Quote' : 'Invoice'} generation failed:`, err);
      alert(`❌ Could not create the ${isQuoteDoc ? 'quote' : 'invoice'}. Please try again.`);
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
      aria-label={isQuoteDoc ? 'Download quote' : 'Create invoice'}
      onClick={() => { if (!busy) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', zIndex: 1000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: '#2a2a2a', width: '100%', maxWidth: '520px', maxHeight: '90vh', overflowY: 'auto', borderRadius: '16px 16px 0 0', padding: '20px 16px 28px', boxSizing: 'border-box', color: '#fff' }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h3 style={{ margin: 0, fontSize: '18px' }}>{isQuoteDoc ? '📄 Download Quote' : '🧾 Create Invoice'}</h3>
          <button onClick={onClose} disabled={!!busy} aria-label="Close" style={{ background: 'none', border: 'none', color: '#aaa', fontSize: '24px', cursor: 'pointer', padding: '4px 8px' }}>×</button>
        </div>

        <span style={labelStyle}>Columns in the table</span>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '16px' }}>
          {INVOICE_COLUMNS.filter(c => !c.needs).map(c => {
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

        {showsBlindType && (
          <div style={{ marginTop: '-8px', marginBottom: '16px' }}>
            <span style={labelStyle}>Show the fabric number too?</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {[
                { yes: true, label: 'Yes, show it' },
                { yes: false, label: 'No' }
              ].map(opt => {
                const on = showsFabric === opt.yes;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    onClick={() => setShowFabric(opt.yes)}
                    aria-pressed={on}
                    style={{ padding: '12px 10px', borderRadius: '8px', border: `1px solid ${on ? '#0e7490' : '#444'}`, background: on ? '#0e749033' : '#1f1f1f', color: '#fff', fontSize: '14px', fontWeight: on ? 'bold' : 'normal', minHeight: '44px', cursor: 'pointer' }}
                  >
                    {on ? '● ' : '○ '}{opt.label}
                  </button>
                );
              })}
            </div>
            {showsFabric && <div style={{ fontSize: '12px', color: '#888', marginTop: '4px' }}>Adds a "Fabric No" column next to Blind Type. Windows with no fabric picked yet stay blank.</div>}
          </div>
        )}

        {ordered.includes('motorSmart') && (
          <div style={{ fontSize: '12px', color: '#888', marginTop: '-8px', marginBottom: '16px' }}>
            {motorInfo === undefined
              ? 'Checking the measurement sheet for motor types...'
              : motorInfo && motorInfo.count > 0
                ? `Manual/Smart shows the motor and chain types from this client's measurement sheet (${motorInfo.count} of ${quoteWindowCount(quote)} windows).`
                : 'No motor types found in a measurement sheet for this quote, so Manual/Smart shows Smart or Manual.'}
          </div>
        )}

        {isQuoteDoc ? (
          <>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>
              {quoteGrandText ? `Grand Total on the quote: ${quoteGrandText} (including tax).` : 'Grand Total from the quote, including tax.'}
              {ordered.includes('unitPrice') ? ' Windows with no fabric picked yet show their price range.' : ' Unit Price is not ticked, so the quote shows only the Grand Total.'}
            </div>
            <label style={labelStyle} htmlFor="quote-discount">Discount ($)</label>
            <input id="quote-discount" type="text" inputMode="decimal" value={discountText} onChange={(e) => setDiscountText(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />
          </>
        ) : (<>
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
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>{ordered.includes('unitPrice')
                ? 'Unit Price is ticked, so the full breakdown stays (Motor, Solar, Hub, Total, Sales Tax) with a Discount line so it adds up to this price.'
                : 'Unit Price is not ticked, so the invoice shows only Grand Total, Advance Payment and Remaining Balance.'}</div>
          </>
        ) : (
          <>
            <div style={{ fontSize: '12px', color: '#888', marginBottom: '14px' }}>Grand Total from the quote, including tax.{ordered.includes('unitPrice') ? '' : ' Unit Price is not ticked, so the invoice shows only Grand Total, Advance Payment and Remaining Balance.'}</div>
            <label style={labelStyle} htmlFor="invoice-discount">Discount ($)</label>
            <input id="invoice-discount" type="text" inputMode="decimal" value={discountText} onChange={(e) => setDiscountText(e.target.value)} style={{ ...inputStyle, marginBottom: '16px' }} />
          </>
        )}

        <label style={labelStyle} htmlFor="invoice-advance">Advance Payment ($)</label>
        <input id="invoice-advance" type="text" inputMode="decimal" value={advanceText} onChange={(e) => { setAdvanceTouched(true); setAdvanceText(e.target.value); }} style={{ ...inputStyle, marginBottom: '4px' }} />
        <div style={{ fontSize: '12px', color: '#888', marginBottom: '16px' }}>Starts at half of the Grand Total - change it if different.</div>
        </>)}

        {problem && <div style={{ color: '#f87171', fontSize: '13px', marginBottom: '12px' }}>{problem}</div>}

        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => create('pdf')}
            disabled={disabled}
            style={{ ...buttonBase, background: '#b91c1c', color: '#fff', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}
          >
            {busy === 'pdf' ? 'Creating...' : (downloaded.pdf ? '✓ PDF again' : '📄 Download PDF')}
          </button>
          <button
            onClick={() => create('docx')}
            disabled={disabled}
            style={{ ...buttonBase, background: '#1d4ed8', color: '#fff', opacity: disabled ? 0.5 : 1, cursor: disabled ? 'default' : 'pointer' }}
          >
            {busy === 'docx' ? 'Creating...' : (downloaded.docx ? '✓ Word again' : '📝 Download Word')}
          </button>
        </div>
        {pendingShare && (
          <button
            onClick={() => shareFile(pendingShare.file, pendingShare.format)}
            style={{ ...buttonBase, width: '100%', marginTop: '10px', background: '#0e7490', color: '#fff', cursor: 'pointer' }}
          >
            📤 Send {pendingShare.format === 'pdf' ? 'PDF' : 'Word'} file
          </button>
        )}
        {(downloaded.pdf || downloaded.docx) && !pendingShare && (
          <div style={{ color: '#4ade80', fontSize: '13px', marginTop: '12px', textAlign: 'center' }}>
            Done. Tap × when you're finished.
          </div>
        )}
      </div>
    </div>
  );
}
