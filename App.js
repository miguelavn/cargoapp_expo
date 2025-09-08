import * as React from 'react';
import { Text, View, Pressable } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RegisterUserScreen from './screens/main/userRegister/RegisterUserScreen';
import MainScreen from './MainScreen';
import LoginScreen from './screens/main/login/LoginScreen';
import ServicesScreen from './screens/main/services/ServicesScreen';
import UsersListScreen from './UsersListScreen';
import VehicleScreen from './screens/main/vehicle/VehicleScreen';
import AccountScreen from './screens/main/account/AccountScreen';

import ForgotPasswordScreen from './screens/main/login/ForgotPasswordScreen';
import VerifyCodeScreen from './screens/main/login/VerifyCodeScreen';
import PasswordResetSuccessScreen from './screens/main/login/PasswordResetSuccessScreen';

const Stack = createNativeStackNavigator();
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons, MaterialCommunityIcons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#666',
        tabBarLabelStyle: { fontSize: 11, marginTop: -2 },
        tabBarStyle: {
          position: 'absolute',
          left: 16,
          right: 16,
          bottom: 16,
          backgroundColor: '#fff',
          borderRadius: 16,
          height: 64,
          paddingBottom: 8,
          paddingTop: 8,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.1,
          shadowRadius: 6,
          elevation: 6,
        },
        tabBarItemStyle: { borderRadius: 14, marginHorizontal: 6 },
        tabBarButton: (props) => (
          <Pressable
            {...props}
            android_ripple={{ color: '#FFF4CC', borderless: true, radius: 36 }}
            style={[props.style, { borderRadius: 999 }]}
          />
        ),
        tabBarIcon: ({ color, focused }) => {
          if (route.name === 'Inicio') {
            const homeName = focused ? 'home-variant' : 'home-variant-outline';
            return <MaterialCommunityIcons name={homeName} size={26} color={color} />;
          }
          let name = 'home';
          switch (route.name) {
            case 'Servicios':
              name = 'local-taxi';
              break;
            case 'Vehículo':
              name = 'directions-car';
              break;
            case 'Cuenta':
              name = 'account-circle';
              break;
            default:
              name = 'home';
          }
          return <MaterialIcons name={name} size={26} color={color} />;
        },
        tabBarLabel: ({ focused, color }) => (
          <Text style={{ color, fontSize: 11, fontWeight: focused ? '700' : '600' }}>
            {route.name}
          </Text>
        ),
      })}
    >
  <Tab.Screen name="Inicio" component={MainScreen} />
      <Tab.Screen name="Servicios" component={ServicesScreen} />
      <Tab.Screen name="Vehículo" component={VehicleScreen} />
      <Tab.Screen name="Cuenta" component={AccountScreen} />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator initialRouteName="Login">
        <Stack.Screen 
          name="Login" 
          component={LoginScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="Principal" 
          component={TabNavigator} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="UsersList" 
          component={UsersListScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="RegisterUser" 
          component={RegisterUserScreen} 
          options={{ headerShown: false }} 
        />

         {/* Pantallas de recuperación de contraseña */}
        <Stack.Screen 
          name="ForgotPassword" 
          component={ForgotPasswordScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="VerifyCode" 
          component={VerifyCodeScreen} 
          options={{ headerShown: false }} 
        />
        <Stack.Screen 
          name="PasswordResetSuccess" 
          component={PasswordResetSuccessScreen} 
          options={{ headerShown: false }} 
        />


        
      </Stack.Navigator>
    </NavigationContainer>
  );
}
