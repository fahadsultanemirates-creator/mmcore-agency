// M&MCore Agency — Marketing Services catalog.
//
// M&MCore doesn't run a separate marketing agency the way AgenticCore Biz
// does -- so instead of building a second business, we bring Biz's full
// AI marketing lineup into M&MCore itself, at 40% below Biz's price.
// Biz prices its à la carte items as ranges (confirmed during scoping);
// M&MCore keeps its own "one simplified tier" convention, so each item
// below is the midpoint of Biz's range, discounted 40%, matching the
// single-price style every other M&MCore service already uses.
//
// This file is loaded after pricing-catalog.js and before dashboard.js /
// any page script. It appends these categories onto the shared
// PRICING_CATALOG so they show up automatically in the New Request
// wizard alongside every other M&MCore service -- no wizard code changes
// needed. MMCORE_MARKETING_PACKAGES is kept separate (same pattern as
// MMCORE_STARTER_PACKAGE) since packages are sold as a bundle, not picked
// from the wizard.
//
// ON THE PRICE GAP WITH THE CORE CATALOGUE
// These items are roughly an order of magnitude above the core sheet
// ($90-900 vs $3-120), because they are a different kind of product:
// core "Marketing Essentials" is a one-off asset or a light posting
// service, while everything here is a continuously-run managed programme
// with real third-party media, data and compute cost behind it. The two
// are deliberately named apart -- "Marketing Essentials" vs "AI
// Marketing Services" -- and each category below carries a `note` the
// wizard renders, so a customer seeing $39/mo social handling next to
// $480/mo autonomous ad budgeting understands why, instead of reading it
// as an inconsistency.
//
// As with pricing-catalog.js, these numbers are DISPLAY ONLY --
// public.service_prices (migration 0014) is what actually gets charged.

const MMCORE_MARKETING_CATALOG = [
  {
    category: 'AI Video & Creative',
    note: 'Produced and iterated continuously by agents, including voice, translation and render cost.',
    items: [
      { name: 'Multilingual AI avatar spokesperson video (per 60-90s video)', price: 127.5 },
      { name: 'Automated video repurposing (monthly, 12 vertical shorts/reels)', price: 360 },
      { name: 'Dynamic ad creative production (15-20 modular ad variants)', price: 285 }
    ]
  },
  {
    category: 'Lead Generation & Outreach',
    note: 'Includes the data, verification and sending infrastructure — not just the setup.',
    items: [
      { name: 'Multi-agent lead scraping & enrichment (1,000 ICP-verified B2B leads)', price: 330 },
      { name: 'Hyper-personalized cold outreach (monthly, full outbound infrastructure)', price: 900 },
      { name: 'Automated lead qualification & scoring (setup)', price: 420 }
    ]
  },
  {
    category: 'Customer Engagement',
    note: 'Always-on services: a setup fee where listed, then a monthly fee to keep it running and supervised.',
    items: [
      { name: '24/7 AI sales & support chatbot (setup)', price: 390 },
      { name: '24/7 AI sales & support chatbot (monthly)', price: 90 },
      { name: 'Automated review & reputation management (monthly)', price: 225 },
      { name: 'Behavioral re-engagement workflows (setup)', price: 375 }
    ]
  },
  {
    category: 'Paid Media & Optimization',
    note: 'Management fee only — your ad spend is paid directly to the platforms and is not included.',
    items: [
      { name: 'Predictive audience targeting & setup', price: 315 },
      { name: 'Autonomous ad budget allocation (monthly)', price: 480 },
      { name: 'Algorithmic A/B testing & CRO (monthly)', price: 405 }
    ]
  },
  {
    category: 'Organic Growth & Intelligence',
    note: 'Ongoing programmes measured over months, not one-off deliverables.',
    items: [
      { name: 'Programmatic SEO & content hubs (setup)', price: 690 },
      { name: 'Real-time competitor & market tracking (monthly)', price: 255 }
    ]
  }
];

// Register the marketing categories onto the shared catalog so the New
// Request wizard (dashboard.js) picks them up with zero code changes.
if (typeof PRICING_CATALOG !== 'undefined') {
  PRICING_CATALOG.push(...MMCORE_MARKETING_CATALOG);
}

// Two fixed monthly packages (40% below Biz's Starter Engine / Omni-Scale
// Growth Engine) plus a Custom Package that, same as Biz, is never a
// checkout item -- it routes to a real conversation instead.
const MMCORE_MARKETING_PACKAGES = [
  {
    key: 'marketing-starter-engine',
    name: 'AI Starter Engine',
    price: 570,
    billing: 'per month',
    recurring: true,
    description: 'A focused starting point: always-on customer engagement plus a steady stream of content.',
    includes: [
      '24/7 AI sales & support chatbot',
      '4 multilingual AI avatar videos',
      '8 repurposed vertical shorts/reels',
      'Automated review & reputation management',
      'Monthly performance report'
    ]
  },
  {
    key: 'marketing-omni-scale-growth-engine',
    name: 'Omni-Scale Growth Engine',
    price: 2070,
    billing: 'per month',
    recurring: true,
    featured: true,
    description: 'Full-scale, multi-channel growth: outbound, paid, organic, and creative, run and optimized continuously.',
    includes: [
      '2,500 ICP-verified leads per month',
      '10 multilingual AI avatar videos',
      '20 repurposed vertical shorts/reels',
      '30 modular ad creative variants',
      'Autonomous ad budget allocation + algorithmic CRO',
      'Real-time competitor & market tracking',
      '10 programmatic SEO pages per month',
      'Bi-weekly strategy calls with your manager'
    ]
  },
  {
    key: 'marketing-custom',
    name: 'Custom Package',
    price: null,
    recurring: true,
    billing: 'Custom — let’s talk',
    description: 'Not sure which package fits, or need something neither one covers? We scope it with you directly, first.',
    includes: [
      'A real conversation about your business and goals before anything is proposed',
      'A plan and price built around what you actually need',
      'The same team and delivery standards as every other package'
    ]
  }
];

// Monthly packages are billed for each month in advance, not on the
// 30/70 split used for one-off project work -- there is no "completion"
// to hold 70% against. The pricing trigger flags them is_recurring and
// approve_project_delivery skips the 70% row for them.
const MARKETING_PACKAGE_BILLING_NOTE =
  'Billed monthly in advance. Cancel any time before the next month starts.';

function formatMarketingPrice(amount) {
  return '$' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
