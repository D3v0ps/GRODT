import { describe, expect, it } from "vitest";
import { mapAfLeverantor } from "./af-leverantorer";

const detalj = {
  id: 10072089,
  namn: "Trim tab AB",
  orgnr: "5591238844",
  kontaktperson_namn: "Tina Nilo",
  kontaktperson_telefon: "0103001430",
  kontaktperson_epost: "info@trim-tab.se",
  hemsida: "www.trim-tab.se",
  rating: "4",
  adresser: [
    { adressrad: "Västerbrogatan 8A", postnummer: "50330", postort: "Borås" },
  ],
};

describe("mapAfLeverantor", () => {
  it("mappar detaljsvaret och normaliserar orgnr + hemsida", () => {
    expect(mapAfLeverantor(detalj)).toEqual({
      orgnr: "559123-8844",
      namn: "Trim tab AB",
      ort: "Borås",
      adress: "Västerbrogatan 8A",
      hemsida: "https://www.trim-tab.se",
      telefon: "0103001430",
      epost: "info@trim-tab.se",
      kontaktNamn: "Tina Nilo",
      rating: 4,
    });
  });

  it("behåller befintligt protokoll på hemsidan", () => {
    expect(mapAfLeverantor({ ...detalj, hemsida: "https://exempel.se" })?.hemsida).toBe(
      "https://exempel.se",
    );
  });

  it("returnerar null utan giltigt orgnr eller namn", () => {
    expect(mapAfLeverantor({ ...detalj, orgnr: "123" })).toBeNull();
    expect(mapAfLeverantor({ ...detalj, orgnr: null })).toBeNull();
    expect(mapAfLeverantor({ ...detalj, namn: "  " })).toBeNull();
  });

  it("hanterar saknade fält och skräpbetyg", () => {
    const mapped = mapAfLeverantor({
      namn: "Matcharna AB",
      orgnr: "556016-0680",
      rating: "okänt",
      adresser: [],
    });
    expect(mapped).toEqual({
      orgnr: "556016-0680",
      namn: "Matcharna AB",
      ort: null,
      adress: null,
      hemsida: null,
      telefon: null,
      epost: null,
      kontaktNamn: null,
      rating: null,
    });
  });

  it("städar blanksteg i kontaktfälten", () => {
    const mapped = mapAfLeverantor({
      ...detalj,
      kontaktperson_namn: "  Tina   Nilo ",
      hemsida: "  ",
    });
    expect(mapped?.kontaktNamn).toBe("Tina Nilo");
    expect(mapped?.hemsida).toBeNull();
  });
});
