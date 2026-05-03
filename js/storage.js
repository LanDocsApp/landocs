'use strict';

const Storage = (() => {
    const AUTO_SAVE_KEY = 'net-topo-autosave';

    // ── JSON Save / Load ──────────────────────────────────────────────────

    function saveJSON() {
        const data = _buildSaveData();
        download(JSON.stringify(data, null, 2), 'landocs-layout.json', 'application/json');
        autoSave();
    }

    function _buildSaveData() {
        return {
            devices: AppState.devices,
            connections: AppState.connections,
            groups: AppState.groups,
            viewport: AppState.viewport,
            customDeviceTypes: AppState.customDeviceTypes
        };
    }

    function loadJSON(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
            try {
                const data = JSON.parse(ev.target.result);
                AppState.devices = data.devices || [];
                AppState.connections = data.connections || [];
                AppState.groups = data.groups || [];
                AppState.customDeviceTypes = data.customDeviceTypes || [];
                if (data.viewport) Object.assign(AppState.viewport, data.viewport);
                AppState.selectedDeviceId = null;
                AppState.selectedDeviceIds.clear();
                AppState.selectedConnectionId = null;
                AppState.connectingPort = null;
                renderCustomToolboxCards();
                render();
            } catch (err) {
                alert('Failed to load file: ' + err.message);
            }
        };
        reader.readAsText(file);
        e.target.value = '';
    }

    // ── Auto-save ─────────────────────────────────────────────────────────

    function autoSave() {
        try {
            localStorage.setItem(AUTO_SAVE_KEY, JSON.stringify(_buildSaveData()));
        } catch (_) { /* quota exceeded or private browsing — silently skip */ }
    }

    function checkAutoSave() {
        try {
            const raw = localStorage.getItem(AUTO_SAVE_KEY);
            if (!raw) return;
            const data = JSON.parse(raw);
            if (!data.devices || data.devices.length === 0) return;
            showRecoveryBanner(data);
        } catch (_) { /* corrupted data — ignore */ }
    }

    function showRecoveryBanner(data) {
        const panel = document.getElementById('canvas-panel');
        if (!panel) return;

        const banner = document.createElement('div');
        banner.id = 'recovery-banner';
        banner.innerHTML = `
            <span>Auto-saved layout found (${data.devices.length} device${data.devices.length !== 1 ? 's' : ''}).</span>
            <button id="recovery-restore">Restore</button>
            <button id="recovery-dismiss">Dismiss</button>
        `;
        panel.insertBefore(banner, panel.firstChild);

        document.getElementById('recovery-restore').addEventListener('click', () => {
            AppState.devices = data.devices || [];
            AppState.connections = data.connections || [];
            AppState.groups = data.groups || [];
            AppState.customDeviceTypes = data.customDeviceTypes || [];
            if (data.viewport) Object.assign(AppState.viewport, data.viewport);
            AppState.selectedDeviceId = null;
            AppState.selectedDeviceIds.clear();
            AppState.selectedConnectionId = null;
            AppState.connectingPort = null;
            renderCustomToolboxCards();
            render();
            banner.remove();
        });

        document.getElementById('recovery-dismiss').addEventListener('click', () => {
            localStorage.removeItem(AUTO_SAVE_KEY);
            banner.remove();
        });
    }

    // ── PNG Export ────────────────────────────────────────────────────────

    function exportPNG() {
        const svg = Canvas.getSVG();
        const rect = svg.getBoundingClientRect();
        const svgData = new XMLSerializer().serializeToString(svg);
        const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
        const url = URL.createObjectURL(svgBlob);

        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = rect.width * 2;
            canvas.height = rect.height * 2;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.scale(2, 2);
            ctx.drawImage(img, 0, 0, rect.width, rect.height);
            URL.revokeObjectURL(url);
            canvas.toBlob(blob => download(blob, 'landocs-diagram.png', 'image/png'));
        };
        img.onerror = () => { URL.revokeObjectURL(url); alert('PNG export failed.'); };
        img.src = url;
    }

    // ── Plain Text Export ─────────────────────────────────────────────────

    function exportText() {
        const lines = [];
        const sep = '='.repeat(60);

        lines.push('LANDOCS - HOME NETWORK REPORT');
        lines.push('Generated: ' + formatDate(new Date()));
        lines.push('');

        lines.push(sep);
        lines.push('DEVICES');
        lines.push(sep);

        AppState.devices.forEach(device => {
            lines.push('');
            lines.push(`${device.label} (${device.type.toUpperCase()})`);
            lines.push(`  ID: ${device.id}`);
            lines.push(`  IP Address: ${device.ip || 'Not assigned'}`);
            lines.push(`  Notes: ${device.notes || 'None'}`);
            lines.push(`  Tags: ${device.tags.length ? device.tags.join(', ') : 'None'}`);
            lines.push('  Ports:');

            device.ports.forEach(port => {
                if (port.connectedTo) {
                    const otherPort = Devices.findPort(port.connectedTo);
                    const otherDevice = otherPort ? Devices.findDeviceByPort(port.connectedTo) : null;
                    const conn = AppState.connections.find(c =>
                        (c.portA === port.id && c.portB === port.connectedTo) ||
                        (c.portB === port.id && c.portA === port.connectedTo)
                    );
                    lines.push(
                        `    - ${port.label}: Connected to ${otherDevice ? otherDevice.label : '?'} ` +
                        `via ${otherPort ? otherPort.label : '?'}`
                    );
                    if (conn) {
                        lines.push(`        Label: ${conn.label || 'None'}`);
                        lines.push(`        Speed: ${conn.speed || 'Not specified'}`);
                        lines.push(`        Status: ${conn.status === 'up' ? 'Up' : 'Down'}`);
                    }
                } else {
                    lines.push(`    - ${port.label}: Not connected`);
                }
            });
        });

        lines.push('');
        lines.push(sep);
        lines.push('GROUPS');
        lines.push(sep);

        if (AppState.groups.length === 0) {
            lines.push('  (No groups defined)');
        } else {
            AppState.groups.forEach(group => {
                const contained = Groups.devicesInGroup(group);
                lines.push('');
                lines.push(group.label);
                lines.push(`  Bounds: x=${Math.round(group.x)}, y=${Math.round(group.y)}, ` +
                    `width=${Math.round(group.width)}, height=${Math.round(group.height)}`);
                lines.push(`  Contains devices: ${contained.length ? contained.join(', ') : '(none)'}`);
            });
        }

        lines.push('');
        lines.push(sep);
        lines.push('CONNECTIONS SUMMARY');
        lines.push(sep);

        if (AppState.connections.length === 0) {
            lines.push('  (No connections)');
        } else {
            AppState.connections.forEach(conn => {
                const devA = Devices.findDeviceByPort(conn.portA);
                const devB = Devices.findDeviceByPort(conn.portB);
                const pA = Devices.findPort(conn.portA);
                const pB = Devices.findPort(conn.portB);
                lines.push('');
                lines.push(
                    `${devA ? devA.label : '?'} (${pA ? pA.label : '?'}) ` +
                    `<──> ${devB ? devB.label : '?'} (${pB ? pB.label : '?'})`
                );
                lines.push(`  Label: ${conn.label || 'None'}`);
                lines.push(`  Speed: ${conn.speed || 'Not specified'}`);
                lines.push(`  Status: ${conn.status === 'up' ? 'Up' : 'Down'}`);
                lines.push(`  Color: ${conn.color}`);
            });
        }

        lines.push('');
        lines.push(sep);
        lines.push('END OF REPORT');

        download(lines.join('\n'), 'landocs-report.txt', 'text/plain');
    }

    function download(data, filename, mimeType) {
        const blob = data instanceof Blob ? data : new Blob([data], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    return { saveJSON, loadJSON, exportPNG, exportText, autoSave, checkAutoSave };
})();
