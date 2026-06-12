import { describe, expect, it } from "vitest";
import { webhookText } from "./notify";

describe("webhookText", () => {
  it("firar vunna affärer men inga andra statusbyten", () => {
    expect(
      webhookText("status_andrad", { namn: "Talang AB", till: "kund" }, "Karim"),
    ).toBe("🎉 Karim vann affären Talang AB!");
    expect(
      webhookText("status_andrad", { namn: "Talang AB", till: "dialog" }, "Karim"),
    ).toBeNull();
  });

  it("tilldelning bara när någon faktiskt får leadet", () => {
    expect(
      webhookText("tilldelad", { namn: "Talang AB", ansvarig: "Sara" }, "Karim"),
    ).toBe("Karim tilldelade Talang AB till Sara");
    expect(webhookText("tilldelad", { namn: "Talang AB", ansvarig: "" }, "Karim")).toBeNull();
  });

  it("uppföljning bara när den läggs på någon annan", () => {
    expect(
      webhookText(
        "uppfoljning_satt",
        { namn: "Talang AB", datum: "2026-07-01", ansvarig: "Sara" },
        "Karim",
      ),
    ).toBe("Karim satte uppföljning 2026-07-01 på Talang AB → Sara");
    expect(
      webhookText("uppfoljning_satt", { namn: "Talang AB", datum: "2026-07-01" }, "Karim"),
    ).toBeNull();
  });

  it("överlämning, massutdelning och ringlista formuleras rätt", () => {
    expect(
      webhookText("kund_overlamnad", { namn: "Talang AB", controller: "Lisa" }, "Karim"),
    ).toBe("Karim lämnade över Talang AB till Lisa");
    expect(
      webhookText("massutdelning", { antal: 12, ansvarig: "Sara" }, "Karim"),
    ).toBe("Karim delade ut 12 leads till Sara");
    expect(
      webhookText("ringlista_skapad", { lista: "Norrland", antal: 40 }, "Karim"),
    ).toBe('Karim skapade ringlistan "Norrland" (40 bolag)');
  });

  it("tysta händelser ger null", () => {
    expect(webhookText("anteckning", { namn: "Talang AB" }, "Karim")).toBeNull();
    expect(webhookText("losenord_bytt", {}, "Karim")).toBeNull();
    expect(webhookText("massutdelning", { antal: 5, ansvarig: "" }, "Karim")).toBeNull();
  });
});
