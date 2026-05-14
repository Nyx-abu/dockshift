import { useLayoutEffect, useRef, useState } from 'react';

/**
 * SegmentedControl — a small set of mutually-exclusive options with a sliding
 * active "pill". Used for the theme picker (Light / Dark / System). For larger
 * option sets use Select instead.
 *
 * Props:
 *   value     currently selected option value
 *   onChange  (value) => void
 *   options   [{ value, label, icon? }]
 *   ...rest   forwarded to the wrapper div (style…)
 */
export default function SegmentedControl({ value, onChange, options = [], className = '', ...rest }) {
  const wrapRef = useRef(null);
  const [pill, setPill] = useState(null); // { left, width }

  // Measure the active option and park the pill behind it. Re-runs on value
  // change and on resize so the pill tracks layout exactly.
  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return undefined;
    const measure = () => {
      const active = wrap.querySelector('[data-active="true"]');
      if (!active) return;
      setPill({ left: active.offsetLeft, width: active.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [value, options]);

  return (
    <div ref={wrapRef} className={`ds-segmented ${className}`} role="radiogroup" {...rest}>
      {pill && (
        <span
          className="ds-segmented__pill"
          style={{ transform: `translateX(${pill.left - 2}px)`, width: pill.width }}
        />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            data-active={active}
            className={`ds-segmented__option${active ? ' ds-segmented__option--active' : ''}`}
            onClick={() => onChange?.(opt.value)}
          >
            {opt.icon}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
