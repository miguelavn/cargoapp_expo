import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { isStrongPassword } from '../../shared/validation.js';
import { getFunctionsBaseUrl } from '../../lib/functionsBaseUrl.js';
import resetPasswordImg from '../../assets/resetPassword.png';

export default function VerifyCode() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const email = useMemo(() => searchParams.get('email') || '', [searchParams]);
  const functionsBase = useMemo(() => getFunctionsBaseUrl(), []);

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);

  const isValidCode = code.trim().length === 6;
  const isValidPassword = isStrongPassword(newPassword);
  const passwordsMatch = isValidPassword && confirmPassword.length > 0 && newPassword === confirmPassword;

  useEffect(() => {
    if (resendTimer <= 0) return;
    const id = setInterval(() => setResendTimer((t) => t - 1), 1000);
    return () => clearInterval(id);
  }, [resendTimer]);

  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');

    if (!email) return setError('Falta el correo (email).');
    if (!isValidCode) return setError('El código debe tener 6 dígitos.');
    if (!isValidPassword) return setError('La contraseña debe tener mín. 8 caracteres, 1 mayúscula y 1 número.');
    if (!passwordsMatch) return setError('Las contraseñas no coinciden.');
    if (!functionsBase) return setError('No está configurada la URL de Supabase Functions.');

    setLoading(true);
    try {
      const resp = await fetch(`${functionsBase}/verify-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, code, newPassword }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Error al verificar código');

      navigate('/password-reset-success', { replace: true });
    } catch (err) {
      setError(err?.message || 'No se pudo verificar el código');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setError('');
    if (resendTimer > 0) return;
    if (!email) return setError('Falta el correo (email).');
    if (!functionsBase) return setError('No está configurada la URL de Supabase Functions.');

    try {
      const resp = await fetch(`${functionsBase}/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'No se pudo reenviar el código');
      setResendTimer(60);
    } catch (err) {
      setError(err?.message || 'No se pudo reenviar el código');
    }
  };

  return (
    <div className="authShell">
      <div className="authHeader">
        <img className="authHeaderImage" src={resetPasswordImg} alt="Verificar código" />
      </div>

      <div className="authBody">
        <div className="authCard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Verificar código</div>
            <Link className="btn" to="/forgot-password" style={{ textDecoration: 'none' }}>
              Volver
            </Link>
          </div>

          <div style={{ color: 'var(--color-muted)', marginTop: 8 }}>
            Ingresa el código que enviamos a tu correo y define tu nueva contraseña.
          </div>

          <form onSubmit={handleVerify} style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Correo</div>
              <input className="input" value={email} disabled readOnly style={{ background: '#F3F4F6' }} />
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Código</div>
              <input
                className="input"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D+/g, '').slice(0, 6))}
                placeholder="Código de 6 dígitos"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
              />
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Nueva contraseña</div>
              <div className="passwordRow">
                <input
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Nueva contraseña"
                  autoComplete="new-password"
                />
                <button className="btn" type="button" onClick={() => setShowPassword((p) => !p)}>
                  {showPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
              <div style={{ color: 'var(--color-muted)', fontSize: 12, marginTop: 6 }}>
                Mín. 8 caracteres, 1 mayúscula y 1 número.
              </div>
            </div>

            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Confirmar contraseña</div>
              <div className="passwordRow">
                <input
                  className="input"
                  type={showConfirmPassword ? 'text' : 'password'}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Confirmar contraseña"
                  autoComplete="new-password"
                />
                <button className="btn" type="button" onClick={() => setShowConfirmPassword((p) => !p)}>
                  {showConfirmPassword ? 'Ocultar' : 'Ver'}
                </button>
              </div>
            </div>

            {error ? <div className="authError">{error}</div> : null}

            <button className="btn btnPrimary" type="submit" disabled={loading}>
              {loading ? 'Verificando…' : 'Confirmar'}
            </button>

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 6 }}>
              <div style={{ color: 'var(--color-muted)' }}>¿No recibiste el código?</div>
              <button className="btn" type="button" onClick={handleResend} disabled={resendTimer > 0}>
                {resendTimer > 0 ? `Reenviar en ${resendTimer}s` : 'Reenviar código'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
