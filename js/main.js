'use strict';

const AppState = {
    devices: [],
    connections: [],
    groups: [],
    viewport: { panX: 0, panY: 0, zoom: 1 },
    selectedDeviceId: null,
    selectedDeviceIds: new Set(),
    selectedConnectionId: null,
    connectingPort: null,
    mouseWorldPos: { x: 0, y: 0 },
    snapEnabled: true,
    gridSize: 16,
    addingGroup: false,
    pendingGroup: null,
    groupDragStart: null,
    undoStack: [],
    redoStack: [],
    customDeviceTypes: []
};

// ── Undo / Redo ───────────────────────────────────────────────

/** Push a deep-cloned snapshot of mutable state onto the undo stack */
function pushUndo() {
    const snap = JSON.parse(JSON.stringify({
        devices: AppState.devices,
        connections: AppState.connections,
        groups: AppState.groups
    }));
    AppState.undoStack.push(snap);
    if (AppState.undoStack.length > 50) AppState.undoStack.shift();
    AppState.redoStack.length = 0;
}

function undo() {
    if (!AppState.undoStack.length) return;
    const current = JSON.parse(JSON.stringify({
        devices: AppState.devices,
        connections: AppState.connections,
        groups: AppState.groups
    }));
    AppState.redoStack.push(current);
    const prev = AppState.undoStack.pop();
    AppState.devices = prev.devices;
    AppState.connections = prev.connections;
    AppState.groups = prev.groups;
    _clearSelection();
    render();
}

function redo() {
    if (!AppState.redoStack.length) return;
    const current = JSON.parse(JSON.stringify({
        devices: AppState.devices,
        connections: AppState.connections,
        groups: AppState.groups
    }));
    AppState.undoStack.push(current);
    const next = AppState.redoStack.pop();
    AppState.devices = next.devices;
    AppState.connections = next.connections;
    AppState.groups = next.groups;
    _clearSelection();
    render();
}

function _clearSelection() {
    AppState.selectedDeviceId = null;
    AppState.selectedDeviceIds.clear();
    AppState.selectedConnectionId = null;
    AppState.connectingPort = null;
}

// ── Full render ───────────────────────────────────────────────

let _renderScheduled = false;

function scheduleRender() {
    if (!_renderScheduled) {
        _renderScheduled = true;
        requestAnimationFrame(() => { _renderScheduled = false; render(); });
    }
}

function render() {
    Canvas.render();
    ConfigPanel.render();
}

function updateZoomDisplay() {
    const el = document.getElementById('zoom-display');
    if (el) el.textContent = Math.round(AppState.viewport.zoom * 100) + '%';
}

// ── Modals ────────────────────────────────────────────────────

let _pendingDropPos = null;
let _pendingCustomPos = null;

function showPortCountModal(x, y) {
    _pendingDropPos = { x, y };
    document.getElementById('modal-overlay').classList.remove('hidden');
    document.getElementById('modal-port-count').focus();
}

function showCustomDeviceModal(x, y) {
    _pendingCustomPos = { x, y };
    document.getElementById('modal-custom').classList.remove('hidden');
    document.getElementById('custom-device-name').value = '';
    document.getElementById('custom-device-ports').value = '2';
    document.getElementById('custom-device-color').value = '#e8f4f8';
    document.getElementById('custom-device-name').focus();
}

// ── Custom toolbox types ──────────────────────────────────────

/** Rebuild the custom-types section of the toolbox from AppState.customDeviceTypes */
function renderCustomToolboxCards() {
    const section = document.getElementById('custom-toolbox-section');
    if (!section) return;
    const list = section.querySelector('.custom-card-list');
    clearEl(list);

    if (!AppState.customDeviceTypes.length) {
        section.style.display = 'none';
        return;
    }
    section.style.display = '';

    AppState.customDeviceTypes.forEach(type => {
        const card = document.createElement('div');
        card.className = 'device-card';
        card.draggable = true;
        card.dataset.type = 'custom';
        card.dataset.customTypeId = type.id;

        const icon = document.createElement('div');
        icon.className = 'device-card-icon';
        icon.style.cssText = `background:${type.customColor};border:1px solid ${type.customStroke};`;
        const abbr = type.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2).toUpperCase() || '?';
        icon.innerHTML = `<svg viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg"><text x="8" y="11" text-anchor="middle" font-size="8" fill="${type.customStroke}" font-family="system-ui" font-weight="600">${abbr}</text></svg>`;

        const info = document.createElement('div');
        info.style.flex = '1';
        info.style.minWidth = '0';
        const lbl = document.createElement('div');
        lbl.className = 'device-card-label';
        lbl.textContent = type.name;
        const sub = document.createElement('div');
        sub.className = 'device-card-sub';
        sub.textContent = type.portCount + ' port' + (type.portCount !== 1 ? 's' : '');
        info.appendChild(lbl);
        info.appendChild(sub);

        const rmBtn = document.createElement('button');
        rmBtn.className = 'custom-type-rm';
        rmBtn.textContent = '×';
        rmBtn.title = 'Remove from toolbox';
        rmBtn.addEventListener('click', e => {
            e.stopPropagation();
            AppState.customDeviceTypes = AppState.customDeviceTypes.filter(t => t.id !== type.id);
            renderCustomToolboxCards();
        });

        card.appendChild(icon);
        card.appendChild(info);
        card.appendChild(rmBtn);

        card.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('device-type', 'custom');
            e.dataTransfer.setData('custom-type-id', type.id);
        });

        list.appendChild(card);
    });
}

// ── Topbar setup ──────────────────────────────────────────────

function setupTopBar() {
    document.getElementById('btn-save').addEventListener('click', Storage.saveJSON);
    document.getElementById('btn-load').addEventListener('click', () =>
        document.getElementById('file-input').click()
    );
    document.getElementById('file-input').addEventListener('change', Storage.loadJSON);
    document.getElementById('btn-export-png').addEventListener('click', Storage.exportPNG);
    document.getElementById('btn-export-text').addEventListener('click', Storage.exportText);

    document.getElementById('btn-zoom-in').addEventListener('click', () => {
        AppState.viewport.zoom = clamp(AppState.viewport.zoom * 1.2, 0.3, 3);
        Canvas.applyViewport(); updateZoomDisplay();
    });
    document.getElementById('btn-zoom-out').addEventListener('click', () => {
        AppState.viewport.zoom = clamp(AppState.viewport.zoom / 1.2, 0.3, 3);
        Canvas.applyViewport(); updateZoomDisplay();
    });
    document.getElementById('btn-zoom-reset').addEventListener('click', () => {
        Object.assign(AppState.viewport, { zoom: 1, panX: 0, panY: 0 });
        Canvas.applyViewport(); updateZoomDisplay();
    });
    document.getElementById('btn-fit').addEventListener('click', Canvas.fitToContents);
    document.getElementById('btn-snap').addEventListener('click', () => {
        AppState.snapEnabled = !AppState.snapEnabled;
        document.getElementById('btn-snap').textContent = 'Snap: ' + (AppState.snapEnabled ? 'On' : 'Off');
    });
    document.getElementById('btn-add-group').addEventListener('click', () => Groups.startDrawing());
    document.getElementById('btn-find').addEventListener('click', Search.show);

    updateZoomDisplay();
}

// ── Modals setup ──────────────────────────────────────────────

function setupSwitchModal() {
    const sel = document.getElementById('modal-port-count');
    const customRow = document.getElementById('modal-custom-port-row');
    const customInput = document.getElementById('modal-port-count-custom');

    sel.addEventListener('change', () => {
        const isCustom = sel.value === 'custom';
        customRow.style.display = isCustom ? '' : 'none';
        if (isCustom) customInput.focus();
    });

    document.getElementById('modal-ok').addEventListener('click', () => {
        let portCount;
        if (sel.value === 'custom') {
            portCount = Math.max(1, parseInt(customInput.value, 10) || 1);
        } else {
            portCount = parseInt(sel.value, 10);
        }
        if (_pendingDropPos) {
            pushUndo();
            const device = Devices.createDevice('switch', _pendingDropPos.x, _pendingDropPos.y, { portCount });
            AppState.devices.push(device);
            AppState.selectedDeviceId = device.id;
            AppState.selectedDeviceIds.clear();
            AppState.selectedDeviceIds.add(device.id);
            _pendingDropPos = null;
            render();
        }
        document.getElementById('modal-overlay').classList.add('hidden');
        sel.value = '24';
        customRow.style.display = 'none';
    });
    document.getElementById('modal-cancel').addEventListener('click', () => {
        _pendingDropPos = null;
        document.getElementById('modal-overlay').classList.add('hidden');
        sel.value = '24';
        customRow.style.display = 'none';
    });
    sel.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('modal-ok').click();
        if (e.key === 'Escape') document.getElementById('modal-cancel').click();
    });
    customInput.addEventListener('keydown', e => {
        if (e.key === 'Enter') document.getElementById('modal-ok').click();
        if (e.key === 'Escape') document.getElementById('modal-cancel').click();
    });
}

function setupCustomModal() {
    const place = () => {
        if (!_pendingCustomPos) return;
        const label = document.getElementById('custom-device-name').value.trim() || 'Device';
        const portCount = Math.max(0, parseInt(document.getElementById('custom-device-ports').value, 10) || 0);
        const customColor = document.getElementById('custom-device-color').value;
        pushUndo();
        const device = Devices.createDevice('custom', _pendingCustomPos.x, _pendingCustomPos.y, {
            customLabel: label, portCount, customColor,
            customStroke: adjustColorForStroke(customColor)
        });
        AppState.devices.push(device);
        AppState.selectedDeviceId = device.id;
        AppState.selectedDeviceIds.clear();
        AppState.selectedDeviceIds.add(device.id);
        _pendingCustomPos = null;
        render();
        document.getElementById('modal-custom').classList.add('hidden');
    };
    document.getElementById('custom-modal-ok').addEventListener('click', place);
    document.getElementById('custom-modal-cancel').addEventListener('click', () => {
        _pendingCustomPos = null;
        document.getElementById('modal-custom').classList.add('hidden');
    });
    document.getElementById('custom-device-name').addEventListener('keydown', e => {
        if (e.key === 'Enter') place();
        if (e.key === 'Escape') document.getElementById('custom-modal-cancel').click();
    });
}

/** Darken a hex color to produce an appropriate stroke */
function adjustColorForStroke(hex) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const d = v => Math.max(0, Math.floor(v * 0.55)).toString(16).padStart(2, '0');
    return `#${d(r)}${d(g)}${d(b)}`;
}

// ── Panel toggle ──────────────────────────────────────────────

function setupPanelToggle() {
    const strip = document.getElementById('panel-toggle-strip');
    const panel = document.getElementById('config-panel');
    if (!strip || !panel) return;
    strip.addEventListener('click', () => {
        const collapsed = panel.classList.toggle('collapsed');
        strip.querySelector('.toggle-arrow').textContent = collapsed ? '‹' : '›';
    });
}

// ── Toolbox drag ──────────────────────────────────────────────

function setupToolbox() {
    document.querySelectorAll('.device-card[data-type]').forEach(card => {
        card.addEventListener('dragstart', e => {
            e.dataTransfer.effectAllowed = 'copy';
            e.dataTransfer.setData('device-type', card.dataset.type);
        });
    });
}

// ── Keyboard shortcuts ────────────────────────────────────────

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', e => {
        if (e.target.matches('input, textarea, select')) return;

        // Undo / Redo
        if (e.ctrlKey && e.key === 'z') { e.preventDefault(); undo(); return; }
        if (e.ctrlKey && e.key === 'y') { e.preventDefault(); redo(); return; }

        // Save
        if (e.ctrlKey && e.key === 's') { e.preventDefault(); Storage.saveJSON(); return; }

        // Fit to screen
        if (e.key === 'f' || e.key === 'F') { Canvas.fitToContents(); return; }

        // Find
        if (e.ctrlKey && e.key === 'f') { e.preventDefault(); Search.show(); return; }

        // Duplicate
        if (e.ctrlKey && e.key === 'd') {
            e.preventDefault();
            if (AppState.selectedDeviceIds.size > 0) {
                pushUndo();
                const newIds = new Set();
                [...AppState.selectedDeviceIds].forEach(id => {
                    const nd = Devices.duplicateDevice(id);
                    if (nd) newIds.add(nd.id);
                });
                AppState.selectedDeviceIds = newIds;
                AppState.selectedDeviceId = [...newIds].at(-1) ?? null;
                render();
            }
            return;
        }

        // Delete selected
        if (e.key === 'Delete' || e.key === 'Backspace') {
            if (AppState.selectedDeviceIds.size > 0) {
                pushUndo();
                [...AppState.selectedDeviceIds].forEach(id => Devices.deleteDevice(id));
                _clearSelection();
                render();
            } else if (AppState.selectedConnectionId) {
                pushUndo();
                Connections.deleteConnection(AppState.selectedConnectionId);
                AppState.selectedConnectionId = null;
                render();
            }
            e.preventDefault();
            return;
        }

        // Escape
        if (e.key === 'Escape') {
            _clearSelection();
            AppState.addingGroup = false;
            AppState.pendingGroup = null;
            document.getElementById('canvas-svg').style.cursor = '';
            Connections.hideContextMenu();
            Groups.hideContextMenu();
            Search.hide();
            render();
        }
    });
}

// ── Init ──────────────────────────────────────────────────────

function init() {
    Canvas.init(document.getElementById('canvas-svg'));
    setupToolbox();
    setupTopBar();
    setupSwitchModal();
    setupCustomModal();
    setupPanelToggle();
    setupKeyboardShortcuts();
    Search.setup();
    AiPrompts.setup();
    renderCustomToolboxCards();

    // Auto-save every 30 seconds
    setInterval(Storage.autoSave, 30000);

    render();

    // Check for auto-save recovery after first render
    requestAnimationFrame(() => Storage.checkAutoSave());
}

document.addEventListener('DOMContentLoaded', init);
