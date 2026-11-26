// ============================================================================
// Small motor (owner's request, 2026-11-26): a cheaper motor choice, $65 per
// window to the client instead of the regular motor's $80.
// ============================================================================
// A small-motor window is still a MOTOR window everywhere: controlType stays
// 'Motor' (so remotes, the motor stepper, solar, "Smart" on the supplier sheet
// and the invoice all keep working untouched) and the group carries
// motorSize: 'Small'. Only the motor PRICE differs: small motors get their own
// line ("Small motor N cost total") at their own editable price
// (editedPrices.smallMotorCost), and the regular "Motor N" line counts only
// regular motors. A quote saved before this has no motorSize anywhere, so its
// numbers never change.
//
// On the supplier sheet the same window has motor type 'Small motor' (a Smart
// type, needs a remote like any motor). Sheet -> quote turns that back into
// motorSize 'Small'.
//
// No imports at all, so pricing, the quote screens AND measurementUtils (which
// must stay independent of the pricing code) can all share this one file.

export const SMALL_MOTOR = 'Small';
export const SMALL_MOTOR_LABEL = 'Small motor';
// The supplier sheet's motor-type value for a small motor (in MOTOR_OPTIONS).
export const SMALL_MOTOR_SHEET_TYPE = 'Small motor';
// What the CLIENT sees on the invoice and the quote PDF/Word (owner's choice,
// 2026-11-26). The supplier sheet/Excel keeps saying "Small motor".
export const SMALL_MOTOR_INVOICE_LABEL = 'Motor with remote';
export const DEFAULT_SMALL_MOTOR_COST_CLIENT = 65;
// Supplier cost not given yet: same as a regular motor until the owner says otherwise.
export const DEFAULT_SMALL_MOTOR_COST_SUPPLIER = 50;

/** True only for a motorized window set to Small motor (a stale motorSize on a Manual window never counts). */
export const isSmallMotor = (group) => !!group && group.controlType === 'Motor' && group.motorSize === SMALL_MOTOR;

/** The choices in every quote-side Type dropdown, in order. */
export const CONTROL_CHOICES = ['Manual', 'Cordless', 'Motor', SMALL_MOTOR_LABEL];

/** What a window group shows as its type ("Manual", "Motor", "Small motor"...). */
export const controlChoice = (group) => (isSmallMotor(group) ? SMALL_MOTOR_LABEL : ((group && group.controlType) || 'Manual'));

/**
 * The group fields for a Type dropdown choice. Always sets motorSize, so a
 * window moved off Small motor never keeps a stale 'Small'. Anything that is
 * not a motor also loses its solar.
 */
export const controlPatch = (choice) => {
  if (choice === SMALL_MOTOR_LABEL) return { controlType: 'Motor', motorSize: SMALL_MOTOR };
  const patch = { controlType: choice || 'Manual', motorSize: '' };
  if (patch.controlType !== 'Motor') patch.solar = false;
  return patch;
};

/** Client price per small motor: the quote's edited price, else its pricing snapshot, else $65. */
export const smallMotorClientCost = (pricing, editedPrices) => {
  if (editedPrices && typeof editedPrices.smallMotorCost === 'number') return editedPrices.smallMotorCost;
  return typeof pricing?.SMALL_MOTOR_COST_CLIENT === 'number' ? pricing.SMALL_MOTOR_COST_CLIENT : DEFAULT_SMALL_MOTOR_COST_CLIENT;
};

export const smallMotorSupplierCost = (pricing) =>
  (typeof pricing?.SMALL_MOTOR_COST_SUPPLIER === 'number' ? pricing.SMALL_MOTOR_COST_SUPPLIER : DEFAULT_SMALL_MOTOR_COST_SUPPLIER);
