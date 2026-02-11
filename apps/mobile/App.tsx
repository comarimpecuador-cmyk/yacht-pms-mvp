import { useEffect } from 'react';
import { Tabs } from './src/navigation/Tabs';
import { initDb } from './src/db/sqlite';

export default function App() {
  useEffect(() => {
    initDb();
  }, []);

  return <Tabs />;
}
