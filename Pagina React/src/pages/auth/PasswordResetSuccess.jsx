import React from 'react';
import { Link } from 'react-router-dom';
import resetPasswordImg from '../../assets/resetPassword.png';

export default function PasswordResetSuccess() {
  return (
    <div className="authShell">
      <div className="authHeader">
        <img className="authHeaderImage" src={resetPasswordImg} alt="Contraseña cambiada" />
      </div>

      <div className="authBody">
        <div className="authCard" style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: 900, fontSize: 22 }}>¡Contraseña cambiada!</div>
          <div style={{ color: 'var(--color-muted)', marginTop: 10 }}>
            Ya puedes iniciar sesión con tu nueva contraseña.
          </div>

          <div style={{ marginTop: 14 }}>
            <Link className="btn btnPrimary" to="/login" style={{ textDecoration: 'none', display: 'inline-block' }}>
              Ir a Iniciar Sesión
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
