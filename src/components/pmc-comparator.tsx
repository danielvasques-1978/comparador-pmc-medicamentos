"use client";

import {
  ArrowDownUp,
  CreditCard,
  Download,
  Heart,
  Landmark,
  LogOut,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Star,
  UserRound,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import criticalMedicines from "@/data/critical-medicines.json";
import { defaultUfIcmsMap, icmsRates, isIcmsRate, resolvePricingZone, ufCodes } from "@/lib/icms";
import type { IcmsRate, Medicine, UfCode, UfIcmsMap } from "@/lib/types";

type SortMode = "group-lab" | "price-asc" | "price-desc" | "name";
type AuthPayload = {
  user?: {
    email: string;
    planStatus?: string;
    subscriptionCurrentPeriodEnd?: string | null;
  } | null;
};

const currency = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});
const billingRequired = process.env.NEXT_PUBLIC_BILLING_REQUIRED === "true";

function formatRate(rate: string) {
  return `${rate.replace(".", ",")}%`;
}

const storageKeys = {
  clientKey: "comparador-pmc:client-key",
  profileEmail: "comparador-pmc:profile-email",
  favorites: "comparador-pmc:favorites",
  ufMap: "comparador-pmc:uf-map",
  recentSearches: "comparador-pmc:recent-searches",
};

const strictSearchTokens = new Set(
  criticalMedicines.flatMap((item) => [item.query, ...item.allowed].flatMap((value) => textTokens(value))),
);

function matchingCriticalSearch(search: string) {
  return criticalMedicines.find((item) => tokensMatchText(search, item.query));
}

function normalize(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function textTokens(value: string) {
  return normalize(value)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function tokenMatchesText(queryToken: string, textToken: string) {
  if (strictSearchTokens.has(queryToken)) return textToken === queryToken;
  return textToken.startsWith(queryToken);
}

function tokensMatchText(search: string, text: string) {
  const searchTokens = queryTokens(search);
  if (searchTokens.length === 0) return false;
  const searchableTokens = textTokens(text);
  return searchTokens.every((queryToken) =>
    searchableTokens.some((textToken) => tokenMatchesText(queryToken, textToken)),
  );
}

function matchesSearch(item: Medicine, search: string) {
  if (!search) return true;
  return tokensMatchText(search, `${item.name} ${item.activeIngredient}`);
}

function matchesDirectSearch(item: Medicine, search: string) {
  if (!search) return false;
  return tokensMatchText(search, `${item.name} ${item.activeIngredient}`);
}

function ingredientTokens(item: Medicine) {
  const labTokens = new Set(normalize(item.laboratory).split(/\s+/));
  const ignored = new Set([
    "acido",
    "clor",
    "clorid",
    "cloridrato",
    "cloreto",
    "carbonato",
    "de",
    "di",
    "do",
    "da",
    "e",
    "gen",
    "generico",
    "generica",
    "monoidratada",
    "monoidratado",
    "sodica",
    "sodico",
  ]);

  return normalize(item.activeIngredient)
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 4 && !ignored.has(token) && !labTokens.has(token));
}

function queryTokens(search: string) {
  return search
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((token) => token.length >= 3);
}

function tokenMatchesQuery(token: string, tokens: string[]) {
  return tokens.some((queryToken) => {
    if (strictSearchTokens.has(queryToken)) return token === queryToken;
    return token.startsWith(queryToken);
  });
}

function matchesRelatedIngredient(item: Medicine, relatedTokens: Set<string>) {
  if (relatedTokens.size === 0) return false;
  return ingredientTokens(item).some((token) => relatedTokens.has(token));
}

function inferForm(presentation: string) {
  const text = normalize(presentation);
  if (text.includes("comp")) return "Comprimido";
  if (text.includes("caps")) return "Cápsula";
  if (text.includes("xpe") || text.includes("susp")) return "Xarope/suspensão";
  if (text.includes("inj") || text.includes("amp") || text.includes("fa ")) return "Injetável";
  if (text.includes("creme") || text.includes("gel") || text.includes("pom")) return "Tópico";
  if (text.includes("sol") || text.includes("got")) return "Solução/gotas";
  return "Outras";
}

function readJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function getClientKey() {
  const existing = window.localStorage.getItem(storageKeys.clientKey);
  if (existing) return existing;
  const next = window.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  window.localStorage.setItem(storageKeys.clientKey, next);
  return next;
}

function readUfIcmsMap() {
  const stored = readJson<Partial<Record<UfCode, string>>>(storageKeys.ufMap, defaultUfIcmsMap);
  return ufCodes.reduce((map, code) => {
    const value = stored[code];
    map[code] = value && isIcmsRate(value) ? value : defaultUfIcmsMap[code];
    return map;
  }, {} as UfIcmsMap);
}

export function PmcComparator({ medicines }: { medicines: Medicine[] }) {
  const [query, setQuery] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
  const [uf, setUf] = useState<UfCode>("SP");
  const [kind, setKind] = useState("Todos");
  const [lab, setLab] = useState("Todos");
  const [form, setForm] = useState("Todas");
  const [sortMode, setSortMode] = useState<SortMode>("group-lab");
  const [maxPrice, setMaxPrice] = useState("");
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [ufMap, setUfMap] = useState<UfIcmsMap>(defaultUfIcmsMap);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [planStatus, setPlanStatus] = useState("free");
  const [subscriptionCurrentPeriodEnd, setSubscriptionCurrentPeriodEnd] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState("");

  useEffect(() => {
    setFavorites(readJson<string[]>(storageKeys.favorites, []));
    const sanitizedUfMap = readUfIcmsMap();
    setUfMap(sanitizedUfMap);
    writeJson(storageKeys.ufMap, sanitizedUfMap);
    setRecentSearches(readJson<string[]>(storageKeys.recentSearches, []));
    const savedEmail = window.localStorage.getItem(storageKeys.profileEmail);
    setUserEmail(savedEmail);
    void fetch("/api/auth/me")
      .then((response) => response.json())
      .then((data: AuthPayload) => {
        if (data.user?.email) {
          window.localStorage.setItem(storageKeys.profileEmail, data.user.email);
          setUserEmail(data.user.email);
          setEmail(data.user.email);
          setPlanStatus(data.user.planStatus ?? "free");
          setSubscriptionCurrentPeriodEnd(data.user.subscriptionCurrentPeriodEnd ?? null);
        }
      })
      .catch(() => undefined);
    const billingResult = new URLSearchParams(window.location.search).get("billing");
    if (billingResult === "success") {
      setAuthMessage("Pagamento recebido. A assinatura será liberada assim que o Stripe confirmar.");
      void refreshAccount();
      window.history.replaceState({}, "", window.location.pathname);
    }
    if (billingResult === "cancelled") {
      setAuthMessage("Assinatura cancelada antes do pagamento.");
      window.history.replaceState({}, "", window.location.pathname);
    }
    void syncFromNeon();
  }, []);

  const selectedRate = ufMap[uf] ?? defaultUfIcmsMap[uf];
  const selectedZone = resolvePricingZone(selectedRate);
  const usesExactIcmsColumn = selectedRate === selectedZone;
  const tableDate = medicines[0]?.tableDate ?? "Não informada";
  const activeQuery = query.trim();
  const hasSearch = normalize(activeQuery).length >= 2;
  const hasPaidAccess = !billingRequired || planStatus === "active" || planStatus === "trialing";

  const relatedIngredientTokens = useMemo(() => {
    const search = normalize(activeQuery);
    if (!search) return new Set<string>();

    const matchingTokens = new Set<string>();
    const fallbackTokens = new Set<string>();
    const searchTokens = queryTokens(search);
    const criticalSearch = matchingCriticalSearch(search);
    criticalSearch?.allowed.forEach((value) => {
      textTokens(value).forEach((token) => matchingTokens.add(token));
    });
    medicines.forEach((item) => {
      if (!matchesDirectSearch(item, search)) return;
      const itemTokens = ingredientTokens(item);
      const matchingIngredientTokens = itemTokens.filter((token) => tokenMatchesQuery(token, searchTokens));
      matchingIngredientTokens.forEach((token) => matchingTokens.add(token));
      itemTokens.forEach((token) => fallbackTokens.add(token));
    });
    return matchingTokens.size > 0 ? matchingTokens : fallbackTokens;
  }, [activeQuery, medicines]);

  const formOptions = useMemo(() => {
    const forms = new Set<string>();
    medicines.forEach((item) => forms.add(inferForm(item.presentation)));
    return ["Todas", ...Array.from(forms).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [medicines]);

  const labOptions = useMemo(() => {
    const search = normalize(activeQuery);
    const labs = new Set<string>();
    medicines.forEach((item) => {
      if (!search && !onlyFavorites) return;
      if (!matchesSearch(item, search) && !matchesRelatedIngredient(item, relatedIngredientTokens)) return;
      if (kind !== "Todos" && item.kind !== kind) return;
      if (form !== "Todas" && inferForm(item.presentation) !== form) return;
      labs.add(item.laboratory);
    });
    return ["Todos", ...Array.from(labs).sort((a, b) => a.localeCompare(b, "pt-BR"))];
  }, [activeQuery, form, kind, medicines, onlyFavorites, relatedIngredientTokens]);

  useEffect(() => {
    if (!labOptions.includes(lab)) setLab("Todos");
  }, [lab, labOptions]);

  const filtered = useMemo(() => {
    const search = normalize(activeQuery);
    const favoriteSet = new Set(favorites);
    const max = maxPrice ? Number(maxPrice.replace(",", ".")) : null;
    if (!hasPaidAccess) return [];

    const rows = medicines.filter((item) => {
      if (!search && !onlyFavorites) return false;
      if (onlyFavorites && !favoriteSet.has(item.id)) return false;
      if (kind !== "Todos" && item.kind !== kind) return false;
      if (lab !== "Todos" && item.laboratory !== lab) return false;
      if (form !== "Todas" && inferForm(item.presentation) !== form) return false;
      const price = item.pmc[selectedZone] ?? 0;
      if (max !== null && Number.isFinite(max) && price > max) return false;
      return matchesSearch(item, search) || matchesRelatedIngredient(item, relatedIngredientTokens);
    });

    rows.sort((a, b) => {
      if (sortMode === "name") return a.name.localeCompare(b.name, "pt-BR");
      const priceA = a.pmc[selectedZone] ?? Number.POSITIVE_INFINITY;
      const priceB = b.pmc[selectedZone] ?? Number.POSITIVE_INFINITY;
      if (sortMode === "group-lab") {
        return (
          a.laboratory.localeCompare(b.laboratory, "pt-BR") ||
          a.name.localeCompare(b.name, "pt-BR") ||
          priceA - priceB
        );
      }
      return sortMode === "price-asc" ? priceA - priceB : priceB - priceA;
    });

    return rows;
  }, [activeQuery, favorites, form, hasPaidAccess, kind, lab, maxPrice, medicines, onlyFavorites, relatedIngredientTokens, selectedZone, sortMode]);

  const visibleRows = filtered.slice(0, 250);

  async function syncFromNeon() {
    const clientKey = getClientKey();
    const queryString = new URLSearchParams({ clientKey }).toString();

    try {
      const [favoritesResponse, settingsResponse, historyResponse] = await Promise.all([
        fetch(`/api/profile/favorites?${queryString}`),
        fetch(`/api/profile/settings?${queryString}`),
        fetch(`/api/profile/history?${queryString}`),
      ]);

      if (favoritesResponse.ok) {
        const data = (await favoritesResponse.json()) as { favorites?: string[] };
        if (data.favorites) {
          setFavorites(data.favorites);
          writeJson(storageKeys.favorites, data.favorites);
        }
      }

      if (settingsResponse.ok) {
        const data = (await settingsResponse.json()) as { settings?: Partial<Record<UfCode, string>> | null };
        if (data.settings && typeof data.settings === "object") {
          const nextUfMap = ufCodes.reduce((map, code) => {
            const value = data.settings?.[code];
            map[code] = value && isIcmsRate(value) ? value : defaultUfIcmsMap[code];
            return map;
          }, {} as UfIcmsMap);
          setUfMap(nextUfMap);
          writeJson(storageKeys.ufMap, nextUfMap);
        }
      }

      if (historyResponse.ok) {
        const data = (await historyResponse.json()) as { history?: string[] };
        if (data.history) {
          const nextSearches = Array.from(new Set(data.history)).slice(0, 6);
          setRecentSearches(nextSearches);
          writeJson(storageKeys.recentSearches, nextSearches);
        }
      }
    } catch {
      // Local storage remains the fallback when the database is not configured.
    }
  }

  async function saveFavorite(id: string, favorite: boolean) {
    try {
      await fetch("/api/profile/favorites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: getClientKey(), medicineId: id, favorite }),
      });
    } catch {
      // Favorite was already saved locally.
    }
  }

  async function saveSearchHistory(searchQuery: string, resultCount: number) {
    try {
      await fetch("/api/profile/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: getClientKey(), query: searchQuery, uf, icmsRate: selectedRate, resultCount }),
      });
    } catch {
      // Search history was already saved locally.
    }
  }

  async function saveSettings(nextUfMap: UfIcmsMap) {
    try {
      await fetch("/api/profile/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ clientKey: getClientKey(), ufIcmsMap: nextUfMap }),
      });
    } catch {
      // Settings were already saved locally.
    }
  }

  function toggleFavorite(id: string) {
    const nextState = !favorites.includes(id);
    const next = favorites.includes(id)
      ? favorites.filter((item) => item !== id)
      : [...favorites, id];
    setFavorites(next);
    writeJson(storageKeys.favorites, next);
    void saveFavorite(id, nextState);
  }

  function updateRate(nextUf: UfCode, nextRate: IcmsRate) {
    const next = { ...ufMap, [nextUf]: nextRate };
    setUfMap(next);
    writeJson(storageKeys.ufMap, next);
    void saveSettings(next);
  }

  function clearFilters() {
    setQuery("");
    setKind("Todos");
    setLab("Todos");
    setForm("Todas");
    setMaxPrice("");
    setOnlyFavorites(false);
    setSortMode("group-lab");
  }

  function submitSearch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed) return;
    const next = [trimmed, ...recentSearches.filter((item) => item !== trimmed)].slice(0, 6);
    setRecentSearches(next);
    writeJson(storageKeys.recentSearches, next);
    void saveSearchHistory(trimmed, filtered.length);
  }

  async function submitAuth(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedEmail = email.trim();
    try {
      const response = await fetch(authMode === "login" ? "/api/auth/login" : "/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          password,
          acceptedPrivacy,
        }),
      });
      const data = (await response.json()) as AuthPayload & { error?: string };
      if (!response.ok || !data.user) {
        throw new Error(data.error ?? "auth");
      }
      window.localStorage.setItem(storageKeys.profileEmail, data.user.email);
      setUserEmail(data.user.email);
      setPlanStatus(data.user.planStatus ?? "free");
      setSubscriptionCurrentPeriodEnd(data.user.subscriptionCurrentPeriodEnd ?? null);
      setAuthMessage(authMode === "login" ? "Login realizado." : "Conta criada.");
      setPassword("");
      void syncFromNeon();
    } catch {
      setAuthMessage("Não foi possível autenticar. Confira e-mail, senha e aceite de privacidade.");
    }
  }

  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => undefined);
    window.localStorage.removeItem(storageKeys.profileEmail);
    setUserEmail(null);
    setEmail("");
    setPlanStatus("free");
    setSubscriptionCurrentPeriodEnd(null);
    setPassword("");
    void syncFromNeon();
  }

  async function deleteAccount() {
    if (!window.confirm("Excluir sua conta, favoritos e histórico salvos?")) return;
    const response = await fetch("/api/account/delete", { method: "POST" });
    if (response.ok) {
      window.localStorage.removeItem(storageKeys.profileEmail);
      setUserEmail(null);
      setEmail("");
      setPlanStatus("free");
      setSubscriptionCurrentPeriodEnd(null);
      setFavorites([]);
      setRecentSearches([]);
      writeJson(storageKeys.favorites, []);
      writeJson(storageKeys.recentSearches, []);
      setAuthMessage("Conta excluída.");
    } else {
      setAuthMessage("Não foi possível excluir a conta agora.");
    }
  }

  async function refreshAccount() {
    const response = await fetch("/api/auth/me");
    const data = (await response.json()) as AuthPayload;
    if (data.user?.email) {
      setUserEmail(data.user.email);
      setPlanStatus(data.user.planStatus ?? "free");
      setSubscriptionCurrentPeriodEnd(data.user.subscriptionCurrentPeriodEnd ?? null);
    }
  }

  async function openBilling(endpoint: "/api/billing/checkout" | "/api/billing/portal") {
    try {
      const response = await fetch(endpoint, { method: "POST" });
      const data = (await response.json()) as { url?: string; error?: string };
      if (!response.ok || !data.url) {
        throw new Error(data.error ?? "billing");
      }
      window.location.assign(data.url);
    } catch {
      setAuthMessage("Cobrança ainda não configurada. Configure Stripe para ativar assinaturas.");
    }
  }

  function planLabel() {
    if (planStatus === "active") return "Plano ativo";
    if (planStatus === "trialing") return "Teste ativo";
    if (planStatus === "past_due") return "Pagamento pendente";
    if (planStatus === "canceled") return "Assinatura cancelada";
    return "Plano gratuito";
  }

  function exportCsv() {
    const header = [
      "Medicamento",
      "Principio ativo",
      "Laboratorio",
      "Tipo",
      "Apresentacao",
      "UF",
      "ICMS UF",
      "Coluna PMC",
      "PMC",
    ];
    const lines = visibleRows.map((item) =>
      [
        item.name,
        item.activeIngredient,
        item.laboratory,
        item.kind,
        item.presentation,
        uf,
        formatRate(selectedRate),
        formatRate(selectedZone),
        String(item.pmc[selectedZone] ?? ""),
      ]
        .map((value) => `"${String(value).replaceAll('"', '""')}"`)
        .join(";"),
    );
    const blob = new Blob([[header.join(";"), ...lines].join("\n")], {
      type: "text/csv;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `comparador-pmc-${uf}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="topbar">
        <div>
          <p className="eyebrow">Tabela importada: {tableDate}</p>
          <h1>Comparador PMC Medicamentos</h1>
        </div>
        <div className="top-actions">
          <a className="ghost-button" href="/admin" title="Revisar base">
            <ShieldCheck size={18} />
            <span>Revisão</span>
          </a>
          {userEmail ? (
            <button className="ghost-button" type="button" onClick={signOut} title="Sair">
              <LogOut size={18} />
              <span>{userEmail}</span>
            </button>
          ) : (
            <button className="ghost-button" type="button" onClick={() => setShowLogin(true)} title="Entrar">
              <UserRound size={18} />
              <span>Entrar</span>
            </button>
          )}
          <button className="icon-button" type="button" onClick={() => setShowSettings(true)} title="Configurar ICMS">
            <Settings size={20} />
          </button>
        </div>
      </section>

      <section className="control-panel">
        <form className="search-row" onSubmit={submitSearch}>
          <label className="search-box">
            <Search size={20} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar por medicamento, princípio ativo, laboratório ou apresentação"
            />
          </label>
          <label className="select-field compact-select">
            <span>UF</span>
            <select value={uf} onChange={(event) => setUf(event.target.value as UfCode)}>
              {ufCodes.map((code) => (
                <option key={code} value={code}>
                  {code}
                </option>
              ))}
            </select>
          </label>
          <button className="primary-button" type="submit">
            <Search size={18} />
            <span>Buscar</span>
          </button>
        </form>

        {recentSearches.length > 0 ? (
          <div className="recent-row">
            {recentSearches.map((item) => (
              <button key={item} type="button" onClick={() => setQuery(item)}>
                {item}
              </button>
            ))}
          </div>
        ) : null}

        <div className="filter-grid">
          <label className="select-field">
            <span>Tipo</span>
            <select value={kind} onChange={(event) => setKind(event.target.value)}>
              <option>Todos</option>
              <option>Genérico</option>
              <option>Similar</option>
              <option>Referência</option>
            </select>
          </label>
          <label className="select-field">
            <span>Laboratório</span>
            <select value={lab} onChange={(event) => setLab(event.target.value)}>
              {labOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <label className="select-field">
            <span>Forma</span>
            <select value={form} onChange={(event) => setForm(event.target.value)}>
              {formOptions.map((item) => (
                <option key={item}>{item}</option>
              ))}
            </select>
          </label>
          <div className="price-range">
            <label className="select-field">
              <span>PMC máx.</span>
              <input
                inputMode="decimal"
                min="0"
                placeholder="999,99"
                type="number"
                value={maxPrice}
                onChange={(event) => setMaxPrice(event.target.value)}
              />
            </label>
          </div>
          <label className="select-field">
            <span>Ordenar</span>
            <select value={sortMode} onChange={(event) => setSortMode(event.target.value as SortMode)}>
              <option value="group-lab">Laboratório e nome</option>
              <option value="price-asc">Menor PMC</option>
              <option value="price-desc">Maior PMC</option>
              <option value="name">Nome</option>
            </select>
          </label>
        </div>
      </section>

      <section className="summary-strip">
        <div>
          <strong>{filtered.length.toLocaleString("pt-BR")}</strong>
          <span>{hasSearch || onlyFavorites ? "apresentações encontradas" : "digite para buscar"}</span>
        </div>
        <div>
          <strong>{uf}</strong>
          <span>
            ICMS {formatRate(selectedRate)}{usesExactIcmsColumn ? "" : ` | PMC ${formatRate(selectedZone)}`}
          </span>
        </div>
        <div>
          <strong>{favorites.length.toLocaleString("pt-BR")}</strong>
          <span>favoritos salvos</span>
        </div>
        <div className="summary-actions">
          <button className={onlyFavorites ? "toggle-button active" : "toggle-button"} type="button" onClick={() => setOnlyFavorites(!onlyFavorites)}>
            <Heart size={17} />
            <span>Favoritos</span>
          </button>
          <button className="toggle-button" type="button" onClick={exportCsv}>
            <Download size={17} />
            <span>CSV</span>
          </button>
          <button className="toggle-button" type="button" onClick={clearFilters}>
            <X size={17} />
            <span>Limpar</span>
          </button>
        </div>
      </section>

      {!hasPaidAccess ? (
        <section className="paywall-strip">
          <div>
            <strong>Assinatura necessária</strong>
            <span>Entre e assine para visualizar os resultados completos.</span>
          </div>
          {userEmail ? (
            <button className="primary-button" type="button" onClick={() => openBilling("/api/billing/checkout")}>
              <CreditCard size={17} />
              <span>Assinar</span>
            </button>
          ) : (
            <button className="primary-button" type="button" onClick={() => setShowLogin(true)}>
              <UserRound size={17} />
              <span>Entrar</span>
            </button>
          )}
        </section>
      ) : null}

      <section className="table-section">
        <div className="table-header">
          <div>
            <h2>Preço máximo ao consumidor</h2>
            <p>
              {hasSearch
                ? hasPaidAccess
                  ? `Busca aplicada: "${activeQuery}", incluindo equivalentes pelo princípio ativo. Exibindo até 250 resultados.`
                  : "Assinatura necessária para exibir resultados."
                : "Digite pelo menos 2 letras do medicamento ou princípio ativo."}
            </p>
          </div>
          <div className="source-pill">
            <ShieldCheck size={16} />
            <span>{medicines[0]?.source ?? "Fonte importada"}</span>
          </div>
        </div>

        <div className="medicine-list">
          {visibleRows.map((item, index) => {
            const favorite = favorites.includes(item.id);
            const previous = index > 0 ? visibleRows[index - 1] : null;
            const showLabHeader = sortMode === "group-lab" && item.laboratory !== previous?.laboratory;
            return (
              <div className="medicine-group" key={item.id}>
                {showLabHeader ? (
                  <div className="lab-divider">
                    <Landmark size={16} />
                    <span>{item.laboratory}</span>
                  </div>
                ) : null}
                <article className="medicine-row">
                  <button className={favorite ? "favorite-button active" : "favorite-button"} type="button" onClick={() => toggleFavorite(item.id)} title="Favoritar">
                    <Star size={18} />
                  </button>
                  <div className="medicine-main">
                    <div className="medicine-title">
                      <h3>{item.name}</h3>
                      <span>{item.kind}</span>
                    </div>
                    <p>{item.activeIngredient}</p>
                    <small>{item.presentation}</small>
                  </div>
                  <div className="medicine-meta">
                    <span>{item.laboratory}</span>
                    <small>Página {item.sourcePage}</small>
                  </div>
                  <div className="price-cell">
                  <small>
                    PMC {uf}
                    {usesExactIcmsColumn ? "" : ` | coluna ${formatRate(selectedZone)}`}
                  </small>
                  <strong>{currency.format(item.pmc[selectedZone] ?? 0)}</strong>
                  </div>
                </article>
              </div>
            );
          })}
        </div>

        {visibleRows.length === 0 ? (
          <div className="empty-state">
            <SlidersHorizontal size={34} />
            <h3>{hasSearch || onlyFavorites ? "Nenhum resultado encontrado" : "Comece pela busca"}</h3>
            <p>
              {hasSearch || onlyFavorites
                ? "Ajuste o termo, filtros ou seleção de favoritos."
                : "A tabela compara somente resultados compatíveis com o termo digitado."}
            </p>
          </div>
        ) : null}
      </section>

      {showSettings ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Configuração de ICMS por UF">
          <section className="settings-modal">
            <div className="modal-title">
              <div>
                <p className="eyebrow">Configuração local</p>
                <h2>ICMS por UF</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowSettings(false)} title="Fechar">
                <X size={20} />
              </button>
            </div>
            <p className="modal-copy">
              O suplemento importado traz PMC para 20%, 18%, 17% e 12%. A alíquota da UF fica registrada aqui; quando não houver coluna exata no PDF, o app usa a coluna mais próxima e informa isso no resultado.
            </p>
            <div className="uf-grid">
              {ufCodes.map((code) => (
                <label className="uf-setting" key={code}>
                  <span>{code}</span>
                  <select
                    value={ufMap[code] ?? defaultUfIcmsMap[code]}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (isIcmsRate(value)) updateRate(code, value);
                    }}
                  >
                    {icmsRates.map((rate) => (
                      <option key={rate} value={rate}>
                        {formatRate(rate)}
                      </option>
                    ))}
                  </select>
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button
                className="ghost-button"
                type="button"
                onClick={() => {
                  setUfMap(defaultUfIcmsMap);
                  writeJson(storageKeys.ufMap, defaultUfIcmsMap);
                  void saveSettings(defaultUfIcmsMap);
                }}
              >
                <ArrowDownUp size={17} />
                <span>Restaurar padrão</span>
              </button>
              <button className="primary-button" type="button" onClick={() => setShowSettings(false)}>
                Salvar
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {showLogin ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="Entrar">
          <section className="settings-modal auth-modal">
            <div className="modal-title">
              <div>
                <p className="eyebrow">Conta opcional</p>
                <h2>Favoritos e histórico</h2>
              </div>
              <button className="icon-button" type="button" onClick={() => setShowLogin(false)} title="Fechar">
                <X size={20} />
              </button>
            </div>
            <div className="auth-switch" role="tablist" aria-label="Tipo de acesso">
              <button
                className={authMode === "login" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("login")}
              >
                Entrar
              </button>
              <button
                className={authMode === "register" ? "active" : ""}
                type="button"
                onClick={() => setAuthMode("register")}
              >
                Criar conta
              </button>
            </div>
            <form className="auth-form" onSubmit={submitAuth}>
              <label className="select-field">
                <span>E-mail</span>
                <input
                  autoComplete="email"
                  inputMode="email"
                  placeholder="seu@email.com"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                />
              </label>
              <label className="select-field">
                <span>Senha</span>
                <input
                  autoComplete={authMode === "login" ? "current-password" : "new-password"}
                  minLength={8}
                  placeholder="mínimo 8 caracteres"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {authMode === "register" ? (
                <label className="checkbox-row">
                  <input
                    type="checkbox"
                    checked={acceptedPrivacy}
                    onChange={(event) => setAcceptedPrivacy(event.target.checked)}
                  />
                  <span>
                    Li e aceito os <a href="/termos">Termos</a> e a{" "}
                    <a href="/privacidade">Política de Privacidade</a>.
                  </span>
                </label>
              ) : null}
              <button className="primary-button" type="submit">
                {authMode === "login" ? "Entrar" : "Criar conta"}
              </button>
            </form>
            {userEmail ? (
              <div className="account-actions">
                <div className="plan-card">
                  <div>
                    <span>Assinatura</span>
                    <strong>{planLabel()}</strong>
                    {subscriptionCurrentPeriodEnd ? (
                      <small>Renova em {new Date(subscriptionCurrentPeriodEnd).toLocaleDateString("pt-BR")}</small>
                    ) : (
                      <small>Favoritos, histórico e exportação ficam disponíveis na conta.</small>
                    )}
                  </div>
                  {planStatus === "active" || planStatus === "trialing" || planStatus === "past_due" ? (
                    <button className="ghost-button" type="button" onClick={() => openBilling("/api/billing/portal")}>
                      <CreditCard size={17} />
                      <span>Gerenciar</span>
                    </button>
                  ) : (
                    <button className="primary-button" type="button" onClick={() => openBilling("/api/billing/checkout")}>
                      <CreditCard size={17} />
                      <span>Assinar</span>
                    </button>
                  )}
                </div>
                <a className="ghost-button" href="/api/account/export" target="_blank" rel="noreferrer">
                  Exportar dados
                </a>
                <button className="danger-button" type="button" onClick={deleteAccount}>
                  Excluir conta
                </button>
              </div>
            ) : null}
            {authMessage ? <p className="modal-copy">{authMessage}</p> : null}
          </section>
        </div>
      ) : null}
      <footer className="app-footer">
        <span>PMC é preço máximo ao consumidor, não preço praticado pela farmácia.</span>
        <a href="/termos">Termos</a>
        <a href="/privacidade">Privacidade</a>
      </footer>
    </main>
  );
}
