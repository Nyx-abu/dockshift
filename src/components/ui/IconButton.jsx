/**
 * IconButton — a square, icon-only button. Used for panel close/back buttons,
 * toolbar toggles, list-row actions. Supersedes the inline `CLOSE_BTN` hover
 * dance every panel currently re-implements.
 *
 * Props:
 *   variant  'ghost' | 'subtle' | 'danger'   (default 'ghost')
 *   size     square px size                  (default 24)
 *   active   sticky accent state (for toolbar toggles)
 *   title    tooltip / aria-label
 *   ...rest  forwarded to <button> (onClick, disabled, style…)
 */
export default function IconButton({
  variant = 'ghost',
  size = 24,
  active = false,
  title,
  className = '',
  children,
  ...rest
}) {
  const cls = [
    'ds-icon-btn',
    `ds-icon-btn--${variant}`,
    active ? 'ds-icon-btn--active' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      className={cls}
      title={title}
      aria-label={title}
      aria-pressed={active || undefined}
      style={{ width: size, height: size }}
      {...rest}
    >
      {children}
    </button>
  );
}
