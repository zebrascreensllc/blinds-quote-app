import React from 'react';
import { Copy, Check, Edit2, Trash2, Share2, Files, Archive } from 'lucide-react';
import { formatMoney } from '../../utils/formatters';
import { generateInvoiceDocx, buildInvoiceLineItems } from '../../utils/invoiceExport';
import { expandQuoteIntoRows } from '../../utils/measurementUtils';
import { sheetToExcelBuffer } from '../../utils/xlsxExport';
import { generatePriceBreakdownExcel } from '../../utils/priceBreakdownExport';

// Extracted from QuoteDetailScreen.js (part of the same size-driven split
// that pulled out CurrentPricingSection.js/PricingDetailsSection.js) - close
// relocation, not a rewrite: same variable names, same structure, only the
// closed-over values are now explicit props instead of direct closure
// access. Every action available from the bottom of the quote screen:
// Create Invoice, the two Excel exports, Copy/Share, Edit, Duplicate,
// Archive, Delete.
export default function QuoteActionButtons({
  archiveQuoteLineage,
  copiedId,
  copyText,
  duplicateQuote,
  grandMin,
  loadQuoteForEdit,
  safeDeleteQuotes,
  selectedQuote,
  setCopiedId,
  setSelectedQuote
}) {
  return (
    <>
      <button
        onClick={async () => {
          // ✅ NEW: real Word invoice matching the business's reference
          // template - client-facing (no Width/Height columns, those
          // stay in Supplier Measurements), one line per window, Motor/
          // Solar/Hub as their own summary lines, then Total/Tax/
          // Discount/Grand Total/Advance/Remaining Balance, then the
          // fixed Terms & Conditions / Warranty Coverage pages.
          const { hasRangePricing } = buildInvoiceLineItems(selectedQuote);
          if (hasRangePricing) {
            if (!window.confirm('Some windows still show an estimated price range (no exact fabric picked yet). The invoice will use the low end of that range for those windows.\n\nContinue anyway?')) return;
          }

          const advanceInput = window.prompt('Advance Payment (defaults to half of Grand Total - edit if different):', formatMoney(grandMin / 2));
          if (advanceInput === null) return;
          const advanceAmount = parseFloat(advanceInput) || 0;

          const discountInput = window.prompt('Discount (optional - enter 0 if none):', '0');
          if (discountInput === null) return;
          const discountAmount = parseFloat(discountInput) || 0;

          try {
            const blob = await generateInvoiceDocx(selectedQuote, { advanceAmount, discountAmount });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(selectedQuote.quoteName || 'quote').replace(/[^a-z0-9]/gi, '_')}_invoice.docx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (err) {
            console.error('Invoice generation failed:', err);
            alert('❌ Could not create the invoice. Please try again.');
          }
        }}
        style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#0e7490', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        🧾 Create Invoice
      </button>

      <button
        onClick={async () => {
          // ✅ NEW: quick "send to supplier for quote" export - same
          // Excel-with-highlighting format Supplier Measurements already
          // uses (sheetToExcelBuffer), reusing the same row-expansion
          // that used to feed the CSV export this replaced. Carries
          // over the quote's own rough width/height as-is
          // (prefillMeasurements: true), since this is a fast
          // confirmation pass, not precise measurements.
          try {
            const rows = expandQuoteIntoRows(selectedQuote, { prefillMeasurements: true });
            const buffer = await sheetToExcelBuffer({ address: selectedQuote.location }, rows);
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(selectedQuote.quoteName || 'quote').replace(/[^a-z0-9]/gi, '_')}_supplier_quote.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (err) {
            console.error('Excel export failed:', err);
            alert('❌ Could not create the Excel file. Please try again.');
          }
        }}
        style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#1d6f42', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        📊 Download Excel for Supplier (with highlighting)
      </button>

      {/* ✅ NEW: client-facing detail breakdown - same per-window prices
          Copy/Share already communicate as text, but as a proper
          spreadsheet with dimensions and one row per window, for the
          occasional client who wants the math spelled out. */}
      <button
        onClick={async () => {
          try {
            const buffer = await generatePriceBreakdownExcel(selectedQuote);
            const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${(selectedQuote.quoteName || 'quote').replace(/[^a-z0-9]/gi, '_')}_price_breakdown.xlsx`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          } catch (err) {
            console.error('Price breakdown export failed:', err);
            alert('❌ Could not create the Excel file. Please try again.');
          }
        }}
        style={{ width: '100%', padding: '12px', marginBottom: '12px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#7c3aed', color: '#fff', border: 'none', cursor: 'pointer' }}
      >
        📈 Download Price Breakdown (Excel)
      </button>

      <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
        {/* ✅ CONSOLIDATED: Copy and Share used to both render side by
            side, but they did the same job - get this quote's text
            somewhere else - with Share strictly the more convenient of
            the two wherever it's available (skips the copy-then-switch-
            app-then-paste round trip, and its own native sheet already
            offers a Copy option too). Now only one shows: Share when
            the browser supports it, Copy as the fallback when it
            doesn't (mainly desktop browsers). */}
        {typeof navigator.share === 'function' ? (
          <button
            onClick={async () => {
              try {
                await navigator.share({ title: selectedQuote.quoteName || 'Quote', text: copyText });
              } catch (err) {
                if (err.name !== 'AbortError') console.error('Share failed:', err);
              }
            }}
            style={{ flex: '1 1 90px', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}
          >
            <Share2 size={16} />
            Share
          </button>
        ) : (
          <button
            onClick={() => {
              navigator.clipboard.writeText(copyText);
              setCopiedId(selectedQuote.id);
              setTimeout(() => setCopiedId(null), 2000);
            }}
            style={{ flex: '1 1 90px', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', fontSize: '14px', background: '#d4af37', color: '#000', border: 'none', cursor: 'pointer' }}
          >
            {copiedId === selectedQuote.id ? <Check size={16} /> : <Copy size={16} />}
            {copiedId === selectedQuote.id ? 'Copied!' : 'Copy'}
          </button>
        )}

        <button
          onClick={() => loadQuoteForEdit(selectedQuote)}
          style={{ flex: '1 1 90px', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#4f46e5', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Edit2 size={16} />
          Edit
        </button>

        {/* ✅ NEW: clones this quote's client info + rooms into a fresh
            Quote Create draft - a new quote, not a new version of this
            one. Handy for a repeat client or a similar job. */}
        <button
          onClick={() => duplicateQuote(selectedQuote)}
          title="Start a brand new, separate quote using this one's rooms as a starting point"
          style={{ flex: '1 1 90px', paddingTop: '12px', paddingBottom: '12px', paddingLeft: '16px', paddingRight: '16px', borderRadius: '8px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer' }}
        >
          <Files size={16} />
          Duplicate
        </button>

        {/* ✅ NEW: hides every version of this quote from your active
            list/Statistics without deleting anything - unlike Delete
            (moves to Trash, 7-day expiry), Archive keeps it forever
            until you unarchive it from History > Archived. */}
        <button
          onClick={() => archiveQuoteLineage(selectedQuote)}
          title="Archive this quote"
          style={{ padding: '12px', borderRadius: '8px', background: '#444', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Archive size={16} />
        </button>

        <button
          onClick={() => {
            // ✅ BUGFIX: this previously deleted instantly with NO confirmation.
            // Now it warns, names the quote, and stores an undo snapshot.
            const done = safeDeleteQuotes([selectedQuote.id], `Deleted ${selectedQuote.quoteName || 'quote'}`);
            if (done) setSelectedQuote(null);
          }}
          style={{ padding: '12px', borderRadius: '8px', fontWeight: 'bold', background: '#b91c1c', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center' }}
        >
          <Trash2 size={16} />
        </button>
      </div>
    </>
  );
}
