import { View, Text } from 'react-native';

export function InboxScreen() {
  return (
    <View style={{ flex: 1, padding: 16 }}>
      <Text style={{ fontSize: 20, fontWeight: '600', marginBottom: 12 }}>Inbox Operativo</Text>
      <Text>Filtros: Yacht · Módulo · Severidad · 7/14/30 días</Text>
      <Text style={{ marginTop: 12 }}>Sections: Approvals, Expirations, Due Tasks, ISM Pending</Text>
    </View>
  );
}
