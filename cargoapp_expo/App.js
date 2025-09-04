import * as React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import RegisterUserScreen from './RegisterUserScreen';
import MainScreen from './MainScreen';
import LoginScreen from './LoginScreen';

import ForgotPasswordScreen from './ForgotPasswordScreen';
import VerifyCodeScreen from './VerifyCodeScreen';
import PasswordResetSuccessScreen from './PasswordResetSuccessScreen';

const Stack = createNativeStackNavigator();

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
          component={MainScreen} 
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
