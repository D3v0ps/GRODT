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
  verksamhetsbeskrivning: { beskrivning: "Rekrytering och uthyrning av personal." },
  organisationsdatum: { registreringsdatum: "2010-03-15" },
  organisationsform: { kod: "AB", klartext: "Aktiebolag" },
  reklamsparr: null,
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
      verksamhetsbeskrivning: "Rekrytering och uthyrning av personal.",
      registreringsdatum: "2010-03-15",
      bolagsform: "Aktiebolag",
      avregistreradDatum: null,
      reklamsparr: false,
    });
  });

  it("normaliserar orter i versaler till normal skiftning", () => {
    const details = mapBolagsverketOrganisation({
      ...organisation,
      postadressOrganisation: {
        postadress: { utdelningsadress: "Industrigatan 4", postort: "HISINGS BACKA" },
      },
    });
    expect(details.ort).toBe("Hisings Backa");
  });

  it("mappar avregistrering och reklamspärr", () => {
    const details = mapBolagsverketOrganisation({
      ...organisation,
      avregistreradOrganisation: { avregistreringsdatum: "2023-05-05T00:00:00.000+00:00" },
      reklamsparr: { kod: "JA" },
    });
    expect(details.avregistreradDatum).toBe("2023-05-05");
    expect(details.reklamsparr).toBe(true);
  });

  it("hanterar saknade fält utan att krascha", () => {
    const details = mapBolagsverketOrganisation({
      organisationsidentitet: { identitetsbeteckning: "5560160680" },
    });
    expect(details.orgnr).toBe("556016-0680");
    expect(details.namn).toBe("Okänt bolagsnamn");
    expect(details.ort).toBeNull();
    expect(details.sniKod).toBeNull();
    expect(details.avregistreradDatum).toBeNull();
    expect(details.reklamsparr).toBe(false);
  });

  it("kastar tydligt fel vid ogiltigt orgnr", () => {
    expect(() =>
      mapBolagsverketOrganisation({ organisationsidentitet: { identitetsbeteckning: "123" } }),
    ).toThrowError(/organisationsnummer/i);
  });
});
