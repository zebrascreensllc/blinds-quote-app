import React, { useState, useEffect } from 'react';
import { ArrowLeft, TrendingUp } from 'lucide-react';
import { PRICING_DATA } from '../../data/pricingData';
import { calculateGroupQuote, getBlindTypeFromFabric } from '../../utils/pricing';
import { isRangeOverride } from '../../utils/formatters';
import { subscribeToAnalysisEntries } from '../../services/analysisSync';

// Pure, only used by this screen - relocated as-is from App.js.
const getLatestQuoteVersions = (quotesToProcess) => {
  const latestByID = {};

  quotesToProcess.forEach(quote => {
    // Every version of a quote gets its own guaranteed-unique `id` -
    // `lineageId` is what ties versions of the same quote together.
    // Grouping by `id` here would mean this never dedupes anything: every
    // version of every quote would count as its own "latest quote".
    const key = quote.lineageId || quote.id;
    if (!latestByID[key]) {
      latestByID[key] = quote;
    } else {
      // Compare dates - keep the one with latest updatedDate
      const currentDate = new Date(latestByID[key].updatedDate || latestByID[key].createdDate);
      const newDate = new Date(quote.updatedDate || quote.createdDate);

      if (newDate > currentDate) {
        latestByID[key] = quote;
      }
    }
  });

  return Object.values(latestByID);
};

// Statistics - relocated from App.js's renderStatistics, plus its own
// read-only Order Analysis subscription (see below).
export default function StatisticsScreen({ quotes, setCurrentView, uid }) {
  // ✅ NEW: a separate, read-only subscription to the SAME orderAnalysis
  // collection OrderAnalysis.js owns - deliberately not lifted into shared
  // App.js state, so this can never risk that component's own read/write
  // logic. Only used here to tell "confirmed order" apart from "quote still
  // awaiting a decision", replacing a stat that was previously meaningless
  // (every quote's status is always 'quote' - the old "Pending (7 days)"
  // check against it was effectively just "quotes made in the last week").
  const [analysisEntries, setAnalysisEntries] = useState([]);
  useEffect(() => {
    if (!uid) return;
    const unsubscribe = subscribeToAnalysisEntries(uid, setAnalysisEntries, (error) => {
      console.error('Statistics: order analysis sync error:', error);
    });
    return () => unsubscribe();
  }, [uid]);
  const confirmedLineageIds = new Set(analysisEntries.map(e => e.quoteLineageId).filter(Boolean));

  const activeQuotes = quotes.filter(q => !q.archived && !q.trashedAt);
  // Only the latest version of each quote lineage
  const latestQuotes = getLatestQuoteVersions(activeQuotes);
  const confirmedCount = latestQuotes.filter(q => confirmedLineageIds.has(q.lineageId || q.id)).length;
  const pendingDecisionCount = latestQuotes.length - confirmedCount;

  const stats = { monthlyStats: {}, totalProfit: 0, totalQuotes: 0 };

  latestQuotes.forEach(quote => {
    const date = new Date(quote.createdDate);
    const monthKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

    if (!stats.monthlyStats[monthKey]) {
      stats.monthlyStats[monthKey] = { quotes: 0, profit: 0 };
    }

    stats.monthlyStats[monthKey].quotes += 1;
    stats.totalQuotes += 1;

    let quoteProfit = 0;
    // Same motor-cost gap as the quote detail screen - a saved motor cost
    // edit changed the "Motor total" row but never reached profit stats.
    const dashDefaultMotorCost = quote.pricing?.MOTOR_COST_CLIENT || 80;
    const dashSavedMotorCost = quote.editedPrices?.motorCost;
    const dashEffectiveMotorCost = typeof dashSavedMotorCost === 'number' ? dashSavedMotorCost : dashDefaultMotorCost;
    const dashMotorCostDelta = dashEffectiveMotorCost - dashDefaultMotorCost;
    // Same fix as motor, mirrored for solar - a saved solar cost edit
    // previously never reached profit stats either.
    const dashDefaultSolarCost = quote.pricing?.SOLAR_COST_CLIENT || 40;
    const dashSavedSolarCost = quote.editedPrices?.solarCost;
    const dashEffectiveSolarCost = typeof dashSavedSolarCost === 'number' ? dashSavedSolarCost : dashDefaultSolarCost;
    const dashSolarCostDelta = dashEffectiveSolarCost - dashDefaultSolarCost;
    quote.rooms.forEach(room => {
      const fabricNumbers = room.fabricInput.split(',').map(f => f.trim()).filter(f => f);
      const motorizedCount = room.windowGroups.filter(w => w.controlType === 'Motor').length;

      // Determine blind type from ACTUAL FABRICS entered
      let actualBlindType = (room.blindTypes || ['Roller'])[0];
      if (fabricNumbers.length > 0) {
        for (const fabricNum of fabricNumbers) {
          const detectedType = getBlindTypeFromFabric(fabricNum, quote.pricing?.PRICING_DATA || PRICING_DATA);
          if (detectedType) {
            actualBlindType = detectedType;
            break;
          }
        }
      }

      room.windowGroups.forEach((group, groupIdx) => {
        const q = calculateGroupQuote(group, fabricNumbers, actualBlindType, motorizedCount, quote.pricing || null);
        // Use the edited per-window price (if one was saved) for profit,
        // not the raw calculated price.
        const priceKey = `${room.id}_${groupIdx}`;
        const savedPrice = quote.editedPrices?.perWindowPrices?.[priceKey];
        if (typeof savedPrice === 'number' || isRangeOverride(savedPrice)) {
          const quantity = parseInt(group.quantity) || 1;
          // A custom range override's revenue estimate uses its midpoint,
          // consistent with how ranges are estimated elsewhere in the app.
          const revenuePerWindow = isRangeOverride(savedPrice) ? (savedPrice.min + savedPrice.max) / 2 : savedPrice;
          const overrideTotal = revenuePerWindow * quantity;
          const avgCost = (q.minCost + q.maxCost) / 2;
          quoteProfit += (overrideTotal - avgCost);
        } else {
          const quantity = parseInt(group.quantity) || 1;
          const motorAdjustment = (group.controlType === 'Motor' && dashMotorCostDelta !== 0) ? dashMotorCostDelta * quantity : 0;
          const solarAdjustment = (group.solar && dashSolarCostDelta !== 0) ? dashSolarCostDelta * quantity : 0;
          quoteProfit += q.profit + motorAdjustment + solarAdjustment;
        }
      });
    });

    stats.monthlyStats[monthKey].profit += quoteProfit;
    stats.totalProfit += quoteProfit;
  });

  const monthlyEntries = Object.entries(stats.monthlyStats).sort().reverse().slice(0, 12);

  return (
    <div style={{ background: 'linear-gradient(135deg, #1a1a1a 0%, #2d2d2d 100%)', minHeight: '100vh', padding: '32px 16px' }}>
      <div style={{ maxWidth: '600px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px' }}>
          <button onClick={() => setCurrentView('menu')} style={{ padding: '8px', borderRadius: '8px', background: 'rgba(100,100,100,0.3)', border: 'none', cursor: 'pointer' }}>
            <ArrowLeft size={24} color="#aaa" />
          </button>
          <h2 style={{ fontSize: '28px', fontWeight: 'bold', color: '#fff', fontFamily: 'Georgia, serif' }}>Statistics</h2>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '32px' }}>
          <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Total Quotes</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{stats.totalQuotes}</p>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Total Profit</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>${stats.totalProfit.toFixed(0)}</p>
          </div>

          {/* ✅ NEW: replaces the old "Pending (7 days)" stat, which was
              effectively meaningless - quote.status is never anything but
              'quote', so that check always passed and the number was really
              just "quotes made in the last week." Order Analysis already
              tracks which quotes became real confirmed orders, so this uses
              that instead. */}
          <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #4ade80', borderRadius: '8px', padding: '24px' }}>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Confirmed Orders</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#4ade80' }}>{confirmedCount}</p>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Pending Decision</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>{pendingDecisionCount}</p>
          </div>

          <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #d4af37', borderRadius: '8px', padding: '24px' }}>
            <p style={{ color: '#888', fontSize: '12px', marginBottom: '8px' }}>Avg Profit/Quote</p>
            <p style={{ fontSize: '32px', fontWeight: 'bold', color: '#fff' }}>${(stats.totalProfit / Math.max(stats.totalQuotes, 1)).toFixed(0)}</p>
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, #2a2a2a 0%, #3a3a3a 100%)', border: '1px solid #444', borderRadius: '8px', padding: '24px' }}>
          <h3 style={{ fontSize: '18px', fontWeight: 'bold', color: '#fff', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <TrendingUp size={24} color="#d4af37" />
            Monthly Breakdown
          </h3>

          {monthlyEntries.length === 0 ? (
            <p style={{ color: '#888', textAlign: 'center', paddingTop: '32px', paddingBottom: '32px' }}>No data yet</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {monthlyEntries.map(([month, data]) => (
                <div key={month} style={{ background: '#1a1a1a', border: '1px solid #333', borderRadius: '8px', padding: '16px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <p style={{ fontWeight: 'bold', color: '#fff' }}>{new Date(month + '-01').toLocaleString('default', { month: 'long', year: 'numeric' })}</p>
                    <span style={{ fontSize: '12px', paddingLeft: '12px', paddingRight: '12px', paddingTop: '4px', paddingBottom: '4px', borderRadius: '999px', background: '#d4af37', color: '#000' }}>{data.quotes} quotes</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                    <div>
                      <p style={{ color: '#888', fontSize: '14px' }}>Profit: <span style={{ color: '#4ade80', fontWeight: 'bold' }}>${data.profit.toFixed(0)}</span></p>
                    </div>
                    <div style={{ width: '128px', height: '32px', borderRadius: '4px', background: '#333' }}>
                      <div
                        style={{
                          height: '100%',
                          borderRadius: '4px',
                          width: `${(data.profit / Math.max(...monthlyEntries.map(e => e[1].profit), 1)) * 100}%`,
                          background: 'linear-gradient(90deg, #d4af37, #f4e4c1)'
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
