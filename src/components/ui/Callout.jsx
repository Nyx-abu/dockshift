import { InfoIcon, AlertIcon } from './icons';

/**
 * Callout — an inline informational / warning box. Replaces the ad-hoc
 * bordered note divs in AiSettings (encryption-unavailable banner, the
 * keyless-provider note, etc.).
 *
 * Props:
 *   tone     'neutral' | 'accent' | 'success' | 'danger' | 'warning'  (default 'neutral')
 *   icon     override the default tone icon; pass `null` to hide it
 *   ...rest  forwarded to the wrapper div (style…)
 */
const DEFAULT_ICON = {
  neutral: <InfoIcon size={14} />,
  accent: <InfoIcon size={14} />,
  success: <InfoIcon size={14} />,
  danger: <AlertIcon size={14} />,
  warning: <AlertIcon size={14} />,
};

export default function Callout({ tone = 'neutral', icon, className = '', children, ...rest }) {
  const resolvedIcon = icon === undefined ? DEFAULT_ICON[tone] : icon;
  return (
    <div className={`ds-callout ds-callout--${tone} ${className}`.trim()} {...rest}>
      {resolvedIcon && <span className="ds-callout__icon">{resolvedIcon}</span>}
      <div>{children}</div>
    </div>
  );
}
