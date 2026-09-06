# TRACECHAIN

This is a [Next.js](https://nextjs.org) project bootstrapped with [v0](https://v0.app).

## Built with v0

This repository is linked to a [v0](https://v0.app) project. You can continue developing by visiting the link below -- start new chats to make changes, and v0 will push commits directly to this repo. Every merge to `main` will automatically deploy.

[Continue working on v0 →](https://v0.app/chat/projects/prj_RGYxK6Hq7w5tP09clRckUr1JzEZt)

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Blockchain data: LIVE vs DEMO

TRACECHAIN's wallet investigation pulls real balances, transactions, and
token transfers from live blockchain/indexer APIs for five chains — Ethereum,
Polygon, BSC, Bitcoin, and TRON. **Every environment variable below is
optional.** With none configured, the app still runs completely: every
result falls back to deterministic, seeded DEMO data and is unambiguously
labeled `DEMO DATA — deterministic sample, not live blockchain data.` in both
the API response (`dataSource: "MOCK"`) and the UI. LIVE/INDEXED/CACHED
results are never mislabeled as demo data, and demo data is never
mislabeled as live.

Copy `.env.example` to `.env.local` and fill in only what you have:

| Variable | Required for | Notes |
|---|---|---|
| `ETHERSCAN_API_KEY` | Ethereum, Polygon, BSC | One key enables all three via the Etherscan V2 unified API (`chainid` param). Free at etherscan.io/apis. |
| `TRACECHAIN_ETH_API_URL` / `_KEY` | Ethereum (override) | Optional dedicated endpoint instead of the unified key. |
| `TRACECHAIN_POLYGON_API_URL` / `_KEY` | Polygon (override) | Optional dedicated endpoint instead of the unified key. |
| `TRACECHAIN_BSC_API_URL` / `_KEY` | BSC (override) | Optional dedicated endpoint instead of the unified key. |
| `TRACECHAIN_BTC_API_URL` / `_KEY` | Bitcoin (override only) | Bitcoin is LIVE **by default** via the public, keyless Blockstream Esplora API — no setup needed. |
| `TRACECHAIN_TRON_API_URL` / `_KEY` | TRON | TronGrid's keyless rate limit is too low for investigation traffic, so a key is **required** for TRON to go LIVE. |
| `TRACECHAIN_PRICE_API_URL` / `_KEY` | Historical/spot USD enrichment (optional, all chains) | CoinGecko-compatible. When unset, every `usdValue`/`usdBalance` is `null` — never a fabricated `0` — and tracing still succeeds. |
| `TRACECHAIN_JWT_SECRET` | Session auth | Falls back to an insecure demo secret if unset. Set a strong random value before any non-local deployment. |

### What happens when a variable is missing

- **Per-chain keys missing:** that chain's investigation silently falls back
  to DEMO data with an explicit notice in the response (`notice: "DEMO
  DATA — deterministic sample, not live blockchain data."` or, if a
  configured live call fails at request time, `"Live provider unavailable
  (<reason>). DEMO DATA…"`). No chain ever appears live when it isn't.
- **`TRACECHAIN_PRICE_API_URL` missing:** every `usdValue` / `usdBalance` is
  `null` (rendered as "Unknown" in the UI), never `0`. Price enrichment is
  best-effort and bounded — it can never fail or block an investigation.
- **`TRACECHAIN_JWT_SECRET` missing:** sessions still work using a fixed
  demo secret; do not run this way outside local development.

Check `/api/blockchain/providers/status` (or the Integrations page in the
app) at any time to see, per chain, whether it is currently LIVE-capable and
which env vars it expects — without exposing any secret values.

### Scoping an investigation

`GET /api/wallet/{address}` accepts optional query params to bound the pull:

| Param | Meaning |
|---|---|
| `chain` | Force a specific chain (otherwise auto-detected from the address). |
| `startDate` / `endDate` | Inclusive ISO date filters applied to each transaction's **authoritative** on-chain timestamp. Rows with an unknown timestamp are kept, never dropped. Filtering is integrated with pagination: because providers page newest-first, the walker stops as soon as it passes `startDate`, so it never silently misses older matches or loops unbounded. |
| `maxTransactions` | Hard cap on returned rows (never exceeds the investigation maximum of 500). |
| `page` | For EVM chains only, the 1-based explorer page to start from (genuine page-number semantics). Bitcoin and TRON are cursor-based and ignore this. |

When more matching transactions may exist beyond the cap, the response sets
`truncated: true` (with `meta.totalFetched` / `meta.pagesFetched`) and the UI
shows a "Partial history" notice — the app never silently claims complete
history.

## Learn More

To learn more, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.
- [v0 Documentation](https://v0.app/docs) - learn about v0 and how to use it.
