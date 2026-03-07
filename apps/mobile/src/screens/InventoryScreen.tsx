import { ActivityIndicator, FlatList, RefreshControl, Text, View } from 'react-native';
import { useAuth } from '../hooks/useAuth';
import { useInventoryItems } from '../hooks/useInventoryItems';
import { InventoryItem } from '../types/inventory';

export function InventoryScreen() {
  const { user } = useAuth();
  const yachtId = user?.yachtIds?.[0];
  const { data, isLoading, error, isRefetching, refetch } = useInventoryItems(yachtId);

  const renderItem = ({ item }: { item: InventoryItem }) => {
    const isLowStock = item.currentStock <= item.minStock;

    return (
      <View
        style={{
          backgroundColor: '#fff',
          borderRadius: 10,
          padding: 12,
          marginBottom: 10,
          borderWidth: 1,
          borderColor: isLowStock ? '#fca5a5' : '#e2e8f0',
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: '600', color: '#0f172a' }}>{item.name}</Text>
        <Text style={{ color: '#334155', marginTop: 2 }}>
          SKU: {item.sku || 'N/A'} | Cat: {item.category}
        </Text>
        <Text style={{ color: '#334155' }}>
          Stock: {item.currentStock} {item.unit} (Min: {item.minStock})
        </Text>
        {item.location ? <Text style={{ color: '#475569' }}>Location: {item.location}</Text> : null}
        {isLowStock ? <Text style={{ marginTop: 6, color: '#b91c1c' }}>Low stock</Text> : null}
      </View>
    );
  };

  if (!yachtId) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Text style={{ color: '#b91c1c' }}>No hay yachtId disponible en tu sesion.</Text>
      </View>
    );
  }

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#0f766e" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 16 }}>
        <Text style={{ color: '#b91c1c', textAlign: 'center' }}>Error cargando inventory: {error.message}</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, padding: 16, backgroundColor: '#f8fafc' }}>
      <Text style={{ fontSize: 20, fontWeight: '700', color: '#0f172a' }}>Inventory</Text>
      <Text style={{ marginTop: 4, marginBottom: 12, color: '#475569' }}>
        Yacht: {yachtId} | Source: {data?.source || 'remote'} | Total: {data?.total || 0}
      </Text>

      <FlatList
        data={data?.items || []}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} tintColor="#0f766e" />
        }
        ListEmptyComponent={
          <View style={{ marginTop: 24, alignItems: 'center' }}>
            <Text style={{ color: '#475569' }}>No hay items de inventory para este yacht.</Text>
          </View>
        }
      />
    </View>
  );
}

