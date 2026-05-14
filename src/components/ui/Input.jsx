import { forwardRef } from 'react';

/**
 * Input — themed text field. Wraps the field in a bordered shell so it can
 * carry an optional leading icon and a consistent focus-within ring. The
 * shared `INPUT_STYLE` in usePanelPosition.js stays for not-yet-migrated
 * panels; new code should use this.
 *
 * Props:
 *   icon     optional leading icon node
 *   invalid  red border
 *   size     'sm' | 'md'                 (default 'md')
 *   wrapStyle style override for the shell
 *   ...rest  forwarded to <input> (value, onChange, type, placeholder…)
 */
const Input = forwardRef(function Input(
  { icon, invalid = false, size = 'md', wrapStyle, className = '', ...rest },
  ref
) {
  const cls = [
    'ds-input',
    `ds-input--${size}`,
    invalid ? 'ds-input--invalid' : '',
    className,
  ].filter(Boolean).join(' ');

  return (
    <div className={cls} style={wrapStyle}>
      {icon && <span className="ds-input__icon">{icon}</span>}
      <input ref={ref} className="ds-input__field" {...rest} />
    </div>
  );
});

export default Input;
