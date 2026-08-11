import { useCallback, useEffect, useState } from "react";

import { fetchSettings, saveSettings, type Settings } from "../api/settings";
import type { AuthenticatedFetch } from "../api/status";

export interface SettingsState {
  value?: Settings;
  defaults?: Settings;
  loaded: boolean;
  loading: boolean;
  saving: boolean;
  error?: string;
  save(value: Settings): Promise<Settings | undefined>;
  retry(): void;
}

export function useSettings(ready: boolean, fetcher: AuthenticatedFetch): SettingsState {
  const [value, setValue] = useState<Settings>();
  const [defaults, setDefaults] = useState<Settings>();
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!ready) return;
    const controller = new AbortController();
    setLoading(true);
    setError(undefined);
    void fetchSettings(fetcher, controller.signal)
      .then((document) => {
        setValue(document.value);
        setDefaults(document.defaults);
        setLoaded(true);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(message(reason, "Settings could not be loaded"));
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [attempt, fetcher, ready]);

  const save = useCallback(async (next: Settings) => {
    setSaving(true);
    setError(undefined);
    try {
      const persisted = await saveSettings(fetcher, next);
      setValue(persisted);
      setLoaded(true);
      return persisted;
    } catch (reason: unknown) {
      setError(message(reason, "Settings could not be saved"));
      return undefined;
    } finally {
      setSaving(false);
    }
  }, [fetcher]);

  return { value, defaults, loaded, loading, saving, error, save, retry: () => setAttempt((current) => current + 1) };
}

function message(reason: unknown, fallback: string): string {
  return reason instanceof Error ? reason.message : fallback;
}
