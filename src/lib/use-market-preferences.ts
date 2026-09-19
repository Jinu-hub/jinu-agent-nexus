// ─────────────────────────────────────────────────────────────────────────
// use-market-preferences — shared MyMemory interests for home surfaces
// ─────────────────────────────────────────────────────────────────────────
//
// Module store + useSyncExternalStore so ChatHelperRail stars and Market
// BriefForYou / reader modal stay in sync without lifting to App.
// ─────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useSyncExternalStore } from "react";

import {
  fetchPreferences,
  isPreferenceSaved,
  mapTopicToPreference,
  removeInterest,
  saveInterest,
  type PreferenceRow,
  type TopicPreferenceSource,
} from "@/lib/topic-preference";

type Store = {
  preferences: PreferenceRow[];
  loading: boolean;
  error: string | null;
  loaded: boolean;
};

let store: Store = {
  preferences: [],
  loading: false,
  error: null,
  loaded: false,
};

const listeners = new Set<() => void>();
let loadPromise: Promise<void> | null = null;

function emit(): void {
  for (const listener of listeners) listener();
}

function setStore(patch: Partial<Store>): void {
  store = { ...store, ...patch };
  emit();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): Store {
  return store;
}

async function ensureLoaded(): Promise<void> {
  if (store.loaded || loadPromise) {
    await loadPromise;
    return;
  }
  setStore({ loading: true, error: null });
  loadPromise = fetchPreferences()
    .then((preferences) => {
      setStore({ preferences, loading: false, loaded: true, error: null });
    })
    .catch((err) => {
      setStore({
        loading: false,
        loaded: true,
        error: err instanceof Error ? err.message : "Failed to load interests",
      });
    })
    .finally(() => {
      loadPromise = null;
    });
  await loadPromise;
}

export function useMarketPreferences(enabled: boolean): {
  preferences: PreferenceRow[];
  preferencesLoading: boolean;
  preferencesError: string | null;
  toggleInterest: (source: TopicPreferenceSource) => Promise<void>;
  removeInterestRow: (row: PreferenceRow) => Promise<void>;
  reloadPreferences: () => Promise<void>;
} {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

  useEffect(() => {
    if (!enabled) return;
    void ensureLoaded();
  }, [enabled]);

  const toggleInterest = useCallback(
    async (source: TopicPreferenceSource) => {
      const mapped = mapTopicToPreference(source);
      if (!mapped) return;
      const saved = isPreferenceSaved(
        store.preferences,
        mapped.kind,
        mapped.target,
      );
      try {
        if (saved) {
          await removeInterest(mapped.kind, mapped.target);
          setStore({
            preferences: store.preferences.filter(
              (p) =>
                !(
                  p.kind === mapped.kind &&
                  p.target.trim().toLowerCase() ===
                    mapped.target.trim().toLowerCase()
                ),
            ),
            error: null,
          });
        } else {
          const row = await saveInterest(
            mapped.kind,
            mapped.target,
            source.display ?? null,
          );
          const without = store.preferences.filter(
            (p) =>
              !(
                p.kind === row.kind &&
                p.target.trim().toLowerCase() ===
                  row.target.trim().toLowerCase()
              ),
          );
          setStore({ preferences: [row, ...without], error: null });
        }
      } catch (err) {
        setStore({
          error:
            err instanceof Error ? err.message : "Failed to update interest",
        });
      }
    },
    [],
  );

  const removeInterestRow = useCallback(async (row: PreferenceRow) => {
    try {
      await removeInterest(row.kind, row.target);
      setStore({
        preferences: store.preferences.filter(
          (p) =>
            !(
              p.kind === row.kind &&
              p.target.trim().toLowerCase() === row.target.trim().toLowerCase()
            ),
        ),
        error: null,
      });
    } catch (err) {
      setStore({
        error: err instanceof Error ? err.message : "Failed to remove interest",
      });
    }
  }, []);

  const reloadPreferences = useCallback(async () => {
    store = { ...store, loaded: false };
    loadPromise = null;
    await ensureLoaded();
  }, []);

  return {
    preferences: snap.preferences,
    preferencesLoading: snap.loading,
    preferencesError: snap.error,
    toggleInterest,
    removeInterestRow,
    reloadPreferences,
  };
}
