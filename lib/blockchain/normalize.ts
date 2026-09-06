import type { Chain, DataProvenance, PriceDataSource, Transaction, TransferType } from "@/lib/types"
import type { TokenTransfer, TxQueryOptions } from "./data-source"
import { MAX_INVESTIGATION_TRANSACTIONS } from "./data-source"

// Phase 9 — unified transaction normalization layer.
//
// Every adapter (EVM native, ERC-20/BEP-20/Polygon/TRC-20 tokens, Bitcoin
// UTXO, Tron) funnels its raw rows through these helpers so the rest of the
// system consumes ONE consistent TRACECHAIN Transaction shape, with an explicit
// transferType and honest value provenance.

export interface NormalizeNativeInput {
  hash: string
  chain: Chain
  from: string
  to: string
  amount: number
  asset: string
  timestamp: string | null
  // Null when the authoritative block number could not be resolved. Never
  // fabricated as 0 — an unknown block height must never look like block 0.
  blockHeight: number | null
  address?: string // reference address to infer direction
  provenance?: DataProvenance
  usdValue?: number | null
  priceDataSource?: PriceDataSource
  priceTimestamp?: string | null
}

export interface NormalizeTokenInput extends NormalizeNativeInput {
  tokenAddress: string
}

// Exported so every adapter (EVM, Bitcoin, Tron) derives "in"/"out" the same
// way instead of each reimplementing the comparison (Phase 9 — no duplicated
// normalization logic).
export function directionOf(address: string | undefined, from: string, to: string): "in" | "out" | undefined {
  if (!address) return undefined
  return to.toLowerCase() === address.toLowerCase() ? "in" : "out"
}

// Shared integer-base-units -> human-decimal converter used by every adapter
// that reads amounts as base-unit strings (EVM wei, TRC-20/ERC-20 token
// units, etc). Centralized here so providers don't each reimplement BigInt
// division (Phase 9 — no duplicated normalization logic across providers).
export function baseUnitsToDecimal(raw: string | number | undefined | null, decimals: number): number {
  if (raw === undefined || raw === null || raw === "") return 0
  try {
    const str = String(raw)
    const negative = str.startsWith("-")
    const digits = negative ? str.slice(1) : str
    const big = BigInt(digits.includes(".") ? digits.split(".")[0] : digits)
    const divisor = BigInt("1" + "0".repeat(Math.max(decimals, 0)))
    const whole = big / divisor
    const frac = big % divisor
    const fracStr = frac.toString().padStart(decimals, "0").slice(0, 8)
    const val = Number(fracStr ? `${whole}.${fracStr}` : `${whole}`)
    return negative ? -val : val
  } catch {
    return 0
  }
}

export function normalizeNative(input: NormalizeNativeInput): Transaction {
  return {
    hash: input.hash,
    chain: input.chain,
    from: input.from,
    to: input.to,
    amount: input.amount,
    asset: input.asset,
    // Live native transfers have no price unless enrichment supplied one.
    usdValue: input.usdValue ?? null,
    timestamp: input.timestamp,
    blockHeight: input.blockHeight,
    direction: directionOf(input.address, input.from, input.to),
    provenance: input.provenance ?? "LIVE_BLOCKCHAIN_DATA",
    transferType: "NATIVE" as TransferType,
    tokenAddress: null,
    priceDataSource: input.priceDataSource ?? "UNAVAILABLE",
    priceTimestamp: input.priceTimestamp ?? null,
  }
}

export function normalizeToken(input: NormalizeTokenInput): Transaction {
  return {
    hash: input.hash,
    chain: input.chain,
    from: input.from,
    to: input.to,
    amount: input.amount,
    asset: input.asset,
    usdValue: input.usdValue ?? null,
    timestamp: input.timestamp,
    blockHeight: input.blockHeight,
    direction: directionOf(input.address, input.from, input.to),
    provenance: input.provenance ?? "LIVE_BLOCKCHAIN_DATA",
    transferType: "TOKEN" as TransferType,
    tokenAddress: input.tokenAddress,
    priceDataSource: input.priceDataSource ?? "UNAVAILABLE",
    priceTimestamp: input.priceTimestamp ?? null,
  }
}

// Adapt a rich TokenTransfer into the common Transaction shape so the
// investigation graph can consume native AND token movements uniformly.
export function tokenTransferToTransaction(t: TokenTransfer, referenceAddress?: string): Transaction {
  return normalizeToken({
    hash: t.hash,
    chain: t.chain,
    from: t.from,
    to: t.to,
    amount: t.amount,
    asset: t.tokenSymbol,
    tokenAddress: t.tokenAddress,
    timestamp: t.timestamp,
    blockHeight: t.blockHeight,
    address: referenceAddress,
  })
}

// Parsed, validated numeric date window (epoch ms). Unparseable/absent bounds
// become `undefined` so a malformed filter is ignored rather than dropping
// every row.
export interface DateBounds {
  start?: number
  end?: number
}

// Parse the ISO startDate/endDate options into an epoch-ms window. Both bounds
// are INCLUSIVE (see classifyTimestamp). Invalid dates are treated as "no
// bound" instead of throwing or silently excluding everything.
export function parseDateBounds(options: TxQueryOptions = {}): DateBounds {
  const start = options.startDate ? Date.parse(options.startDate) : Number.NaN
  const end = options.endDate ? Date.parse(options.endDate) : Number.NaN
  return {
    start: Number.isFinite(start) ? start : undefined,
    end: Number.isFinite(end) ? end : undefined,
  }
}

export function hasDateBounds(bounds: DateBounds): boolean {
  return bounds.start !== undefined || bounds.end !== undefined
}

// Classify one authoritative timestamp against the requested window. Providers
// fetch newest-first (descending), so this lets an adapter skip rows that are
// too new, keep rows in range, and STOP paging once it reaches rows older than
// startDate — bounded, no extra upstream calls.
//   "in"     -> within [start, end] (inclusive), OR a null/unparseable
//               timestamp we cannot prove is out of range (kept, never dropped)
//   "after"  -> strictly newer than endDate (skip this row, keep paging)
//   "before" -> strictly older than startDate (in descending order this marks
//               the end of the window)
export function classifyTimestamp(timestamp: string | null, bounds: DateBounds): "in" | "after" | "before" {
  if (!timestamp) return "in"
  const ts = Date.parse(timestamp)
  if (!Number.isFinite(ts)) return "in"
  if (bounds.end !== undefined && ts > bounds.end) return "after"
  if (bounds.start !== undefined && ts < bounds.start) return "before"
  return "in"
}

// Apply investigation date filters + the hard investigation cap. Returns the
// filtered rows and whether the result was truncated by the cap.
export function applyInvestigationFilters(
  txs: Transaction[],
  options: TxQueryOptions = {},
): { transactions: Transaction[]; truncated: boolean } {
  const cap = Math.min(options.maxTransactions ?? MAX_INVESTIGATION_TRANSACTIONS, MAX_INVESTIGATION_TRANSACTIONS)
  const start = options.startDate ? Date.parse(options.startDate) : undefined
  const end = options.endDate ? Date.parse(options.endDate) : undefined

  let filtered = txs
  if (start !== undefined || end !== undefined) {
    filtered = filtered.filter((t) => {
      const ts = t.timestamp ? Date.parse(t.timestamp) : Number.NaN
      if (!Number.isFinite(ts)) return true
      if (start !== undefined && ts < start) return false
      if (end !== undefined && ts > end) return false
      return true
    })
  }

  const truncated = filtered.length > cap
  return { transactions: truncated ? filtered.slice(0, cap) : filtered, truncated }
}
