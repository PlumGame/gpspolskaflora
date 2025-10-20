// src/components/Overlay.jsx
import React from "react";
import "../overlay.css";

const Overlay = ({ children, title = "", onClose }) => {
  return (
    <div className="modern-overlay-backdrop" onMouseDown={onClose}>
      <div className="modern-overlay-card" role="dialog" aria-modal="true" onMouseDown={(e) => e.stopPropagation()}>
        <header className="modern-overlay-header">
          <div className="modern-overlay-title">{title}</div>
          <button className="modern-overlay-close" onClick={onClose} aria-label="Close overlay">✕</button>
        </header>

        <div className="modern-overlay-body">
          {children}
        </div>

        <footer className="modern-overlay-footer" aria-hidden>
          <div className="modern-overlay-hint">Нажмите вне окна или Esc чтобы закрыть</div>
        </footer>
      </div>
    </div>
  );
};

export default Overlay;
