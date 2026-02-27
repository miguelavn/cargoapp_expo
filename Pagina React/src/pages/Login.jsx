import React, { useMemo, useState } from 'react';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { supabase } from '../lib/supabaseClient.js';
import { isEmail } from '../shared/validation.js';
import loginImg from '../assets/login.png';
import logoCargo from '../assets/logoCargo.png';
import logoCargoMovil from '../assets/logoCargoMovil.png';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const redirectTo = useMemo(() => location.state?.from || '/', [location.state]);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const isValidEmail = isEmail(email);
  const isValidPassword = password.length >= 6;

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!isValidEmail) {
      setError('Correo no válido.');
      return;
    }
    if (!isValidPassword) {
      setError('La contraseña debe tener al menos 6 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (signInError) throw signInError;
      navigate(redirectTo, { replace: true });
    } catch (err) {
      setError(err?.message || 'No se pudo iniciar sesión');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="loginShell">
      <div className="loginSplit">
        <div className="loginFormCol">
          <div className="loginMobileHeader">
            <img className="loginLogo loginLogoMobile" src={logoCargoMovil} alt="CargoApp" />
          </div>
          <div className="loginFormWrap">
            <div className="loginTopBrand">
              <img className="loginLogo" src={logoCargo} alt="CargoApp" />
            </div>

            <div className="loginCard">
              <div className="loginCardTitle">Iniciar sesión</div>
              <div className="loginCardSubtitle">Accede con tu correo y contraseña.</div>

              <form onSubmit={onSubmit} className="loginForm">
                <div>
                  <label className="srOnly" htmlFor="login_email">Email</label>
                  <div className="inputRow">
                    <input
                      id="login_email"
                      className={`input ${email ? (isValidEmail ? 'inputOk' : 'inputBad') : ''}`}
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      inputMode="email"
                      autoComplete="email"
                    />
                    {isValidEmail ? <div className="inputAffix">✓</div> : null}
                  </div>
                </div>

                <div>
                  <label className="srOnly" htmlFor="login_password">Contraseña</label>
                  <div className="loginField">
                    <input
                      id="login_password"
                      className={`input ${password ? (isValidPassword ? 'inputOk' : 'inputBad') : ''}`}
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Contraseña"
                      autoComplete="current-password"
                    />

                    {password ? (
                      <button
                        className="loginEyeBtn"
                        type="button"
                        onClick={() => setShowPassword((p) => !p)}
                        aria-label={showPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                        title={showPassword ? 'Ocultar' : 'Ver'}
                      >
                        {showPassword ? (
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M2.1 3.51 3.5 2.1l18.4 18.4-1.41 1.41-2.38-2.38A11.8 11.8 0 0 1 12 21C7 21 2.73 17.89 1 13.5c.78-2 2.14-3.72 3.87-5.03L2.1 3.51Zm6.21 6.21a4 4 0 0 0 5.66 5.66l-1.3-1.3a2.2 2.2 0 0 1-3.06-3.06l-1.3-1.3Zm9.43 9.43-1.83-1.83A6 6 0 0 1 6.68 8.09L4.9 6.31A10.03 10.03 0 0 0 3.1 13.5C4.64 17.2 8.1 19.8 12 19.8c1.95 0 3.8-.62 5.74-1.45ZM12 5.2c5 0 9.27 3.11 11 7.5a13.43 13.43 0 0 1-2.59 4.02l-1.52-1.52A11.7 11.7 0 0 0 20.9 13.5C19.36 9.8 15.9 7.2 12 7.2c-.94 0-1.85.14-2.73.41L7.66 6A11.7 11.7 0 0 1 12 5.2Z"
                            />
                          </svg>
                        ) : (
                          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
                            <path
                              fill="currentColor"
                              d="M12 5.2c5 0 9.27 3.11 11 7.5-1.73 4.39-6 7.5-11 7.5S2.73 17.09 1 12.7c1.73-4.39 6-7.5 11-7.5Zm0 2C8.1 7.2 4.64 9.8 3.1 13.5c1.54 3.7 5 6.3 8.9 6.3s7.36-2.6 8.9-6.3c-1.54-3.7-5-6.3-8.9-6.3Zm0 2.3a4 4 0 1 1 0 8 4 4 0 0 1 0-8Zm0 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4Z"
                            />
                          </svg>
                        )}
                      </button>
                    ) : null}

                    {isValidPassword ? <div className="loginFieldAffix">✓</div> : null}
                  </div>
                </div>

                {error ? <div className="authError">{error}</div> : null}

                <div className="loginLinksRow">
                  <Link className="loginLink" to="/forgot-password">
                    ¿Olvidaste tu contraseña?
                  </Link>
                </div>

                <button className="btn btnPrimary loginSubmit" type="submit" disabled={loading}>
                  {loading ? 'Ingresando…' : 'Ingresar'}
                </button>
              </form>
            </div>

            <div className="loginFooterBtns">
              <a className="btn" href="mailto:soporte@cargoapp.com" style={{ textDecoration: 'none' }}>
                Soporte técnico
              </a>
              <a className="btn" href="https://cargoapp.com" target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>
                Visita nuestra web
              </a>
            </div>

          </div>
        </div>

        <div className="loginAside">
          <div className="loginAsideInner">
            <div className="loginAsideBadge">Panel de gestión</div>
            <div className="loginAsideTitle">Rápido, claro y productivo</div>
            <div className="loginAsideText">Mantén el control de tus órdenes, servicios y usuarios desde cualquier lugar.</div>
            <img className="loginAsideImage" src={loginImg} alt="Ilustración" />
          </div>
        </div>
      </div>
    </div>
  );
}
