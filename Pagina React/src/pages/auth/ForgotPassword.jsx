import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { isEmail } from '../../shared/validation.js';
import { getFunctionsBaseUrl } from '../../lib/functionsBaseUrl.js';
import resetPasswordImg from '../../assets/resetPassword.png';

export default function ForgotPassword() {
  const navigate = useNavigate();
  const functionsBase = useMemo(() => getFunctionsBaseUrl(), []);

  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleRequest = async (e) => {
    e.preventDefault();
    setError('');

    if (!isEmail(email)) {
      setError('Por favor ingresa un correo válido.');
      return;
    }
    if (!functionsBase) {
      setError('No está configurada la URL de Supabase Functions.');
      return;
    }

    setLoading(true);
    try {
      const resp = await fetch(`${functionsBase}/request-password-reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });

      const data = await resp.json().catch(() => ({}));
      if (!resp.ok) throw new Error(data.error || 'Error al enviar código');

      navigate(`/verify-code?email=${encodeURIComponent(email.trim())}`, { replace: true });
    } catch (err) {
      setError(err?.message || 'No se pudo enviar el código');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="authShell">
      <div className="authHeader">
        <img className="authHeaderImage" src={resetPasswordImg} alt="Recuperar contraseña" />
      </div>

      <div className="authBody">
        <div className="authCard">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ fontWeight: 900, fontSize: 20 }}>Recuperar contraseña</div>
            <Link className="btn" to="/login" style={{ textDecoration: 'none' }}>
              Volver
            </Link>
          </div>

          <div style={{ color: 'var(--color-muted)', marginTop: 8 }}>
            Ingresa tu correo y te enviaremos un código para restablecer tu contraseña.
          </div>

          <form onSubmit={handleRequest} style={{ display: 'grid', gap: 10, marginTop: 14 }}>
            <div>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Correo</div>
              <input
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Correo electrónico"
                inputMode="email"
                autoComplete="email"
              />
            </div>

            {error ? <div className="authError">{error}</div> : null}

            <button className="btn btnPrimary" type="submit" disabled={loading}>
              {loading ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>

          <div style={{ marginTop: 12, color: 'var(--color-muted)', fontSize: 13 }}>
            Si no tienes configurado el dominio de functions, define <code>VITE_SUPABASE_FUNCTIONS_URL</code>.
          </div>
        </div>
      </div>
    </div>
  );
}
