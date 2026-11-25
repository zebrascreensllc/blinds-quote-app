// Unsaved changes on the quote screen. Price, cassette, motor, size, hub and
// fabric edits there are only kept in memory (tableEditValues) until "Save
// All Changes", so anything that leaves the screen must check this first.
// ONE definition, used by the quote screen (Save button, banner, file
// buttons, leaving the screen) and App.js (closing/reloading the page).

export function hasPendingTableEdits(t) {
  if (!t) return false;
  const size = (s) => (s && typeof s.size === 'number' ? s.size : 0);
  return Object.keys(t.perWindowPrices || {}).length > 0
    || t.motorCost != null || t.solarCost != null || t.taxRate != null
    || t.otherExpenses != null || t.otherExpensesLabel != null
    || Object.keys(t.groupEdits || {}).length > 0
    || size(t.deletedRoomIds) > 0 || size(t.deletedGroupKeys) > 0
    || Object.keys(t.fabricEdits || {}).length > 0
    || Object.keys(t.addedGroups || {}).length > 0
    || size(t.clearedPriceKeys) > 0
    || !!t.hubEdits;
}

export const UNSAVED_LEAVE_MESSAGE = (action) =>
  `You have unsaved changes on this quote (prices, cassette, motors, sizes...).\n\nIf you ${action} now, those changes will be lost.\n\nTap Cancel to stay, then tap "Save All Changes". Tap OK to ${action} without saving.`;
