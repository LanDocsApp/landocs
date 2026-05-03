'use strict';

const Devices = (() => {
    const PORT_SPACING = 12;

    const COLORS = {
        switch: { fill: '#e0f7fa', stroke: '#00838f', accent: '#00838f' },
        router: { fill: '#fff3e0', stroke: '#e65100', accent: '#e65100' },
        server: { fill: '#e8eaf6', stroke: '#3949ab', accent: '#3949ab' },
        pc:     { fill: '#f1f8e9', stroke: '#558b2f', accent: '#558b2f' }
    };

    function getDims(device) {
        if (device.type === 'switch') {
            const n = device.ports.length;
            return { w: Math.max(160, n * PORT_SPACING + 20), h: 54 };
        }
        if (device.type === 'router') return { w: 80, h: 80 };
        if (device.type === 'server') return { w: 60, h: 100 };
        if (device.type === 'pc')     return { w: 60, h: 78 };
        if (device.type === 'custom') {
            const n = device.ports.length;
            return { w: Math.max(120, n * PORT_SPACING + 20), h: 60 };
        }
        return { w: 80, h: 60 };
    }

    function getLocalPortPos(device, portId) {
        const idx = device.ports.findIndex(p => p.id === portId);
        if (idx === -1) return { x: 0, y: 0 };
        const n = device.ports.length || 1;

        if (device.type === 'switch' || device.type === 'custom') {
            const { w, h } = getDims(device);
            const total = n * PORT_SPACING;
            const xStart = (w - total) / 2;
            return { x: xStart + idx * PORT_SPACING + PORT_SPACING / 2, y: h };
        }
        if (device.type === 'router') {
            const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
            const r = 35;
            return { x: 40 + Math.cos(angle) * r, y: 40 + Math.sin(angle) * r };
        }
        if (device.type === 'server') {
            const spacing = 100 / (n + 1);
            return { x: 60, y: spacing * (idx + 1) };
        }
        if (device.type === 'pc') {
            const spacing = 60 / (n + 1);
            return { x: spacing * (idx + 1), y: 56 };
        }
        return { x: 0, y: 0 };
    }

    function getPortPosition(device, portId) {
        const local = getLocalPortPos(device, portId);
        return { x: device.x + local.x, y: device.y + local.y };
    }

    function getPortExitDir(device, portId) {
        const idx = device.ports.findIndex(p => p.id === portId);
        const n = device.ports.length || 1;

        if (device.type === 'router') {
            const angle = (idx / n) * 2 * Math.PI - Math.PI / 2;
            return { dx: Math.cos(angle), dy: Math.sin(angle) };
        }
        if (device.type === 'server') return { dx: 1, dy: 0 };
        return { dx: 0, dy: 1 };
    }

    function findDeviceByPort(portId) {
        return AppState.devices.find(d => d.ports.some(p => p.id === portId)) ?? null;
    }

    function findPort(portId) {
        for (const d of AppState.devices) {
            const p = d.ports.find(p => p.id === portId);
            if (p) return p;
        }
        return null;
    }

    function createDevice(type, x, y, options = {}) {
        const id = generateUUID();
        const countOfType = AppState.devices.filter(d => d.type === type).length + 1;
        const defaultLabels = { switch: 'Switch', router: 'Router', server: 'Server', pc: 'PC', custom: 'Device' };

        let portDefs = [];
        const portCount = options.portCount ?? defaultPortCount(type);

        if (type === 'switch' || type === 'custom') {
            portDefs = Array.from({ length: portCount }, (_, i) => `Port ${i + 1}`);
        } else if (type === 'router') {
            portDefs = portCount === 4
                ? ['WAN', 'LAN1', 'LAN2', 'LAN3']
                : Array.from({ length: portCount }, (_, i) => i === 0 ? 'WAN' : `LAN${i}`);
        } else if (type === 'server') {
            portDefs = Array.from({ length: portCount }, (_, i) => `NIC${i + 1}`);
        } else if (type === 'pc') {
            portDefs = Array.from({ length: portCount }, (_, i) => i === 0 ? 'ETH0' : `ETH${i}`);
        }

        const ports = portDefs.map(label => ({
            id: generateUUID(), label, connectedTo: null, deviceId: id
        }));

        const base = { id, type, label: options.customLabel || `${defaultLabels[type]} ${countOfType}`, x, y, ip: '', notes: '', tags: [], ports };
        if (type === 'custom') {
            base.customColor = options.customColor || '#e8f4f8';
            base.customStroke = options.customStroke || '#555555';
        }
        return base;
    }

    function defaultPortCount(type) {
        return { switch: 8, router: 4, server: 2, pc: 1, custom: 2 }[type] ?? 2;
    }

    function deleteDevice(deviceId) {
        const device = AppState.devices.find(d => d.id === deviceId);
        if (!device) return;
        const portIds = new Set(device.ports.map(p => p.id));
        AppState.connections = AppState.connections.filter(c =>
            !portIds.has(c.portA) && !portIds.has(c.portB)
        );
        AppState.devices.forEach(d =>
            d.ports.forEach(p => { if (portIds.has(p.connectedTo)) p.connectedTo = null; })
        );
        AppState.devices = AppState.devices.filter(d => d.id !== deviceId);
    }

    /** Duplicate a device — new UUIDs, offset +32px, no connections */
    function duplicateDevice(id) {
        const source = AppState.devices.find(d => d.id === id);
        if (!source) return null;
        const newId = generateUUID();
        const newPorts = source.ports.map(p => ({
            id: generateUUID(), label: p.label, connectedTo: null, deviceId: newId
        }));
        const copy = Object.assign({}, source, { id: newId, x: source.x + 32, y: source.y + 32, ports: newPorts });
        AppState.devices.push(copy);
        return copy;
    }

    // ── Device visuals ────────────────────────────────────────────────────

    function _isSel(device) {
        return device.id === AppState.selectedDeviceId || AppState.selectedDeviceIds.has(device.id);
    }

    function renderSwitch(device, g) {
        const { w, h } = getDims(device);
        const { fill, stroke, accent } = COLORS.switch;
        const sel = _isSel(device);

        g.appendChild(svgEl('rect', { x: 0, y: 0, width: w, height: h, fill, stroke, 'stroke-width': sel ? 2.5 : 1.5, rx: 3 }));
        g.appendChild(svgEl('line', { x1: 6, y1: h - 16, x2: w - 6, y2: h - 16, stroke: accent, 'stroke-width': 0.8, 'stroke-dasharray': '3,2' }));

        const lbl = svgEl('text', { x: w / 2, y: (h - 16) / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#111', 'font-size': 12, 'font-family': 'system-ui', 'pointer-events': 'none' });
        lbl.textContent = device.label;
        g.appendChild(lbl);

        const sub = svgEl('text', { x: 6, y: h - 5, 'text-anchor': 'start', 'dominant-baseline': 'middle', fill: accent, 'font-size': 9, 'font-family': 'system-ui', 'pointer-events': 'none' });
        sub.textContent = `SW  ${device.ports.length}p`;
        g.appendChild(sub);
    }

    function renderRouter(device, g) {
        const { fill, stroke, accent } = COLORS.router;
        const sel = _isSel(device);
        const r = 35, cx = 40, cy = 40;

        const pts = Array.from({ length: 6 }, (_, i) => {
            const a = i * Math.PI / 3 - Math.PI / 6;
            return `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
        }).join(' ');

        g.appendChild(svgEl('polygon', { points: pts, fill, stroke, 'stroke-width': sel ? 2.5 : 1.5 }));

        const lbl = svgEl('text', { x: cx, y: cy - 6, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#111', 'font-size': 11, 'font-family': 'system-ui', 'pointer-events': 'none' });
        lbl.textContent = device.label;
        g.appendChild(lbl);

        const sub = svgEl('text', { x: cx, y: cy + 8, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: accent, 'font-size': 9, 'font-family': 'system-ui', 'pointer-events': 'none' });
        sub.textContent = 'ROUTER';
        g.appendChild(sub);
    }

    function renderServer(device, g) {
        const { fill, stroke, accent } = COLORS.server;
        const sel = _isSel(device);

        g.appendChild(svgEl('rect', { x: 0, y: 0, width: 60, height: 100, fill, stroke, 'stroke-width': sel ? 2.5 : 1.5, rx: 2 }));
        for (let i = 1; i <= 4; i++) {
            g.appendChild(svgEl('line', { x1: 4, y1: i * 20, x2: 56, y2: i * 20, stroke: '#9fa8da', 'stroke-width': 0.6 }));
        }
        for (let i = 0; i < 2; i++) {
            g.appendChild(svgEl('rect', { x: 8, y: 8 + i * 20, width: 44, height: 10, fill: '#c5cae9', rx: 1 }));
        }

        const lbl = svgEl('text', { x: 30, y: 72, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#111', 'font-size': 10, 'font-family': 'system-ui', 'pointer-events': 'none' });
        lbl.textContent = device.label;
        g.appendChild(lbl);

        const sub = svgEl('text', { x: 30, y: 86, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: accent, 'font-size': 9, 'font-family': 'system-ui', 'pointer-events': 'none' });
        sub.textContent = 'SERVER';
        g.appendChild(sub);
    }

    function renderPC(device, g) {
        const { fill, stroke } = COLORS.pc;
        const sel = _isSel(device);

        g.appendChild(svgEl('rect', { x: 0, y: 0, width: 60, height: 44, fill, stroke, 'stroke-width': sel ? 2.5 : 1.5, rx: 2 }));
        g.appendChild(svgEl('rect', { x: 5, y: 5, width: 50, height: 30, fill: '#b2dfdb', rx: 1 }));
        g.appendChild(svgEl('rect', { x: 26, y: 44, width: 8, height: 7, fill: stroke }));
        g.appendChild(svgEl('rect', { x: 16, y: 51, width: 28, height: 5, fill: stroke, rx: 1 }));

        const lbl = svgEl('text', { x: 30, y: 68, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#111', 'font-size': 11, 'font-family': 'system-ui', 'pointer-events': 'none' });
        lbl.textContent = device.label;
        g.appendChild(lbl);
    }

    function renderCustom(device, g) {
        const { w, h } = getDims(device);
        const fill = device.customColor || '#e8f4f8';
        const stroke = device.customStroke || '#555';
        const sel = _isSel(device);

        g.appendChild(svgEl('rect', { x: 0, y: 0, width: w, height: h, fill, stroke, 'stroke-width': sel ? 2.5 : 1.5, rx: 4 }));

        const lbl = svgEl('text', { x: w / 2, y: h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: '#111', 'font-size': 12, 'font-family': 'system-ui', 'font-weight': '600', 'pointer-events': 'none' });
        lbl.textContent = device.label;
        g.appendChild(lbl);
    }

    function renderPorts(device, g) {
        device.ports.forEach(port => {
            const local = getLocalPortPos(device, port.id);
            const isConnecting = AppState.connectingPort && AppState.connectingPort.portId === port.id;
            const isConnected = !!port.connectedTo;

            const portRect = svgEl('rect', {
                x: local.x - 4, y: local.y - 4, width: 8, height: 8,
                fill: isConnecting ? '#2196F3' : (isConnected ? '#4CAF50' : '#fff'),
                stroke: isConnecting ? '#0d47a1' : '#555',
                'stroke-width': 1,
                'data-port-id': port.id,
                'data-device-id': device.id,
                class: 'port-sq',
                style: 'cursor:pointer'
            });

            portRect.addEventListener('pointerenter', e => {
                portRect.setAttribute('fill', '#ffeb3b');
                const tooltip = document.getElementById('port-tooltip');
                if (tooltip) {
                    const peer = port.connectedTo ? findDeviceByPort(port.connectedTo) : null;
                    const peerPort = port.connectedTo ? findPort(port.connectedTo) : null;
                    tooltip.textContent = port.label + (peer
                        ? ` → ${peer.label} [${peerPort ? peerPort.label : '?'}]`
                        : ' (free)');
                    tooltip.style.display = 'block';
                    tooltip.style.left = (e.clientX + 14) + 'px';
                    tooltip.style.top = (e.clientY - 10) + 'px';
                }
            });
            portRect.addEventListener('pointermove', e => {
                const tooltip = document.getElementById('port-tooltip');
                if (tooltip && tooltip.style.display === 'block') {
                    tooltip.style.left = (e.clientX + 14) + 'px';
                    tooltip.style.top = (e.clientY - 10) + 'px';
                }
            });
            portRect.addEventListener('pointerleave', () => {
                portRect.setAttribute('fill', isConnecting ? '#2196F3' : (isConnected ? '#4CAF50' : '#fff'));
                const tooltip = document.getElementById('port-tooltip');
                if (tooltip) tooltip.style.display = 'none';
            });
            portRect.addEventListener('pointerdown', e => e.stopPropagation());
            portRect.addEventListener('pointerup', e => {
                e.stopPropagation();
                Connections.handlePortClick(device.id, port.id);
            });

            g.appendChild(portRect);
        });
    }

    function updateSelectionVisual() {
        document.querySelectorAll('#devices-layer .device-group').forEach(gEl => {
            const id = gEl.id.replace('device-', '');
            const isSel = id === AppState.selectedDeviceId || AppState.selectedDeviceIds.has(id);
            gEl.classList.toggle('selected', isSel);
            const shape = gEl.querySelector('rect, polygon');
            if (shape) shape.setAttribute('stroke-width', isSel ? '2.5' : '1.5');
        });
    }

    function attachDragEvents(device, g) {
        let dragging = false;
        let offsetX, offsetY;
        let multiOffsets = [];

        g.addEventListener('pointerdown', e => {
            if (e.target.classList.contains('port-sq')) return;
            if (e.button !== 0) return;

            if (e.shiftKey) {
                // Shift+click: toggle in selection
                if (AppState.selectedDeviceIds.has(device.id)) {
                    AppState.selectedDeviceIds.delete(device.id);
                    if (AppState.selectedDeviceId === device.id) {
                        AppState.selectedDeviceId = [...AppState.selectedDeviceIds].at(-1) ?? null;
                    }
                } else {
                    AppState.selectedDeviceIds.add(device.id);
                    AppState.selectedDeviceId = device.id;
                }
                AppState.selectedConnectionId = null;
                updateSelectionVisual();
                ConfigPanel.render();
                e.stopPropagation();
                return;
            }

            if (!AppState.selectedDeviceIds.has(device.id)) {
                // Not in current selection — replace selection
                AppState.selectedDeviceId = device.id;
                AppState.selectedDeviceIds.clear();
                AppState.selectedDeviceIds.add(device.id);
                AppState.selectedConnectionId = null;
                AppState.connectingPort = null;
            } else {
                AppState.selectedDeviceId = device.id;
            }

            const svgEl2 = Canvas.getSVG();
            const rect = svgEl2.getBoundingClientRect();
            const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, AppState.viewport);
            offsetX = world.x - device.x;
            offsetY = world.y - device.y;

            if (AppState.selectedDeviceIds.size > 1) {
                multiOffsets = [...AppState.selectedDeviceIds].map(id => {
                    const d = AppState.devices.find(d => d.id === id);
                    return d ? { device: d, ox: world.x - d.x, oy: world.y - d.y } : null;
                }).filter(Boolean);
            } else {
                multiOffsets = [];
            }

            dragging = true;
            g.setPointerCapture(e.pointerId);
            updateSelectionVisual();
            ConfigPanel.render();
            e.stopPropagation();
        });

        g.addEventListener('pointermove', e => {
            if (!dragging) return;
            const svgEl2 = Canvas.getSVG();
            const rect = svgEl2.getBoundingClientRect();
            const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, AppState.viewport);

            if (multiOffsets.length > 1) {
                multiOffsets.forEach(({ device: d, ox, oy }) => {
                    let nx = world.x - ox;
                    let ny = world.y - oy;
                    if (AppState.snapEnabled) {
                        nx = snapToGrid(nx, AppState.gridSize);
                        ny = snapToGrid(ny, AppState.gridSize);
                    }
                    d.x = nx;
                    d.y = ny;
                    const dg = document.getElementById('device-' + d.id);
                    if (dg) dg.setAttribute('transform', `translate(${nx},${ny})`);
                });
            } else {
                let nx = world.x - offsetX;
                let ny = world.y - offsetY;
                if (AppState.snapEnabled) {
                    nx = snapToGrid(nx, AppState.gridSize);
                    ny = snapToGrid(ny, AppState.gridSize);
                }
                device.x = nx;
                device.y = ny;
                g.setAttribute('transform', `translate(${nx},${ny})`);
            }
            Connections.render(Canvas.getConnectionsLayer());
        });

        g.addEventListener('pointerup', () => {
            if (dragging) {
                dragging = false;
                Canvas.render();
            }
        });

        g.addEventListener('pointercancel', () => {
            dragging = false;
            Canvas.render();
        });
    }

    function render(layer) {
        clearEl(layer);
        AppState.devices.forEach(device => {
            const sel = _isSel(device);
            const g = svgEl('g', {
                id: 'device-' + device.id,
                class: 'device-group' + (sel ? ' selected' : ''),
                transform: `translate(${device.x},${device.y})`,
                style: 'cursor:move'
            });

            if (device.type === 'switch')      renderSwitch(device, g);
            else if (device.type === 'router') renderRouter(device, g);
            else if (device.type === 'server') renderServer(device, g);
            else if (device.type === 'pc')     renderPC(device, g);
            else if (device.type === 'custom') renderCustom(device, g);

            renderPorts(device, g);
            attachDragEvents(device, g);
            layer.appendChild(g);
        });
    }

    return {
        render,
        createDevice,
        deleteDevice,
        duplicateDevice,
        getDims,
        getPortPosition,
        getLocalPortPos,
        getPortExitDir,
        findDeviceByPort,
        findPort
    };
})();
