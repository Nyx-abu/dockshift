/**
 * Badge — a small status pill. Used for "Saved" / "Not set" key state, the
 * model-list "fallback" hint, etc.
 *
 * Props:
 *   tone     'neutral' | 'accent' | 'success' | 'danger' | 'warning'  (default 'neutral')
 *   icon     optional leading icon node
 *   ...rest  forwarded to <span> (style, title…)
 */
export default function Badge({ tone = 'neutral', icon, className = '', children, ...rest }) {
  return (
    <span className={`ds-badge ds-badge--${tone} ${className}`.trim()} {...rest}>
      {icon}
      {children}
    </span>
  );
}
