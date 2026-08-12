import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(new URL("../../supabase/migrations/20260811071323_customer_intelligence_recommendations_segments.sql", import.meta.url), "utf8");

describe("customer intelligence persistence migration", () => {
  it("creates every durable P0 object", () => {
    for (const table of [
      "fc_intelligence_recommendation",
      "fc_intelligence_recommendation_version",
      "fc_intelligence_recommendation_decision",
      "fc_segment",
      "fc_segment_version",
      "fc_segment_lineage",
      "fc_segment_member",
      "fc_segment_member_event",
      "fc_segment_activation",
    ]) {
      expect(migration).toContain(`create table public.${table}`);
      expect(migration).toContain(`alter table public.${table} enable row level security`);
    }
  });

  it("keeps browser roles out and grants only the service role", () => {
    expect(migration).toContain("from public, anon, authenticated");
    expect(migration).toContain("to service_role");
    expect(migration).not.toMatch(/create policy/i);
  });

  it("versions recommendations, segments and activation snapshots", () => {
    expect(migration).toContain("unique (recommendation_id, version)");
    expect(migration).toContain("unique (segment_id, version)");
    expect(migration).toContain("member_snapshot jsonb not null");
    expect(migration).toContain("source_recommendation_version_id uuid");
  });
});
