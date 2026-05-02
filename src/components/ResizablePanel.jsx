import React, { useRef } from 'react';
import { Resizable } from 're-resizable';
import { usePanelPosition, useDraggable, PANEL_BASE_STYLE } from '../hooks/usePanelPosition';

export default function ResizablePanel({ 
  isOpen, 
  dockAction, 
  defaultWidth = 420, 
  defaultHeight = 480, 
  minWidth = 300, 
  minHeight = 300, 
  style = {}, 
  children 
}) {
  const panelRef = useRef(null);

  // Center on first open only
  usePanelPosition(isOpen, panelRef, dockAction, defaultWidth);

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
      defaultSize={{ width: defaultWidth, height: defaultHeight }}
      minWidth={minWidth}
      minHeight={minHeight}
      style={{
        ...PANEL_BASE_STYLE,
        display: isOpen ? 'flex' : 'none',
        flexDirection: 'column',
        ...style
      }}
      enable={{
        top: true, right: true, bottom: true, left: true,
        topRight: true, bottomRight: true, bottomLeft: true, topLeft: true
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
