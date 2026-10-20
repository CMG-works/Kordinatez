// ==UserScript==
// @name         Kordinatez
// @namespace    https://vectaria.io/
// @version      1.1
// @description  Real-time coordinate copier for Vectaria.io with configurable rounding and formats (Array, Object, JSON, plain, labeled)
// @author       PIllagerJ88
// @match        https://vectaria.io/*
// @match        https://*.vectaria.io/*
// @icon         https://vectaria.io/favicon.ico
// @updateURL    https://raw.githubusercontent.com/CMG-works/Kordinatez/main/Kordinatez.user.js
// @downloadURL  https://raw.githubusercontent.com/CMG-works/Kordinatez/main/Kordinatez.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
  'use strict';

  if (window.__KORDINATEZ_INITIALIZED__) return;
  window.__KORDINATEZ_INITIALIZED__ = true;

  console.log("[Kordinatez] Userscript v1.1 loaded.");

  //PERSISTENT SETTINGS IN LOCALSTORAGE
  const STORAGE_KEY = 'kordinatez_settings_v1';
  const defaultSettings = {
    rounded: true,
    decimals: 1,
    format: 'array',
    includeYaw: false,
    hotkeyCopy: 'KeyC',    // Alt + C
    minimized: false,
    posX: null,
    posY: null
  };

 function loadSettings() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? Object.assign({}, defaultSettings, JSON.parse(saved)) : Object.assign({}, defaultSettings);
    } catch (e) {
      return Object.assign({}, defaultSettings);
    }
  }

  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {}
  }

  const settings = loadSettings();

  //PINIA AND GAMEWORLD ACCESS
  function getPinia() {
    const appEl = document.getElementById("app");
    if (!appEl) return null;
    return (
      appEl._vnode?.component?.appContext?.config?.globalProperties?.$pinia ||
      appEl.__vue_app__?.config?.globalProperties?.$pinia ||
      appEl._vnode?.component?.appContext?.provides?.pinia ||
      (() => {
        for (const el of document.querySelectorAll('*')) {
          const p = el._vnode?.component?.appContext?.config?.globalProperties?.$pinia || el.__vue_app__?.config?.globalProperties?.$pinia;
          if (p) return p;
        }
        return null;
      })()
    );
  }

  function getGameWorld() {
    if (window.__gameWorld__?.player?.position) return window.__gameWorld__;
    if (window.gameWorld?.player?.position) return window.gameWorld;

    const pinia = getPinia();
    if (pinia && pinia._s) {
      for (const s of pinia._s.values()) {
        if (s?.gameWorld) {
          window.__gameWorld__ = s.gameWorld;
          return s.gameWorld;
        }
      }
    }
    return null;
  }

  //GETTING PLAYER COORDINATES
  function getPlayerCoordinates() {
    const gw = getGameWorld();
    if (gw) {
      // 1. Direct player position
      if (gw.player?.position && typeof gw.player.position.x === 'number') {
        return {
          x: gw.player.position.x,
          y: gw.player.position.y,
          z: gw.player.position.z,
          yaw: gw.player.yaw ?? gw.camera?.rotation?.y ?? 0,
          pitch: gw.player.pitch ?? gw.camera?.rotation?.x ?? 0,
          inGame: true
        };
      }

      if (gw.camera?.position && typeof gw.camera.position.x === 'number') {
        return {
          x: gw.camera.position.x,
          y: gw.camera.position.y - 1.62,
          z: gw.camera.position.z,
          yaw: gw.camera.rotation?.y ?? 0,
          pitch: gw.camera.rotation?.x ?? 0,
          inGame: true
        };
      }
    }
    return null;
  }

  //COORDINATE FORMATTING
  function formatCoordinate(val, rounded, decimals) {
    if (!Number.isFinite(val)) return '0';
    if (!rounded) return String(val);
    const d = Math.max(0, parseInt(decimals, 10) || 0);
    return d === 0 ? String(Math.round(val)) : val.toFixed(d);
  }

  function getDirectionName(yawRad) {
    if (yawRad === null || yawRad === undefined) return '';
    // Normalize to 0..360
    let deg = ((yawRad * 180 / Math.PI) % 360 + 360) % 360;
    if (deg >= 315 || deg < 45) return 'South (+Z)';
    if (deg >= 45 && deg < 135) return 'West (-X)';
    if (deg >= 135 && deg < 225) return 'North (-Z)';
    return 'East (+X)';
  }

  function buildFormattedOutput(coords, opts) {
    if (!coords) return '(Not connected)';

    const xStr = formatCoordinate(coords.x, opts.rounded, opts.decimals);
    const yStr = formatCoordinate(coords.y, opts.rounded, opts.decimals);
    const zStr = formatCoordinate(coords.z, opts.rounded, opts.decimals);

    const xNum = opts.rounded ? (opts.decimals === 0 ? parseInt(xStr, 10) : parseFloat(xStr)) : coords.x;
    const yNum = opts.rounded ? (opts.decimals === 0 ? parseInt(yStr, 10) : parseFloat(yStr)) : coords.y;
    const zNum = opts.rounded ? (opts.decimals === 0 ? parseInt(zStr, 10) : parseFloat(zStr)) : coords.z;

    switch (opts.format) {
      case 'object':
        return opts.includeYaw
          ? JSON.stringify({ x: xNum, y: yNum, z: zNum, yaw: Number(coords.yaw.toFixed(2)) }, null, 2)
          : `{ x: ${xStr}, y: ${yStr}, z: ${zStr} }`;

      case 'object_json':
        return JSON.stringify({ x: xNum, y: yNum, z: zNum });

      case 'array':
        return `[${xStr}, ${yStr}, ${zStr}]`;

      case 'plain':
        return `${xStr}, ${yStr}, ${zStr}`;

      case 'labeled':
        return `X: ${xStr} | Y: ${yStr} | Z: ${zStr}`;

      default:
        return `[${xStr}, ${yStr}, ${zStr}]`;
    }
  }

  //CLIPBOARD COPIER
  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (e) {}

    // Fallback using a textarea
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const success = document.execCommand('copy');
      document.body.removeChild(ta);
      return success;
    } catch (e) {
      return false;
    }
  }

  // TOAST NOTIFICATION
  function showToast(message, type = 'success') {
    let toast = document.getElementById('kord-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'kord-toast';
      document.body.appendChild(toast);
    }
    toast.textContent = message;
    toast.className = `kord-toast-show kord-toast-${type}`;
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => {
      toast.className = '';
    }, 2500);
  }

  // UI STYLE
  function createUI() {
    if (document.getElementById('kordinatez-container')) return;

    const container = document.createElement('div');
    container.id = 'kordinatez-container';

    container.innerHTML = `
      <style>
        /* minimalist dark theme */
        #kordinatez-container {
          --v3d-bg: #161512;
          --v3d-panel: #262421;
          --v3d-panel-2: #2f2d2a;
          --v3d-border: #3c3a37;
          --v3d-text: #bababa;
          --v3d-text-strong: #e6e6e6;
          --v3d-muted: #7c7a77;
          --v3d-accent: #3692e7;
          --v3d-accent-hover: #4aa0f0;
          --v3d-success: #759900;
          --v3d-error: #cc3333;
          position: fixed;
          top: 130px;
          right: 20px;
          z-index: 9999998;
          font-family: 'Noto Sans', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
          user-select: none;
        }
        #kordinatez-container *,
        #kordinatez-container *::before,
        #kordinatez-container *::after {
          box-sizing: border-box;
        }
        #kord-toggle-btn {
          display: none;
          background: var(--v3d-panel);
          color: var(--v3d-text-strong);
          padding: 7px 12px;
          border-radius: 3px;
          font-size: 13px;
          cursor: pointer;
          border: 1px solid var(--v3d-border);
          align-items: center;
          gap: 6px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
        }
        #kord-toggle-btn:hover {
          background: var(--v3d-panel-2);
        }
        #kord-toggle-badge {
          background: var(--v3d-accent);
          color: #fff;
          font-size: 10px;
          padding: 1px 5px;
          border-radius: 2px;
          font-weight: bold;
        }
        #kord-window {
          width: 290px;
          background: var(--v3d-bg);
          border: 1px solid var(--v3d-border);
          border-radius: 3px;
          box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
          color: var(--v3d-text);
          overflow: hidden;
        }
        #kord-header {
          padding: 9px 12px;
          background: var(--v3d-panel);
          border-bottom: 1px solid var(--v3d-border);
          display: flex;
          justify-content: space-between;
          align-items: center;
          cursor: move;
        }
        .kord-title-box {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        .kord-title {
          font-size: 13px;
          font-weight: 600;
          color: var(--v3d-text-strong);
        }
        .kord-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--v3d-muted);
          transition: background 0.3s;
        }
        .kord-dot.active {
          background: #22c55e;
          box-shadow: 0 0 6px #22c55e88;
        }
        .kord-icon-btn {
          background: transparent;
          border: none;
          color: var(--v3d-muted);
          width: 22px;
          height: 22px;
          border-radius: 3px;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 13px;
          line-height: 1;
        }
        .kord-icon-btn:hover {
          background: var(--v3d-panel-2);
          color: var(--v3d-text-strong);
        }
        #kord-body {
          padding: 8px;
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .kord-section {
          background: var(--v3d-panel);
          border: 1px solid var(--v3d-border);
          border-radius: 3px;
          padding: 9px 10px;
          display: flex;
          flex-direction: column;
          gap: 6px;
        }
        .kord-section-title {
          font-size: 11px;
          font-weight: 600;
          color: var(--v3d-muted);
          text-transform: uppercase;
          letter-spacing: 0.5px;
          display: flex;
          justify-content: space-between;
          align-items: center;
        }

        /* Live coordinates */
        .kord-coords-grid {
          display: grid;
          grid-template-columns: 1fr 1fr 1fr;
          gap: 4px;
        }
        .kord-axis-box {
          background: var(--v3d-bg);
          border: 1px solid var(--v3d-border);
          border-radius: 2px;
          padding: 5px 6px;
          text-align: center;
        }
        .kord-axis-label {
          font-size: 10px;
          font-weight: bold;
          color: var(--v3d-muted);
        }
        .kord-axis-val {
          font-family: 'Consolas', 'Courier New', monospace;
          font-size: 12px;
          font-weight: 600;
          color: var(--v3d-text-strong);
          margin-top: 1px;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
        .kord-sub-info {
          display: flex;
          justify-content: space-between;
          font-size: 11px;
          color: var(--v3d-muted);
          margin-top: 2px;
        }

        /* Primary blue button */
        .kord-btn {
          background: var(--v3d-panel-2);
          color: var(--v3d-text-strong);
          border: 1px solid var(--v3d-border);
          border-radius: 3px;
          padding: 8px 12px;
          font-size: 12px;
          font-family: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: background 0.15s, border-color 0.15s, transform 0.05s;
        }
        .kord-btn:hover { background: #3a3835; }
        .kord-btn:active { transform: scale(0.98); }
        .kord-btn-primary {
          background: var(--v3d-accent);
          border-color: var(--v3d-accent);
          color: #fff;
          font-weight: 600;
          box-shadow: 0 2px 8px rgba(54, 146, 231, 0.25);
        }
        .kord-btn-primary:hover {
          background: var(--v3d-accent-hover);
          border-color: var(--v3d-accent-hover);
        }
        .kord-btn-success {
          background: var(--v3d-success) !important;
          border-color: var(--v3d-success) !important;
          color: #fff !important;
        }

        /* Options and controls */
        .kord-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          font-size: 12px;
          color: var(--v3d-text);
        }
        .kord-checkbox-label {
          display: flex;
          align-items: center;
          gap: 7px;
          cursor: pointer;
          font-size: 12px;
          color: var(--v3d-text-strong);
        }
        .kord-checkbox-label input[type="checkbox"] {
          accent-color: var(--v3d-accent);
          cursor: pointer;
          width: 14px;
          height: 14px;
          margin: 0;
        }
        .kord-select {
          background: var(--v3d-bg);
          border: 1px solid var(--v3d-border);
          border-radius: 3px;
          color: var(--v3d-text-strong);
          padding: 4px 6px;
          font-size: 11px;
          font-family: inherit;
          outline: none;
          cursor: pointer;
        }
        .kord-select:focus { border-color: var(--v3d-accent); }
        .kord-select option {
          background: var(--v3d-bg);
          color: var(--v3d-text-strong);
        }

        /* Preview box */
        .kord-preview-box {
          background: var(--v3d-bg);
          border: 1px dashed var(--v3d-border);
          border-radius: 2px;
          padding: 6px 8px;
          font-family: 'Consolas', 'Courier New', monospace;
          font-size: 11px;
          color: #79c0ff;
          word-break: break-all;
          min-height: 28px;
          display: flex;
          align-items: center;
        }

        /* Status */
        #kord-status {
          font-size: 11px;
          color: var(--v3d-muted);
          padding: 5px 8px;
          background: var(--v3d-panel);
          border-left: 3px solid var(--v3d-border);
          border-radius: 3px;
          display: flex;
          align-items: center;
          justify-content: space-between;
        }
        .kord-status-success {
          color: var(--v3d-text-strong) !important;
          border-left-color: var(--v3d-success) !important;
        }
        .kord-status-error {
          color: var(--v3d-text-strong) !important;
          border-left-color: var(--v3d-error) !important;
        }

        #kord-footer {
          padding: 4px 10px 6px;
          display: flex;
          justify-content: space-between;
          align-items: center;
          font-size: 9px;
          color: var(--v3d-muted);
          opacity: 0.75;
        }

        /* Floating toast */
        #kord-toast {
          position: fixed;
          bottom: 24px;
          right: 24px;
          z-index: 10000000;
          background: #1e1e24;
          color: #fff;
          border: 1px solid var(--v3d-border);
          border-left: 4px solid var(--v3d-accent);
          padding: 10px 16px;
          border-radius: 4px;
          font-size: 12px;
          font-family: 'Noto Sans', sans-serif;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.6);
          opacity: 0;
          pointer-events: none;
          transform: translateY(10px);
          transition: opacity 0.2s, transform 0.2s;
        }
        #kord-toast.kord-toast-show {
          opacity: 1;
          pointer-events: auto;
          transform: translateY(0);
        }
        #kord-toast.kord-toast-success { border-left-color: #22c55e; }
      </style>

      <!-- open button shown when minimized -->
      <div id="kord-toggle-btn">
        <span class="kord-dot" id="kord-btn-dot"></span>
        <span>Kordinatez</span>
        <span id="kord-toggle-badge">XYZ</span>
      </div>

      <!-- main window -->
      <div id="kord-window">
        <div id="kord-header">
          <div class="kord-title-box">
            <span class="kord-dot" id="kord-live-dot"></span>
            <span class="kord-title">Kordinatez</span>
          </div>
          <button class="kord-icon-btn" id="kord-btn-minimize" title="Minimize window">&minus;</button>
        </div>

        <div id="kord-body">
          <!-- live coordinates -->
          <div class="kord-section">
            <div class="kord-section-title">
              <span>Live coordinates</span>
              <span id="kord-heading-tag" style="font-weight: normal; text-transform: none; color: var(--v3d-text);">—</span>
            </div>
            <div class="kord-coords-grid">
              <div class="kord-axis-box">
                <div class="kord-axis-label">X</div>
                <div class="kord-axis-val" id="kord-val-x">0.0</div>
              </div>
              <div class="kord-axis-box">
                <div class="kord-axis-label">Y</div>
                <div class="kord-axis-val" id="kord-val-y">0.0</div>
              </div>
              <div class="kord-axis-box">
                <div class="kord-axis-label">Z</div>
                <div class="kord-axis-val" id="kord-val-z">0.0</div>
              </div>
            </div>
          </div>

          <!-- format and rounding options -->
          <div class="kord-section">
            <div class="kord-section-title">
              <span>Settings</span>
            </div>

            <!-- Format (Array, Object, ....) -->
            <div class="kord-row">
              <label for="kord-format-select" style="font-size: 11px; color: var(--v3d-muted);">Format:</label>
              <select class="kord-select" id="kord-format-select" style="width: 145px;">
                <option value="array">[x, y, z] (Array)</option>
                <option value="object">{ x, y, z } (Object)</option>
                <option value="object_json">{"x":0,"y":0,"z":0} (JSON)</option>
                <option value="plain">x, y, z (Plain text)</option>
                <option value="labeled">X: .. Y: .. Z: .. (Labeled)</option>
              </select>
            </div>

            <!-- round coordinates checkbox -->
            <div class="kord-row" style="margin-top: 2px;">
              <label class="kord-checkbox-label">
                <input type="checkbox" id="kord-check-round" />
                <span>Round coordinates</span>
              </label>
              <select class="kord-select" id="kord-decimals-select" style="width: 75px;">
                <option value="0">Integer (0)</option>
                <option value="1">1 decimal</option>
                <option value="2">2 decimals</option>
                <option value="3">3 decimals</option>
              </select>
            </div>
          </div>

          <!-- preview -->
          <div class="kord-section">
            <div class="kord-section-title">
              <span>Preview</span>
            </div>
            <div class="kord-preview-box" id="kord-preview-text">[0, 0, 0]</div>
          </div>

          <!-- primary copy button -->
          <button class="kord-btn kord-btn-primary" id="kord-btn-copy" title="Copy to clipboard (Alt + C)">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
            </svg>
            <span id="kord-btn-text">Copy coordinates</span>
          </button>

          <!-- status bar -->
          <div id="kord-status">
            <span id="kord-status-text">Ready (Alt + C to copy)</span>
            <span style="font-size: 10px; color: var(--v3d-muted);">Alt+C</span>
          </div>
        </div>

        <div id="kord-footer">
          <span>Kordinatez v1.1</span>
          <span>by PIllagerJ88</span>
        </div>
      </div>
    `;

    document.body.appendChild(container);

    // DOM ELEMENTS
    const winEl = container.querySelector('#kord-window');
    const toggleBtn = container.querySelector('#kord-toggle-btn');
    const btnMinimize = container.querySelector('#kord-btn-minimize');
    const header = container.querySelector('#kord-header');
    const btnCopy = container.querySelector('#kord-btn-copy');
    const btnText = container.querySelector('#kord-btn-text');
    const checkRound = container.querySelector('#kord-check-round');
    const selectDecimals = container.querySelector('#kord-decimals-select');
    const selectFormat = container.querySelector('#kord-format-select');
    const previewEl = container.querySelector('#kord-preview-text');
    const valX = container.querySelector('#kord-val-x');
    const valY = container.querySelector('#kord-val-y');
    const valZ = container.querySelector('#kord-val-z');
    const headingTag = container.querySelector('#kord-heading-tag');
    const liveDot = container.querySelector('#kord-live-dot');
    const btnDot = container.querySelector('#kord-btn-dot');
    const statusText = container.querySelector('#kord-status-text');
    const statusBox = container.querySelector('#kord-status');

    // LOAD SETTINGS INTO THE UI
    checkRound.checked = !!settings.rounded;
    selectDecimals.value = String(settings.decimals);
    selectDecimals.disabled = !checkRound.checked;
    selectFormat.value = settings.format || 'array';

    if (settings.minimized) {
      winEl.style.display = 'none';
      toggleBtn.style.display = 'flex';
    }

    if (settings.posX !== null && settings.posY !== null) {
      container.style.right = 'auto';
      container.style.left = `${settings.posX}px`;
      container.style.top = `${settings.posY}px`;
    }

    // CONTROL EVENTS
    checkRound.addEventListener('change', () => {
      settings.rounded = checkRound.checked;
      selectDecimals.disabled = !checkRound.checked;
      saveSettings(settings);
      updatePreview();
    });

    selectDecimals.addEventListener('change', () => {
      settings.decimals = parseInt(selectDecimals.value, 10);
      saveSettings(settings);
      updatePreview();
    });

    selectFormat.addEventListener('change', () => {
      settings.format = selectFormat.value;
      saveSettings(settings);
      updatePreview();
    });

    // Minimize / Restore
    btnMinimize.addEventListener('click', () => {
      winEl.style.display = 'none';
      toggleBtn.style.display = 'flex';
      settings.minimized = true;
      saveSettings(settings);
    });

    toggleBtn.addEventListener('click', () => {
      winEl.style.display = 'block';
      toggleBtn.style.display = 'none';
      settings.minimized = false;
      saveSettings(settings);
    });

    // WINDOW DRAGGING
    let isDragging = false;
    let startX, startY, initLeft, initTop;

    header.addEventListener('mousedown', (e) => {
      if (e.target.id === 'kord-btn-minimize') return;
      isDragging = true;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      initLeft = rect.left;
      initTop = rect.top;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
      if (!isDragging) return;
      const newLeft = Math.max(10, Math.min(window.innerWidth - 300, initLeft + (e.clientX - startX)));
      const newTop = Math.max(10, Math.min(window.innerHeight - 300, initTop + (e.clientY - startY)));
      container.style.right = 'auto';
      container.style.left = `${newLeft}px`;
      container.style.top = `${newTop}px`;
      settings.posX = newLeft;
      settings.posY = newTop;
    }

    function onMouseUp() {
      if (isDragging) {
        isDragging = false;
        saveSettings(settings);
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
      }
    }

    // COPY COORDINATES
    let copyResetTimer = null;
    async function triggerCopy() {
      const coords = getPlayerCoordinates();
      if (!coords) {
        setStatus("Position not detected (are you in a match?)", "error");
        showToast("Position not detected in the match", "error");
        return;
      }

      const formatted = buildFormattedOutput(coords, settings);
      const ok = await copyToClipboard(formatted);

      if (ok) {
        btnCopy.classList.add('kord-btn-success');
        btnText.textContent = "Copied successfully!";
        setStatus(`Copied: ${formatted}`, "success");
        showToast(`✔ Coordinates copied: ${formatted}`, "success");

        clearTimeout(copyResetTimer);
        copyResetTimer = setTimeout(() => {
          btnCopy.classList.remove('kord-btn-success');
          btnText.textContent = "Copy coordinates";
        }, 1500);
      } else {
        setStatus("Failed to copy to clipboard", "error");
        showToast("Failed to copy", "error");
      }
    }

    btnCopy.addEventListener('click', triggerCopy);

    function setStatus(text, type = '') {
      statusText.textContent = text;
      statusBox.className = type ? `kord-status-${type}` : '';
    }

    function updatePreview() {
      const coords = getPlayerCoordinates();
      if (coords) {
        previewEl.textContent = buildFormattedOutput(coords, settings);
      } else {
        previewEl.textContent = buildFormattedOutput({ x: 13022.4, y: 372.3, z: -37774.0, yaw: 0 }, settings);
      }
    }

    // LIVE UPDATE LOOP
    let wasConnected = false;
    setInterval(() => {
      try {
        const coords = getPlayerCoordinates();
        if (coords) {
          if (!wasConnected) {
            wasConnected = true;
            liveDot.classList.add('active');
            btnDot.classList.add('active');
            setStatus("In match • Connected", "success");
          }

          valX.textContent = formatCoordinate(coords.x, settings.rounded, settings.decimals);
          valY.textContent = formatCoordinate(coords.y, settings.rounded, settings.decimals);
          valZ.textContent = formatCoordinate(coords.z, settings.rounded, settings.decimals);

          const facing = getDirectionName(coords.yaw);
          headingTag.textContent = facing ? `Facing: ${facing}` : '';

          previewEl.textContent = buildFormattedOutput(coords, settings);
        } else {
          if (wasConnected) {
            wasConnected = false;
            liveDot.classList.remove('active');
            btnDot.classList.remove('active');
            headingTag.textContent = '—';
            setStatus("Waiting to join a match...", "");
          }
        }
      } catch (err) {}
    }, 100);

    // GLOBAL KEYBOARD SHORTCUTS
    document.addEventListener('keydown', (e) => {
      if (['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName) || document.activeElement?.isContentEditable) {
        return;
      }

      // alt + C: copy coordinates instantly
      if (e.altKey && (e.code === 'KeyC' || e.key.toLowerCase() === 'c')) {
        e.preventDefault();
        triggerCopy();
        return;
      }

      // alt + K: show / hide the Kordinatez window
      if (e.altKey && (e.code === 'KeyK' || e.key.toLowerCase() === 'k')) {
        e.preventDefault();
        if (winEl.style.display === 'none') {
          winEl.style.display = 'block';
          toggleBtn.style.display = 'none';
          settings.minimized = false;
        } else {
          winEl.style.display = 'none';
          toggleBtn.style.display = 'flex';
          settings.minimized = true;
        }
        saveSettings(settings);
      }
    });

    console.log("[Kordinatez] UI initialized successfully.");
  }

  //INITIALIZATION WITH RETRY
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    createUI();
  } else {
    window.addEventListener('DOMContentLoaded', createUI);
  }

  setInterval(createUI, 2000);

})();