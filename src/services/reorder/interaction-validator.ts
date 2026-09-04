export const FC_INTERACTION_TYPES = [
  "experience_opened",
  "amazon_product_clicked",
  "storefront_clicked",
  "discount_viewed",
  "discount_copied",
  "survey_started",
  "survey_completed",
] as const;

export type FcInteractionType = typeof FC_INTERACTION_TYPES[number];
export type InteractionExclusionReason = "staff_test" | "bot" | "rapid_repeat" | "no_meaningful_interaction";

export interface FcInteractionEvent {
  eventId: string;
  fcId: string;
  type: FcInteractionType;
  occurredAt: string;
  sessionId?: string | null;
  deviceId?: string | null;
  userAgent?: string | null;
  isStaff?: boolean;
  isTestFc?: boolean;
}

export interface InteractionFilterOptions {
  rapidRepeatCount?: number;
  rapidRepeatWindowMs?: number;
}

const MEANINGFUL = new Set<FcInteractionType>(FC_INTERACTION_TYPES.filter((type) => type !== "experience_opened"));
const BOT_PATTERN = /bot|crawler|spider|headless|selenium|playwright|puppeteer|phantomjs|lighthouse/i;

function isRapidRepeat(events: FcInteractionEvent[], count: number, windowMs: number): boolean {
  const identified = events.filter((event) => event.deviceId || event.sessionId);
  const groups = new Map<string, number[]>();
  for (const event of identified) {
    const identity = event.deviceId || event.sessionId;
    if (!identity) continue;
    const time = Date.parse(event.occurredAt);
    if (!Number.isFinite(time)) continue;
    const times = groups.get(identity) ?? [];
    times.push(time);
    groups.set(identity, times);
  }
  return [...groups.values()].some((times) => {
    times.sort((a, b) => a - b);
    return times.some((start, index) => index + count - 1 < times.length && times[index + count - 1] - start <= windowMs);
  });
}

export function evaluateFcInteractions(events: readonly FcInteractionEvent[], options: InteractionFilterOptions = {}) {
  const rapidRepeatCount = options.rapidRepeatCount ?? 5;
  const rapidRepeatWindowMs = options.rapidRepeatWindowMs ?? 2_000;
  const seenEventIds = new Set<string>();
  const uniqueEvents: FcInteractionEvent[] = [];
  for (const event of events) {
    if (!event.eventId || seenEventIds.has(event.eventId)) continue;
    seenEventIds.add(event.eventId);
    uniqueEvents.push({ ...event, fcId: event.fcId.trim().toUpperCase() });
  }
  const byFc = new Map<string, FcInteractionEvent[]>();
  for (const event of uniqueEvents) {
    if (!event.fcId || !FC_INTERACTION_TYPES.includes(event.type)) continue;
    const group = byFc.get(event.fcId) ?? [];
    group.push(event);
    byFc.set(event.fcId, group);
  }

  const validFcIds: string[] = [];
  const excluded: Array<{ fcId: string; reason: InteractionExclusionReason }> = [];
  for (const [fcId, group] of byFc) {
    let reason: InteractionExclusionReason | null = null;
    if (group.some((event) => event.isStaff || event.isTestFc)) reason = "staff_test";
    else if (group.some((event) => BOT_PATTERN.test(event.userAgent ?? ""))) reason = "bot";
    else if (isRapidRepeat(group, rapidRepeatCount, rapidRepeatWindowMs)) reason = "rapid_repeat";
    else if (!group.some((event) => MEANINGFUL.has(event.type))) reason = "no_meaningful_interaction";
    if (reason) excluded.push({ fcId, reason });
    else validFcIds.push(fcId);
  }

  const reasonCounts = excluded.reduce<Partial<Record<InteractionExclusionReason, number>>>((counts, entry) => {
    counts[entry.reason] = (counts[entry.reason] ?? 0) + 1;
    return counts;
  }, {});
  return {
    validFcIds: validFcIds.sort(),
    excluded,
    validCount: validFcIds.length,
    excludedCount: excluded.length,
    reasonCounts,
    acceptedEventCount: uniqueEvents.length,
    duplicateEventCount: events.length - uniqueEvents.length,
  };
}
