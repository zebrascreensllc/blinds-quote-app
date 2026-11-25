// History search (owner's request, 2026-11-25): find a quote by the client's
// name, address OR phone, however it was typed. Phone numbers are compared
// by digits only, so "214-555-0101", "(214) 555 0101" and "2145550101" all
// match "5550101". Words in the search can be in any order ("oak 2" finds
// "2 Oak St"). Used by every History tab (Active, Trash, Archived).
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const digits = (s) => String(s ?? '').replace(/\D/g, '');

export function quoteMatchesSearch(quote, searchText) {
  const raw = String(searchText ?? '').trim();
  if (!raw || !quote) return true;
  const text = norm([quote.clientName, quote.location, quote.clientPhone, quote.quoteName].join(' '));
  const words = norm(raw).split(' ').filter(Boolean);
  if (words.length && words.every(w => text.includes(w))) return true;
  // Phone: 3+ digits typed with any spacing or dashes.
  const q = digits(raw);
  return q.length >= 3 && q.length === raw.replace(/[\s()+.-]/g, '').length && digits(quote.clientPhone).includes(q);
}
