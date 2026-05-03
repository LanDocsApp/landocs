'use strict';

const Groups = (() => {
    const GROUP_COLORS = ['#e3f2fd', '#fce4ec', '#e8f5e9', '#fff8e1', '#f3e5f5', '#e0f2f1'];
    let colorIdx = 0;
    let contextMenu = null;
    let ctxGroupId = null;
    let _outsideHandler = null;

    function startDrawing() {
        AppState.addingGroup = true;
        Canvas.getSVG().style.cursor = 'crosshair';
    }

    function finaliseGroup(rect) {
        pushUndo();
        const label = prompt('Group name:', 'Group ' + (AppState.groups.length + 1));
        if (label === null) { AppState.undoStack.pop(); return; }
        AppState.groups.push({
            id: generateUUID(),
            label: label || ('Group ' + (AppState.groups.length + 1)),
            x: rect.x, y: rect.y,
            width: rect.width, height: rect.height,
            color: GROUP_COLORS[colorIdx++ % GROUP_COLORS.length]
        });
    }

    function showContextMenu(groupId, clientX, clientY) {
        hideContextMenu();
        ctxGroupId = groupId;
        const group = AppState.groups.find(g => g.id === groupId);
        if (!group) return;

        contextMenu = document.createElement('div');
        contextMenu.className = 'ctx-menu';
        contextMenu.style.left = clientX + 'px';
        contextMenu.style.top = clientY + 'px';

        const renameBtn = document.createElement('button');
        renameBtn.className = 'ctx-item';
        renameBtn.textContent = 'Rename';
        renameBtn.addEventListener('click', () => {
            hideContextMenu();
            const val = prompt('Group name:', group.label);
            if (val !== null) { group.label = val; render(Canvas.getGroupsLayer()); }
        });

        const colorBtn = document.createElement('button');
        colorBtn.className = 'ctx-item';
        colorBtn.textContent = 'Change color';
        colorBtn.addEventListener('click', () => {
            hideContextMenu();
            const input = document.createElement('input');
            input.type = 'color';
            input.value = _colorToHex(group.color);
            input.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
            document.body.appendChild(input);
            input.addEventListener('change', () => {
                group.color = input.value;
                render(Canvas.getGroupsLayer());
            });
            input.addEventListener('blur', () => input.remove());
            input.click();
        });

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'ctx-item danger';
        deleteBtn.textContent = 'Delete Group';
        deleteBtn.addEventListener('click', () => {
            hideContextMenu();
            pushUndo();
            AppState.groups = AppState.groups.filter(g => g.id !== groupId);
            render(Canvas.getGroupsLayer());
        });

        contextMenu.appendChild(renameBtn);
        contextMenu.appendChild(colorBtn);
        contextMenu.appendChild(deleteBtn);
        document.body.appendChild(contextMenu);

        // Dismiss only when clicking OUTSIDE the menu, so button clicks still fire.
        setTimeout(() => {
            _outsideHandler = e => {
                if (contextMenu && !contextMenu.contains(e.target)) hideContextMenu();
            };
            document.addEventListener('pointerdown', _outsideHandler);
        }, 0);
    }

    function hideContextMenu() {
        if (contextMenu) { contextMenu.remove(); contextMenu = null; ctxGroupId = null; }
        if (_outsideHandler) {
            document.removeEventListener('pointerdown', _outsideHandler);
            _outsideHandler = null;
        }
    }

    function _colorToHex(color) {
        if (color && color.startsWith('#') && color.length === 7) return color;
        const canvas = document.createElement('canvas');
        canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 1, 1);
        const d = ctx.getImageData(0, 0, 1, 1).data;
        return '#' + [d[0], d[1], d[2]].map(v => v.toString(16).padStart(2, '0')).join('');
    }

    function attachGroupEvents(group, g, lblEl) {
        let dragging = false;
        let offsetX, offsetY;

        lblEl.style.cursor = 'move';

        lblEl.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            dragging = true;
            const svgRect = Canvas.getSVG().getBoundingClientRect();
            const world = screenToWorld(e.clientX - svgRect.left, e.clientY - svgRect.top, AppState.viewport);
            offsetX = world.x - group.x;
            offsetY = world.y - group.y;
            lblEl.setPointerCapture(e.pointerId);
            e.stopPropagation();
        });

        lblEl.addEventListener('pointermove', e => {
            if (!dragging) return;
            const svgRect = Canvas.getSVG().getBoundingClientRect();
            const world = screenToWorld(e.clientX - svgRect.left, e.clientY - svgRect.top, AppState.viewport);
            group.x = world.x - offsetX;
            group.y = world.y - offsetY;
            // Move the whole group by updating only the transform — no re-render, so
            // pointer capture on lblEl is preserved for the duration of the drag.
            g.setAttribute('transform', `translate(${group.x},${group.y})`);
        });

        lblEl.addEventListener('pointerup', () => {
            if (dragging) { dragging = false; Canvas.render(); }
        });

        lblEl.addEventListener('pointercancel', () => { dragging = false; });

        g.addEventListener('contextmenu', e => {
            e.preventDefault();
            e.stopPropagation();
            showContextMenu(group.id, e.clientX, e.clientY);
        });

        const handle = g.querySelector('.resize-handle');
        if (!handle) return;
        let resizing = false;

        handle.addEventListener('pointerdown', e => {
            if (e.button !== 0) return;
            resizing = true;
            handle.setPointerCapture(e.pointerId);
            e.stopPropagation();
        });

        handle.addEventListener('pointermove', e => {
            if (!resizing) return;
            const svgRect = Canvas.getSVG().getBoundingClientRect();
            const world = screenToWorld(e.clientX - svgRect.left, e.clientY - svgRect.top, AppState.viewport);
            group.width  = Math.max(60, world.x - group.x);
            group.height = Math.max(40, world.y - group.y);
            // Update child elements directly — keeps pointer capture on handle intact.
            const rects = g.querySelectorAll('rect');
            if (rects[0]) { rects[0].setAttribute('width', group.width); rects[0].setAttribute('height', group.height); }
            if (rects[1]) { rects[1].setAttribute('width', Math.min(group.width - 12, 120)); }
            handle.setAttribute('x', group.width - 8);
            handle.setAttribute('y', group.height - 8);
        });

        handle.addEventListener('pointerup', () => {
            if (resizing) { resizing = false; Canvas.render(); }
        });

        handle.addEventListener('pointercancel', () => { resizing = false; });
    }

    function render(layer) {
        clearEl(layer);

        AppState.groups.forEach(group => {
            // Use a translate transform so drag can update a single attribute without
            // destroying child elements (which would break pointer capture mid-drag).
            const g = svgEl('g', {
                class: 'group-rect-group',
                transform: `translate(${group.x},${group.y})`
            });

            const handleSize = 8;

            // Background fill rect (relative coords, origin = group top-left)
            g.appendChild(svgEl('rect', {
                x: 0, y: 0,
                width: group.width, height: group.height,
                fill: group.color, 'fill-opacity': '0.35',
                stroke: '#aaa', 'stroke-width': 1.2, rx: 4
            }));

            // Label pill background
            const lblW = Math.min(group.width - 12, 120);
            g.appendChild(svgEl('rect', {
                x: 6, y: 4,
                width: lblW, height: 16,
                fill: group.color, 'fill-opacity': '0.85',
                stroke: '#aaa', 'stroke-width': 0.6, rx: 3
            }));

            const lblEl = svgEl('text', {
                x: 10, y: 13,
                'dominant-baseline': 'middle',
                fill: '#333', 'font-size': '11', 'font-family': 'system-ui',
                'font-weight': '600', 'pointer-events': 'all',
                style: 'user-select:none'
            });
            lblEl.textContent = group.label;
            g.appendChild(lblEl);

            // Resize handle (bottom-right corner)
            g.appendChild(svgEl('rect', {
                x: group.width - handleSize,
                y: group.height - handleSize,
                width: handleSize, height: handleSize,
                fill: '#888', 'fill-opacity': '0.6',
                class: 'resize-handle', style: 'cursor:se-resize'
            }));

            attachGroupEvents(group, g, lblEl);
            layer.appendChild(g);
        });

        if (AppState.pendingGroup && AppState.pendingGroup.width > 0) {
            const pg = AppState.pendingGroup;
            layer.appendChild(svgEl('rect', {
                x: pg.x, y: pg.y,
                width: pg.width, height: pg.height,
                fill: '#e3f2fd', 'fill-opacity': '0.3',
                stroke: '#1565c0', 'stroke-width': 1.2,
                'stroke-dasharray': '6,3', rx: 4,
                'pointer-events': 'none'
            }));
        }
    }

    function devicesInGroup(group) {
        return AppState.devices
            .filter(d => {
                const dims = Devices.getDims(d);
                const cx = d.x + dims.w / 2;
                const cy = d.y + dims.h / 2;
                return cx >= group.x && cx <= group.x + group.width &&
                       cy >= group.y && cy <= group.y + group.height;
            })
            .map(d => d.label);
    }

    return { startDrawing, finaliseGroup, render, hideContextMenu, devicesInGroup };
})();
