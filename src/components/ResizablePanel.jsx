import React, { useRef } from 'react';
import { Resizable } from 're-resizable';
import {
  usePanelPosition,
  useDraggable,
  PANEL_BASE_STYLE,
  PANEL_SIZE_STANDARD,
  PANEL_SIZE_WIDE,
} from '../hooks/usePanelPosition';

const SIZES = { standard: PANEL_SIZE_STANDARD, wide: PANEL_SIZE_WIDE };

/**
 * Shared draggable + resizable wrapper for every dock panel.
 *
 * Sizing: pass `size="standard"` (default) or `size="wide"`. Both resolve to
 * the shared constants in usePanelPosition, so the dock only ever shows two
 * panel footprints. Explicit `defaultWidth` / `minHeight` / etc. still work
 * as an escape hatch but should be rare — prefer the named sizes.
 *
 * Surface styling (frosted-glass background, blur, border, shadow) comes
 * entirely from PANEL_BASE_STYLE — panels should NOT pass a `background`
 * override in `style`.
 */
export default function ResizablePanel({
  isOpen,
  dockAction,
  size = 'standard',
  defaultWidth,
  defaultHeight,
  minWidth,
  minHeight,
  style = {},
  children,
}) {
  const panelRef = useRef(null);
  const preset = SIZES[size] || PANEL_SIZE_STANDARD;

  // Explicit props win over the named preset (escape hatch); preset is the norm.
  const width = defaultWidth ?? preset.width;
  const height = defaultHeight ?? preset.height;
  const resolvedMinWidth = minWidth ?? preset.minWidth;
  const resolvedMinHeight = minHeight ?? preset.minHeight;

  // Center on first open only
  usePanelPosition(isOpen, panelRef, dockAction, width);

  // Enable free dragging via header
  useDraggable(panelRef);

  // When Resizable creates the ref, it passes it to its internal div.
  // We can attach it to panelRef so usePanelPosition can manipulate it.
  const handleRef = (c) => {
    if (c && c.resizable) {
      panelRef.current = c.resizable;
    }
  };

  return (
    <Resizable
      ref={handleRef}
      defaultSize={{ width, height }}
      minWidth={resolvedMinWidth}
      minHeight={resolvedMinHeight}
      style={{
        ...PANEL_BASE_STYLE,
        display: isOpen ? 'flex' : 'none',
        flexDirection: 'column',
        ...style,
      }}
      enable={{
        top: true, right: true, bottom: true, left: true,
        topRight: true, bottomRight: true, bottomLeft: true, topLeft: true,
      }}
    >
      {/* Wrap children so that headers with data-drag-handle are detected */}
      {React.Children.map(children, (child, index) => {
        // The first child is typically the header — mark it as the drag handle
        if (index === 0 && React.isValidElement(child)) {
          return React.cloneElement(child, {
            'data-drag-handle': true,
          });
        }
        return child;
      })}
    </Resizable>
  );
}
