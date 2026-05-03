'use strict';

const ConfigPanel = (() => {
    function render() {
        const panel = document.getElementById('config-panel-content');
        if (!panel) return;

        // Multi-select panel
        if (AppState.selectedDeviceIds.size > 1) {
            renderMultiSelect(panel);
            return;
        }

        if (AppState.selectedDeviceId) {
            const device = AppState.devices.find(d => d.id === AppState.selectedDeviceId);
            if (device) { renderDevice(panel, device); return; }
        }
        if (AppState.selectedConnectionId) {
            const conn = AppState.connections.find(c => c.id === AppState.selectedConnectionId);
            if (conn) { renderConnection(panel, conn); return; }
        }
        panel.innerHTML = '<p class="panel-empty">Click a device or connection to configure it.</p>';
    }

    // ── Multi-select panel ────────────────────────────────────────────────

    function renderMultiSelect(panel) {
        panel.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'panel-header';
        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = `${AppState.selectedDeviceIds.size} DEVICES`;
        header.appendChild(badge);
        panel.appendChild(header);

        const info = document.createElement('p');
        info.style.cssText = 'font-size:11px;color:#777;padding:8px 0;';
        info.textContent = 'Shift+click to add/remove. Drag any selected device to move all.';
        panel.appendChild(info);

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = `Delete ${AppState.selectedDeviceIds.size} Devices`;
        del.addEventListener('click', () => {
            if (confirm(`Delete ${AppState.selectedDeviceIds.size} selected devices?`)) {
                pushUndo();
                [...AppState.selectedDeviceIds].forEach(id => Devices.deleteDevice(id));
                AppState.selectedDeviceIds.clear();
                AppState.selectedDeviceId = null;
                render();
                Canvas.render();
            }
        });
        panel.appendChild(del);
    }

    // ── Device panel ──────────────────────────────────────────────────────

    function renderDevice(panel, device) {
        panel.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'panel-header';
        const badge = document.createElement('span');
        badge.className = 'type-badge type-' + device.type;
        badge.textContent = device.type.toUpperCase();
        header.appendChild(badge);
        panel.appendChild(header);

        addField(panel, 'Name', 'text', device.label, val => {
            device.label = val;
            const gEl = document.getElementById('device-' + device.id);
            if (gEl) {
                const lbl = gEl.querySelector('text');
                if (lbl) lbl.textContent = val;
            }
        });

        addField(panel, 'IP Address', 'text', device.ip, val => { device.ip = val; }, '0.0.0.0/24');
        addTextarea(panel, 'Notes', device.notes, val => { device.notes = val; });
        addTagsField(panel, device);
        addPortsSection(panel, device);

        // Save to Toolbox (custom devices only)
        if (device.type === 'custom') {
            const saveBtn = document.createElement('button');
            saveBtn.className = 'btn-tiny';
            saveBtn.style.marginTop = '10px';
            saveBtn.textContent = 'Save as Device Type';
            saveBtn.title = 'Add this device as a reusable type in the toolbox';
            saveBtn.addEventListener('click', () => {
                const exists = AppState.customDeviceTypes.some(t =>
                    t.name === device.label && t.portCount === device.ports.length
                );
                if (exists) { alert('A type with this name and port count already exists.'); return; }
                AppState.customDeviceTypes.push({
                    id: generateUUID(),
                    name: device.label,
                    portCount: device.ports.length,
                    customColor: device.customColor || '#e8f4f8',
                    customStroke: device.customStroke || '#555555'
                });
                renderCustomToolboxCards();
                saveBtn.textContent = 'Saved!';
                saveBtn.disabled = true;
            });
            panel.appendChild(saveBtn);
        }

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = 'Delete Device';
        del.addEventListener('click', () => {
            if (confirm(`Delete "${device.label}"?`)) {
                pushUndo();
                Devices.deleteDevice(device.id);
                AppState.selectedDeviceId = null;
                AppState.selectedDeviceIds.clear();
                render();
                Canvas.render();
            }
        });
        panel.appendChild(del);
    }

    function addField(panel, labelText, type, value, onChange, placeholder = '') {
        const row = document.createElement('div');
        row.className = 'panel-row';
        const lbl = document.createElement('label');
        lbl.textContent = labelText;
        row.appendChild(lbl);
        const inp = document.createElement('input');
        inp.type = type;
        inp.value = value;
        inp.placeholder = placeholder;
        inp.addEventListener('input', () => onChange(inp.value));
        row.appendChild(inp);
        panel.appendChild(row);
        return inp;
    }

    function addTextarea(panel, labelText, value, onChange) {
        const row = document.createElement('div');
        row.className = 'panel-row';
        const lbl = document.createElement('label');
        lbl.textContent = labelText;
        row.appendChild(lbl);
        const ta = document.createElement('textarea');
        ta.value = value;
        ta.rows = 3;
        ta.addEventListener('input', () => onChange(ta.value));
        row.appendChild(ta);
        panel.appendChild(row);
    }

    function addTagsField(panel, device) {
        const row = document.createElement('div');
        row.className = 'panel-row';
        const lbl = document.createElement('label');
        lbl.textContent = 'Tags';
        row.appendChild(lbl);
        const inp = document.createElement('input');
        inp.type = 'text';
        inp.value = device.tags.join(', ');
        inp.placeholder = 'web, prod, rack-a';
        row.appendChild(inp);
        panel.appendChild(row);

        const chips = document.createElement('div');
        chips.className = 'tag-chips';
        function refreshChips() {
            chips.innerHTML = '';
            device.tags.forEach(t => {
                const c = document.createElement('span');
                c.className = 'tag-chip';
                c.textContent = t;
                chips.appendChild(c);
            });
        }
        refreshChips();
        inp.addEventListener('input', () => {
            device.tags = inp.value.split(',').map(t => t.trim()).filter(Boolean);
            refreshChips();
        });
        panel.appendChild(chips);
    }

    // ── Ports section ─────────────────────────────────────────────────────

    function addPortsSection(panel, device) {
        const sec = document.createElement('div');
        sec.className = 'panel-section';

        const headRow = document.createElement('div');
        headRow.className = 'ports-head';

        const title = document.createElement('span');
        title.className = 'panel-section-title';
        title.textContent = 'Ports';
        headRow.appendChild(title);

        const addBtn = document.createElement('button');
        addBtn.className = 'btn-tiny';
        addBtn.textContent = '+ Add Port';
        addBtn.addEventListener('click', () => {
            pushUndo();
            device.ports.push({
                id: generateUUID(),
                label: 'Port ' + (device.ports.length + 1),
                connectedTo: null,
                deviceId: device.id
            });
            Canvas.render();
            render();
        });
        headRow.appendChild(addBtn);
        sec.appendChild(headRow);

        const list = document.createElement('div');
        list.className = 'ports-list';

        device.ports.forEach(port => {
            const row = document.createElement('div');
            row.className = 'port-row';

            const nameInp = document.createElement('input');
            nameInp.type = 'text';
            nameInp.className = 'port-name-input';
            nameInp.value = port.label;
            nameInp.title = 'Port name';
            nameInp.addEventListener('input', () => { port.label = nameInp.value; });
            row.appendChild(nameInp);

            const connInfo = document.createElement('span');
            connInfo.className = 'port-conn-info';
            if (port.connectedTo) {
                const otherPort = Devices.findPort(port.connectedTo);
                const otherDev = otherPort ? Devices.findDeviceByPort(port.connectedTo) : null;
                connInfo.textContent = otherDev ? `→ ${otherDev.label}` : '→ ?';
                connInfo.style.color = '#388e3c';

                const discBtn = document.createElement('button');
                discBtn.className = 'btn-tiny-danger';
                discBtn.textContent = '✕';
                discBtn.title = 'Disconnect';
                discBtn.addEventListener('click', () => {
                    const conn = AppState.connections.find(c =>
                        c.portA === port.id || c.portB === port.id
                    );
                    if (conn) Connections.deleteConnection(conn.id);
                    AppState.selectedConnectionId = null;
                    Canvas.render();
                    render();
                });
                row.appendChild(connInfo);
                row.appendChild(discBtn);
            } else {
                connInfo.textContent = 'free';
                connInfo.style.color = '#bbb';
                row.appendChild(connInfo);

                const rmBtn = document.createElement('button');
                rmBtn.className = 'btn-tiny-danger';
                rmBtn.textContent = '−';
                rmBtn.title = 'Remove port';
                rmBtn.addEventListener('click', () => {
                    pushUndo();
                    device.ports = device.ports.filter(p => p.id !== port.id);
                    Canvas.render();
                    render();
                });
                row.appendChild(rmBtn);
            }

            list.appendChild(row);
        });

        if (device.ports.length === 0) {
            const empty = document.createElement('p');
            empty.className = 'panel-empty';
            empty.style.fontSize = '11px';
            empty.textContent = 'No ports — click + Add Port';
            list.appendChild(empty);
        }

        sec.appendChild(list);
        panel.appendChild(sec);
    }

    // ── Connection panel ──────────────────────────────────────────────────

    function renderConnection(panel, conn) {
        panel.innerHTML = '';

        const header = document.createElement('div');
        header.className = 'panel-header';
        const badge = document.createElement('span');
        badge.className = 'type-badge';
        badge.textContent = 'CONNECTION';
        header.appendChild(badge);
        panel.appendChild(header);

        // Status toggle
        const statusRow = document.createElement('div');
        statusRow.className = 'panel-row';
        const statusLbl = document.createElement('label');
        statusLbl.textContent = 'Status';
        const statusBtn = document.createElement('button');
        statusBtn.className = conn.status === 'up' ? 'status-up' : 'status-down';
        statusBtn.textContent = conn.status === 'up' ? 'Up' : 'Down';
        statusBtn.addEventListener('click', () => {
            conn.status = conn.status === 'up' ? 'down' : 'up';
            render();
            Canvas.render();
        });
        statusRow.appendChild(statusLbl);
        statusRow.appendChild(statusBtn);
        panel.appendChild(statusRow);

        addField(panel, 'Label', 'text', conn.label, val => {
            conn.label = val;
            Canvas.render();
        }, 'VLAN 10, Uplink...');

        addField(panel, 'Speed / Bandwidth', 'text', conn.speed || '', val => {
            conn.speed = val;
            Canvas.render();
        }, '1 Gbps, 10G...');

        // Color picker
        const colorRow = document.createElement('div');
        colorRow.className = 'panel-row';
        const colorLbl = document.createElement('label');
        colorLbl.textContent = 'Color';
        const colorInp = document.createElement('input');
        colorInp.type = 'color';
        colorInp.value = conn.color;
        colorInp.addEventListener('input', () => { conn.color = colorInp.value; Canvas.render(); });
        colorRow.appendChild(colorLbl);
        colorRow.appendChild(colorInp);
        panel.appendChild(colorRow);

        // Endpoints
        const devA = Devices.findDeviceByPort(conn.portA);
        const devB = Devices.findDeviceByPort(conn.portB);
        const pA = Devices.findPort(conn.portA);
        const pB = Devices.findPort(conn.portB);
        const info = document.createElement('div');
        info.className = 'conn-endpoints';
        info.textContent =
            (devA ? devA.label : '?') + ' [' + (pA ? pA.label : '?') + ']' +
            '  ↔  ' +
            (devB ? devB.label : '?') + ' [' + (pB ? pB.label : '?') + ']';
        panel.appendChild(info);

        const del = document.createElement('button');
        del.className = 'btn-delete';
        del.textContent = 'Delete Connection';
        del.addEventListener('click', () => {
            Connections.deleteConnection(conn.id);
            AppState.selectedConnectionId = null;
            render();
            Canvas.render();
        });
        panel.appendChild(del);
    }

    return { render };
})();
