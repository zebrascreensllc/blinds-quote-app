import React from 'react';
import { formatMoney } from '../../utils/formatters';

// Extracted from QuoteDetailScreen.js (part of the same size-driven split
// that pulled out CurrentPricingSection.js earlier) - close relocation, not
// a rewrite: same variable names, same structure, only the closed-over
// values are now explicit props instead of direct closure access. Two
// read-only collapsible info panels: the locked-in pricing snapshot used
// for this quote, and the internal supplier-cost/profit breakdown.
export default function PricingDetailsSection({
  storedPricing,
  expandedPricingDetails,
  setExpandedPricingDetails,
  selectedQuote,
  expandedPricingComparison,
  setExpandedPricingComparison,
  overallFabricCost,
  overallShippingCost,
  overallMotorSupplierCost,
  overallSolarSupplierCost,
  overallSupplierCost,
  pricingComparisonProfit
}) {
  return (
    <>
      {/* Pricing Details Section - Collapsible (default collapsed) */}
      {storedPricing && storedPricing.PROFIT_PER_WINDOW && (
        <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#1a3a3a', border: '1px solid #4a7a6a', padding: '16px' }}>
          <button onClick={() => setExpandedPricingDetails(!expandedPricingDetails)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: expandedPricingDetails ? '12px' : '0' }}>
            <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span>📋 PRICING DETAILS (Used for this quote)</span>
              <span style={{ color: '#888', fontSize: '14px' }}>{expandedPricingDetails ? '▼' : '▶'}</span>
            </p>
          </button>

          {expandedPricingDetails && (
            <>
              <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px', fontStyle: 'italic' }}>✅ All fabric prices, profit margins, and surcharges captured and locked for this quote</p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Profit Per Window:</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.PROFIT_PER_WINDOW}</p>
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Captured Date:</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>{storedPricing?.CREATED_DATE ? new Date(storedPricing.CREATED_DATE).toLocaleDateString() : selectedQuote?.createdDate ? new Date(selectedQuote.createdDate).toLocaleDateString() : 'N/A'}</p>
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Width Surcharge (41-55"):</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.WIDTH_SURCHARGES?.["41-55"] ?? 45}</p>
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Height Surcharge (&gt;90"):</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.HEIGHT_SURCHARGE ?? 37}</p>
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Motor Cost (Client):</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.MOTOR_COST_CLIENT ?? 80}</p>
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Solar Cost (Client):</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.SOLAR_COST_CLIENT ?? 40}</p>
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Misc Expense:</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.MISC_EXPENSE ?? 4.50}</p>
                </div>
                <div>
                  <p style={{ color: '#888', marginBottom: '4px' }}>Shipping Cost:</p>
                  <p style={{ color: '#fff', fontWeight: 'bold' }}>${storedPricing.SHIPPING_COST ?? 42}</p>
                </div>
                <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid #4a7a6a' }}>
                  <p style={{ color: '#d4af37', fontSize: '11px', fontWeight: 'bold' }}>📦 Fabric Prices: LOCKED ({storedPricing.PRICING_DATA ? Object.keys(storedPricing.PRICING_DATA).length : 'N/A'} blind types)</p>
                  <p style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>All fabric costs are captured and will not change even if you update prices later</p>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ✅ PRICING COMPARISON - same structure as "📋 PRICING DETAILS" above */}
      <div style={{ borderRadius: '8px', marginBottom: '24px', background: '#1a3a3a', border: '1px solid #4a7a6a', padding: '16px' }}>
        <button onClick={() => setExpandedPricingComparison(!expandedPricingComparison)} style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: '0', marginBottom: expandedPricingComparison ? '12px' : '0' }}>
          <p style={{ fontSize: '12px', fontWeight: 'bold', color: '#d4af37', marginBottom: '0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span>📊 PRICING COMPARISON (Supplier Only)</span>
            <span style={{ color: '#888', fontSize: '14px' }}>{expandedPricingComparison ? '▼' : '▶'}</span>
          </p>
        </button>

        {expandedPricingComparison && (
          <>
            <p style={{ fontSize: '11px', color: '#aaa', marginBottom: '12px', fontStyle: 'italic' }}>💡 Internal cost/profit breakdown. Not shown to clients.</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
              <div>
                <p style={{ color: '#888', marginBottom: '4px' }}>Fabric Cost (Supplier Cost):</p>
                <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallFabricCost)}</p>
              </div>
              <div>
                <p style={{ color: '#888', marginBottom: '4px' }}>Shipping Cost:</p>
                <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallShippingCost)}</p>
              </div>
              <div>
                <p style={{ color: '#888', marginBottom: '4px' }}>Motor Cost (Supplier Cost):</p>
                <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallMotorSupplierCost)}</p>
              </div>
              <div>
                <p style={{ color: '#888', marginBottom: '4px' }}>Solar Cost (Supplier Cost):</p>
                <p style={{ color: '#fff', fontWeight: 'bold' }}>${formatMoney(overallSolarSupplierCost)}</p>
              </div>
              <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid #4a7a6a' }}>
                <p style={{ color: '#888', marginBottom: '4px' }}>Overall Expected Cost (Supplier Side, no profit):</p>
                <p style={{ color: '#ffaa00', fontWeight: 'bold', fontSize: '13px' }}>${formatMoney(overallSupplierCost)}</p>
              </div>
              <div style={{ gridColumn: '1 / -1', paddingTop: '8px', borderTop: '1px solid #4a7a6a' }}>
                <p style={{ color: '#d4af37', fontSize: '11px', fontWeight: 'bold' }}>💰 PROFIT: ${formatMoney(pricingComparisonProfit)}</p>
                <p style={{ color: '#888', fontSize: '11px', marginTop: '4px' }}>Total price to client minus the overall supplier cost above</p>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
