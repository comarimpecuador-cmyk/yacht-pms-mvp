'use client';

import { createContext, useContext, useState, useRef, useCallback, useMemo, type ReactNode } from 'react';
import { api } from './api';
import { translate } from './i18n';

export interface Yacht {
  id: string;
  name: string;
  flag: string;
  isActive: boolean;
  imoOptional?: string;
}

interface YachtContextType {
  currentYacht: Yacht | null;
  yachts: Yacht[];
  isLoading: boolean;
  selectYacht: (yachtId: string) => void;
  loadYachts: () => Promise<void>;
  clearYacht: () => void;
}

const YachtContext = createContext<YachtContextType | undefined>(undefined);

export function YachtProvider({ children }: { children: ReactNode }) {
  const [currentYacht, setCurrentYacht] = useState<Yacht | null>(null);
  const [yachts, setYachts] = useState<Yacht[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const isLoadingRef = useRef(false);

  const loadYachts = useCallback(async () => {
    // Prevent multiple concurrent calls
    if (isLoadingRef.current) return;
    isLoadingRef.current = true;

    setIsLoading(true);
    try {
      const response = await api.get<Yacht[]>('/yachts');
      setYachts(response);

      const currentPath = typeof window !== 'undefined' ? window.location.pathname : '';
      const routeMatch = currentPath.match(/^\/yachts\/([^/]+)/);
      const routeYachtId = routeMatch?.[1];

      const routeYacht = routeYachtId
        ? response.find((y) => y.id === routeYachtId)
        : null;

      setCurrentYacht((prev) => {
        if (routeYacht) return routeYacht;
        if (prev) return response.find((y) => y.id === prev.id) ?? null;
        if (response.length === 1) return response[0];
        return prev ?? null;
      });
    } catch (error) {
      console.error(translate('errors.loadYachtsFailed'), error);
      setYachts([]);
    } finally {
      isLoadingRef.current = false;
      setIsLoading(false);
    }
  }, []);

  const selectYacht = useCallback((yachtId: string) => {
    const yacht = yachts.find((y) => y.id === yachtId);
    if (yacht) {
      setCurrentYacht(yacht);
      // Use window.location for navigation to avoid router dependency
      if (typeof window !== 'undefined') {
        window.location.href = `/yachts/${yachtId}/home`;
      }
    }
  }, [yachts]);

  const clearYacht = useCallback(() => {
    setCurrentYacht(null);
  }, []);

  const value = useMemo(() => ({
    currentYacht,
    yachts,
    isLoading,
    selectYacht,
    loadYachts,
    clearYacht,
  }), [currentYacht, yachts, isLoading, selectYacht, loadYachts, clearYacht]);

  return (
    <YachtContext.Provider value={value}>
      {children}
    </YachtContext.Provider>
  );
}

export function useYacht() {
  const context = useContext(YachtContext);
  if (context === undefined) {
    return {
      currentYacht: null,
      yachts: [],
      isLoading: false,
      selectYacht: () => {},
      loadYachts: async () => {},
      clearYacht: () => {},
    };
  }
  return context;
}
