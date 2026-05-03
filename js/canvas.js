'use strict';

const Canvas = (() => {
    let svg, mainGroup, groupsLayer, connectionsLayer, devicesLayer;
    let spaceDown = false;
    let isPanning = false;
    let panAnchor = { x: 0, y: 0 };
    let rbState = { active: false, confirmed: false, startClientX: 0, startClientY: 0 };

    function init(svgElement) {
        svg = svgElement;

        const defs = svgEl('defs');
        const pattern = svgEl('pattern', {
            id: 'grid-dot', x: '0', y: '0',
            width: '16', height: '16',
            patternUnits: 'userSpaceOnUse'
        });
        const dot = svgEl('circle', { cx: '0', cy: '0', r: '0.8', fill: '#cccccc' });
        pattern.appendChild(dot);
        defs.appendChild(pattern);
        svg.appendChild(defs);

        const gridRect = svgEl('rect', {
            id: 'grid-bg',
            x: '-9999', y: '-9999',
            width: '19998', height: '19998',
            fill: 'url(#grid-dot)'
        });
        svg.appendChild(gridRect);

        mainGroup = svgEl('g', { id: 'main-group' });
        groupsLayer = svgEl('g', { id: 'groups-layer' });
        connectionsLayer = svgEl('g', { id: 'connections-layer' });
        devicesLayer = svgEl('g', { id: 'devices-layer' });
        mainGroup.appendChild(groupsLayer);
        mainGroup.appendChild(connectionsLayer);
        mainGroup.appendChild(devicesLayer);
        svg.appendChild(mainGroup);

        attachEvents();
    }

    function applyViewport() {
        const vp = AppState.viewport;
        mainGroup.setAttribute('transform',
            `translate(${vp.panX},${vp.panY}) scale(${vp.zoom})`);

        const gridSize = 16 * vp.zoom;
        const pattern = document.getElementById('grid-dot');
        if (pattern) {
            pattern.setAttribute('width', gridSize);
            pattern.setAttribute('height', gridSize);
            pattern.setAttribute('x', vp.panX % gridSize);
            pattern.setAttribute('y', vp.panY % gridSize);
            const dot = pattern.querySelector('circle');
            if (dot) dot.setAttribute('r', clamp(0.8 * vp.zoom, 0.5, 2.5));
        }
    }

    function render() {
        applyViewport();
        Groups.render(groupsLayer);
        Connections.render(connectionsLayer);
        Devices.render(devicesLayer);
    }

    /** Pan+zoom to fit all devices and groups with 40px padding */
    function fitToContents() {
        if (AppState.devices.length === 0 && AppState.groups.length === 0) return;
        const PAD = 40;
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

        AppState.devices.forEach(d => {
            const { w, h } = Devices.getDims(d);
            minX = Math.min(minX, d.x);
            minY = Math.min(minY, d.y);
            maxX = Math.max(maxX, d.x + w);
            maxY = Math.max(maxY, d.y + h);
        });
        AppState.groups.forEach(g => {
            minX = Math.min(minX, g.x);
            minY = Math.min(minY, g.y);
            maxX = Math.max(maxX, g.x + g.width);
            maxY = Math.max(maxY, g.y + g.height);
        });

        const svgRect = svg.getBoundingClientRect();
        const svgW = svgRect.width;
        const svgH = svgRect.height;
        const contentW = maxX - minX;
        const contentH = maxY - minY;
        const zoom = clamp(
            Math.min((svgW - PAD * 2) / contentW, (svgH - PAD * 2) / contentH),
            0.3, 3
        );
        AppState.viewport.zoom = zoom;
        AppState.viewport.panX = (svgW - contentW * zoom) / 2 - minX * zoom;
        AppState.viewport.panY = (svgH - contentH * zoom) / 2 - minY * zoom;
        applyViewport();
        updateZoomDisplay();
    }

    function _updateRubberBand(curX, curY) {
        const rb = document.getElementById('rubber-band');
        if (!rb) return;
        const svgRect = svg.getBoundingClientRect();
        const x1 = Math.min(rbState.startClientX, curX) - svgRect.left;
        const y1 = Math.min(rbState.startClientY, curY) - svgRect.top;
        const w = Math.abs(curX - rbState.startClientX);
        const h = Math.abs(curY - rbState.startClientY);
        rb.style.display = 'block';
        rb.style.left = x1 + 'px';
        rb.style.top = y1 + 'px';
        rb.style.width = w + 'px';
        rb.style.height = h + 'px';
    }

    function _hideRubberBand() {
        const rb = document.getElementById('rubber-band');
        if (rb) rb.style.display = 'none';
    }

    function _selectDevicesInRubberBand(curX, curY) {
        const svgRect = svg.getBoundingClientRect();
        const vp = AppState.viewport;
        const x1 = Math.min(rbState.startClientX, curX) - svgRect.left;
        const y1 = Math.min(rbState.startClientY, curY) - svgRect.top;
        const x2 = Math.max(rbState.startClientX, curX) - svgRect.left;
        const y2 = Math.max(rbState.startClientY, curY) - svgRect.top;
        const wTL = screenToWorld(x1, y1, vp);
        const wBR = screenToWorld(x2, y2, vp);

        AppState.selectedDeviceIds.clear();
        AppState.devices.forEach(device => {
            const dims = Devices.getDims(device);
            const cx = device.x + dims.w / 2;
            const cy = device.y + dims.h / 2;
            if (cx >= wTL.x && cx <= wBR.x && cy >= wTL.y && cy <= wBR.y) {
                AppState.selectedDeviceIds.add(device.id);
            }
        });
        AppState.selectedDeviceId = [...AppState.selectedDeviceIds].at(-1) ?? null;
    }

    function attachEvents() {
        document.addEventListener('keydown', e => {
            if (e.code === 'Space' && !e.target.matches('input,textarea,select')) {
                spaceDown = true;
                if (!isPanning) svg.style.cursor = 'grab';
                e.preventDefault();
            }
        });
        document.addEventListener('keyup', e => {
            if (e.code === 'Space') {
                spaceDown = false;
                if (!isPanning) svg.style.cursor = AppState.addingGroup ? 'crosshair' : '';
            }
        });

        svg.addEventListener('pointerdown', e => {
            Connections.hideContextMenu();
            Groups.hideContextMenu();

            const isMidButton = e.button === 1;
            const isSpacePan = e.button === 0 && spaceDown;

            if (isMidButton || isSpacePan) {
                isPanning = true;
                rbState.active = false;
                panAnchor = { x: e.clientX - AppState.viewport.panX, y: e.clientY - AppState.viewport.panY };
                svg.style.cursor = 'grabbing';
                svg.setPointerCapture(e.pointerId);
                e.preventDefault();
                return;
            }

            if (AppState.addingGroup && e.button === 0 &&
                (e.target === svg || e.target.id === 'grid-bg')) {
                const rect = svg.getBoundingClientRect();
                const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, AppState.viewport);
                AppState.groupDragStart = world;
                AppState.pendingGroup = { x: world.x, y: world.y, width: 0, height: 0 };
                svg.setPointerCapture(e.pointerId);
                return;
            }

            if (e.button === 0 && (e.target === svg || e.target.id === 'grid-bg')) {
                if (AppState.connectingPort) {
                    AppState.connectingPort = null;
                    svg.style.cursor = '';
                    render();
                    return;
                }
                rbState.active = true;
                rbState.confirmed = false;
                rbState.startClientX = e.clientX;
                rbState.startClientY = e.clientY;
                svg.setPointerCapture(e.pointerId);
            }
        });

        svg.addEventListener('pointermove', e => {
            if (isPanning) {
                AppState.viewport.panX = e.clientX - panAnchor.x;
                AppState.viewport.panY = e.clientY - panAnchor.y;
                applyViewport();
                return;
            }

            if (rbState.active) {
                const dx = e.clientX - rbState.startClientX;
                const dy = e.clientY - rbState.startClientY;
                if (!rbState.confirmed && (Math.abs(dx) > 5 || Math.abs(dy) > 5)) {
                    rbState.confirmed = true;
                    AppState.selectedDeviceIds.clear();
                    AppState.selectedDeviceId = null;
                    AppState.selectedConnectionId = null;
                    scheduleRender();
                }
                if (rbState.confirmed) _updateRubberBand(e.clientX, e.clientY);
                return;
            }

            if (AppState.pendingGroup && AppState.groupDragStart) {
                const rect = svg.getBoundingClientRect();
                const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, AppState.viewport);
                const dx = world.x - AppState.groupDragStart.x;
                const dy = world.y - AppState.groupDragStart.y;
                AppState.pendingGroup = {
                    x: dx >= 0 ? AppState.groupDragStart.x : world.x,
                    y: dy >= 0 ? AppState.groupDragStart.y : world.y,
                    width: Math.abs(dx),
                    height: Math.abs(dy)
                };
                render();
                return;
            }

            if (AppState.connectingPort) {
                const rect = svg.getBoundingClientRect();
                AppState.mouseWorldPos = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, AppState.viewport);
                scheduleRender();
            }
        });

        svg.addEventListener('pointerup', e => {
            if (isPanning) {
                isPanning = false;
                svg.style.cursor = spaceDown ? 'grab' : (AppState.addingGroup ? 'crosshair' : '');
                return;
            }

            if (rbState.active) {
                if (rbState.confirmed) {
                    _selectDevicesInRubberBand(e.clientX, e.clientY);
                    _hideRubberBand();
                } else {
                    AppState.selectedDeviceIds.clear();
                    AppState.selectedDeviceId = null;
                    AppState.selectedConnectionId = null;
                }
                rbState.active = false;
                rbState.confirmed = false;
                render();
                ConfigPanel.render();
                return;
            }

            if (AppState.pendingGroup && AppState.groupDragStart) {
                const pg = AppState.pendingGroup;
                if (pg.width > 20 && pg.height > 20) {
                    Groups.finaliseGroup(pg);
                }
                AppState.pendingGroup = null;
                AppState.groupDragStart = null;
                AppState.addingGroup = false;
                svg.style.cursor = '';
                render();
            }
        });

        svg.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = svg.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;
            const factor = e.deltaY < 0 ? 1.1 : 0.9;
            const vp = AppState.viewport;
            const newZoom = clamp(vp.zoom * factor, 0.3, 3);
            vp.panX = mx - (mx - vp.panX) * (newZoom / vp.zoom);
            vp.panY = my - (my - vp.panY) * (newZoom / vp.zoom);
            vp.zoom = newZoom;
            applyViewport();
            updateZoomDisplay();
        }, { passive: false });

        svg.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'copy';
        });

        svg.addEventListener('drop', e => {
            e.preventDefault();
            const type = e.dataTransfer.getData('device-type');
            const customTypeId = e.dataTransfer.getData('custom-type-id');
            if (!type && !customTypeId) return;

            const rect = svg.getBoundingClientRect();
            const world = screenToWorld(e.clientX - rect.left, e.clientY - rect.top, AppState.viewport);
            let x = world.x, y = world.y;
            if (AppState.snapEnabled) {
                x = snapToGrid(x, AppState.gridSize);
                y = snapToGrid(y, AppState.gridSize);
            }

            if (customTypeId) {
                const ctype = AppState.customDeviceTypes.find(t => t.id === customTypeId);
                if (ctype) {
                    pushUndo();
                    const device = Devices.createDevice('custom', x, y, {
                        customLabel: ctype.name,
                        portCount: ctype.portCount,
                        customColor: ctype.customColor,
                        customStroke: ctype.customStroke
                    });
                    AppState.devices.push(device);
                    AppState.selectedDeviceId = device.id;
                    AppState.selectedDeviceIds.clear();
                    AppState.selectedDeviceIds.add(device.id);
                    render();
                }
                return;
            }

            if (type === 'switch') {
                showPortCountModal(x, y);
            } else if (type === 'custom') {
                showCustomDeviceModal(x, y);
            } else {
                pushUndo();
                const device = Devices.createDevice(type, x, y);
                AppState.devices.push(device);
                AppState.selectedDeviceId = device.id;
                AppState.selectedDeviceIds.clear();
                AppState.selectedDeviceIds.add(device.id);
                render();
            }
        });
    }

    function getSVG() { return svg; }
    function getGroupsLayer() { return groupsLayer; }
    function getConnectionsLayer() { return connectionsLayer; }
    function getDevicesLayer() { return devicesLayer; }

    return { init, render, applyViewport, fitToContents, getSVG, getGroupsLayer, getConnectionsLayer, getDevicesLayer };
})();
