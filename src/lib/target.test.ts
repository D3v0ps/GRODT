import { describe, expect, it } from "vitest";
import { isOffTarget, likelyStaffing, sniTargetState } from "./target";

const TARGET = ["78.100"];

describe("sniTargetState", () => {
  it("matchar oavsett punkt/format", () => {
    expect(sniTargetState("78.100", TARGET)).toBe("target");
    expect(sniTargetState("78100", TARGET)).toBe("target");
    expect(sniTargetState("78.100 – Arbetsförmedling", ["78100"])).toBe("target");
  });

  it("känd icke-målkod är 'off'", () => {
    expect(sniTargetState("78.200", TARGET)).toBe("off"); // personaluthyrning
    expect(sniTargetState("78.300", TARGET)).toBe("off");
    expect(sniTargetState("62.010", TARGET)).toBe("off");
  });

  it("saknad SNI är 'unknown' – göms aldrig på spekulation", () => {
    expect(sniTargetState(null, TARGET)).toBe("unknown");
    expect(sniTargetState("", TARGET)).toBe("unknown");
    expect(sniTargetState(undefined, TARGET)).toBe("unknown");
  });

  it("tom målbild ger unknown (inget att jämföra mot)", () => {
    expect(sniTargetState("78.200", [])).toBe("unknown");
  });

  it("stödjer flera målkoder", () => {
    expect(sniTargetState("78.200", ["78.100", "78.200"])).toBe("target");
    expect(sniTargetState("78.300", ["78.100", "78.200"])).toBe("off");
  });
});

describe("isOffTarget", () => {
  it("är true endast för känd icke-målkod", () => {
    expect(isOffTarget("78.200", TARGET)).toBe(true);
    expect(isOffTarget("78.100", TARGET)).toBe(false);
    expect(isOffTarget(null, TARGET)).toBe(false);
  });
});

describe("likelyStaffing", () => {
  it("flaggar bemannings-/uthyrningsbolag på namnet", () => {
    expect(likelyStaffing("Nordisk Bemanning AB")).toBe(true);
    expect(likelyStaffing("StaffPoint Staffing AB")).toBe(true);
    expect(likelyStaffing("Vikariepoolen i Väst AB")).toBe(true);
  });

  it("flaggar via beskrivningen även när namnet är neutralt", () => {
    expect(
      likelyStaffing("Talangbron AB", "Uthyrning av personal till industrin."),
    ).toBe(true);
  });

  it("ren rekrytering flaggas inte", () => {
    expect(likelyStaffing("Talangbron Rekrytering AB")).toBe(false);
    expect(likelyStaffing("Headhunters Sverige AB", "Search & selection.")).toBe(false);
    expect(likelyStaffing(null, null)).toBe(false);
  });
});
