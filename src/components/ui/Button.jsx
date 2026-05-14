/**
 * Button — the one text-button primitive for the whole app.
 *
 * Replaces the per-panel ad-hoc buttons (NotesPanel `TBtn`, ClipboardPanel
 * `btnBase`, AiSettings inline `btnStyle`, …). States (hover/active/disabled/
 * focus) live in ui.css; this file is just structure + variant wiring.
 *
 * Props:
 *   variant   'primary' | 'secondary' | 'ghost' | 'danger'  (default 'secondary')
 *   size      'sm' | 'md'                                   (default 'md')
 *   icon      optional leading icon node
 *   iconRight optional trailing icon node
 *   loading   show a spinner and disable
 *   fullWidth stretch to container width
 *   ...rest   forwarded to <button> (onClick, disabled, type, title, style…)
 */
export default function Button({
  variant = 'secondary',
  size = 'md',
  icon,
  iconRight,
  loading = false,
  fullWidth = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'ds-btn',
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    fullWidth ? 'ds-btn--full' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="ds-btn__spinner" aria-hidden="true" />}
      {!loading && icon && <span className="ds-btn__icon">{icon}</span>}
      {children}
      {!loading && iconRight && <span className="ds-btn__icon">{iconRight}</span>}
    </button>
  );
}
