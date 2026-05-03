'use strict';

/** Generate a UUID v4 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
}

/** Snap a value to the nearest grid multiple */
function snapToGrid(value, gridSize) {
    return Math.round(value / gridSize) * gridSize;
}

/** Return the midpoint between two points */
function midpoint(x1, y1, x2, y2) {
    return { x: (x1 + x2) / 2, y: (y1 + y2) / 2 };
}

/** Convert screen coordinates to world coordinates */
function screenToWorld(screenX, screenY, viewport) {
    return {
        x: (screenX - viewport.panX) / viewport.zoom,
        y: (screenY - viewport.panY) / viewport.zoom
    };
}

/** Create an SVG element with the given attributes */
function svgEl(tag, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

/** Remove all children of a DOM element */
function clearEl(el) {
    while (el.firstChild) el.removeChild(el.firstChild);
}

/** Format a Date as a readable timestamp */
function formatDate(date) {
    return date.toISOString().replace('T', ' ').split('.')[0] + ' UTC';
}

/** Clamp a number between min and max */
function clamp(val, min, max) {
    return Math.max(min, Math.min(max, val));
}
