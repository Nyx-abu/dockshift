import { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Button, IconButton, XIcon } from './ui';

/**
 * Generic confirm modal — same chrome as SaveWorkspaceModal but with no input
 * field, a customizable destructive button, and a clear "ARE YOU SURE" tone
 * for irreversible actions. Use for: Clear All, Delete named items, Remove
 * secrets. Skip for: single-item routine deletes (would over-confirm).
 *
 * Props:
 *   isOpen        boolean
 *   title         heading text
 *   message       body text (string or node)
 *   confirmLabel  text on the destructive button (default "Confirm")
 *   variant       'danger' (default) | 'primary'
 *   onConfirm     fired when the user clicks the confirm button
 *   onClose       fired when the user clicks Cancel, the backdrop, X, or Esc
 */
export default function ConfirmModal({
  isOpen,
  title = 'Are you sure?',
  message = '',
  confirmLabel = 'Confirm',
  variant = 'danger',
  onConfirm,
  onClose,
}) {
  const [animIn, setAnimIn] = useState(false);

  useEffect(() => {
    if (!isOpen) return undefined;
    setAnimIn(false);
    const id = setTimeout(() => setAnimIn(true), 0);

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose?.();
      } else if (e.key === 'Enter' && !e.shiftKey) {
        // Enter = confirm. Mirrors the SaveWorkspaceModal so muscle memory
        // works the same way across both dialogs.
        e.preventDefault();
        onConfirm?.();
      }
    };
    window.addEventListener('keydown', handleKeyDown);

    return () => {
      clearTimeout(id);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onConfirm, onClose]);

  if (!isOpen) return null;

  const modal = (
    <>
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
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: `translate(-50%, -50%) scale(${animIn ? 1 : 0.96})`,
          opacity: animIn ? 1 : 0,
          transition: 'opacity 150ms var(--ds-ease), transform 150ms var(--ds-ease)',
          width: 380,
          maxWidth: '90vw',
          borderRadius: 'var(--ds-radius-lg)',
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
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--ds-space-2)' }}>
          <div style={{
            fontSize: 'var(--ds-font-md)',
            fontWeight: 'var(--ds-weight-semibold)',
            color: 'var(--ds-text-strong)',
            flex: 1,
          }}>
            {title}
          </div>
          <IconButton variant="danger" title="Close" onClick={onClose}>
            <XIcon size={14} />
          </IconButton>
        </div>

        {message && (
          <div style={{
            fontSize: 'var(--ds-font-sm)',
            color: 'var(--ds-text-secondary)',
            lineHeight: 1.5,
          }}>
            {message}
          </div>
        )}

        <div style={{
          display: 'flex',
          justifyContent: 'flex-end',
          gap: 'var(--ds-space-2)',
          marginTop: 'var(--ds-space-1)',
        }}>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant={variant} onClick={onConfirm}>{confirmLabel}</Button>
        </div>
      </div>
    </>
  );

  return ReactDOM.createPortal(modal, document.body);
}
