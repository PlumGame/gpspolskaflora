// src/components/AddTracker.jsx
import React, { useState } from "react";

/**
 * Форма принимает IMEI, пароль и отображаемое имя (label).
 * По submit вызывает onAddAccount({ imei, password, label }).
 */
const AddTracker = ({ onAddAccount }) => {
  const [imei, setImei] = useState("");
  const [password, setPassword] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState(null);

  const submit = (e) => {
    e.preventDefault();
    setError(null);

    if (!imei || imei.trim().length === 0) {
      setError("Введите IMEI.");
      return;
    }
    if (!password || password.trim().length === 0) {
      setError("Введите пароль.");
      return;
    }
    if (!label || label.trim().length === 0) {
      setError("Введите отображаемое имя.");
      return;
    }

    onAddAccount({ imei: imei.trim(), password: password.trim(), label: label.trim() });

    setImei("");
    setPassword("");
    setLabel("");
  };

  return (
    <form onSubmit={submit} style={{ border: "1px solid #ddd", padding: 12, borderRadius: 6, maxWidth: 520, margin: "12px auto" }}>
      <h3 style={{ margin: "0 0 8px 0", textAlign: "center" }}>Добавить трекер (IMEI)</h3>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block", fontSize: 13 }}>IMEI</label>
        <input value={imei} onChange={(e) => setImei(e.target.value)} style={{ width: "100%" }} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block", fontSize: 13 }}>Пароль</label>
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ width: "100%" }} />
      </div>

      <div style={{ marginBottom: 8 }}>
        <label style={{ display: "block", fontSize: 13 }}>Отображаемое имя</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)} style={{ width: "100%" }} />
      </div>

      {error && <div style={{ color: "crimson", marginBottom: 8 }}>{error}</div>}

      <div style={{ textAlign: "center" }}>
        <button type="submit" style={{ padding: "8px 12px" }}>
          Добавить трекер
        </button>
      </div>
    </form>
  );
};

export default AddTracker;
