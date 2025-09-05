import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RegisterUserScreen from './RegisterUserScreen';
import MainScreen from './MainScreen';
import LoginScreen from './LoginScreen';
import ServicesScreen from './ServicesScreen';
import VehicleScreen from './VehicleScreen';
import AccountScreen from './AccountScreen';

import ForgotPasswordScreen from './ForgotPasswordScreen';
import VerifyCodeScreen from './VerifyCodeScreen';
import PasswordResetSuccessScreen from './PasswordResetSuccessScreen';

const Stack = createNativeStackNavigator();
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialIcons } from '@expo/vector-icons';

const Tab = createBottomTabNavigator();

function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarShowLabel: false,
        tabBarActiveTintColor: '#6C63FF',
        tabBarInactiveTintColor: '#666',
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
        tabBarIcon: ({ color, size }) => {
          switch (route.name) {
            case 'Inicio':
              return <MaterialIcons name="home" size={26} color={color} />;
            case 'Servicios':
              return <MaterialIcons name="local-taxi" size={26} color={color} />;
            case 'Vehículo':
              return <MaterialIcons name="directions-car" size={26} color={color} />;
            case 'Cuenta':
              return <MaterialIcons name="account-circle" size={26} color={color} />;
            default:
              return null;
          }
        },
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
