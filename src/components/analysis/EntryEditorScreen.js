import React, { useState } from 'react';
import { compressImageFile, readSmallFileAsDataUrl } from '../../utils/imageUtils';
import { parseSupplierInvoiceExcel } from '../../utils/invoiceParser';
import { formatMoney } from '../../utils/formatters';

const inputStyle = { width: '100%', padding: '10px', borderRadius: '6px', fontSize: '13px', background: '#1a1a1a', border: '1px solid #444', color: 'white', boxSizing: 'border-box' };
const labelStyle = { fontSize: '11px', color: '#888', display: 'block', marginBottom: '4px' };

const COST_FIELDS = [
  { key: 'fabric', label: 'Fabric Cost' },
  { key: 'motor', label: 'Motor Cost' },
  { key: 'remote', label: 'Remote Cost' },
  { key: 'solar', label: 'Solar Panel Cost' },
  { key: 'shipping', label: 'Shipping Cost' }
];

export default function EntryEditorScreen({ activeEntry, onBack, syncStatus, updateActiveEntry }) {
  const [uploadingFile, setUploadingFile] = useState(false);
  const [fileError, setFileError] = useState(null);
  const [parsingExcel, setParsingExcel] = useState(false);
  const [excelResult, setExcelResult] = useState(null); // { totals } | { error: true }

  if (!activeEntry) {
    return (
      <div style={{ background: '#1a1a1a', minHeight: '100vh', padding: '24px', color: '#fff' }}>
        <p>Entry not found.</p>
        <button onClick={onBack} style={{ marginTop: '12px', padding: '10px 16px', borderRadius: '8px', background: '#444', border: 'none', color: '#fff', cursor: 'pointer' }}>Back to list</button>
      </div>
    );
  }

  const supplierCosts = activeEntry.supplierCosts || {};
  const appCosts = activeEntry.appGeneratedCosts || {};
  const supplierTotal = COST_FIELDS.reduce((sum, f) => sum + (typeof supplierCosts[f.key] === 'number' ? supplierCosts[f.key] : 0), 0);
  const hasAnySupplierData = COST_FIELDS.some(f => typeof supplierCosts[f.key] === 'number');
  const appTotal = appCosts.total || 0;
  const estimatedRevenue = activeEntry.revenueSubtotal || 0;
  // ✅ NEW: falls back to the original estimate for entries created before
  // this field existed, so nothing looks broken for older data.
  const finalPriceCharged = typeof activeEntry.finalPriceCharged === 'number' ? activeEntry.finalPriceCharged : estimatedRevenue;
  const discountGiven = estimatedRevenue - finalPriceCharged;
  const profitVsSupplierActual = finalPriceCharged - supplierTotal;
  const profitVsAppEstimate = finalPriceCharged - appTotal;

  // Backward-compat: an entry saved before the image/PDF split still has
  // the old invoicePhoto field - show it if invoiceFile isn't set yet.
  const invoiceFile = activeEntry.invoiceFile || (activeEntry.invoicePhoto ? { dataUrl: activeEntry.invoicePhoto, mimeType: 'image/jpeg', fileName: 'invoice.jpg' } : null);

  const setSupplierCost = (key, rawValue) => {
    const value = rawValue === '' ? null : (parseFloat(rawValue) || 0);
    updateActiveEntry(entry => ({
      ...entry,
      supplierCosts: { ...entry.supplierCosts, [key]: value },
      updatedDate: new Date().toISOString()
    }));
  };

  const setField = (key, value) => {
    updateActiveEntry(entry => ({ ...entry, [key]: value, updatedDate: new Date().toISOString() }));
  };

  const handleFileSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setFileError(null);
    setUploadingFile(true);
    try {
      const isImage = file.type.startsWith('image/');
      const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
      if (!isImage && !isPdf) {
        setFileError('Only photos and PDF files can be attached here. For an Excel invoice, use "Auto-fill from Excel" below instead.');
        return;
      }
      const dataUrl = isImage ? await compressImageFile(file) : await readSmallFileAsDataUrl(file);
      const newFile = { dataUrl, mimeType: isImage ? 'image/jpeg' : 'application/pdf', fileName: file.name };
      updateActiveEntry(entry => ({ ...entry, invoiceFile: newFile, invoicePhoto: undefined, updatedDate: new Date().toISOString() }));
    } catch (err) {
      setFileError(err.message || 'Could not attach that file.');
    } finally {
      setUploadingFile(false);
    }
  };

  const handleExcelSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setExcelResult(null);
    setParsingExcel(true);
    try {
      const totals = await parseSupplierInvoiceExcel(file);
      if (!totals) {
        setExcelResult({ error: true });
      } else {
        updateActiveEntry(entry => ({
          ...entry,
          supplierCosts: { fabric: totals.fabric, motor: totals.motor, remote: totals.remote, solar: totals.solar, shipping: totals.shipping },
          updatedDate: new Date().toISOString()
        }));
        setExcelResult({ totals });
      }
    } catch (err) {
      console.error('Excel parse failed:', err);
      setExcelResult({ error: true });
    } finally {
      setParsingExcel(false);
    }
  };

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '24px 16px' }}>
      <div style={{ maxWidth: '700px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button onClick={onBack} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer', color: '#fff' }}>← Back</button>
          <div style={{ width: '60px' }} />
        </div>

        {syncStatus && !syncStatus.ok && (
          <div style={{ padding: '12px', marginBottom: '16px', background: '#3a1a1a', border: '1px solid #ef4444', borderRadius: '8px' }}>
            <p style={{ color: '#f87171', fontWeight: 'bold', fontSize: '13px', marginBottom: '4px' }}>
              ⚠️ {syncStatus.failedCount} change{syncStatus.failedCount > 1 ? 's' : ''} not yet saved to the cloud
            </p>
            <p style={{ color: '#ccc', fontSize: '12px' }}>{syncStatus.lastError} — your local copy is safe, and this keeps retrying automatically.</p>
          </div>
        )}

        <p style={{ color: '#d4af37', fontWeight: 'bold', fontSize: '20px', marginBottom: '4px' }}>{activeEntry.clientName || 'Untitled'}</p>
        <p style={{ color: '#888', fontSize: '12px', marginBottom: '20px' }}>{activeEntry.quoteName}</p>

        <div style={{ marginBottom: '20px' }}>
          <label style={labelStyle}>Date Order Confirmed</label>
          <input
            type="date"
            value={activeEntry.orderConfirmedDate || ''}
            onChange={(e) => setField('orderConfirmedDate', e.target.value)}
            style={inputStyle}
          />
        </div>

        {/* App-generated costs - read-only snapshot pulled from the quote's latest version at the time this entry was created */}
        <div style={{ background: '#1a3a3a', border: '1px solid #4a7a6a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '4px' }}>App Generated Cost (Estimate)</p>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px', fontStyle: 'italic' }}>Snapshot from the quote's latest version when this entry was created.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
            {COST_FIELDS.map(f => (
              <div key={f.key}>
                <p style={{ color: '#888', marginBottom: '2px', fontSize: '11px' }}>{f.label}</p>
                <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(appCosts[f.key] || 0)}</p>
              </div>
            ))}
          </div>
          <div style={{ marginTop: '12px', paddingTop: '10px', borderTop: '1px solid #4a7a6a' }}>
            <p style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>Total Estimated Cost</p>
            <p style={{ color: '#ffaa00', fontWeight: 'bold', fontSize: '14px' }}>${formatMoney(appTotal)}</p>
          </div>
        </div>

        {/* Supplier-provided actual costs - manual entry (or auto-filled from Excel below), compared against the estimate above */}
        <div style={{ background: '#2a2a1a', border: '1px solid #7a6a4a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '12px' }}>Supplier Provided Cost (Actual)</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            {COST_FIELDS.map(f => {
              const appVal = appCosts[f.key] || 0;
              const supplierVal = supplierCosts[f.key];
              const delta = typeof supplierVal === 'number' ? supplierVal - appVal : null;
              return (
                <div key={f.key}>
                  <label style={labelStyle}>{f.label}</label>
                  <input
                    type="number"
                    inputMode="decimal"
                    placeholder="Not entered"
                    value={typeof supplierVal === 'number' ? supplierVal : ''}
                    onChange={(e) => setSupplierCost(f.key, e.target.value)}
                    style={inputStyle}
                  />
                  {delta !== null && (
                    <p style={{ fontSize: '11px', marginTop: '3px', color: delta > 0 ? '#f87171' : (delta < 0 ? '#4ade80' : '#888') }}>
                      {delta > 0 ? `+$${formatMoney(delta)} over estimate` : (delta < 0 ? `-$${formatMoney(Math.abs(delta))} under estimate` : 'Matches estimate')}
                    </p>
                  )}
                </div>
              );
            })}
          </div>

          {/* ✅ NEW: Excel auto-fill - parses the file in the browser and fills
              the fields above; the file itself is never saved anywhere. */}
          <div style={{ marginTop: '16px', paddingTop: '14px', borderTop: '1px solid #7a6a4a' }}>
            <label style={labelStyle}>Auto-fill from Excel Invoice (optional)</label>
            <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '8px', fontStyle: 'italic' }}>Reads the 5 costs above from a supplier invoice .xlsx matching this supplier's format. The file itself isn't saved - only the numbers.</p>
            <input type="file" accept=".xlsx,.xls" onChange={handleExcelSelected} disabled={parsingExcel} style={{ fontSize: '12px', color: '#ccc' }} />
            {parsingExcel && <p style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>Reading invoice...</p>}
            {excelResult?.totals && (
              <p style={{ color: '#4ade80', fontSize: '11px', marginTop: '6px' }}>
                ✅ Extracted: Fabric ${formatMoney(excelResult.totals.fabric)}, Motor ${formatMoney(excelResult.totals.motor)}, Solar ${formatMoney(excelResult.totals.solar)}, Remote ${formatMoney(excelResult.totals.remote)}, Shipping ${formatMoney(excelResult.totals.shipping)} - double-check these against the invoice above.
              </p>
            )}
            {excelResult?.error && (
              <p style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>Could not recognize this invoice's layout - enter the costs above manually instead.</p>
            )}
          </div>
        </div>

        {/* Final price charged - separate from the app's original estimate,
            so a client discount is tracked explicitly instead of silently
            making profit look worse than the deal actually was. */}
        <div style={{ background: '#1a2a3a', border: '1px solid #4a6a8a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '4px' }}>Final Price Charged to Client</p>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px', fontStyle: 'italic' }}>Defaults to the app's estimate - change this if you negotiated a different final price.</p>
          <input
            type="number"
            inputMode="decimal"
            value={finalPriceCharged}
            onChange={(e) => setField('finalPriceCharged', e.target.value === '' ? estimatedRevenue : (parseFloat(e.target.value) || 0))}
            style={inputStyle}
          />
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '10px', fontSize: '12px' }}>
            <div>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>App Estimated Revenue</p>
              <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(estimatedRevenue)}</p>
            </div>
            <div>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>Discount Given</p>
              <p style={{ color: discountGiven > 0 ? '#f87171' : (discountGiven < 0 ? '#4ade80' : '#888'), fontWeight: 'bold' }}>
                {discountGiven === 0 ? '$0' : (discountGiven > 0 ? `-$${formatMoney(discountGiven)}` : `+$${formatMoney(Math.abs(discountGiven))}`)}
              </p>
            </div>
          </div>
        </div>

        {/* Profit summary */}
        <div style={{ background: '#1a2a1a', border: '1px solid #4a7a4a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '10px' }}>Profit Made</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', fontSize: '13px' }}>
            <div>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>Based on App Estimate</p>
              <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(profitVsAppEstimate)}</p>
            </div>
            <div>
              <p style={{ color: '#888', fontSize: '11px', marginBottom: '2px' }}>Based on Supplier Actual</p>
              <p style={{ color: hasAnySupplierData ? '#4ade80' : '#888', fontWeight: 'bold' }}>{hasAnySupplierData ? `$${formatMoney(profitVsSupplierActual)}` : 'Enter supplier costs above'}</p>
            </div>
          </div>
          <p style={{ color: '#666', fontSize: '10px', marginTop: '10px' }}>Revenue used: ${formatMoney(finalPriceCharged)} (Final Price Charged above, before tax)</p>
        </div>

        {/* Invoice attachment - photo or PDF, reference only, not auto-read */}
        <div style={{ background: '#1a1a2a', border: '1px solid #4a4a7a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '8px' }}>Supplier Invoice - Photo or PDF (Optional)</p>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px', fontStyle: 'italic' }}>Saved as a reference alongside this entry - not automatically read into the numbers above. For Excel, use "Auto-fill from Excel" above instead.</p>
          {invoiceFile && (
            <div style={{ marginBottom: '10px' }}>
              {invoiceFile.mimeType === 'application/pdf' ? (
                <a href={invoiceFile.dataUrl} target="_blank" rel="noopener noreferrer" style={{ display: 'inline-block', padding: '10px 14px', background: '#1a1a1a', border: '1px solid #444', borderRadius: '6px', color: '#7dd3fc', fontSize: '13px', textDecoration: 'none', marginBottom: '8px' }}>
                  📄 {invoiceFile.fileName || 'invoice.pdf'} - View
                </a>
              ) : (
                <img src={invoiceFile.dataUrl} alt="Supplier invoice" style={{ maxWidth: '100%', borderRadius: '6px', display: 'block', marginBottom: '8px' }} />
              )}
              <div>
                <button onClick={() => updateActiveEntry(entry => ({ ...entry, invoiceFile: null, invoicePhoto: undefined, updatedDate: new Date().toISOString() }))} style={{ fontSize: '11px', padding: '6px 10px', background: 'transparent', color: '#f87171', border: '1px solid #7a4a4a', borderRadius: '4px', cursor: 'pointer' }}>Remove File</button>
              </div>
            </div>
          )}
          <input type="file" accept="image/*,.pdf,application/pdf" capture="environment" onChange={handleFileSelected} disabled={uploadingFile} style={{ fontSize: '12px', color: '#ccc' }} />
          {uploadingFile && <p style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>Attaching file...</p>}
          {fileError && <p style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>{fileError}</p>}
        </div>

        <div style={{ marginBottom: '32px' }}>
          <label style={labelStyle}>Notes</label>
          <textarea
            value={activeEntry.notes || ''}
            onChange={(e) => setField('notes', e.target.value)}
            rows={3}
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>
      </div>
    </div>
  );
}
