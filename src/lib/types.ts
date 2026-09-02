export type IcmsRate =
  | "17"
  | "18"
  | "19"
  | "19.5"
  | "20"
  | "20.5"
  | "22.5"
  | "23";

export type IcmsZone = IcmsRate;

export type Medicine = {
  id: string;
  name: string;
  activeIngredient: string;
  laboratory: string;
  kind: string;
  productType?: string;
  presentation: string;
  pmc: Partial<Record<IcmsZone, number | null>>;
  pf?: Partial<Record<IcmsZone, number | null>>;
  ggremCode?: string;
  registration?: string;
  commercialized?: boolean;
  ean1?: string;
  ean2?: string;
  ean3?: string;
  therapeuticClass?: string;
  tarja?: string;
  hospitalRestricted?: boolean;
  delistedAt?: string;
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
