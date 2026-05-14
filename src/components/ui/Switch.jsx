/**
 * Switch — a restrained on/off toggle. Deliberately plain: a track that goes
 * from `--ds-bg-hover` to `--ds-accent` and a white thumb that slides. No
 * gradient, no glow — that "game UI" treatment was the whole reason the old
 * Settings toggle looked childish.
 *
 * Props:
 *   checked   boolean
 *   onChange  (next: boolean) => void
 *   size      'sm' | 'md'   (default 'md')
 *   disabled  boolean
 *   ...rest   forwarded to <button> (title, aria-label, style…)
 */
export default function Switch({
  checked = false,
  onChange,
  size = 'md',
  disabled = false,
  className = '',
  ...rest
}) {
  const cls = [
    'ds-switch',
    `ds-switch--${size}`,
    checked ? 'ds-switch--on' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      className={cls}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      {...rest}
    >
      <span className="ds-switch__thumb" />
    </button>
  );
}
