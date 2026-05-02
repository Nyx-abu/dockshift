import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const PANEL_WIDTH = 420;

export const PANEL_BASE_STYLE = {
  position: 'fixed',
  left: -9999, top: -9999,
  width: PANEL_WIDTH,
  height: 480,
  maxHeight: '80vh',
  borderRadius: 16,
  background: 'rgba(22, 24, 32, 0.95)',
  border: '1px solid rgba(255, 255, 255, 0.07)',
  boxShadow: '0 16px 48px rgba(0, 0, 0, 0.4), 0 4px 16px rgba(0, 0, 0, 0.2)',
  padding: '14px 14px 12px',
  color: 'white',
  display: 'flex',
  flexDirection: 'column',
  gap: 10,
  zIndex: 9500,
  pointerEvents: 'auto',
  WebkitAppRegion: 'no-drag',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  boxSizing: 'border-box',
  overflow: 'hidden',
  opacity: 0,
};

export const HEADER_STYLE = {
  display: 'flex', alignItems: 'center', gap: 8,
  flexShrink: 0, WebkitAppRegion: 'no-drag',
  cursor: 'grab',
  userSelect: 'none',
};

export const TITLE_STYLE = {
  fontSize: 14, fontWeight: 600, flex: 1, letterSpacing: '-0.01em',
  color: '#fff',
};

export const CLOSE_BTN = {
  background: 'rgba(255, 255, 255, 0.06)',
  border: '1px solid rgba(255, 255, 255, 0.06)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 7, padding: '4px', flexShrink: 0,
  color: 'rgba(255,255,255,0.35)', fontSize: 13, lineHeight: 1,
  transition: 'all 0.15s ease', WebkitAppRegion: 'no-drag',
  width: 24, height: 24,
};

export const INPUT_STYLE = {
  background: 'rgba(255, 255, 255, 0.05)',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 8, padding: '8px 12px', color: '#fff', fontSize: 12,
  outline: 'none', width: '100%', boxSizing: 'border-box',
  WebkitAppRegion: 'no-drag',
  transition: 'border-color 0.15s ease',
  fontFamily: 'inherit',
};

export const SCROLL_AREA = {
  flex: 1, overflowY: 'auto', minHeight: 0,
  display: 'flex', flexDirection: 'column', gap: 4,
  scrollbarWidth: 'thin', scrollbarColor: 'rgba(255,255,255,0.1) transparent',
  WebkitAppRegion: 'no-drag',
};

/**
 * Centers the panel on first open.
 * Waits for the Electron window to finish resizing to fullscreen before positioning.
 */
export function usePanelPosition(isOpen, panelRef, dockAction, panelWidth = PANEL_WIDTH) {
  const hasPositioned = useRef(false);

  useEffect(() => {
    if (!isOpen) hasPositioned.current = false;
  }, [isOpen]);

  useLayoutEffect(() => {
    if (!isOpen || !panelRef.current || hasPositioned.current) return;

    // The Electron window resizes from ~480x140 to fullscreen when a panel opens.
    // We need to wait for that resize to complete before centering.
    let cancelled = false;

    const positionPanel = () => {
      if (cancelled || !panelRef.current) return;

      const vW = window.innerWidth;
      const vH = window.innerHeight;

      // If viewport is still the small dock size, wait for resize
      if (vW < 600 || vH < 400) return;

      const pW = panelRef.current.offsetWidth || panelWidth;
      const pH = panelRef.current.offsetHeight || 480;

      const tx = Math.round((vW - pW) / 2);
      const ty = Math.round(Math.max(40, (vH - pH) / 2 - 20));

      panelRef.current.style.left = `${tx}px`;
      panelRef.current.style.top = `${ty}px`;
      panelRef.current.classList.add('macos-pop');

      hasPositioned.current = true;
    };

    // Try positioning on resize events (fired when electron window expands)
    const onResize = () => {
      if (hasPositioned.current) return;
      positionPanel();
      if (hasPositioned.current) {
        window.removeEventListener('resize', onResize);
      }
    };

    window.addEventListener('resize', onResize);

    // Also try after a short delay as fallback
    const timer = setTimeout(() => {
      if (!hasPositioned.current) positionPanel();
    }, 150);

    // Try immediately in case window is already fullscreen
    requestAnimationFrame(positionPanel);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      clearTimeout(timer);
    };
  }, [isOpen, panelWidth]);
}

/**
 * Makes a panel draggable by its header area.
 */
export function useDraggable(panelRef) {
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const onMouseDown = useCallback((e) => {
    const handle = e.target.closest('[data-drag-handle]');
    if (!handle) return;
    if (e.target.closest('button, input, select, textarea, a')) return;

    e.preventDefault();
    dragging.current = true;

    const el = panelRef.current;
    if (!el) return;

    const rect = el.getBoundingClientRect();
    offset.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    handle.style.cursor = 'grabbing';

    const onMouseMove = (ev) => {
      if (!dragging.current || !panelRef.current) return;
      ev.preventDefault();

      let newX = ev.clientX - offset.current.x;
      let newY = ev.clientY - offset.current.y;

      const vW = window.innerWidth;
      const vH = window.innerHeight;
      const pW = panelRef.current.offsetWidth;

      const minVisible = 60;
      newX = Math.max(-pW + minVisible, Math.min(newX, vW - minVisible));
      newY = Math.max(0, Math.min(newY, vH - minVisible));

      panelRef.current.style.left = `${Math.round(newX)}px`;
      panelRef.current.style.top = `${Math.round(newY)}px`;
    };

    const onMouseUp = () => {
      dragging.current = false;
      handle.style.cursor = 'grab';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  }, [panelRef]);

  useEffect(() => {
    const el = panelRef.current;
    if (!el) return;

    el.addEventListener('mousedown', onMouseDown);
    return () => el.removeEventListener('mousedown', onMouseDown);
  }, [panelRef, onMouseDown]);
}
