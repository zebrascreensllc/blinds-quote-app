/**
 * @jest-environment node
 */
// Run with: CI=true npx react-scripts test --watchAll=false src/utils/cardFee.test.js
// Credit card service fee (owner's request, 2026-11-26): 3.5% on whatever
// the client puts on a card. Never part of the quote's price. Checks the
// invoice's card lines (whole bill / advance only / remaining only), the
// quote file's "by credit card" line, the terms wording, older quotes, and
// that an invoice with no card payment is exactly what it was before.
import assert from 'assert';
import JSZip from 'jszip';
import { Packer } from 'docx';
import { buildInvoiceModel, buildInvoiceDocument, paymentLines } from './invoiceExport';
import { buildInvoicePdf } from './invoicePdf';
import { cardFeeRate, cardFeeOn, cardFeePercentText, cardFeeTermsLine, DEFAULT_CARD_FEE_RATE } from './cardFee';
import { TERMS_AND_CONDITIONS, termsAndConditions } from './invoiceContent';
import { getPricingSnapshot } from './constants';

const snap = getPricingSnapshot();
const oldSnap = (() => { const s = { ...snap }; delete s.CARD_FEE_RATE; return s; })();
const ALL_COLS = ['itemNo', 'location', 'count', 'width', 'height', 'blindType', 'motorSmart', 'unitPrice'];

const exactQuote = (pricing = snap) => ({
  id: 'q1', clientName: 'Ann', location: '1 Main', pricing,
  rooms: [{ id: 1, name: 'Living', fabricInput: '83003L', blindTypes: ['Zebra'], windowGroups: [{ quantity: '2', width: '35', height: '70', controlType: 'Motor' }] }]
});
const rangeQuote = () => ({
  id: 'q2', clientName: 'Ben', location: '2 Oak', pricing: snap,
  rooms: [{ id: 1, name: 'Kitchen', fabricInput: '', blindTypes: ['Roller'], windowGroups: [{ quantity: '2', width: '30', height: '40', controlType: 'Manual' }] }]
});

const labels = (m) => m.summary.map(s => s.label);
const value = (m, label) => (m.summary.find(s => s.label === label) || {}).value;
const money = (v) => parseFloat(String(v).replace(/[$,]/g, ''));

test('rate: saved per quote, default 3.5% for older quotes and odd values', () => {
  assert.equal(snap.CARD_FEE_RATE, 0.035);
  assert.equal(cardFeeRate(exactQuote()), 0.035);
  assert.equal(cardFeeRate(exactQuote(oldSnap)), DEFAULT_CARD_FEE_RATE);
  assert.equal(cardFeeRate({}), 0.035);
  assert.equal(cardFeeRate(null), 0.035);
  [undefined, null, '3.5', -0.01, 0.5, NaN, Infinity].forEach(r => assert.equal(cardFeeRate({ pricing: { CARD_FEE_RATE: r } }), 0.035, String(r)));
  assert.equal(cardFeeRate({ pricing: { CARD_FEE_RATE: 0.03 } }), 0.03);
  assert.equal(cardFeePercentText(0.035), '3.5%');
  assert.equal(cardFeePercentText(0.03), '3%');
  assert.equal(cardFeePercentText(0.0275), '2.75%');
});

test('fee amount: cents, and $0 for blank/negative', () => {
  assert.equal(cardFeeOn(1000, 0.035), 35);
  assert.equal(cardFeeOn(1234.56, 0.035), 43.21); // 43.2096
  assert.equal(cardFeeOn(0.15, 0.035), 0.01); // 0.00525
  [0, -5, NaN, undefined, null, '100'].forEach(a => assert.equal(cardFeeOn(a, 0.035), 0, String(a)));
});

test('terms: names 3.5%, no more "NOT included", older quotes too', () => {
  const line = cardFeeTermsLine(0.035);
  assert.ok(line.includes('3.5%'));
  assert.ok(TERMS_AND_CONDITIONS.includes(line));
  assert.ok(!TERMS_AND_CONDITIONS.some(t => /NOT included/i.test(t)));
  assert.equal(TERMS_AND_CONDITIONS.length, 6, 'same number of terms as before');
  assert.ok(buildInvoiceModel(exactQuote()).termsAndConditions.includes(line));
  assert.ok(buildInvoiceModel(exactQuote(oldSnap), { docType: 'quote' }).termsAndConditions.includes(line));
  // A quote saved with another rate prints that rate everywhere.
  const q3 = exactQuote({ ...snap, CARD_FEE_RATE: 0.03 });
  assert.ok(buildInvoiceModel(q3).termsAndConditions.some(t => t.includes('3% card service fee')));
  assert.deepEqual(termsAndConditions(0.03).filter(t => !t.includes('card')), TERMS_AND_CONDITIONS.filter(t => !t.includes('card')));
});

test('invoice, no card: exactly the three lines it always had', () => {
  for (const cols of [ALL_COLS, ['location', 'width']]) {
    const m = buildInvoiceModel(exactQuote(), { advanceAmount: 300, columns: cols });
    const tail = labels(m).slice(-3);
    assert.deepEqual(tail, ['Grand Total', 'Advance Payment', 'Remaining Balance']);
    assert.ok(!labels(m).some(l => /card/i.test(l)));
    assert.equal(m.cardFee, 0);
    assert.equal(m.remainingBalance, m.grandTotal - 300);
    // A bad mode is treated as no card.
    assert.deepEqual(buildInvoiceModel(exactQuote(), { advanceAmount: 300, columns: cols, cardPayment: 'bogus' }).summary, m.summary);
  }
});

test('invoice, whole bill by card: fee on the Grand Total, advance + remaining = card total', () => {
  for (const cols of [ALL_COLS, ['location', 'width']]) {
    const base = buildInvoiceModel(exactQuote(), { columns: cols });
    const G = base.grandTotal;
    const m = buildInvoiceModel(exactQuote(), { advanceAmount: 300, columns: cols, cardPayment: 'all' });
    const fee = cardFeeOn(G, 0.035);
    assert.equal(m.cardFee, fee);
    assert.equal(money(value(m, 'Credit card fee 3.5%')), fee);
    assert.equal(money(value(m, 'Total by credit card')), Math.round((G + fee) * 100) / 100);
    assert.ok(Math.abs(300 + money(value(m, 'Remaining Balance')) - money(value(m, 'Total by credit card'))) < 0.011);
    assert.equal(m.grandTotal, G, 'Grand Total itself is unchanged');
    assert.deepEqual(labels(m).slice(-5), ['Grand Total', 'Credit card fee 3.5%', 'Total by credit card', 'Advance Payment', 'Remaining Balance']);
  }
});

test('invoice, advance only by card: fee on the advance; remaining is cash/check', () => {
  const G = buildInvoiceModel(exactQuote()).grandTotal;
  const m = buildInvoiceModel(exactQuote(), { advanceAmount: 400, columns: ALL_COLS, cardPayment: 'advance' });
  assert.equal(m.cardFee, 14);
  assert.equal(value(m, 'Credit card fee 3.5% (on advance)'), '$14');
  assert.equal(value(m, 'Advance charged to card'), '$414');
  assert.equal(money(value(m, 'Remaining Balance')), Math.round((G - 400) * 100) / 100);
});

test('invoice, remaining only by card: fee on what is left', () => {
  const G = buildInvoiceModel(exactQuote()).grandTotal;
  const m = buildInvoiceModel(exactQuote(), { advanceAmount: 400, columns: ALL_COLS, cardPayment: 'remaining' });
  const fee = cardFeeOn(G - 400, 0.035);
  assert.equal(m.cardFee, fee);
  assert.equal(money(value(m, 'Advance Payment')), 400);
  assert.equal(money(value(m, 'Credit card fee 3.5% (on remaining)')), fee);
  assert.equal(money(value(m, 'Remaining by credit card')), Math.round((G - 400 + fee) * 100) / 100);
});

test('invoice with an agreed final price: fee on the agreed price', () => {
  for (const cols of [ALL_COLS, ['location', 'width']]) {
    const m = buildInvoiceModel(exactQuote(), { advanceAmount: 1000, finalPrice: 2500, columns: cols, cardPayment: 'all' });
    assert.equal(value(m, 'Grand Total'), '$2500');
    assert.equal(value(m, 'Credit card fee 3.5%'), '$87.50');
    assert.equal(value(m, 'Total by credit card'), '$2587.50');
    assert.equal(value(m, 'Remaining Balance'), '$1587.50');
  }
});

test('paymentLines: amounts always add up (many values)', () => {
  for (let g = 100; g < 20000; g += 337.77) {
    for (const a of [0, g / 2, g]) {
      const all = paymentLines(g, a, 'all', 0.035);
      assert.ok(Math.abs(all.remaining + a - (g + all.fee)) < 1e-6);
      const adv = paymentLines(g, a, 'advance', 0.035);
      assert.ok(Math.abs(adv.remaining - (g - a)) < 1e-6);
      assert.equal(adv.fee, cardFeeOn(a, 0.035));
      const rem = paymentLines(g, a, 'remaining', 0.035);
      assert.equal(rem.fee, cardFeeOn(g - a, 0.035));
    }
  }
});

test('quote file: card price under Grand Total by default, can be turned off', () => {
  const on = buildInvoiceModel(exactQuote(), { docType: 'quote', columns: ALL_COLS });
  const G = on.grandTotal;
  const fee = cardFeeOn(G, 0.035);
  const i = labels(on).indexOf('Grand Total');
  assert.deepEqual(labels(on).slice(i, i + 3), ['Grand Total', 'If paying by credit card: fee 3.5%', 'Grand Total by credit card']);
  assert.equal(money(value(on, 'If paying by credit card: fee 3.5%')), fee);
  assert.equal(money(value(on, 'Grand Total by credit card')), Math.round((G + fee) * 100) / 100);
  assert.equal(on.grandTotal, G);
  const off = buildInvoiceModel(exactQuote(), { docType: 'quote', columns: ALL_COLS, showCardPrice: false });
  assert.ok(!labels(off).some(l => /credit card/i.test(l)));
  // Without Unit Price the quote still shows it under the Grand Total.
  const short = buildInvoiceModel(exactQuote(), { docType: 'quote', columns: ['location', 'width'] });
  assert.deepEqual(labels(short), ['Grand Total', 'If paying by credit card: fee 3.5%', 'Grand Total by credit card']);
});

test('quote file: an estimate range shows the card price as a range', () => {
  const m = buildInvoiceModel(rangeQuote(), { docType: 'quote', columns: ALL_COLS });
  assert.ok(m.grandTotalMax > m.grandTotal);
  assert.match(value(m, 'Grand Total by credit card'), /^\$\d[\d,]*-\$\d[\d,]*$/);
  const [lo, hi] = value(m, 'Grand Total by credit card').split('-').map(money);
  assert.equal(lo, Math.round(m.grandTotal + cardFeeOn(m.grandTotal, 0.035)));
  assert.equal(hi, Math.round(m.grandTotalMax + cardFeeOn(m.grandTotalMax, 0.035)));
});

test('quote file: $0 quote shows no card line', () => {
  const q = { id: 'z', clientName: 'Z', pricing: snap, rooms: [] };
  const m = buildInvoiceModel(q, { docType: 'quote', columns: ALL_COLS });
  assert.ok(!labels(m).some(l => /credit card/i.test(l)));
});

test('PDF and Word files build with every card choice and print the new terms', async () => {
  const q = exactQuote();
  const optionsList = [
    { docType: 'quote', columns: ALL_COLS }, { docType: 'quote', columns: ALL_COLS, showCardPrice: false },
    ...['none', 'all', 'advance', 'remaining'].map(cardPayment => ({ advanceAmount: 300, columns: ALL_COLS, cardPayment }))
  ];
  for (const options of optionsList) {
    const pdf = buildInvoicePdf(q, options, null);
    assert.ok(pdf.output('arraybuffer').byteLength > 1000);
    const buf = await Packer.toBuffer(buildInvoiceDocument(q, options, null));
    const xml = await (await JSZip.loadAsync(buf)).file('word/document.xml').async('string');
    assert.ok(xml.includes('3.5% card service fee'), 'terms in Word');
    assert.ok(!xml.includes('NOT included'));
    if (options.cardPayment === 'all') assert.ok(xml.includes('Total by credit card'));
    if (options.docType === 'quote' && options.showCardPrice !== false) assert.ok(xml.includes('Grand Total by credit card'));
  }
});
