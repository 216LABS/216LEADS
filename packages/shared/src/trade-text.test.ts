import { describe, expect, it } from "vitest";
import { runningText, TRADES, tradeWord, withArticle } from "./constants";

describe("trade text (issue #70: \"need a hvac business\")", () => {
  it("keeps acronyms and lower-cases words", () => {
    expect(tradeWord("hvac")).toBe("HVAC");
    expect(tradeWord("electrical")).toBe("electrical");
    expect(tradeWord("lawn_care")).toBe("lawn care");
  });

  it("picks the article by sound", () => {
    expect(withArticle(tradeWord("hvac"))).toBe("an HVAC");
    expect(withArticle(tradeWord("electrical"))).toBe("an electrical");
    expect(withArticle(tradeWord("roofing"))).toBe("a roofing");
    expect(withArticle(tradeWord("plumbing"))).toBe("a plumbing");
  });

  it("gives every trade a lower-case word or an acronym", () => {
    for (const t of TRADES) expect(tradeWord(t.key)).toMatch(/^([a-z ]+|[A-Z]{2,})$/);
  });
});

describe("runningText in a phrase", () => {
  it("lowers words but keeps acronyms", () => {
    expect(runningText("Age of last HVAC work")).toBe("age of last HVAC work");
    expect(runningText("HVAC")).toBe("HVAC");
    expect(runningText("Lawn care")).toBe("lawn care");
  });
});
