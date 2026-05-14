import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Button, IconButton, Input, XIcon } from './ui';

export default function SaveWorkspaceModal({ isOpen, initialName = '', onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [animIn, setAnimIn] = useState(false);
  const inputRef = useRef(null);

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (onSave) onSave(trimmed);
  };

  useEffect(() => {
    if (!isOpen) return undefined;
    setName(initialName || '');
    setAnimIn(false);

    const id = setTimeout(() => {
      setAnimIn(true);
      if (inputRef.current) {
        inputRef.current.focus();
        inputRef.current.select();
      }
    }, 0);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', handleKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const modal = (
    <>
      {/* Backdrop overlay */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(8, 9, 12, 0.5)',
          zIndex: 10000,
          pointerEvents: 'auto',
        }}
        onClick={onClose}
      />

      {/* Centered modal container */}
      <div
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${animIn ? 1 : 0.96})`,
          opacity: animIn ? 1 : 0,
          transition: 'opacity 150ms var(--ds-ease), transform 150ms var(--ds-ease)',
          width: 340,
          maxWidth: '90vw',
          borderRadius: 'var(--ds-radius-lg)',
          // Solid surface — no backdrop-filter (it can't blur the desktop
          // through the transparent window, only makes the modal see-through).
          background: 'var(--ds-bg-panel)',
          border: '1px solid var(--ds-border-strong)',
          boxShadow: 'var(--ds-shadow-panel)',
          padding: 'var(--ds-space-4)',
          color: 'var(--ds-text-primary)',
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--ds-space-3)',
          zIndex: 10001,
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Save workspace snapshot"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-2)' }}>
          <div style={{
            fontSize: 'var(--ds-font-md)',
            fontWeight: 'var(--ds-weight-semibold)',
            color: 'var(--ds-text-strong)',
            flex: 1,
          }}>
            Save Workspace Snapshot
          </div>
          <IconButton variant="danger" title="Close" onClick={onClose}>
            <XIcon size={14} />
          </IconButton>
        </div>

        <div>
          <label style={{
            display: 'block',
            fontSize: 'var(--ds-font-xs)',
            fontWeight: 'var(--ds-weight-semibold)',
            color: 'var(--ds-text-muted)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            marginBottom: 'var(--ds-space-2)',
          }}>
            Name
          </label>
          <Input
            ref={inputRef}
            type="text"
            placeholder="e.g. Deep Focus, Coding Session"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--ds-space-2)', marginTop: 'var(--ds-space-1)' }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="primary" onClick={handleSubmit} disabled={!name.trim()}>Save</Button>
        </div>
      </div>
    </>
  );

  // Render into document.body so it never participates in dock layout
  return ReactDOM.createPortal(modal, document.body);
}
