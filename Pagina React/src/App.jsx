import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import Login from './pages/Login.jsx';
import ForgotPassword from './pages/auth/ForgotPassword.jsx';
import VerifyCode from './pages/auth/VerifyCode.jsx';
import PasswordResetSuccess from './pages/auth/PasswordResetSuccess.jsx';
import PrincipalLayout from './pages/PrincipalLayout.jsx';
import Home from './pages/Home.jsx';
import Orders from './pages/orders/Orders.jsx';
import RegisterOrder from './pages/orders/RegisterOrder.jsx';
import Account from './pages/Account.jsx';
import Projects from './pages/projects/Projects.jsx';
import RegisterProject from './pages/projects/RegisterProject.jsx';
import Users from './pages/users/Users.jsx';
import Services from './pages/services/Services.jsx';
import RegisterService from './pages/services/RegisterService.jsx';
import Vehicle from './pages/vehicle/Vehicle.jsx';
import { RequireAuth } from './state/RequireAuth.jsx';

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/verify-code" element={<VerifyCode />} />
      <Route path="/password-reset-success" element={<PasswordResetSuccess />} />

      <Route
        path="/"
        element={
          <RequireAuth>
            <PrincipalLayout />
          </RequireAuth>
        }
      >
        <Route index element={<Home />} />
        <Route path="orders" element={<Orders />} />
        <Route path="orders/new" element={<RegisterOrder />} />
        <Route path="projects" element={<Projects />} />
        <Route path="projects/new" element={<RegisterProject />} />
        <Route path="users" element={<Users />} />
        <Route path="services" element={<Services />} />
        <Route path="services/new" element={<RegisterService />} />
        <Route path="vehicle" element={<Vehicle />} />
        <Route path="account" element={<Account />} />
      </Route>

      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
