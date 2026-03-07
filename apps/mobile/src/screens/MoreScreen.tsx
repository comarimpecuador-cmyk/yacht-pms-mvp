import { Pressable, Text, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';

export function MoreScreen() {
  const { logout, user, status } = useAuth();
  const submitting = status === 'loading';

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12 }}>More</Text>
      <Text>Timeline / Agenda por Yacht (placeholder)</Text>
      <Text style={{ marginTop: 8 }}>Notification Settings (placeholder)</Text>
      {user ? <Text style={{ marginTop: 16 }}>Usuario: {user.email}</Text> : null}
      <Pressable
        style={{
          marginTop: 16,
          backgroundColor: '#dc2626',
          paddingVertical: 10,
          borderRadius: 8,
          alignItems: 'center',
          opacity: submitting ? 0.6 : 1,
        }}
        onPress={() => {
          void logout();
        }}
        disabled={submitting}
      >
        <Text style={{ color: '#fff', fontWeight: '600' }}>Cerrar sesion</Text>
      </Pressable>
    </View>
  );
}
