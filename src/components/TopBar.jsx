import { useEffect, useState } from 'react';
import { Gear, Isotipo, Sync, User } from './Icons.jsx';
import { useFrame } from '../lib/useFrame.js';

function MasterMeter({ transport }) {
  const [level, setLevel] = useState(0);
  useFrame(() => {
    const target = transport.getMasterLevel ? Math.min(1, transport.getMasterLevel()) : 0;
    setLevel((l) => (target > l ? target : l + (target - l) * 0.15));
  });
  const segs = 24;
  return (
    <div className="master-meter" title="Master">
      <span>Master</span>
      <div className="meter-row">
        {Array.from({ length: 2 }).map((_, row) => (
          <div key={row} className="meter-line">
            {Array.from({ length: segs }).map((__, i) => {
              const on = i / segs < level * (row ? 0.97 : 1);
              const cls = i > segs * 0.88 ? 'hot' : i > segs * 0.72 ? 'warm' : '';
              return <i key={i} className={`${cls} ${on ? 'on' : ''}`} />;
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function Clock() {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 10_000);
    return () => clearInterval(id);
  }, []);
  return <span className="clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })}</span>;
}

export default function TopBar({ transport, mode, onModeChange, onSettings }) {
  return (
    <header className="topbar">
      <div className="topbar-left">
        <div className="traffic-space" />
        <div className="mode-switch" role="tablist" aria-label="Modo">
          {['lite', 'pro'].map((m) => (
            <button key={m} className={mode === m ? 'active' : ''} onClick={() => onModeChange(m)}>
              {m === 'lite' ? 'Essential' : 'Pro'}
            </button>
          ))}
        </div>
      </div>
      <div className="brand" title="B2B · Back to back">
        <Isotipo size={20} className="brand-glyph" />
        <span className="brand-name">B2B</span>
        <span className="brand-sub">Back to back</span>
      </div>
      <div className="topbar-right">
        <MasterMeter transport={transport} />
        <button className="icon-btn" title="Sincronizar librería"><Sync /></button>
        <button className="text-btn">Help ▾</button>
        <button className="icon-btn" title="Ajustes" onClick={onSettings}><Gear /></button>
        <button className="icon-btn" title="Cuenta"><User /></button>
        <Clock />
      </div>
    </header>
  );
}
