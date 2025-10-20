// src/components/FloatingMenu.jsx
import React, { useState, useEffect } from "react";
import "./floating-menu.css";

const FloatingMenu = ({
  onOpenAdd,
  dynamicAccounts = [],
  onRemoveAccount = () => {},
  legend = [],
  onFocus = () => {},
  selected = null,
}) => {
  const [open, setOpen] = useState(false);
  const [localSelected, setLocalSelected] = useState(selected);

  useEffect(() => {
    setLocalSelected(selected);
  }, [selected]);

  const handleClickItem = (a) => {
    const payload = { label: a.label ?? null, imei: a.imei ?? null };
    setLocalSelected(payload.label ?? payload.imei);
    if (typeof onFocus === "function") onFocus(payload);
  };

  return (
    <aside className={`fm-wrapper ${open ? "fm-open" : "fm-closed"}`} aria-label="Меню трекеров">
      <div className="fm-top-row">
        <button className="fm-btn fm-toggle" onClick={() => setOpen((s) => !s)} aria-label={open ? "Скрыть меню" : "Открыть меню"}>
          {open ? "←" : "☰"}
        </button>

        <div className="fm-actions">
          <button className="fm-btn fm-add" onClick={onOpenAdd} aria-label="Добавить трекер">＋</button>
        </div>
      </div>

      <div className="fm-content" aria-hidden={!open}>
        <div className="fm-section">
          <div className="fm-section-title">Трекеры</div>

          {dynamicAccounts.length === 0 ? (
            <div className="fm-empty">Нет добавленных</div>
          ) : (
            <ul className="fm-list">
              {dynamicAccounts.map((a) => {
                const focusId = a.imei ?? a.label;
                const isSelected = String(localSelected) === String(focusId);
                return (
                  <li className={`fm-item ${isSelected ? "fm-item-selected" : ""}`} key={a.label}>
                    <div className="fm-item-left" style={{ cursor: "pointer" }} onClick={() => handleClickItem(a)}>
                      <span className="fm-dot" style={{ background: a.color || "#0b78d1" }} />
                      <div className="fm-meta">
                        <div className="fm-label">{a.label}</div>
                        <div className="fm-sub">{a.imei}</div>
                      </div>
                    </div>
                    <button className="fm-btn fm-del" onClick={() => onRemoveAccount(a.label)} aria-label={`Удалить ${a.label}`}>✕</button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="fm-section">
          <div className="fm-section-title">Легенда</div>
          <div className="fm-legend">
            {legend.map((g) => (
              <div className="fm-legend-item" key={g.label}>
                <span className="fm-legend-dot" style={{ background: g.color }} />
                <span className="fm-legend-name">{g.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
};

export default FloatingMenu;
