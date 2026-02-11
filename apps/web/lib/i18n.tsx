'use client';

import { createContext, useContext, type ReactNode } from 'react';
import es from '@/locales/es.json';

// Type definition for the translations
export type Locale = typeof es;

// Create context
interface I18nContextType {
  locale: Locale;
  t: (key: string, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nContextType | undefined>(undefined);

// Default context value
const defaultContext: I18nContextType = {
  locale: es,
  t: (key: string) => key,
};

// Helper to get nested value
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;

  for (const key of keys) {
    if (current === null || current === undefined) {
      return undefined;
    }
    if (typeof current === 'object' && current !== null) {
      current = (current as Record<string, unknown>)[key];
    } else {
      return undefined;
    }
  }

  return current;
}

// Static translation function (for use outside components)
export function translate(key: string, params?: Record<string, string | number>): string {
  const value = getNestedValue(es, key);

  if (typeof value !== 'string') {
    return key;
  }

  if (params) {
    let result = value;
    for (const [paramKey, paramValue] of Object.entries(params)) {
      result = result.replace(new RegExp(`{{${paramKey}}}`, 'g'), String(paramValue));
    }
    return result;
  }

  return value;
}

// Hook version (for use inside components)
export function useI18n() {
  const context = useContext(I18nContext);
  
  const translateFn = (key: string, params?: Record<string, string | number>): string => {
    return translate(key, params);
  };

  return context || { locale: es, t: translateFn };
}

// I18n Provider component
export function I18nProvider({ children }: { children: ReactNode }) {
  const translateFn = (key: string, params?: Record<string, string | number>): string => {
    return translate(key, params);
  };

  return (
    <I18nContext.Provider value={{ locale: es, t: translateFn }}>
      {children}
    </I18nContext.Provider>
  );
}
