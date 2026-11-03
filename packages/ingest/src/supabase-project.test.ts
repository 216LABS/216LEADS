import { describe, expect, it } from "vitest";
import { supabaseProjectMismatch } from "./supabase-project";

const REF = "sdkwahhpspiruknlnogk";
const OTHER = "abcdefghijklmnopqrst";
const pooler = (ref: string) => `postgresql://postgres.${ref}:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres`;

describe("supabaseProjectMismatch (issue #78)", () => {
  it("passes when both point at the same project", () => {
    expect(supabaseProjectMismatch(pooler(REF), `https://${REF}.supabase.co`)).toBeNull();
    expect(supabaseProjectMismatch(`postgresql://postgres:pw@db.${REF}.supabase.co:5432/postgres`, `https://${REF}.supabase.co`)).toBeNull();
  });

  it("passes for a fully local setup", () => {
    expect(supabaseProjectMismatch("postgresql://postgres:postgres@127.0.0.1:54322/postgres", "http://127.0.0.1:54321")).toBeNull();
  });

  it("stops a staging database paired with the local API", () => {
    expect(supabaseProjectMismatch(pooler(REF), "http://127.0.0.1:54321")).toMatch(/local stack/);
  });

  it("stops two different projects", () => {
    expect(supabaseProjectMismatch(pooler(REF), `https://${OTHER}.supabase.co`)).toMatch(new RegExp(`${REF}.*${OTHER}`));
  });

  it("says nothing when either side is missing", () => {
    expect(supabaseProjectMismatch(undefined, `https://${REF}.supabase.co`)).toBeNull();
    expect(supabaseProjectMismatch(pooler(REF), undefined)).toBeNull();
  });
});
