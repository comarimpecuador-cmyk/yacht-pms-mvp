import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { PlaceholderScreen } from '../screens/PlaceholderScreen';
import { InboxScreen } from '../screens/InboxScreen';
import { MoreScreen } from '../screens/MoreScreen';
import { LogBookScreen } from '../screens/LogBookScreen';
import { InventoryScreen } from '../screens/InventoryScreen';

const Tab = createBottomTabNavigator();

export function Tabs() {
  return (
    <NavigationContainer>
      <Tab.Navigator>
        <Tab.Screen name="Inbox" component={InboxScreen} />
        <Tab.Screen name="LogBook" component={LogBookScreen} />
        <Tab.Screen name="Inventory" component={InventoryScreen} />
        <Tab.Screen name="ISM" children={() => <PlaceholderScreen title="ISM" />} />
        <Tab.Screen name="More" component={MoreScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
