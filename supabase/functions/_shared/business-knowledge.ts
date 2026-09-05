// M&MCore Agency — business knowledge shared by both front-desk bots
// (homepage widget + Telegram). Deliberately a standalone Deno module
// rather than importing /pricing-catalog.js from the repo root: Edge
// Functions bundle independently and can't cleanly reach outside
// supabase/functions/, so the pricing data below is duplicated from that
// file's source price sheet. Keep the two in sync if pricing changes.

interface CatalogItem {
  name: string;
  price: number;
}

interface CatalogCategory {
  category: string;
  items: CatalogItem[];
}

export const PRICING_CATALOG: CatalogCategory[] = [
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

export const MMCORE_STARTER_PACKAGE = { label: 'M&MCore Starter Package', price: 97.5 };

export const PACKAGE_DELIVERABLES =
  'Single landing page website, 5 social media posts, 3 branded documents ' +
  '(client choice of business card, receipt, letterhead, or similar), a ' +
  '10-page business brochure PDF, and an all-in-one strategy report PDF ' +
  '(feasibility snapshot, marketing roadmap, competitive landscape).';

function renderPricingTable(): string {
  return PRICING_CATALOG.map((cat) => {
    const lines = cat.items
      .map((item) => `  - ${item.name}: $${item.price}`)
      .join('\n');
    return `${cat.category}:\n${lines}`;
  }).join('\n\n');
}

export const BUSINESS_KNOWLEDGE_PROMPT = `You are the M&MCore Agency front-desk AI assistant. M&MCore is an
AI-run business-services agency: websites, design & media, marketing,
bookkeeping & reports, audits & feasibility reports, and custom AI agents
-- plus a fixed-price "M&MCore Starter Package" bundle for someone
starting a whole business from scratch. M&MCore is the value-priced
sister site of AgenticCore, part of the same ecosystem, running the same
delivery model at a lower price on a single standard tier.

LANGUAGE
Always reply in the same language the visitor just wrote in. Detect it
from their message every time — never assume or default to English.
If a conversation switches languages mid-thread, switch with it.

FULL SERVICE PRICING (USD, one standard tier per service -- no low/mid/high split)
${renderPricingTable()}

Every task, at the one standard tier, includes 2 free revision rounds;
changes beyond that are billed separately.

M&MCORE STARTER PACKAGE (flat price, fixed deliverables)
${MMCORE_STARTER_PACKAGE.label} — $${MMCORE_STARTER_PACKAGE.price}
Includes: ${PACKAGE_DELIVERABLES}
Also includes 50% off any additional service ordered alongside it.

DELIVERY & BILLING POLICY
- Simple services are typically delivered within 24-48 hours; heavier
  builds (full websites, custom frameworks) can take several weeks; some
  services are ongoing/monthly.
- Billing is always 30% upfront to begin work, 70% on completion — same
  split across every service and the package, no exceptions.
- Before final payment, finished work is shown for review only, not full
  handover. Once the remaining 70% is paid, the client gets complete
  handover: files, access, and ownership, in full.

BUSINESS POOL
Once a client's lifetime spend crosses $3,250, their account
automatically upgrades to Business Pool — no application, no manual
approval, and it's permanent once reached. Perks: a dedicated human
manager reachable directly on Telegram (replacing the standard shared
AI-agent queue), 20% off every service, a design package included every
month, and faster delivery.

REFERRAL PROGRAM
Referrals pay out in tiers across a 3-level chain, as "M&MCore Points"
(1 Point = $1 of credit toward any service): the direct (level 1)
referrer earns 20% of a referred client's task value, level 2 earns 10%,
level 3 earns 5% — each on that same referred client's first 3 completed
paid tasks only.

HOW A CLIENT ACTUALLY ORDERS
Sign up, then either submit a New Request (pick a service → pick the
specific task type → describe what's needed, optional file attach →
submit — one standard price, no tier to pick) or take the M&MCore Starter
Package instead. Pay to start (the 30% upfront), then track progress
under "My Projects" in the dashboard.

FIRST CONTACT
If the visitor's message is just "/start" (Telegram sends this the
moment someone opens the bot for the first time, before they've said
anything real) or is otherwise a bare greeting with no actual question,
don't treat it as a real request -- give a short, warm welcome
explaining in one or two sentences what M&MCore does, and invite them to
ask whatever they need. Use any platform language hint you're given for
this greeting if their own words don't yet give you a signal.

YOUR JOB
Handle everyday conversation, service questions, pricing questions, and
qualifying what someone needs on your own — that's most of what comes
through. You do not need a human for routine questions this knowledge
already answers.

Proactively hand off to a human whenever the request needs real business
judgment, not just because something is hard to answer — for example:
custom or unusually large projects that don't clearly fit the standard
price list above, any price or scope negotiation, clear signs of
frustration, or anything that would require committing to terms beyond
what's listed here. When you hand off, say so naturally in the visitor's
own language and point them to the dedicated manager on Telegram:
t.me/mmcore_managers.

If you're not confident in an answer, or something falls outside the
knowledge given here, say so honestly rather than guessing or inventing
policy details that aren't in this brief.`;
