import { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory } from '@docusaurus/router';
import { useStorageSlot } from '@docusaurus/theme-common';
import { useQueryStringValue } from '@docusaurus/theme-common/internal';
import ExecutionEnvironment from '@docusaurus/ExecutionEnvironment';

export type SdkLanguage = 'typescript' | 'python';

export interface SdkLanguageConfig {
  value: SdkLanguage;
  label: string;
}

export const SDK_LANGUAGES: SdkLanguageConfig[] = [
  { value: 'typescript', label: 'TypeScript' },
  { value: 'python', label: 'Python' },
];

const SDK_QUERY_PARAM = 'sdk';
const SDK_STORAGE_KEY = 'docusaurus.tab.sdk-language';

function isValidSdk(value: string | null | undefined): value is SdkLanguage {
  return value === 'typescript' || value === 'python';
}

export function useSdkLanguage() {
  const history = useHistory();
  const queryStringValue = useQueryStringValue(SDK_QUERY_PARAM);
  const [storageValue, storageSlot] = useStorageSlot(SDK_STORAGE_KEY);

  // Resolve language: URL param > localStorage > default
  const resolvedLanguage: SdkLanguage = isValidSdk(queryStringValue)
    ? queryStringValue
    : isValidSdk(storageValue)
      ? storageValue
      : 'typescript';

  const [language, setLanguageState] = useState<SdkLanguage>(resolvedLanguage);
  const languageRef = useRef(language);

  // Keep ref in sync
  useEffect(() => {
    languageRef.current = language;
  }, [language]);

  // Sync resolved language into state (handles hydration + external changes)
  useEffect(() => {
    if (resolvedLanguage !== languageRef.current) {
      setLanguageState(resolvedLanguage);
    }
  }, [resolvedLanguage]);

  // On mount: sync URL from storage if no URL param exists
  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM) return;
    const params = new URLSearchParams(window.location.search);
    const urlSdk = params.get(SDK_QUERY_PARAM);
    if (!urlSdk && isValidSdk(storageValue)) {
      // localStorage has a value but URL doesn't — push to URL
      const searchParams = new URLSearchParams(history.location.search);
      searchParams.set(SDK_QUERY_PARAM, storageValue);
      history.replace({ ...history.location, search: searchParams.toString() });
    } else if (isValidSdk(urlSdk)) {
      // URL has a value — persist to storage
      storageSlot.set(urlSdk);
    }
    // Only run on mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setLanguage = useCallback(
    (newLanguage: SdkLanguage) => {
      setLanguageState(newLanguage);
      storageSlot.set(newLanguage);
      // Update URL via history.replace (not pushState — language is a setting, not navigation)
      const searchParams = new URLSearchParams(history.location.search);
      searchParams.set(SDK_QUERY_PARAM, newLanguage);
      history.replace({ ...history.location, search: searchParams.toString() });
    },
    [storageSlot, history],
  );

  // Cross-tab sync via storage events
  useEffect(() => {
    if (!ExecutionEnvironment.canUseDOM) return;
    const cleanup = storageSlot.listen((event: StorageEvent) => {
      if (event.newValue && isValidSdk(event.newValue) && event.newValue !== languageRef.current) {
        setLanguageState(event.newValue);
        const searchParams = new URLSearchParams(history.location.search);
        searchParams.set(SDK_QUERY_PARAM, event.newValue);
        history.replace({ ...history.location, search: searchParams.toString() });
      }
    });
    return cleanup;
  }, [storageSlot, history]);

  return { language, setLanguage, languages: SDK_LANGUAGES };
}
