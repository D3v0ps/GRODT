import { describe, expect, it } from "vitest";
import { mapBolagsverketOrganisation } from "./bolagsverket";

/** Fixtur enligt Bolagsverkets publicerade OpenAPI-exempel. */
const organisation = {
  organisationsidentitet: {
    identitetsbeteckning: "5567124830",
    typ: { kod: "ORGNR", klartext: "Organisationsnummer" },
  },
  namnskyddslopnummer: 1,
  organisationsnamn: {
    organisationsnamnLista: [
      {
        namn: "Nordisk Bemanning AB",
        organisationsnamntyp: { kod: "FNAMN", klartext: "Företagsnamn" },
        registreringsdatum: "2010-03-15",
      },
    ],
  },
  postadressOrganisation: {
    postadress: {
      utdelningsadress: "Vasagatan 11",
      postnummer: "11120",
      postort: "Stockholm",
      land: "Sverige",
    },
  },
  naringsgrenOrganisation: {
    sni: [{ kod: "78100", klartext: "Arbetsförmedling och rekrytering" }],
  },
  verksamOrganisation: { kod: "JA" },
};

describe("Bolagsverket-fältmappning", () => {
  it("mappar organisation till bolagsfält och normaliserar orgnr/SNI", () => {
    const details = mapBolagsverketOrganisation(organisation);
    expect(details).toEqual({
      orgnr: "556712-4830",
      namn: "Nordisk Bemanning AB",
      ort: "Stockholm",
      sniKod: "78.100",
      adress: "Vasagatan 11",
      antalAnstallda: null, // finns inte i API:et – berikningen rör inte fältet
      hemsida: null,
      telefon: null,
    });
  });

  it("hanterar saknade fält utan att krascha", () => {
    const details = mapBolagsverketOrganisation({
      organisationsidentitet: { identitetsbeteckning: "5560160680" },
    });
    expect(details.orgnr).toBe("556016-0680");
    expect(details.namn).toBe("Okänt bolagsnamn");
    expect(details.ort).toBeNull();
    expect(details.sniKod).toBeNull();
  });

  it("kastar tydligt fel vid ogiltigt orgnr", () => {
    expect(() =>
      mapBolagsverketOrganisation({ organisationsidentitet: { identitetsbeteckning: "123" } }),
    ).toThrowError(/organisationsnummer/i);
  });
});
