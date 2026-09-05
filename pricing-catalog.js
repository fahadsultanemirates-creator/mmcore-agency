// M&MCore Agency — finalized service price sheet, shared by the New
// Request wizard. Plain JS constants rather than a DB table: pricing is
// a display/computation concern, not something that should need a
// migration to change.
//
// M&MCore runs ONE standard tier per service (no low/mid/high split).
// Every price below is exactly AgenticCore's equivalent "Low" tier price
// minus 35% (i.e. 65% of it) — M&MCore is the value entry point of the
// AgenticCore ecosystem, not a second full-price catalog.

const PRICING_CATALOG = [
  {
    category: 'Websites',
    items: [
      { name: 'Single landing page website', price: 32.5 },
      { name: 'Multi-page website (3-5 pages)', price: 97.5 },
      { name: 'Multi-page website (6-10 pages)', price: 195 },
      { name: 'E-commerce website', price: 520 },
      { name: 'Custom dashboard / web app', price: 650 },
      { name: 'Website redesign', price: 130 },
      { name: 'Blog setup', price: 32.5 },
      { name: 'Domain + hosting setup (one-time)', price: 19.5 },
      { name: 'Website maintenance (monthly)', price: 13 }
    ]
  },
  {
    category: 'Design & Media',
    items: [
      { name: 'Logo design', price: 3.25 },
      { name: 'Business card design', price: 3.25 },
      { name: 'Letterhead or receipt design', price: 3.25 },
      { name: 'Brand style guide', price: 13 },
      { name: 'Social media single post', price: 3.25 },
      { name: 'Social media post pack (5 posts)', price: 16.25 },
      { name: 'Social media post pack (10 posts)', price: 32.5 },
      { name: 'Social media post pack (20 posts)', price: 48.75 },
      { name: 'Marketing banner', price: 3.25 },
      { name: 'Video (8-15 sec)', price: 9.75 },
      { name: 'Video (30-60 sec)', price: 26 },
      { name: 'Photo editing', price: 3.25 },
      { name: 'PDF proposal design', price: 9.75 },
      { name: 'PDF report design', price: 9.75 },
      { name: 'PDF brochure design', price: 16.25 },
      { name: 'Email (design)', price: 3.25 }
    ]
  },
  {
    category: 'Marketing',
    items: [
      { name: 'Social media handling (monthly)', price: 39 },
      { name: 'Auto social media posting (monthly)', price: 32.5 },
      { name: 'Marketing strategy & feasibility plan', price: 16.25 },
      { name: 'Full marketing management retainer (monthly)', price: 117 },
      { name: 'Ad campaign management (monthly)', price: 39 },
      { name: 'SEO optimization (one-time)', price: 39 },
      { name: 'SEO maintenance (monthly)', price: 32.5 },
      { name: 'AI marketing framework build', price: 227.5 },
      { name: 'AI marketing framework maintenance (monthly)', price: 32.5 },
      { name: 'Email marketing setup', price: 16.25 }
    ]
  },
  {
    category: 'Bookkeeping & Reports',
    items: [
      { name: 'Bookkeeping cleanup', price: 39 },
      { name: 'Ongoing bookkeeping (monthly)', price: 32.5 },
      { name: 'Monthly balance sheet', price: 19.5 },
      { name: 'Yearly balance sheet / annual report', price: 65 },
      { name: 'Invoicing & receipts setup', price: 16.25 },
      { name: 'Payroll setup', price: 32.5 },
      { name: 'Tax preparation support', price: 39 }
    ]
  },
  {
    category: 'Audits & Feasibility Reports',
    items: [
      { name: 'Business feasibility report', price: 26 },
      { name: 'Business audit', price: 32.5 },
      { name: 'Market research report', price: 26 },
      { name: 'Competitor analysis report', price: 19.5 },
      { name: 'Real estate project feasibility report', price: 65 }
    ]
  },
  {
    category: 'Custom AI Agents',
    items: [
      { name: 'Single-task AI agent', price: 97.5 },
      { name: 'Multi-agent framework (2-4 agents)', price: 325 },
      { name: 'Multi-agent framework (full business system)', price: 650 },
      { name: 'Telegram/WhatsApp customer support agent', price: 130 },
      { name: 'Voice AI agent', price: 195 },
      { name: 'Agent hosting & maintenance (monthly)', price: 16.25 },
      { name: 'Framework handover (client owns & runs it)', price: 97.5 }
    ]
  }
];

// Flat M&MCore starter bundle — single tier, same idea as AgenticCore's
// package bundles but with one fixed price instead of three.
const MMCORE_STARTER_PACKAGE = { label: 'M&MCore Starter Package', price: 97.5 };

function getCatalogCategory(category) {
  return PRICING_CATALOG.find((c) => c.category === category) || null;
}

function getCatalogItem(category, itemName) {
  const cat = getCatalogCategory(category);
  if (!cat) return null;
  return cat.items.find((i) => i.name === itemName) || null;
}
