import { useEffect } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { initDb } from './src/db/sqlite';
import { queryClient } from './src/services/queryClient';
import { AuthProvider } from './src/services/auth/AuthProvider';
import { SessionGate } from './src/navigation/SessionGate';

export default function App() {
  useEffect(() => {
    initDb();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <SafeAreaProvider>
        <AuthProvider>
          <SessionGate />
        </AuthProvider>
      </SafeAreaProvider>
    </QueryClientProvider>
  );
}
