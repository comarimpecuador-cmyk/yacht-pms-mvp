import { View, Text } from 'react-native';

export function PlaceholderScreen({ title }: { title: string }) {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>{title}</Text>
      <Text style={{ marginTop: 8, color: '#64748b' }}>Scaffold base listo</Text>
    </View>
  );
}
