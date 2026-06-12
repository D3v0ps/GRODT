import { describe, expect, it } from "vitest";
import { namesRoughlyMatch, pickPlaceMatch } from "./google-places";

describe("Google Places – namnmatchningsvakt", () => {
  it("matchar samma bolag trots bolagsform och ordföljd", () => {
    expect(namesRoughlyMatch("AB Effektiv Göteborg", "Effektiv Göteborg")).toBe(true);
    expect(namesRoughlyMatch("Nordisk Bemanning AB", "Nordisk Bemanning")).toBe(true);
    expect(namesRoughlyMatch("Talangpartner Sverige AB", "Talangpartner Sverige AB")).toBe(true);
  });

  it("avvisar andra bolag med liknande men inte samma namn", () => {
    expect(namesRoughlyMatch("A Hub AB", "Hubbster Group AB")).toBe(false);
    expect(namesRoughlyMatch("Nordisk Bemanning AB", "Nordisk Städservice AB")).toBe(false);
  });

  it("tillåter ett saknat ord i långa namn (kedjenamn med ortssuffix)", () => {
    expect(
      namesRoughlyMatch("Rekryteringsgruppen i Malmö AB", "Rekryteringsgruppen Malmö"),
    ).toBe(true);
  });
});

describe("Google Places – kandidatval", () => {
  const response = {
    places: [
      {
        displayName: { text: "Fel Bolag i Stan AB" },
        nationalPhoneNumber: "08-000 00 00",
      },
      {
        displayName: { text: "Nordisk Bemanning" },
        nationalPhoneNumber: "08-123 45 67",
        websiteUri: "https://www.nordiskbemanning.se/",
      },
    ],
  };

  it("hoppar över kandidater som inte klarar namnvakten", () => {
    const match = pickPlaceMatch(response, "Nordisk Bemanning AB");
    expect(match).toEqual({
      matchedName: "Nordisk Bemanning",
      telefon: "08-123 45 67",
      hemsida: "https://www.nordiskbemanning.se/",
    });
  });

  it("returnerar null när ingen kandidat matchar eller har kontaktdata", () => {
    expect(pickPlaceMatch(response, "Helt Annat Bolag AB")).toBeNull();
    expect(
      pickPlaceMatch(
        { places: [{ displayName: { text: "Nordisk Bemanning" } }] },
        "Nordisk Bemanning AB",
      ),
    ).toBeNull();
  });
});
