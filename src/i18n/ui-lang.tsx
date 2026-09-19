// ─────────────────────────────────────────────────────────────────────────
// UiLangProvider — Settings content_lang drives screen chrome.
// Chat reply language stays independent (user's typed / chip prompt).
// ─────────────────────────────────────────────────────────────────────────

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import type { ContentLang } from "../../worker/chat-agent/settings";
import { DEFAULT_CONTENT_LANG } from "../../worker/chat-agent/settings";
import { messages, type MessageKey } from "./messages";

export type TFn = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

type UiLangValue = {
  lang: ContentLang;
  t: TFn;
};

const UiLangContext = createContext<UiLangValue | null>(null);

function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, name: string) =>
    vars[name] == null ? `{${name}}` : String(vars[name]),
  );
}

export function translate(
  lang: ContentLang,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const dict = messages[lang] ?? messages.ko;
  return interpolate(dict[key] ?? messages.en[key] ?? key, vars);
}

export function UiLangProvider({
  lang,
  children,
}: {
  lang: ContentLang | null | undefined;
  children: ReactNode;
}) {
  const resolved: ContentLang = lang ?? DEFAULT_CONTENT_LANG;

  useEffect(() => {
    document.documentElement.lang = resolved;
  }, [resolved]);

  const t = useCallback<TFn>(
    (key, vars) => translate(resolved, key, vars),
    [resolved],
  );

  const value = useMemo<UiLangValue>(
    () => ({ lang: resolved, t }),
    [resolved, t],
  );

  return (
    <UiLangContext.Provider value={value}>{children}</UiLangContext.Provider>
  );
}

export function useUiLang(): UiLangValue {
  const ctx = useContext(UiLangContext);
  if (!ctx) {
    throw new Error("useUiLang must be used within UiLangProvider");
  }
  return ctx;
}

export function useT(): TFn {
  return useUiLang().t;
}

/** Use inside UiLangProvider when the parent component is the provider itself. */
export function UiLangConsumer({
  children,
}: {
  children: (t: TFn, lang: ContentLang) => ReactNode;
}) {
  const { t, lang } = useUiLang();
  return children(t, lang);
}

export function seriesGroupTitle(
  t: TFn,
  groupId: string,
  fallback: string,
): string {
  if (groupId === "market-issues") return t("series.group.marketIssues");
  if (groupId === "weekly-ai-issues") return t("series.group.weeklyAi");
  if (groupId === "daily-market-issues-kr") {
    return t("series.group.marketIssuesKr");
  }
  return fallback;
}

export function seriesTabLabel(
  t: TFn,
  slug: string | null | undefined,
  fallback: string,
): string {
  switch (slug) {
    case "weekly-ai-issues":
      return t("series.tab.weeklyAi");
    case "weekly-market-issues":
      return t("series.tab.weeklyMarket");
    case "daily-market-issues":
      return t("series.tab.daily");
    case "daily-market-issues-kr":
      return t("series.tab.marketKr");
    default:
      return fallback;
  }
}

export function interestKindLabel(t: TFn, kind: string): string {
  switch (kind) {
    case "theme":
      return t("interest.kind.theme");
    case "company":
      return t("interest.kind.company");
    case "industry":
      return t("interest.kind.industry");
    case "asset":
      return t("interest.kind.asset");
    default:
      return kind;
  }
}

export function entityGroupLabel(t: TFn, group: string): string {
  switch (group) {
    case "companies":
      return t("topics.group.companies");
    case "institutions":
      return t("topics.group.institutions");
    case "technologies":
      return t("topics.group.technologies");
    case "industries":
      return t("topics.group.industries");
    case "products":
      return t("topics.group.products");
    case "indicators":
      return t("topics.group.indicators");
    case "persons":
      return t("topics.group.persons");
    case "countries":
      return t("topics.group.countries");
    default:
      return group;
  }
}

export function keywordKindLabel(t: TFn, group: string): string {
  switch (group) {
    case "companies":
      return t("topics.kind.company");
    case "institutions":
      return t("topics.kind.institution");
    case "technologies":
      return t("topics.kind.technology");
    case "industries":
      return t("topics.kind.industry");
    case "products":
      return t("topics.kind.product");
    case "indicators":
      return t("topics.kind.indicator");
    case "persons":
      return t("topics.kind.person");
    case "countries":
      return t("topics.kind.place");
    default:
      return group;
  }
}

export function reportPageEyebrow(
  t: TFn,
  slug: string,
  fallback: string,
): string {
  if (slug === "daily-market-issues") return t("chat.page.daily.eyebrow");
  if (slug === "weekly-ai-issues") return t("chat.page.weeklyAi.eyebrow");
  return fallback;
}
