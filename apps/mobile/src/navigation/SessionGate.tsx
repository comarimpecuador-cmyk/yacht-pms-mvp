import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Tabs } from './Tabs';
import { LoginScreen } from '../screens/LoginScreen';
import { useAuth } from '../hooks/useAuth';

export function SessionGate() {
  const { status, isAuthenticated } = useAuth();

  if (status === 'loading') {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  if (!isAuthenticated) {
    return <LoginScreen />;
  }

  return <Tabs />;
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f8fafc',
  },
});

