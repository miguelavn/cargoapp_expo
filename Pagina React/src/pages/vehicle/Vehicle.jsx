import React from 'react';

export default function Vehicle() {
  return (
    <div className="container">
      <div className="card" style={{ textAlign: 'center' }}>
        <div style={{ fontWeight: 900, fontSize: 18 }}>Vehículo</div>
        <div style={{ marginTop: 8, color: 'var(--color-muted)' }}>Vehículo (próximamente)</div>
      </div>
    </div>
  );
}
