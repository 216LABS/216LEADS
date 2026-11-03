import { describe, expect, it } from "vitest";
import { authErrorMessage, safeNext } from "./auth-links";

describe("safeNext (issue #70: the sign-in form followed any ?next=)", () => {
  it.each(["/onboarding", "/leads?status=new", "/invite/abc", "/"])("keeps the on-site path %s", (p) => {
    expect(safeNext(p, "/leads")).toBe(p);
  });

  it.each([null, "", "https://evil.example", "//evil.example", "/\\evil.example", "javascript:alert(1)", "leads", "/\tx"])(
    "falls back for %s",
    (p) => expect(safeNext(p, "/leads")).toBe("/leads"),
  );
});

describe("authErrorMessage", () => {
  it("explains a confirm link opened in another browser", () => {
    const msg = authErrorMessage("PKCE code verifier not found in storage. This can happen if the auth flow was initiated in a different browser or device, or if the storage was cleared.");
    expect(msg).toMatch(/same browser you signed up in/);
    expect(msg).not.toMatch(/PKCE|verifier/);
  });

  it("maps common errors to plain sentences", () => {
    expect(authErrorMessage("Email link is invalid or has expired")).toMatch(/expired or was already used/);
    expect(authErrorMessage("Invalid login credentials")).toMatch(/don't match/);
  });

  it("never shows unknown raw text, and stays empty without an error", () => {
    expect(authErrorMessage("AuthApiError: unexpected_failure 500 at /token")).toBe("We couldn't sign you in. Try again, or request a new link below.");
    expect(authErrorMessage(null)).toBeNull();
  });
});
