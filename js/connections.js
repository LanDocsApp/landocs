'use strict';

const Connections = (() => {
    let contextMenu = null;
    let ctxConnectionId = null;

    function handlePortClick(deviceId, portId) {
        if (AppState.connectingPort) {
            const { deviceId: srcDevId, portId: srcPortId } = AppState.connectingPort;

            if (srcDevId === deviceId) {
                AppState.connectingPort = null;
                Canvas.getSVG().style.cursor = '';
                Canvas.render();
                return;
            }

            const srcPort = Devices.findPort(srcPortId);
            const dstPort = Devices.findPort(portId);
            if (!srcPort || !dstPort) return;
            if (srcPort.connectedTo || dstPort.connectedTo) {
                alert('One or both ports are already connected. Disconnect first.');
                AppState.connectingPort = null;
                Canvas.getSVG().style.cursor = '';
                Canvas.render();
                return;
            }

            pushUndo();
            const id = generateUUID();
            AppState.connections.push({ id, portA: srcPortId, portB: portId, label: '', speed: '', color: '#444444', status: 'up' });
            srcPort.connectedTo = portId;
            dstPort.connectedTo = srcPortId;

            AppState.connectingPort = null;
            AppState.selectedConnectionId = id;
            Canvas.getSVG().style.cursor = '';
            Canvas.render();
            ConfigPanel.render();
        } else {
            AppState.connectingPort = { deviceId, portId };
            AppState.selectedConnectionId = null;
            Canvas.getSVG().style.cursor = 'crosshair';

            const device = AppState.devices.find(d => d.id === deviceId);
            if (device) AppState.mouseWorldPos = Devices.getPortPosition(device, portId);

            Canvas.render();
        }
    }

    function deleteConnection(connectionId) {
        const conn = AppState.connections.find(c => c.id === connectionId);
        if (!conn) return;
        pushUndo();
        const pA = Devices.findPort(conn.portA);
        const pB = Devices.findPort(conn.portB);
        if (pA) pA.connectedTo = null;
        if (pB) pB.connectedTo = null;
        AppState.connections = AppState.connections.filter(c => c.id !== connectionId);
    }

    function buildPath(devA, portA, devB, portB) {
        const p0 = Devices.getPortPosition(devA, portA.id);
        const p3 = Devices.getPortPosition(devB, portB.id);
        const d0 = Devices.getPortExitDir(devA, portA.id);
        const d3 = Devices.getPortExitDir(devB, portB.id);
        const cd = 70;
        const p1 = { x: p0.x + d0.dx * cd, y: p0.y + d0.dy * cd };
        const p2 = { x: p3.x + d3.dx * cd, y: p3.y + d3.dy * cd };
        return `M ${p0.x} ${p0.y} C ${p1.x} ${p1.y}, ${p2.x} ${p2.y}, ${p3.x} ${p3.y}`;
    }

    function showContextMenu(connId, clientX, clientY) {
        hideContextMenu();
        ctxConnectionId = connId;
        const conn = AppState.connections.find(c => c.id === connId);
        if (!conn) return;

        contextMenu = document.createElement('div');
        contextMenu.className = 'ctx-menu';
        contextMenu.style.left = clientX + 'px';
        contextMenu.style.top = clientY + 'px';

        const items = [
            { label: 'Edit label', action: () => editLabel(conn) },
            { label: 'Change color', action: () => changeColor(conn) },
            { label: conn.status === 'up' ? 'Mark as Down' : 'Mark as Up', action: () => toggleStatus(conn) },
            { label: 'Delete connection', action: () => { deleteConnection(connId); AppState.selectedConnectionId = null; Canvas.render(); ConfigPanel.render(); }, danger: true }
        ];

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'ctx-item' + (item.danger ? ' danger' : '');
            btn.textContent = item.label;
            btn.addEventListener('click', () => { hideContextMenu(); item.action(); });
            contextMenu.appendChild(btn);
        });

        document.body.appendChild(contextMenu);
        setTimeout(() => {
            document.addEventListener('pointerdown', hideContextMenu, { once: true });
        }, 0);
    }

    function hideContextMenu() {
        if (contextMenu) { contextMenu.remove(); contextMenu = null; ctxConnectionId = null; }
    }

    function editLabel(conn) {
        const val = prompt('Connection label:', conn.label);
        if (val !== null) { conn.label = val; render(Canvas.getConnectionsLayer()); }
    }

    function changeColor(conn) {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = conn.color;
        input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(input);
        input.addEventListener('change', () => { conn.color = input.value; render(Canvas.getConnectionsLayer()); });
        input.addEventListener('blur', () => input.remove());
        input.click();
    }

    function toggleStatus(conn) {
        conn.status = conn.status === 'up' ? 'down' : 'up';
        render(Canvas.getConnectionsLayer());
    }

    function render(layer) {
        clearEl(layer);

        AppState.connections.forEach(conn => {
            const devA = Devices.findDeviceByPort(conn.portA);
            const devB = Devices.findDeviceByPort(conn.portB);
            if (!devA || !devB) return;

            const portA = devA.ports.find(p => p.id === conn.portA);
            const portB = devB.ports.find(p => p.id === conn.portB);
            if (!portA || !portB) return;

            const d = buildPath(devA, portA, devB, portB);
            const isSelected = conn.id === AppState.selectedConnectionId;
            const isDown = conn.status === 'down';

            const hitPath = svgEl('path', {
                d, fill: 'none', stroke: 'transparent', 'stroke-width': 12, style: 'cursor:pointer'
            });

            const visPath = svgEl('path', {
                d, fill: 'none',
                stroke: isDown ? '#e53935' : (isSelected ? '#1565c0' : conn.color),
                'stroke-width': isSelected ? 2.5 : 2,
                'stroke-dasharray': isDown ? '8,4' : 'none',
                'pointer-events': 'none'
            });

            const g = svgEl('g', { class: 'connection-group' });
            g.appendChild(hitPath);
            g.appendChild(visPath);

            const p0 = Devices.getPortPosition(devA, portA.id);
            const p3 = Devices.getPortPosition(devB, portB.id);
            const mp = midpoint(p0.x, p0.y, p3.x, p3.y);

            // Label
            if (conn.label) {
                const bg = svgEl('rect', {
                    x: mp.x - 22, y: mp.y - 9, width: 44, height: 14,
                    fill: '#fff', stroke: '#ccc', 'stroke-width': 0.5, rx: 2,
                    'pointer-events': 'none'
                });
                const txt = svgEl('text', {
                    x: mp.x, y: mp.y,
                    'text-anchor': 'middle', 'dominant-baseline': 'middle',
                    fill: '#333', 'font-size': '9', 'font-family': 'system-ui',
                    'pointer-events': 'none'
                });
                txt.textContent = conn.label;
                g.appendChild(bg);
                g.appendChild(txt);
            }

            // Speed badge (shown below label, or at midpoint if no label)
            if (conn.speed) {
                const yOff = conn.label ? 12 : 0;
                const sbg = svgEl('rect', {
                    x: mp.x - 18, y: mp.y + yOff - 7, width: 36, height: 12,
                    fill: '#f5f5f5', stroke: '#bbb', 'stroke-width': 0.5, rx: 2,
                    'pointer-events': 'none'
                });
                const stxt = svgEl('text', {
                    x: mp.x, y: mp.y + yOff,
                    'text-anchor': 'middle', 'dominant-baseline': 'middle',
                    fill: '#555', 'font-size': '8', 'font-family': 'system-ui',
                    'pointer-events': 'none'
                });
                stxt.textContent = conn.speed;
                g.appendChild(sbg);
                g.appendChild(stxt);
            }

            hitPath.addEventListener('pointerdown', e => {
                e.stopPropagation();
                AppState.selectedConnectionId = conn.id;
                AppState.selectedDeviceId = null;
                AppState.selectedDeviceIds.clear();
                Canvas.render();
                ConfigPanel.render();
            });
            hitPath.addEventListener('contextmenu', e => {
                e.preventDefault();
                e.stopPropagation();
                showContextMenu(conn.id, e.clientX, e.clientY);
            });

            layer.appendChild(g);
        });

        // Pending connection line
        if (AppState.connectingPort) {
            const { deviceId, portId } = AppState.connectingPort;
            const dev = AppState.devices.find(d => d.id === deviceId);
            if (dev) {
                const p0 = Devices.getPortPosition(dev, portId);
                const p1 = AppState.mouseWorldPos;
                layer.appendChild(svgEl('line', {
                    x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y,
                    stroke: '#2196F3', 'stroke-width': 1.5, 'stroke-dasharray': '6,3',
                    'pointer-events': 'none'
                }));
            }
        }
    }

    return { handlePortClick, deleteConnection, render, hideContextMenu, showContextMenu };
})();
