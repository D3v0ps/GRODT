import { describe, expect, it } from "vitest";
import { mapTicCompanyDetails, mapTicFinancials, toTicSniCode } from "./tic";

/** Fixtur som speglar LENS-API:ets svar (fält per docs.tic.io). */
const ticCompanyFixture = {
  companyId: 123456,
  mostRecentName: "Nordisk Bemanning AB",
  registrationNumber: "5567124830",
  registeredAddress: { street: "Vasagatan 11", postalCode: "111 20", city: "Stockholm" },
  visitingAddress: null,
  phoneNumber: { e164PhoneNumber: "+4681234567", phoneNumberFormatted: "08-123 45 67" },
  homepage: { hyperlink: "https://www.nordiskbemanning.se" },
  industryCodes: [{ industryCode: "78100" }],
  financialSummary: [
    {
      periodStart: "2023-01-01",
      periodEnd: "2023-12-31",
      rs_NetSalesK: 18400, // tkr!
      rs_OperatingProfitOrLossK: 1430,
      fn_NumberOfEmployees: 38,
    },
    {
      periodStart: "2024-01-01",
      periodEnd: "2024-12-31",
      rs_NetSalesK: 21250,
      rs_OperatingProfitOrLossK: -120, // förlustår
      fn_NumberOfEmployees: 42,
    },
  ],
};

describe("tic.io-fältmappning", () => {
  it("mappar bolagsdetaljer och normaliserar orgnr till XXXXXX-XXXX", () => {
    const details = mapTicCompanyDetails(ticCompanyFixture);
    expect(details).toEqual({
      orgnr: "556712-4830",
      namn: "Nordisk Bemanning AB",
      ort: "Stockholm",
      sniKod: "78.100",
      adress: "Vasagatan 11",
      antalAnstallda: 42, // från senaste bokslutet
      hemsida: "https://www.nordiskbemanning.se",
      telefon: "08-123 45 67",
    });
  });

  it("hanterar 12-siffriga orgnr med sekelprefix", () => {
    const details = mapTicCompanyDetails({
      ...ticCompanyFixture,
      registrationNumber: "165567124830",
    });
    expect(details.orgnr).toBe("556712-4830");
  });

  it("konverterar bokslut från tkr till SEK-heltal", () => {
    const financials = mapTicFinancials(ticCompanyFixture.financialSummary);
    expect(financials).toEqual([
      { year: 2023, revenueSek: 18_400_000, profitSek: 1_430_000, employees: 38 },
      { year: 2024, revenueSek: 21_250_000, profitSek: -120_000, employees: 42 },
    ]);
  });

  it("tar senaste perioden när två bokslut slutar samma år (brutet räkenskapsår)", () => {
    const financials = mapTicFinancials([
      { periodEnd: "2023-04-30", rs_NetSalesK: 1000, rs_OperatingProfitOrLossK: 10, fn_NumberOfEmployees: 5 },
      { periodEnd: "2023-12-31", rs_NetSalesK: 2000, rs_OperatingProfitOrLossK: 20, fn_NumberOfEmployees: 6 },
    ]);
    expect(financials).toEqual([
      { year: 2023, revenueSek: 2_000_000, profitSek: 20_000, employees: 6 },
    ]);
  });

  it("hanterar saknade belopp som null", () => {
    const financials = mapTicFinancials([
      { periodEnd: "2022-12-31", rs_NetSalesK: null, rs_OperatingProfitOrLossK: null, fn_NumberOfEmployees: null },
    ]);
    expect(financials).toEqual([
      { year: 2022, revenueSek: null, profitSek: null, employees: null },
    ]);
  });

  it("kastar tydligt fel vid ogiltigt orgnr", () => {
    expect(() =>
      mapTicCompanyDetails({ ...ticCompanyFixture, registrationNumber: "123" }),
    ).toThrowError(/organisationsnummer/i);
  });

  it("översätter SNI-koder till tic-format utan punkt", () => {
    expect(toTicSniCode("78.100")).toBe("78100");
    expect(toTicSniCode("78100")).toBe("78100");
  });
});
