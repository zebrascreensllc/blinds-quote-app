// Fixed content for the generated invoice - business letterhead info and the
// standard Terms & Conditions / Warranty Coverage boilerplate, extracted
// verbatim (typos aside) from the business's real reference invoice
// template. None of this varies per-quote, so it lives here as plain data
// rather than mixed into invoiceExport.js's document-building logic.

import { cardFeeTermsLine, DEFAULT_CARD_FEE_RATE } from './cardFee';

export const INVOICE_BUSINESS = {
  name: 'Zebra Screens & Rollers',
  tagline: 'Elevate Your Windows',
  addressLine1: '615 Blue Horizon Way',
  addressLine2: 'Argyle, TX 76226',
  phone: '940-326-1488',
  email: 'zebrascreensllc@gmail.com'
};

// The card line used to say only "Credit card convenience fees are NOT
// included." (no rate). It now names the quote's own card fee rate, so use
// termsAndConditions(rate) - TERMS_AND_CONDITIONS is the default-rate copy.
export const termsAndConditions = (cardRate = DEFAULT_CARD_FEE_RATE) => [
  'All Sales are final, no refunds, exchange, returns, or revisions.',
  'All window coverings come with a manufacturer warranty for non-human errors - the customer is responsible for any associated shipping costs.',
  'Half down payment due upon ordering, remaining due upon installation.',
  cardFeeTermsLine(cardRate),
  'The window coverings you are ordering and have approved are a custom-made product for your windows.',
  'Installation Timeline: Installation is typically completed within 2–3 weeks from the order date. Delays due to shipping issues or product damage may extend this timeframe, and we will work to resolve them as quickly as possible.'
];

export const TERMS_AND_CONDITIONS = termsAndConditions();

export const WARRANTY_SUMMARY = [
  'Fabric: 1 Year Limited Warranty',
  'Motor: 3 Years Limited Warranty',
  'Remote: 3 Months Limited Warranty'
];

export const WARRANTY_SECTIONS = [
  {
    title: '1. Manufacturing Defects (Covered)',
    bullets: [
      'Any fabric discoloration or malfunction in the blinds due to manufacturing defects will be covered under warranty within 1 year from the date of installation.',
      'For motorized systems, any functional issues with the motor will be covered under warranty for up to 3 years, and with the remote for up to 3 months, subject to proper usage.'
    ],
    notes: [
      'Note: If the motor battery is not charged and drains completely, the motor may reset and lose its connection with the remote. Re-pairing the motor with the remote in this case is the client’s responsibility. We will provide instructions on how to re-pair it, but a service visit for this is not included under warranty.'
    ]
  },
  {
    title: '2. The warranty does not cover damages resulting from:',
    bullets: [
      'Accidental damage, misuse, or negligence',
      'Unauthorized removal, dismantling, or modification of blinds',
      'Factory reset, limit setting changes, or app adjustments performed without our guidance',
      'Improper handling or installation by anyone other than our team'
    ],
    notes: [
      'In such cases, repair or replacement costs, including shipping, will be the responsibility of the client.',
      'If a supplier discontinues a fabric, motor, or remote after the warranty period has ended, Zebra Screens & Rollers is not responsible for providing a replacement. If the same item is still available from the supplier, we will be happy to help arrange a replacement. However, the cost of the replacement part and all shipping charges will be the responsibility of the client.'
    ]
  },
  {
    title: '3. Battery & Motor Care (Client Responsibility)',
    bullets: [
      'For motorized blinds, it is the client’s responsibility to charge the motor battery regularly - we recommend every 3-3.5 months, but this varies based on usage frequency and blind dimensions.',
      'Allowing the battery to frequently drain to 0% may reduce battery life and performance.',
      'Battery degradation due to improper charging practices is not covered under warranty.',
      'Motor failures or charging-related issues caused by the use of low-quality, unbranded, damaged, or non-compliant charging cables or extension cords are not covered under warranty. The use of reputable brands such as Anker, Belkin, UGREEN, Baseus, Amazon Basics, or equivalent is recommended.'
    ]
  },
  {
    title: '4. Transformer Care & Warranty Coverage',
    bullets: [
      'The 100V–240V AC to DC 24V transformer is covered against manufacturing defects for a period of 3 months from the date of installation, provided it is used under normal operating conditions.',
      'The warranty does not cover failures or damage resulting from improper installation, overloading, short circuits, reverse polarity connections, physical damage, unauthorized modifications, or use with incompatible devices.',
      'Failures resulting from environmental conditions (exposed to extreme heat, water, or moisture) are not covered under warranty.',
      'Damage caused by power surges, voltage fluctuations, lightning, or unstable electrical supply is not covered under warranty. The use of a suitable surge protector is strongly recommended.',
      'Due to limited inventory for hardwired systems, replacement transformers and related parts may require additional lead time. Expedited shipping can be arranged at the client’s expense.',
      'In the event of a transformer failure determined to be outside the scope of warranty coverage, replacement and any associated service or shipping costs will be the responsibility of the client.'
    ]
  },
  {
    title: '5. General Conditions',
    bullets: [
      'Warranty is valid only for products installed by our team or authorized personnel.',
      'Service visits (if required) may include applicable service charges depending on the issue.',
      'Any service issue reported by the customer will be acknowledged within 24 hours. Our team will assess the issue and provide an appropriate resolution timeframe based on the complexity and severity of the problem.'
    ]
  }
];
