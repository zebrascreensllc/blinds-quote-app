import React, { useState } from 'react';
import { compressImageFile } from '../../utils/imageUtils';
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
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoError, setPhotoError] = useState(null);

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
  const revenue = activeEntry.revenueSubtotal || 0;
  const profitVsSupplierActual = revenue - supplierTotal;
  const profitVsAppEstimate = revenue - appTotal;

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

  const handlePhotoSelected = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setPhotoError(null);
    setUploadingPhoto(true);
    try {
      const dataUrl = await compressImageFile(file);
      updateActiveEntry(entry => ({ ...entry, invoicePhoto: dataUrl, updatedDate: new Date().toISOString() }));
    } catch (err) {
      setPhotoError(err.message || 'Could not attach that photo.');
    } finally {
      setUploadingPhoto(false);
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

        {/* Supplier-provided actual costs - manual entry, compared against the estimate above */}
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
          <p style={{ color: '#666', fontSize: '10px', marginTop: '10px' }}>Revenue used: ${formatMoney(revenue)} (client-facing window + motor + solar total, before tax)</p>
        </div>

        {/* Invoice photo attachment - reference only, not auto-read */}
        <div style={{ background: '#1a1a2a', border: '1px solid #4a4a7a', borderRadius: '8px', padding: '16px', marginBottom: '20px' }}>
          <p style={{ fontSize: '13px', fontWeight: 'bold', color: '#d4af37', marginBottom: '8px' }}>Supplier Invoice Photo (Optional)</p>
          <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '10px', fontStyle: 'italic' }}>Saved as a reference alongside this entry - not automatically read into the numbers above.</p>
          {activeEntry.invoicePhoto && (
            <div style={{ marginBottom: '10px' }}>
              <img src={activeEntry.invoicePhoto} alt="Supplier invoice" style={{ maxWidth: '100%', borderRadius: '6px', display: 'block', marginBottom: '8px' }} />
              <button onClick={() => setField('invoicePhoto', null)} style={{ fontSize: '11px', padding: '6px 10px', background: 'transparent', color: '#f87171', border: '1px solid #7a4a4a', borderRadius: '4px', cursor: 'pointer' }}>Remove Photo</button>
            </div>
          )}
          <input type="file" accept="image/*" capture="environment" onChange={handlePhotoSelected} disabled={uploadingPhoto} style={{ fontSize: '12px', color: '#ccc' }} />
          {uploadingPhoto && <p style={{ color: '#888', fontSize: '11px', marginTop: '6px' }}>Compressing photo...</p>}
          {photoError && <p style={{ color: '#f87171', fontSize: '11px', marginTop: '6px' }}>{photoError}</p>}
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
