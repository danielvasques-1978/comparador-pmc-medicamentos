export type IcmsZone = "20" | "18" | "17" | "12";
export type IcmsRate =
  | "17"
  | "18"
  | "19"
  | "19.5"
  | "20"
  | "20.5"
  | "22.5"
  | "23";

export type Medicine = {
  id: string;
  name: string;
  activeIngredient: string;
  laboratory: string;
  kind: "Genérico" | "Similar" | "Referência";
  presentation: string;
  pmc: Record<IcmsZone, number>;
  sourcePage: number;
  source: string;
  tableDate: string;
};

export type UfCode =
  | "AC"
  | "AL"
  | "AP"
  | "AM"
  | "BA"
  | "CE"
  | "DF"
  | "ES"
  | "GO"
  | "MA"
  | "MT"
  | "MS"
  | "MG"
  | "PA"
  | "PB"
  | "PR"
  | "PE"
  | "PI"
  | "RJ"
  | "RN"
  | "RS"
  | "RO"
  | "RR"
  | "SC"
  | "SP"
  | "SE"
  | "TO";

export type UfIcmsMap = Record<UfCode, IcmsRate>;

export type FutureAuthProfile = {
  id: string;
  email: string;
  name?: string;
};
