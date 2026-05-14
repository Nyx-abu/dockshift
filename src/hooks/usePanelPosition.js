import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

export const PANEL_WIDTH = 420;

/**
 * The two canonical panel sizes. Every panel uses one of these (via the
 * `size` prop on ResizablePanel) so the dock never shows a grab-bag of
 * dimensions. STANDARD fits all content panels; WIDE is for the browser and
 * terminal, which genuinely need the horizontal room.
 */
export const PANEL_SIZE_STANDARD = { width: 420, height: 480, minWidth: 340, minHeight: 320 };
export const PANEL_SIZE_WIDE = { width: 720, height: 520, minWidth: 480, minHeight: 360 };

export const PANEL_BASE_STYLE = {
  position: 'fixed',
  left: -9999, top: -9999,
  width: PANEL_WIDTH,
  height: 480,
  maxHeight: '80vh',
  borderRadius: 'var(--ds-radius-xl)',
  // Solid frosted-glass surface. NOTE: deliberately NO CSS backdrop-filter.
  // On a transparent Electron window there is nothing *in the page* behind the
  // panel to blur — it's the live desktop showing through OS transparency, and
  // backdrop-filter can't reach that. Worse, it makes the panel sample empty
  // transparent pixels and render see-through (that's why the panel looked
  // like glass over VS Code). Real blur comes from the window's acrylic
  // backdrop material, which the main process turns on when a panel opens.
  background: 'var(--ds-bg-panel)',
  border: '1px solid var(--ds-border)',
  boxShadow: 'var(--ds-shadow-panel)',
  padding: '14px 14px 12px',
  color: 'var(--ds-text-primary)',
  display: 'flex',
  flexDirection: 'column',
  gap: 'var(--ds-space-3)',
  zIndex: 9500,
  pointerEvents: 'auto',
  WebkitAppRegion: 'no-drag',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
  boxSizing: 'border-box',
  overflow: 'hidden',
  opacity: 0,
  // Hidden until usePanelPosition() has centered it. Without this the panel
  // can flash at the viewport's top-left for a frame — re-resizable briefly
  // flips the element to `position: relative` on mount to measure its parent,
  // and the window is still resizing to fullscreen underneath it.
  visibility: 'hidden',
};

export const HEADER_STYLE = {
  display: 'flex', alignItems: 'center', gap: 'var(--ds-space-2)',
  flexShrink: 0, WebkitAppRegion: 'no-drag',
  cursor: 'grab',
  userSelect: 'none',
};

export const TITLE_STYLE = {
  fontSize: 'var(--ds-font-md)', fontWeight: 'var(--ds-weight-semibold)',
  flex: 1, letterSpacing: '-0.01em',
  color: 'var(--ds-text-strong)',
};

export const CLOSE_BTN = {
  background: 'var(--ds-bg-control)',
  border: '1px solid var(--ds-border)',
  cursor: 'pointer',
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  borderRadius: 'var(--ds-radius-sm)', padding: '4px', flexShrink: 0,
  color: 'var(--ds-text-faint)', fontSize: 'var(--ds-font-base)', lineHeight: 1,
  transition: 'all 0.15s ease', WebkitAppRegion: 'no-drag',
  width: 24, height: 24,
};

export const INPUT_STYLE = {
  background: 'var(--ds-bg-input)',
  border: '1px solid var(--ds-border)',
  borderRadius: 'var(--ds-radius-md)', padding: '8px 12px',
  color: 'var(--ds-text-primary)', fontSize: 'var(--ds-font-sm)',
  outline: 'none', width: '100%', boxSizing: 'border-box',
  WebkitAppRegion: 'no-drag',
  transition: 'border-color 0.15s ease',
  fontFamily: 'inherit',
};

export const SCROLL_AREA = {
  flex: 1, overflowY: 'auto', minHeight: 0,
  display: 'flex', flexDirection: 'column', gap: 'var(--ds-space-1)',
  scrollbarWidth: 'thin', scrollbarColor: 'var(--ds-scrollbar-thumb) transparent',
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

    // The Electron window grows from collapsed to fullscreen when a panel
    // opens. Centering against `window.innerWidth` *during* that resize lands
    // the panel at an intermediate spot and it visibly settles — so we wait
    // until the window has actually reached (about) the screen's work area,
    // then center once.
    let cancelled = false;

    // Stay hidden until centered. Also covers the re-open case, where the
    // element still carries `visibility: visible` and a stale position.
    panelRef.current.style.visibility = 'hidden';

    const center = () => {
      if (cancelled || !panelRef.current) return;
      const vW = window.innerWidth;
      const vH = window.innerHeight;
      const pW = panelRef.current.offsetWidth || panelWidth;
      const pH = panelRef.current.offsetHeight || 480;

      panelRef.current.style.left = `${Math.round((vW - pW) / 2)}px`;
      panelRef.current.style.top = `${Math.round(Math.max(40, (vH - pH) / 2 - 20))}px`;
      panelRef.current.style.visibility = 'visible';
      panelRef.current.classList.add('macos-pop');
      hasPositioned.current = true;
    };

    // Center only once the window has finished growing — i.e. its viewport
    // has reached the screen work area (small tolerance for rounding/DPI).
    const tryCenter = () => {
      if (cancelled || hasPositioned.current) return;
      const doneW = window.innerWidth >= window.screen.availWidth - 8;
      const doneH = window.innerHeight >= window.screen.availHeight - 8;
      if (doneW && doneH) center();
    };

    const onResize = () => {
      tryCenter();
      if (hasPositioned.current) window.removeEventListener('resize', onResize);
    };
    window.addEventListener('resize', onResize);

    // In case the window is already fullscreen (re-open) try immediately.
    requestAnimationFrame(tryCenter);

    // Safety net: if the resize never reports a full-size viewport, center
    // anyway after a beat so the panel can't get stuck hidden.
    const fallback = setTimeout(() => {
      if (!hasPositioned.current) center();
    }, 500);

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      clearTimeout(fallback);
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
