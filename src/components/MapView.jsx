// src/components/MapView.jsx
import React, { useEffect, useRef, useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Circle, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: require("leaflet/dist/images/marker-icon-2x.png"),
  iconUrl: require("leaflet/dist/images/marker-icon.png"),
  shadowUrl: require("leaflet/dist/images/marker-shadow.png"),
});

function MapInit({ center, zoom, bounds }) {
  const map = useMap();
  useEffect(() => {
    if (!map) return;
    if (bounds && bounds.length === 2) {
      try {
        map.fitBounds(bounds, { padding: [40, 40] });
      } catch {
        map.setView([center.lat, center.lng], zoom);
      }
    } else {
      map.setView([center.lat, center.lng], zoom);
    }
  }, [map, center, zoom, bounds]);
  return null;
}

function createUserIcon(size = 22) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}"><circle cx="${size/2}" cy="${size/2}" r="${size/2 - 1}" fill="#1e90ff" stroke="#ffffff" stroke-width="2"/><circle cx="${size/2}" cy="${size/2}" r="${Math.max(2, Math.floor(size*0.22))}" fill="#e6f4ff"/></svg>`;
  return L.icon({
    iconUrl: "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg),
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    className: "user-location-icon",
  });
}

const userIcon = createUserIcon(26);

function makeSvgDataUrl({ color = "#0b78d1", size = 44, rotate = 0, label = "" }) {
  const s = size;
  const r = Math.round(s * 0.18);
  const circleR = Math.round(s * 0.33);
  const strokeW = Math.max(1, Math.round(s * 0.03));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}"><g transform="translate(${s/2},${s/2}) rotate(${rotate}) translate(${-s/2},${-s/2})"><path d="M ${s/2} ${s*0.08} A ${circleR} ${circleR} 0 1 1 ${s/2 - 0.001} ${s*0.08} Z" fill="${color}" stroke="#ffffff" stroke-width="${strokeW}" /><circle cx="${s/2}" cy="${s*0.36}" r="${r}" fill="#ffffff"/><circle cx="${s/2}" cy="${s*0.36}" r="${Math.max(1, r*0.6)}" fill="${color}"/><polygon points="${s/2 - 6},${s*0.80} ${s/2 + 6},${s*0.80} ${s/2},${s*0.96}" fill="${color}" />${label ? `<text x="${s/2}" y="${s*0.43}" font-size="${Math.max(8, s*0.12)}" text-anchor="middle" fill="#fff" font-family="Arial" font-weight="700">${label}</text>` : ""}</g></svg>`;
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function createIconFromSpec(spec) {
  const size = spec.size || 44;
  if (spec.imageUrl) {
    return L.icon({
      iconUrl: spec.imageUrl,
      iconSize: [size, size],
      iconAnchor: spec.anchor || [size / 2, Math.round(size * 0.92)],
      popupAnchor: spec.popupAnchor || [0, -Math.round(size * 0.9)],
      className: "custom-image-marker",
    });
  }
  const url = makeSvgDataUrl({ color: spec.color || "#0b78d1", size, rotate: spec.rotate || 0, label: spec.label || "" });
  return L.icon({
    iconUrl: url,
    iconSize: [size, size],
    iconAnchor: [size / 2, Math.round(size * 0.92)],
    popupAnchor: [0, -Math.round(size * 0.9)],
    className: "custom-svg-marker",
  });
}

async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&addressdetails=1&extratags=1&namedetails=1`;
  const referer = typeof window !== "undefined" && window.location ? window.location.origin : "";
  const resp = await fetch(url, { headers: { "Accept-Language": "ru", Referer: referer } });
  if (!resp.ok) throw new Error(`Geocode failed: ${resp.status}`);
  return resp.json();
}

function formatAddress(data) {
  if (!data) return [];
  const addr = data.address || {};
  const rows = [];
  if (addr.road) rows.push({ label: "Улица", value: addr.road });
  if (addr.house_number) rows.push({ label: "Номер", value: addr.house_number });
  if (addr.city) rows.push({ label: "Город", value: addr.city });
  if (addr.postcode) rows.push({ label: "Индекс", value: addr.postcode });
  if (addr.country) rows.push({ label: "Страна", value: addr.country });
  if (data.display_name) rows.push({ label: "Полный адрес", value: data.display_name });
  return rows;
}

const MapView = ({
  vehicles = [],
  center = { lat: 52.0, lng: 19.0 },
  zoom = 6,
  initialBounds = null,
  onMapLoad = null,
  highlightId = null,
  customIcons = {},
  defaultColor = "#0b78d1",
  animateDuration = 600,
  showUserLocation = true,
  watchUser = true,
  centerOnUser = false,
}) => {
  const markerRefs = useRef({});
  const prevPositions = useRef({});
  const addressesRef = useRef({});
  const iconsCache = useRef({});
  const [, tick] = useState(0);
  const mapInstanceRef = useRef(null);
  const geowatchIdRef = useRef(null);

  const [userPos, setUserPos] = useState(null);
  const [, setUserError] = useState(null);

  const handleWhenCreated = (mapInstance) => {
    mapInstanceRef.current = mapInstance;
    if (typeof onMapLoad === "function") onMapLoad(mapInstance);
  };

  const getIconForVehicle = (v) => {
    const keysToTry = [String(v.rawId ?? ""), String(v.id ?? ""), String(v.name ?? ""), String(v.source ?? "")];
    let spec = null;
    for (const k of keysToTry) {
      if (!k) continue;
      if (customIcons && Object.prototype.hasOwnProperty.call(customIcons, k)) {
        spec = customIcons[k];
        break;
      }
    }
    if (!spec && v.color) spec = { color: v.color, size: 44, label: v.name ? String(v.name).slice(0, 2).toUpperCase() : "" };
    if (!spec) {
      const color = v.source === "A" ? "#1e90ff" : v.source === "B" ? "#e11d48" : defaultColor;
      spec = { color, size: 44, label: v.name ? String(v.name).slice(0, 2).toUpperCase() : "" };
    }
    const specKey = JSON.stringify(spec);
    if (!iconsCache.current[specKey]) iconsCache.current[specKey] = createIconFromSpec(spec);
    return iconsCache.current[specKey];
  };

  const setMarkerRef = (id) => (ref) => {
    if (!ref) {
      const entry = markerRefs.current[id];
      if (entry && entry.anim && entry.anim.rafId) cancelAnimationFrame(entry.anim.rafId);
      delete markerRefs.current[id];
      return;
    }
    markerRefs.current[id] = markerRefs.current[id] || {};
    markerRefs.current[id].marker = ref;
  };

  const animateMarkerTo = (id, fromPos, toPos, duration) => {
    const entry = markerRefs.current[id];
    if (!entry || !entry.marker) return;
    if (entry.anim && entry.anim.rafId) cancelAnimationFrame(entry.anim.rafId);
    const start = performance.now();
    const anim = { start, from: fromPos, to: toPos, rafId: null };
    const step = (now) => {
      const t = Math.min(1, (now - anim.start) / duration);
      const lat = anim.from.lat + (anim.to.lat - anim.from.lat) * t;
      const lng = anim.from.lng + (anim.to.lng - anim.from.lng) * t;
      try {
        const m = entry.marker;
        if (m && typeof m.setLatLng === "function") m.setLatLng([lat, lng]);
      } catch {}
      if (t < 1) {
        anim.rafId = requestAnimationFrame(step);
        entry.anim = anim;
      } else {
        entry.anim = null;
      }
    };
    anim.rafId = requestAnimationFrame(step);
    entry.anim = anim;
  };

  useEffect(() => {
    const incoming = {};
    vehicles.forEach((v) => {
      if (Number.isFinite(v.lat) && Number.isFinite(v.lng) && v.id != null) incoming[v.id] = { lat: v.lat, lng: v.lng };
    });

    Object.keys(incoming).forEach((id) => {
      const toPos = incoming[id];
      const prev = prevPositions.current[id];
      let fromPos = prev;
      if (!fromPos && markerRefs.current[id] && markerRefs.current[id].marker && typeof markerRefs.current[id].marker.getLatLng === "function") {
        try {
          const ll = markerRefs.current[id].marker.getLatLng();
          fromPos = { lat: ll.lat, lng: ll.lng };
        } catch {
          fromPos = toPos;
        }
      }
      if (!fromPos) fromPos = toPos;
      const changed = fromPos.lat !== toPos.lat || fromPos.lng !== toPos.lng;
      if (changed) animateMarkerTo(id, fromPos, toPos, animateDuration);
      else {
        const entry = markerRefs.current[id];
        if (entry && entry.marker && typeof entry.marker.setLatLng === "function") {
          try {
            entry.marker.setLatLng([toPos.lat, toPos.lng]);
          } catch {}
        }
      }
      prevPositions.current[id] = { lat: toPos.lat, lng: toPos.lng };
    });

    Object.keys(prevPositions.current).forEach((id) => {
      if (!incoming[id]) {
        const entry = markerRefs.current[id];
        if (entry && entry.anim && entry.anim.rafId) cancelAnimationFrame(entry.anim.rafId);
        delete prevPositions.current[id];
      }
    });

    tick((n) => n + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vehicles]);

  const fetchAddressFor = async (id, lat, lng) => {
    const cache = addressesRef.current[id];
    const now = Date.now();
    if (cache && cache.loading) return;
    if (cache && cache.data && now - (cache.fetchedAt || 0) < 30000) return;
    addressesRef.current[id] = { loading: true, data: null, error: null, fetchedAt: null };
    tick((n) => n + 1);
    try {
      const json = await reverseGeocode(lat, lng);
      addressesRef.current[id] = { loading: false, data: json, error: null, fetchedAt: Date.now() };
    } catch (err) {
      addressesRef.current[id] = { loading: false, data: null, error: err.message || String(err), fetchedAt: Date.now() };
    }
    tick((n) => n + 1);
  };

  useEffect(() => {
    if (!showUserLocation) return;
    if (!("geolocation" in navigator)) {
      setUserError("Геолокация недоступна в этом браузере");
      return;
    }
    setUserError(null);

    const onSuccess = (pos) => {
      const coords = pos.coords;
      setUserPos({
        lat: coords.latitude,
        lng: coords.longitude,
        accuracy: coords.accuracy,
        timestamp: pos.timestamp || Date.now(),
      });
      if (centerOnUser && mapInstanceRef.current) {
        try {
          mapInstanceRef.current.flyTo([coords.latitude, coords.longitude], Math.max(mapInstanceRef.current.getZoom(), 13), { duration: 0.9 });
        } catch {}
      }
    };

    const onError = (err) => {
      let msg = "";
      switch (err.code) {
        case err.PERMISSION_DENIED:
          msg = "Отказано в доступе к геолокации";
          break;
        case err.POSITION_UNAVAILABLE:
          msg = "Позиция недоступна";
          break;
        case err.TIMEOUT:
          msg = "Превышено время ожидания геолокации";
          break;
        default:
          msg = err.message || "Неизвестная ошибка геолокации";
      }
      setUserError(msg);
    };

    const geoOptions = { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 };

    if (watchUser) {
      const id = navigator.geolocation.watchPosition(onSuccess, onError, geoOptions);
      geowatchIdRef.current = id;
      navigator.geolocation.getCurrentPosition(onSuccess, onError, geoOptions);
    } else {
      navigator.geolocation.getCurrentPosition(onSuccess, onError, geoOptions);
    }

    return () => {
      if (geowatchIdRef.current != null) {
        navigator.geolocation.clearWatch(geowatchIdRef.current);
        geowatchIdRef.current = null;
      }
    };
  }, [showUserLocation, watchUser, centerOnUser]);

  const openRouteTo = (destLat, destLng, travelMode = "driving") => {
    const openWithOrigin = (originLat, originLng) => {
      const base = "https://www.google.com/maps/dir/?api=1";
      const params = `&origin=${encodeURIComponent(originLat + "," + originLng)}&destination=${encodeURIComponent(destLat + "," + destLng)}&travelmode=${encodeURIComponent(travelMode)}`;
      window.open(base + params, "_blank");
    };

    if (userPos && Number.isFinite(userPos.lat) && Number.isFinite(userPos.lng)) {
      openWithOrigin(userPos.lat, userPos.lng);
      return;
    }

    if (!("geolocation" in navigator)) {
      alert("Геолокация недоступна в этом браузере. Невозможно проложить маршрут.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = pos.coords;
        setUserPos({ lat: c.latitude, lng: c.longitude, accuracy: c.accuracy, timestamp: pos.timestamp || Date.now() });
        openWithOrigin(c.latitude, c.longitude);
      },
      (err) => {
        let msg = "";
        switch (err.code) {
          case err.PERMISSION_DENIED:
            msg = "Отказано в доступе к геолокации. Разрешите доступ и попробуйте снова.";
            break;
          case err.POSITION_UNAVAILABLE:
            msg = "Позиция недоступна.";
            break;
          case err.TIMEOUT:
            msg = "Превышено время ожидания геолокации.";
            break;
          default:
            msg = err.message || "Ошибка геолокации.";
        }
        alert(msg);
      },
      { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
  };

  useEffect(() => {
    if (!highlightId) return;
    let entry = markerRefs.current[highlightId];
    let foundVehicle = null;
    if (!entry) {
      foundVehicle = vehicles.find((v) =>
        String(v.id) === String(highlightId) ||
        String(v.rawId) === String(highlightId) ||
        (v.imei != null && String(v.imei) === String(highlightId)) ||
        (v.name && String(v.name).includes(String(highlightId)))
      );
      if (foundVehicle) entry = markerRefs.current[foundVehicle.id];
    }

    if (entry && entry.marker && typeof entry.marker.openPopup === "function") {
      try {
        entry.marker.openPopup();
      } catch {}
    } else if (foundVehicle && foundVehicle.lat != null && foundVehicle.lng != null && mapInstanceRef.current) {
      try {
        mapInstanceRef.current.flyTo([foundVehicle.lat, foundVehicle.lng], Math.max(mapInstanceRef.current.getZoom(), 13), { duration: 0.8 });
      } catch {}
    }
  }, [highlightId, vehicles]);

  return (
    <MapContainer center={[center.lat, center.lng]} zoom={zoom} style={{ height: "100%", width: "100%" }} whenCreated={handleWhenCreated}>
      <MapInit center={center} zoom={zoom} bounds={initialBounds} />
      <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a> участники' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />

      {vehicles.map((v) => {
        if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng) || v.id == null) return null;
        const icon = getIconForVehicle(v);
        const addrState = addressesRef.current[v.id] || { loading: false, data: null, error: null };

        return (
          <Marker key={v.id} position={[v.lat, v.lng]} ref={setMarkerRef(v.id)} icon={icon} eventHandlers={{ click: () => fetchAddressFor(v.id, v.lat, v.lng) }}>
            <Popup minWidth={260}>
              <div style={{ fontFamily: "Inter, system-ui, sans-serif", color: "#0b1220" }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 6 }}>{v.name || "Техника"}</div>
                <div style={{ fontSize: 13, color: "#374151" }}>{v.desc || ""}</div>

                <div style={{ marginTop: 8, fontSize: 13 }}>
                  <strong>Координаты:</strong> {Number(v.lat).toFixed(6)}, {Number(v.lng).toFixed(6)}
                </div>

                <div style={{ marginTop: 8 }}>
                  <strong>Адрес:</strong>
                  <div style={{ marginTop: 6, fontSize: 13 }}>
                    {addrState.loading && <div>Определение адреса...</div>}
                    {addrState.error && <div style={{ color: "#b91c1c" }}>Ошибка: {addrState.error}</div>}
                    {!addrState.loading && addrState.data && (
                      <div>
                        {formatAddress(addrState.data).map((row, i) => (
                          <div key={i} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 12, color: "#6b7280" }}>{row.label}</div>
                            <div style={{ fontSize: 14, color: "#0b1220", fontWeight: 600 }}>{row.value}</div>
                          </div>
                        ))}
                      </div>
                    )}
                    {!addrState.loading && !addrState.data && !addrState.error && <div style={{ color: "#6b7280" }}>Нажмите маркер для загрузки полного адреса</div>}
                  </div>
                </div>

                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button
                    onClick={() => openRouteTo(v.lat, v.lng, "driving")}
                    style={{
                      background: "#1e90ff",
                      color: "#fff",
                      border: "none",
                      borderRadius: 6,
                      padding: "8px 10px",
                      cursor: "pointer",
                      fontWeight: 700,
                      boxShadow: "0 4px 10px rgba(30,144,255,0.15)",
                    }}
                  >
                    Проложить маршрут
                  </button>
                </div>
              </div>
            </Popup>
          </Marker>
        );
      })}

      {showUserLocation && userPos && (
        <>
          <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}>
            <Popup minWidth={180}>
              <div style={{ fontWeight: 700 }}>Вы здесь</div>
              <div style={{ marginTop: 6 }}>Точность: {userPos.accuracy ? `${Math.round(userPos.accuracy)} м` : "—"}</div>
              <div style={{ marginTop: 6, fontSize: 12, color: "#555" }}>Обновлено: {new Date(userPos.timestamp || Date.now()).toLocaleString()}</div>
            </Popup>
          </Marker>

          {typeof userPos.accuracy === "number" && (
            <Circle center={[userPos.lat, userPos.lng]} radius={userPos.accuracy} pathOptions={{ color: "#1e90ff", opacity: 0.18, fillOpacity: 0.06 }} />
          )}
        </>
      )}
    </MapContainer>
  );
};

export default MapView;
