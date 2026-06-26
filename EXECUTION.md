# Execution Checklist

Everything below is doable with no budget and no existing audience — just the free tool, the offer stack, and time. This is a checklist for you to run manually; nothing here auto-publishes or auto-charges anyone.

## 1. Stripe setup (free, ~15 min)

1. Create a Stripe account at stripe.com — no cost to create or to receive payments, Stripe takes a per-transaction fee only on actual sales.
2. In the Dashboard, go to **Payment Links → Create payment link** and create one for each tier:
   - Rate Reality Kit — $19, one-time
   - Systemization Pack — $79, one-time
   - Income Stability System — $297, one-time (only activate this once Tier 3 content actually exists — see `products/income-stability-system/README.md`)
3. On each Payment Link, enable **"Collect customer email"** — you need this for delivery regardless of which fulfillment option below you pick.
4. Copy each link, then open `offer-stack.html` and replace the three `https://buy.stripe.com/REPLACE_WITH_...` placeholders with your real links.

## 2. Fulfillment — start manual, automate later

**To start (zero setup):** when Stripe emails you a sale notification, manually email the buyer the relevant `products/` folder (zipped, or each `.md` converted to PDF) within a few hours. At low volume this costs you minutes a day and requires nothing beyond what you already have.

**Once volume justifies it:** move to automated delivery — either a Stripe Payment Link success-page redirect to a download page, or a dedicated delivery tool (Lemon Squeezy, Gumroad, SendOwl) that licenses and locks the file behind the purchase. Don't build this before you have sales to justify it.

## 3. Hosting (free)

1. In this repo's GitHub settings, enable **GitHub Pages** (Settings → Pages → Deploy from branch → `main`, root).
2. Your free calculator will be live at `https://<your-username>.github.io/<repo-name>/freelance-profit-calculator.html`, and the offer stack at the same path with `offer-stack.html`.
3. Double check the relative link between the two pages still resolves once hosted (`offer-stack.html` and `freelance-profit-calculator.html` living in the same directory — they do by default in this repo).

## 4. Distribution — zero-budget, organic

The free calculator is the asset that travels — it produces a personalized, slightly alarming number, which is what makes people want to share it. Lead with the tool itself, not with "I built a thing," in every channel below. Read and follow each community's self-promotion rules before posting — being removed or banned for spamming a launch kills the channel for every future post.

- **r/freelance, r/forhire, r/digitalnomad** — check each sub's self-promo rules; many require a minimum account age/karma or a specific weekly thread for tool shares.
- **Indie Hackers** — a "Show IH" style post about the free calculator, focused on the insight (the rate illusion), not the sales pitch.
- **X/Twitter** — post the actual number the calculator produces for a realistic example persona, as a hook tweet; the offer stack link goes in a reply, not the first post.
- **Freelance-focused Discord/Slack communities** — share in a relevant channel only, framed as "made this, thought it might be useful" rather than a launch announcement.
- **Direct, value-first outreach** — if you personally know freelancers, send them the free calculator link with zero ask attached. Some will ask what's next; that's when the offer stack link is relevant.

## 5. The stack math (a model, not a promise)

This shows how the pricing in this repo maps to revenue at different volumes — useful for deciding where to focus, not a guarantee of any specific outcome. Actual conversion depends entirely on how much real traffic and trust you generate through distribution.

| Tier | Price | Units to reach ~$350 | Units/mo to reach ~$9,400/mo |
|---|---|---|---|
| Rate Reality Kit | $19 | 19 units | — |
| Systemization Pack | $79 | — | 50 units/mo ≈ $3,950 |
| Income Stability System | $297 | — | 18 units/mo ≈ $5,350 |
| **Combined example** | — | **~19 Tier-1 sales** | **~50 Tier-2 + ~18 Tier-3 sales/mo** |

The right-hand column assumes Tier 2 and Tier 3 actually exist and have a buyer base by then — which, per `DEMAND-ALCHEMY.md`, only happens after Tier 1 proves there's real demand. Don't treat the $9.4K column as a near-term target; treat the $350 column as the actual first milestone.

## 6. First 7 days, in order

1. Day 1: Stripe account + Payment Link for Tier 1 only. Replace the placeholder link in `offer-stack.html`.
2. Day 1: Enable GitHub Pages, confirm both pages load and link to each other correctly.
3. Day 2-3: Post the free calculator in 2-3 communities from the distribution list, following each one's rules.
4. Day 3-7: Respond to every comment/DM the free tool generates — that's your actual distribution channel, not the initial post.
5. Ongoing: every sale, fulfill manually within hours, and ask the buyer one question — "what almost stopped you from buying?" That answer is your next piece of copy or product fix.
6. After ~15-20 Tier-1 sales: revisit `products/systemization-pack/README.md` and build out modules 2-4 for Tier 2.
