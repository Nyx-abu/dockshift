import { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';

export default function SaveWorkspaceModal({ isOpen, initialName = '', onSave, onClose }) {
  const [name, setName] = useState(initialName);
  const [animIn, setAnimIn] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isOpen) return;
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
      } else if (e.key === 'Enter') {
        if (!e.shiftKey) {
          e.preventDefault();
          handleSubmit();
        }
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

  const handleSubmit = () => {
    const trimmed = name.trim();
    if (!trimmed) return;
    if (onSave) {
      onSave(trimmed);
    }
  };

  const modal = (
    <>
      {/* Backdrop overlay – covers entire viewport, no layout impact */}
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.4)',
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
          transition: 'opacity 150ms ease-out, transform 150ms ease-out',
          width: 340,
          maxWidth: '90vw',
          borderRadius: 14,
          background: 'radial-gradient(circle at top left, #202733, #12141a)',
          border: '1px solid rgba(255,255,255,0.12)',
          boxShadow: 'none',
          padding: 16,
          color: 'white',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          zIndex: 10001,
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Save workspace snapshot"
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 4 }}>
          <div style={{ fontSize: 15, fontWeight: 600, flex: 1 }}>
            Save Workspace Snapshot
          </div>
          <button
            onClick={onClose}
            style={{
              border: 'none',
              background: 'transparent',
              color: 'rgba(255,255,255,0.65)',
              cursor: 'pointer',
              fontSize: 18,
            }}
            aria-label="Close save workspace modal"
          >
            ✕
          </button>
        </div>

        <label
          style={{
            fontSize: 12,
            color: 'rgba(255,255,255,0.7)',
            marginBottom: 2,
          }}
        >
          Name
        </label>
        <input
          ref={inputRef}
          type="text"
          placeholder="e.g. Deep Focus, Coding Session"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{
            width: '100%',
            padding: '7px 9px',
            borderRadius: 8,
            border: '1px solid rgba(255,255,255,0.2)',
            background: 'rgba(0,0,0,0.45)',
            color: 'white',
            fontSize: 13,
            outline: 'none',
          }}
        />

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 8,
            marginTop: 10,
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 10px',
              borderRadius: 999,
              border: 'none',
              background: 'rgba(255,255,255,0.08)',
              color: 'rgba(255,255,255,0.8)',
              fontSize: 12,
              cursor: 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={!name.trim()}
            style={{
              padding: '6px 12px',
              borderRadius: 999,
              border: 'none',
              background: !name.trim()
                ? 'rgba(255,255,255,0.18)'
                : 'linear-gradient(135deg, #4ac1ff, #6e7dff)',
              color: 'white',
              fontSize: 12,
              cursor: !name.trim() ? 'default' : 'pointer',
            }}
          >
            Save
          </button>
        </div>
      </div>
    </>
  );

  // Render into document.body so it never participates in dock layout
  return ReactDOM.createPortal(modal, document.body);
}

