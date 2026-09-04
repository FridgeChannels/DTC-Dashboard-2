export type DiscountIssueCode =
  | "expired"
  | "product_mapping_required"
  | "invalid"
  | "codes_low"
  | "codes_exhausted"
  | "parsing_issue";

export interface DiscountIssue {
  code: DiscountIssueCode;
  label: string;
}

export interface DiscountDisplayInput {
  title?: string | null;
  benefitSummary?: string | null;
  startAt?: string | null;
  endAt?: string | null;
  eligibleAsins?: string[];
  matchedAsins?: string[];
  isVisibleOnFc?: boolean;
  claimCodeMode?: "none" | "group" | "single_use" | null;
  discountKind?: "amazon_coupon" | "amazon_promotion";
  groupClaimCode?: string | null;
  codePool?: { available?: number; status?: string | null } | null;
  parsingIssue?: boolean;
}

const ISSUE_LABELS: Record<DiscountIssueCode, string> = {
  expired: "Expired",
  product_mapping_required: "Product mapping required",
  invalid: "Invalid",
  codes_low: "Codes low",
  codes_exhausted: "Codes exhausted",
  parsing_issue: "Parsing issue",
};

export function parseEligibleAsins(value: unknown): string[] {
  const text = Array.isArray(value) ? value.join(" ") : String(value ?? "");
  return [...new Set(text.toUpperCase().match(/[A-Z0-9]{10}/g) ?? [])];
}

export function matchProductsByAsins<T extends { asin?: string | null }>(
  products: T[],
  asins: string[],
): { matched: T[]; unmatchedAsins: string[] } {
  const wanted = new Set(asins.map((asin) => asin.toUpperCase()));
  const matched = products.filter((product) => wanted.has(String(product.asin || "").toUpperCase()));
  const matchedAsins = new Set(matched.map((product) => String(product.asin || "").toUpperCase()));
  return {
    matched,
    unmatchedAsins: [...wanted].filter((asin) => !matchedAsins.has(asin)),
  };
}

export function amazonPeriodEnded(endAt: string | null | undefined, now = Date.now()): boolean {
  const end = Date.parse(String(endAt ?? ""));
  return Number.isFinite(end) && end <= now;
}

export function amazonPeriodLabel(startAt: string | null | undefined, endAt: string | null | undefined, now = Date.now()): string {
  if (amazonPeriodEnded(endAt, now)) return "Ended";
  const start = Date.parse(String(startAt ?? ""));
  const end = Date.parse(String(endAt ?? ""));
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "—";
  const format = (value: number) => new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return `${format(start)}–${format(end)}`;
}

export function claimCodeColumn(kind: string | null | undefined, mode: string | null | undefined): string {
  if (kind === "amazon_coupon") return "—";
  if (mode === "group") return "Group";
  if (mode === "single_use") return "Single-use";
  return "None";
}

export function discountIssues(input: DiscountDisplayInput, now = Date.now()): DiscountIssue[] {
  const issues: DiscountIssue[] = [];
  const eligible = input.eligibleAsins ?? [];
  const matched = new Set(input.matchedAsins ?? []);
  const unmatched = eligible.filter((asin) => !matched.has(asin));
  const start = Date.parse(String(input.startAt ?? ""));
  const end = Date.parse(String(input.endAt ?? ""));
  const datesValid = Number.isFinite(start) && Number.isFinite(end) && end > start;
  const requiredFacts = Boolean(input.title?.trim() && input.benefitSummary?.trim() && datesValid && eligible.length);
  const groupMissing = input.discountKind === "amazon_promotion"
    && input.claimCodeMode === "group"
    && !input.groupClaimCode?.trim();

  if (input.parsingIssue) issues.push({ code: "parsing_issue", label: ISSUE_LABELS.parsing_issue });
  if (!requiredFacts || groupMissing) issues.push({ code: "invalid", label: ISSUE_LABELS.invalid });
  if (unmatched.length) issues.push({ code: "product_mapping_required", label: ISSUE_LABELS.product_mapping_required });
  if (amazonPeriodEnded(input.endAt, now)) issues.push({ code: "expired", label: ISSUE_LABELS.expired });

  if (input.discountKind === "amazon_promotion" && input.claimCodeMode === "single_use") {
    const available = input.codePool?.available ?? 0;
    const status = input.codePool?.status;
    if (available === 0 || status === "exhausted") {
      issues.push({ code: "codes_exhausted", label: ISSUE_LABELS.codes_exhausted });
    } else if (status === "codes_low" || status === "low") {
      issues.push({ code: "codes_low", label: ISSUE_LABELS.codes_low });
    }
  }
  return issues;
}

export function primaryDiscountIssue(input: DiscountDisplayInput, now = Date.now()): DiscountIssue | null {
  return discountIssues(input, now)[0] ?? null;
}

export function canDisplayDiscountOnConsumer(
  input: DiscountDisplayInput & { productAsin?: string | null },
  now = Date.now(),
): boolean {
  if (input.isVisibleOnFc !== true) return false;
  const issues = discountIssues(input, now);
  if (issues.some((issue) => ["expired", "invalid", "parsing_issue", "codes_exhausted"].includes(issue.code))) {
    return false;
  }
  const asin = input.productAsin?.trim().toUpperCase();
  if (asin) {
    if (!(input.matchedAsins ?? []).includes(asin) || !(input.eligibleAsins ?? []).includes(asin)) return false;
  } else if ((input.matchedAsins ?? []).length === 0) {
    return false;
  }
  const start = Date.parse(String(input.startAt ?? ""));
  const end = Date.parse(String(input.endAt ?? ""));
  return Number.isFinite(start) && Number.isFinite(end) && start <= now && now < end;
}
