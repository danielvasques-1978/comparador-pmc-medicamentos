import type { IcmsRate, IcmsZone, UfCode, UfIcmsMap } from "./types";

export const ufCodes: UfCode[] = [
  "AC",
  "AL",
  "AP",
  "AM",
  "BA",
  "CE",
  "DF",
  "ES",
  "GO",
  "MA",
  "MT",
  "MS",
  "MG",
  "PA",
  "PB",
  "PR",
  "PE",
  "PI",
  "RJ",
  "RN",
  "RS",
  "RO",
  "RR",
  "SC",
  "SP",
  "SE",
  "TO",
];

export const icmsRates: IcmsRate[] = ["17", "18", "19", "19.5", "20", "20.5", "22.5", "23"];
export const icmsZones: IcmsZone[] = icmsRates;

export const defaultUfIcmsMap: UfIcmsMap = {
  AC: "19",
  AL: "19",
  AP: "18",
  AM: "20",
  BA: "20.5",
  CE: "20",
  DF: "20",
  ES: "17",
  GO: "19",
  MA: "23",
  MT: "17",
  MS: "17",
  MG: "18",
  PA: "19",
  PB: "20",
  PR: "19.5",
  PE: "20.5",
  PI: "22.5",
  RJ: "20",
  RN: "20",
  RS: "17",
  RO: "19.5",
  RR: "20",
  SC: "17",
  SP: "18",
  SE: "19",
  TO: "20",
};

export function isIcmsZone(value: string): value is IcmsZone {
  return icmsZones.includes(value as IcmsZone);
}

export function isIcmsRate(value: string): value is IcmsRate {
  return icmsRates.includes(value as IcmsRate);
}

export function resolvePricingZone(rate: IcmsRate): IcmsZone {
  return rate;
}
