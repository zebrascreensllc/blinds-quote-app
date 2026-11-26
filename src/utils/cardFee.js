// Credit card service fee (owner's request, 2026-11-26).
//
// A client who pays by credit card is charged an extra 3.5% of the amount
// put on the card. It is NEVER part of a quote's price: the quote file shows
// the card price as an extra line under Grand Total, and the invoice adds the
// fee only when the owner says the client is paying by card.
//
// The rate is saved in each new quote's pricing snapshot (CARD_FEE_RATE), so
// if the rate ever changes, quotes already sent keep the rate they were sent
// with. Quotes saved before this existed use DEFAULT_CARD_FEE_RATE.

export const DEFAULT_CARD_FEE_RATE = 0.035;

// What part of the bill goes on the card, on an invoice.
export const CARD_PAYMENT_MODES = ['none', 'all', 'advance', 'remaining'];

// The quote's own rate, or the default. Anything odd (missing, text,
// negative, over 10%) falls back to the default instead of printing a
// strange fee.
export function cardFeeRate(quote) {
  const r = quote && quote.pricing ? quote.pricing.CARD_FEE_RATE : undefined;
  return typeof r === 'number' && Number.isFinite(r) && r >= 0 && r <= 0.1 ? r : DEFAULT_CARD_FEE_RATE;
}

const round2 = (n) => Math.round((n + Number.EPSILON) * 100) / 100;

// The fee on an amount, rounded to cents. A bad or negative amount = $0.
export function cardFeeOn(amount, rate) {
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return 0;
  return round2(amount * rate);
}

// "3.5%" (no trailing zeros: 0.03 -> "3%", 0.0275 -> "2.75%").
export function cardFeePercentText(rate) {
  return `${parseFloat((rate * 100).toFixed(2))}%`;
}

// The terms line about card payments.
export function cardFeeTermsLine(rate) {
  return `Payments made by credit card include a ${cardFeePercentText(rate)} card service fee on the amount charged to the card. There is no fee for cash, check or Zelle.`;
}
