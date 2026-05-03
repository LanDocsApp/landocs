'use strict';

const Search = (() => {
    function show() {
        const overlay = document.getElementById('search-overlay');
        if (!overlay) return;
        overlay.classList.remove('hidden');
        const input = document.getElementById('search-input');
        if (input) { input.value = ''; input.focus(); }
        _refreshList('');
    }

    function hide() {
        const overlay = document.getElementById('search-overlay');
        if (overlay) overlay.classList.add('hidden');
    }

    function _refreshList(query) {
        const list = document.getElementById('search-list');
        if (!list) return;
        list.innerHTML = '';
        const q = query.toLowerCase();
        const matches = AppState.devices.filter(d =>
            d.label.toLowerCase().includes(q) ||
            (d.ip && d.ip.toLowerCase().includes(q)) ||
            d.tags.some(t => t.toLowerCase().includes(q))
        );

        if (matches.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'search-empty';
            empty.textContent = query ? 'No devices match.' : 'No devices on canvas.';
            list.appendChild(empty);
            return;
        }

        matches.forEach(device => {
            const row = document.createElement('div');
            row.className = 'search-row';

            const badge = document.createElement('span');
            badge.className = 'type-badge type-' + device.type;
            badge.textContent = device.type.toUpperCase();

            const name = document.createElement('span');
            name.className = 'search-name';
            name.textContent = device.label;

            const ip = document.createElement('span');
            ip.className = 'search-ip';
            ip.textContent = device.ip || '';

            row.appendChild(badge);
            row.appendChild(name);
            row.appendChild(ip);

            row.addEventListener('click', () => {
                AppState.selectedDeviceId = device.id;
                AppState.selectedDeviceIds.clear();
                AppState.selectedDeviceIds.add(device.id);
                AppState.selectedConnectionId = null;

                // Pan canvas to center on the device
                const svgEl = Canvas.getSVG();
                const svgRect = svgEl.getBoundingClientRect();
                const dims = Devices.getDims(device);
                const cx = device.x + dims.w / 2;
                const cy = device.y + dims.h / 2;
                const zoom = AppState.viewport.zoom;
                AppState.viewport.panX = svgRect.width / 2 - cx * zoom;
                AppState.viewport.panY = svgRect.height / 2 - cy * zoom;

                Canvas.applyViewport();
                updateZoomDisplay();
                Canvas.render();
                ConfigPanel.render();
                hide();
            });

            list.appendChild(row);
        });
    }

    function setup() {
        const input = document.getElementById('search-input');
        if (!input) return;
        input.addEventListener('input', () => _refreshList(input.value));
        input.addEventListener('keydown', e => {
            if (e.key === 'Escape') { e.preventDefault(); hide(); }
        });
        const overlay = document.getElementById('search-overlay');
        if (overlay) {
            overlay.addEventListener('click', e => { if (e.target === overlay) hide(); });
        }
        const closeBtn = document.getElementById('search-close');
        if (closeBtn) closeBtn.addEventListener('click', hide);
    }

    return { show, hide, setup };
})();
