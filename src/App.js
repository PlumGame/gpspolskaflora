// src/App.js
import React, { useEffect, useState, useRef, useCallback } from "react";
import MapView from "./components/MapView";
import AddTracker from "./components/AddTracker";
import Overlay from "./components/Overlay";
import FloatingMenu from "./components/FloatingMenu";
import { loginWhatsGPS, getVehicleStatus } from "./services/whatsgps";
import "./overlay.css";

import { loadTrackers, saveTrackersArray } from "./services/supabaseClient";

const REFRESH_INTERVAL = 15000;
const POLAND_CENTER = { lat: 52.0, lng: 19.0 };
const POLAND_ZOOM = 6;
const POLAND_BOUNDS = [
  [49.0, 14.0],
  [55.1, 24.2],
];

function normalizeStatus(statusArray, sourceLabel) {
  if (!Array.isArray(statusArray)) return [];
  return statusArray.map((s) => ({
    id: `${sourceLabel}::${s.carId}`,
    rawId: s.carId,
    source: sourceLabel,
    name: s.machineName || s.carNO || sourceLabel || `Car ${s.carId}`,
    lat: Number(s.lat ?? s.latc ?? s.latitude ?? null),
    lng: Number(s.lon ?? s.lonc ?? s.longitude ?? null),
    desc: `speed: ${s.speed || 0} km/h`,
    imei: s.imei ?? s.IMIE ?? s.deviceId ?? null,
    heading: s.direction ?? s.course ?? s.heading ?? null,
  }));
}

export default function App() {
  const [vehicles, setVehicles] = useState([]);
  const [dynamicAccounts, setDynamicAccounts] = useState([]); // { imei,label,password,color,authRef }
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [overlayOpen, setOverlayOpen] = useState(false);
  const [selectedTracker, setSelectedTracker] = useState(null);

  const authA = useRef({ token: null, userId: null });
  const authB = useRef({ token: null, userId: null });
  const mapRef = useRef(null);

  // Load trackers from Supabase on start
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await loadTrackers();
        if (!mounted) return;
        const prepared = rows.map((r) => ({ ...r, authRef: { current: { token: null, userId: null } } }));
        setDynamicAccounts(prepared);
      } catch (e) {
        console.error("Failed to load trackers from Supabase", e);
        setDynamicAccounts([]);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  // Save dynamicAccounts to Supabase on change (debounced)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const toSave = dynamicAccounts.map(({ authRef, id, created_at, ...rest }) => rest);
        if (toSave.length === 0) {
          // optional: clear table
          await saveTrackersArray([]);
        } else {
          await saveTrackersArray(toSave);
        }
      } catch (e) {
        console.error("Failed to save trackers to Supabase", e);
      }
    }, 600);
    return () => clearTimeout(timer);
  }, [dynamicAccounts]);

  const fetchForAccount = useCallback(async (username, password, authRef, sourceLabel) => {
    if (!username || !password) return { success: true, data: [] };
    try {
      if (!authRef.current.token || !authRef.current.userId) {
        const loginData = await loginWhatsGPS(username, password);
        if (!loginData || !loginData.token || !loginData.userId) {
          return { success: false, data: [], msg: `Ошибка входа ${sourceLabel}: неожиданный ответ` };
        }
        authRef.current.token = loginData.token;
        authRef.current.userId = loginData.userId;
      }
      const { token, userId } = authRef.current;
      const status = await getVehicleStatus(token, userId);
      return { success: true, data: normalizeStatus(status, sourceLabel) };
    } catch (err) {
      const errMsg = err && err.response && err.response.data ? JSON.stringify(err.response.data) : (err && err.message) || String(err);
      if (/login|登录|参数不能为空|C05/i.test(errMsg)) authRef.current = { token: null, userId: null };
      return { success: false, data: [], msg: `Ошибка ${sourceLabel}: ${errMsg}` };
    }
  }, []);

  const handleAddAccount = (account) => {
    setDynamicAccounts((prev) => {
      const filtered = prev.filter((a) => a.label !== account.label);
      return [...filtered, { ...account, authRef: { current: { token: null, userId: null } } }];
    });
    setOverlayOpen(false);
  };

  const handleRemoveAccount = (label) => {
    setDynamicAccounts((prev) => prev.filter((a) => a.label !== label));
    if (String(selectedTracker) === String(label)) setSelectedTracker(null);
  };

  useEffect(() => {
    let mounted = true;
    let intervalId = null;

    const fetchAll = async () => {
      setLoading(true);
      setError(null);

      const staticPromises = [
        fetchForAccount(process.env.REACT_APP_WHATSGPS_LOGIN_A, process.env.REACT_APP_WHATSGPS_PASS_A, authA, "A"),
        fetchForAccount(process.env.REACT_APP_WHATSGPS_LOGIN_B, process.env.REACT_APP_WHATSGPS_PASS_B, authB, "B"),
      ];

      const dynamicPromises = dynamicAccounts.map((acc) =>
        fetchForAccount(acc.imei, acc.password, acc.authRef ?? { current: { token: null, userId: null } }, acc.label)
      );

      const results = await Promise.all([...staticPromises, ...dynamicPromises]);

      if (!mounted) return;

      const allData = results.reduce((acc, res) => {
        if (res && Array.isArray(res.data)) acc.push(...res.data);
        return acc;
      }, []);

      setVehicles(allData);

      const errors = results.filter((r) => r && !r.success && r.msg).map((r) => r.msg);
      setError(errors.length > 0 ? errors.join(" | ") : null);
      setLoading(false);
    };

    fetchAll();
    intervalId = setInterval(fetchAll, REFRESH_INTERVAL);

    return () => {
      mounted = false;
      if (intervalId) clearInterval(intervalId);
    };
  }, [fetchForAccount, dynamicAccounts]);

  const legend = [
    { label: "Техника — текущая позиция", color: "#1e90ff" },
    { label: "Техника — последний трек", color: "#60a5fa" },
    { label: "Ожидание / офлайн", color: "#f97316" },
    { label: "Ошибка / сигнал отсутствует", color: "#ef4444" },
    { label: "Ручной маркер / пользовательский", color: "#10b981" },
  ];

  const handleMapLoad = (mapInstance) => {
    mapRef.current = mapInstance;
  };

  const buildCustomIcons = () => {
    const map = {};
    dynamicAccounts.forEach((a) => {
      const keyImei = a.imei != null ? String(a.imei) : null;
      const keyLabel = a.label != null ? String(a.label) : null;
      const spec = { color: a.color || undefined, size: 48, label: (a.label || "").slice(0, 2).toUpperCase() };
      if (keyImei) map[keyImei] = spec;
      if (keyLabel) map[keyLabel] = spec;
    });
    return map;
  };
  const customIcons = buildCustomIcons();

  const focusVehicle = (payload) => {
    const identifierObj = payload && typeof payload === "object" ? payload : { label: payload, imei: payload };
    const { label, imei } = identifierObj;
    const selectedKey = label ?? imei ?? String(payload);
    setSelectedTracker(selectedKey);

    let found = null;
    found = vehicles.find((v) => v.id != null && (String(v.id) === String(label) || String(v.id) === String(imei)));

    if (!found && imei) {
      found = vehicles.find((v) => (v.rawId != null && String(v.rawId) === String(imei)) || (v.imei != null && String(v.imei) === String(imei)));
    }

    if (!found && label) {
      found = vehicles.find((v) => (v.name && String(v.name) === String(label)) || (v.name && String(v.name).includes(String(label))));
    }

    if (!found && label) {
      const acc = dynamicAccounts.find((a) => a.label === label);
      if (acc && acc.imei) {
        found = vehicles.find((v) => (v.rawId != null && String(v.rawId) === String(acc.imei)) || (v.imei != null && String(v.imei) === String(acc.imei)));
      }
    }

    if (!found && imei) {
      found = vehicles.find((v) => (v.name && String(v.name).includes(String(imei))) || (v.rawId != null && String(v.rawId).includes(String(imei))));
    }

    if (found && Number.isFinite(found.lat) && Number.isFinite(found.lng) && mapRef.current) {
      const currentZoom = typeof mapRef.current.getZoom === "function" ? mapRef.current.getZoom() : POLAND_ZOOM;
      const targetZoom = Math.max(currentZoom, 13);
      try {
        mapRef.current.flyTo([found.lat, found.lng], targetZoom, { duration: 0.8 });
      } catch (e) {
        try {
          mapRef.current.setView([found.lat, found.lng], targetZoom);
        } catch {}
      }
      setSelectedTracker(found.id);
    } else {
      setSelectedTracker(selectedKey);
    }
  };

  return (
    <div style={{ position: "relative", height: "100vh", width: "100vw", overflow: "hidden" }}>
      <FloatingMenu
        onOpenAdd={() => setOverlayOpen(true)}
        dynamicAccounts={dynamicAccounts}
        onRemoveAccount={handleRemoveAccount}
        legend={legend}
        onFocus={focusVehicle}
        selected={selectedTracker}
      />

      {overlayOpen && (
        <Overlay title="Добавить трекер" onClose={() => setOverlayOpen(false)}>
          <AddTracker onAddAccount={handleAddAccount} />
        </Overlay>
      )}

      {loading && <div style={{ position: "absolute", top: 12, left: 12, zIndex: 4800, color: "#fff" }}>Загрузка данных...</div>}

      {error && (
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 4800, color: "crimson" }}>
          <strong>Ошибка:</strong> {error}
        </div>
      )}

      <div style={{ height: "100%", width: "100%" }}>
        <MapView
          vehicles={vehicles}
          center={POLAND_CENTER}
          zoom={POLAND_ZOOM}
          initialBounds={POLAND_BOUNDS}
          onMapLoad={handleMapLoad}
          highlightId={selectedTracker}
          customIcons={customIcons}
          showUserLocation={true}
          watchUser={true}
        />
      </div>
    </div>
  );
}
