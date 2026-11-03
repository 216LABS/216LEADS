import { describe, expect, it } from "vitest";
import { cronText, etDateTime } from "./dates";

describe("cronText (issue #70: the data page showed raw cron)", () => {
  it.each([
    ["0 5 * * *", "Daily at 5:00 AM ET"],
    ["15 5 * * *", "Daily at 5:15 AM ET"],
    ["0 5 * * 1", "Weekly on Monday at 5:00 AM ET"],
    ["0 3 * * 0", "Weekly on Sunday at 3:00 AM ET"],
    ["0 1 1 * *", "Monthly on the 1st at 1:00 AM ET"],
    ["30 3 2,5,10 * *", "Monthly on the 2nd, 5th and 10th at 3:30 AM ET"],
    ["0 2 2 1 *", "Yearly on Jan 2 at 2:00 AM ET"],
    ["0 13 * * *", "Daily at 1:00 PM ET"],
    ["@once", "One-time load"],
    ["manual", "When new records arrive"],
  ])("%s -> %s", (cron, text) => expect(cronText(cron)).toBe(text));

  it("leaves shapes it doesn't know as they are", () => {
    expect(cronText("*/5 * * * *")).toBe("*/5 * * * *");
  });
});

describe("etDateTime", () => {
  it("shows a UTC timestamp in Eastern time, labeled", () => {
    expect(etDateTime("2026-11-03T03:40:10.323Z")).toBe("Nov 2, 2026, 10:40 PM ET");
    expect(etDateTime("2026-07-01T12:00:00Z")).toBe("Jul 1, 2026, 8:00 AM ET");
  });
});
