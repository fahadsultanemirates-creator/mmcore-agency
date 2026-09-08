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

const MMCORE_MARKETING_CATALOG = [
  {
    category: 'AI Video & Creative',
    items: [
      { name: 'Multilingual AI avatar spokesperson video (per 60-90s video)', price: 127.5 },
      { name: 'Automated video repurposing (monthly, 12 vertical shorts/reels)', price: 360 },
      { name: 'Dynamic ad creative production (15-20 modular ad variants)', price: 285 }
    ]
  },
  {
    category: 'Lead Generation & Outreach',
    items: [
      { name: 'Multi-agent lead scraping & enrichment (1,000 ICP-verified B2B leads)', price: 330 },
      { name: 'Hyper-personalized cold outreach (monthly, full outbound infrastructure)', price: 900 },
      { name: 'Automated lead qualification & scoring (setup)', price: 420 }
    ]
  },
  {
    category: 'Customer Engagement',
    items: [
      { name: '24/7 AI sales & support chatbot (setup)', price: 390 },
      { name: '24/7 AI sales & support chatbot (monthly)', price: 90 },
      { name: 'Automated review & reputation management (monthly)', price: 225 },
      { name: 'Behavioral re-engagement workflows (setup)', price: 375 }
    ]
  },
  {
    category: 'Paid Media & Optimization',
    items: [
      { name: 'Predictive audience targeting & setup', price: 315 },
      { name: 'Autonomous ad budget allocation (monthly)', price: 480 },
      { name: 'Algorithmic A/B testing & CRO (monthly)', price: 405 }
    ]
  },
  {
    category: 'Organic Growth & Intelligence',
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
    billing: 'Custom — let’s talk',
    description: 'Not sure which package fits, or need something neither one covers? We scope it with you directly, first.',
    includes: [
      'A real conversation about your business and goals before anything is proposed',
      'A plan and price built around what you actually need',
      'The same team and delivery standards as every other package'
    ]
  }
];

function formatMarketingPrice(amount) {
  return '$' + Number(amount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
