import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import ReactDOM from 'react-dom';
import { ChevronDownIcon, CheckIcon, SearchIcon, PlusIcon } from './icons';

/**
 * Select — the custom dropdown that replaces every native `<select>` and the
 * AI model `<datalist>`.
 *
 * Why custom: native `<select>` renders the dated Windows OS dropdown and
 * can't be themed; `<datalist>` is inconsistent and gives no affordance that
 * free-text is allowed. This one is fully themed, keyboard-accessible, and its
 * popover is portaled to <body> so the panels' `overflow:hidden` can't clip it.
 *
 * Props:
 *   value       selected option value
 *   onChange    (value) => void
 *   options     [{ value, label, hint?, group? }]  (plain strings also accepted)
 *   searchable  show a filter input inside the popover (for long lists)
 *   allowCustom a non-matching typed value becomes a selectable "Use …" row
 *   loading     show a spinner in the trigger, disable opening
 *   placeholder shown when nothing is selected
 *   disabled    boolean
 *   size        'sm' | 'md'        (default 'md')
 *   emptyText   shown when the filtered list is empty
 *   ...rest     forwarded to the trigger <button> (style, title…)
 */

function normalize(options) {
  return (options || []).map((o) => (typeof o === 'string' ? { value: o, label: o } : o));
}

const POPOVER_MAX = 288; // keep in sync with .ds-select__popover max-height + padding

export default function Select({
  value,
  onChange,
  options = [],
  searchable = false,
  allowCustom = false,
  loading = false,
  placeholder = 'Select…',
  disabled = false,
  size = 'md',
  emptyText = 'No matches',
  className = '',
  ...rest
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [pos, setPos] = useState(null);

  const triggerRef = useRef(null);
  const popoverRef = useRef(null);
  const searchRef = useRef(null);
  const typeahead = useRef({ str: '', at: 0 });
  const listboxId = useId();

  const norm = useMemo(() => normalize(options), [options]);
  const selected = useMemo(() => norm.find((o) => o.value === value) || null, [norm, value]);

  // Visible options, filtered by the search query when searchable.
  const filtered = useMemo(() => {
    if (!searchable || !query.trim()) return norm;
    const q = query.trim().toLowerCase();
    return norm.filter(
      (o) =>
        String(o.label).toLowerCase().includes(q) ||
        String(o.value).toLowerCase().includes(q)
    );
  }, [norm, searchable, query]);

  // The free-text "Use …" row — discoverable replacement for the old datalist.
  const customRow = useMemo(() => {
    if (!allowCustom) return null;
    const q = query.trim();
    if (!q || norm.some((o) => String(o.value) === q)) return null;
    return { value: q, label: q, __custom: true };
  }, [allowCustom, query, norm]);

  // Group the filtered options while preserving order; custom row stays loose.
  const groups = useMemo(() => {
    const out = [];
    const byName = new Map();
    for (const o of filtered) {
      const g = o.group || '';
      let bucket = byName.get(g);
      if (!bucket) {
        bucket = { name: g, items: [] };
        byName.set(g, bucket);
        out.push(bucket);
      }
      bucket.items.push(o);
    }
    return out;
  }, [filtered]);

  // Flat, keyboard-navigable list (group headers excluded; custom row last).
  const navItems = useMemo(
    () => (customRow ? [...filtered, customRow] : filtered),
    [filtered, customRow]
  );

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const placeAbove = spaceBelow < POPOVER_MAX && r.top > spaceBelow;
    setPos({
      left: r.left,
      width: r.width,
      top: placeAbove ? undefined : Math.round(r.bottom + 4),
      bottom: placeAbove ? Math.round(window.innerHeight - r.top + 4) : undefined,
    });
  }, []);

  const openMenu = useCallback(() => {
    if (disabled || loading) return;
    updatePosition();
    setQuery('');
    const selIdx = navItems.findIndex((o) => o.value === value);
    setActiveIndex(selIdx >= 0 ? selIdx : 0);
    setOpen(true);
  }, [disabled, loading, updatePosition, navItems, value]);

  const closeMenu = useCallback(() => {
    setOpen(false);
    setQuery('');
    triggerRef.current?.focus();
  }, []);

  const commit = useCallback(
    (opt) => {
      if (!opt) return;
      onChange?.(opt.value);
      setOpen(false);
      setQuery('');
      triggerRef.current?.focus();
    },
    [onChange]
  );

  // Keep activeIndex in range as the filtered list shrinks/grows.
  useEffect(() => {
    if (open && activeIndex > navItems.length - 1) setActiveIndex(Math.max(0, navItems.length - 1));
  }, [open, navItems.length, activeIndex]);

  // While open: reposition on resize/scroll, close on outside mousedown.
  useEffect(() => {
    if (!open) return undefined;
    const onScrollResize = () => updatePosition();
    const onDocDown = (e) => {
      if (triggerRef.current?.contains(e.target)) return;
      if (popoverRef.current?.contains(e.target)) return;
      setOpen(false);
      setQuery('');
    };
    window.addEventListener('resize', onScrollResize);
    window.addEventListener('scroll', onScrollResize, true);
    document.addEventListener('mousedown', onDocDown);
    return () => {
      window.removeEventListener('resize', onScrollResize);
      window.removeEventListener('scroll', onScrollResize, true);
      document.removeEventListener('mousedown', onDocDown);
    };
  }, [open, updatePosition]);

  // Focus the search field when a searchable menu opens.
  useLayoutEffect(() => {
    if (open && searchable) searchRef.current?.focus();
  }, [open, searchable]);

  // Scroll the active option into view.
  useEffect(() => {
    if (!open || !popoverRef.current) return;
    const el = popoverRef.current.querySelector(`[data-nav-index="${activeIndex}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [open, activeIndex]);

  const handleKeyDown = (e) => {
    if (!open) {
      if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault();
        openMenu();
      }
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      closeMenu();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => Math.min(i + 1, navItems.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      commit(navItems[activeIndex]);
    } else if (e.key === 'Tab') {
      // Tab commits the highlighted option and lets focus move on.
      if (navItems[activeIndex]) commit(navItems[activeIndex]);
    } else if (!searchable && e.key.length === 1) {
      // Type-ahead for non-searchable selects.
      const now = Date.now();
      typeahead.current.str =
        now - typeahead.current.at < 700 ? typeahead.current.str + e.key : e.key;
      typeahead.current.at = now;
      const q = typeahead.current.str.toLowerCase();
      const idx = navItems.findIndex((o) => String(o.label).toLowerCase().startsWith(q));
      if (idx >= 0) setActiveIndex(idx);
    }
  };

  const triggerCls = ['ds-select', `ds-select--${size}`, className].filter(Boolean).join(' ');

  // Render the popover row-by-row, tracking a flat nav index that matches navItems.
  let navCursor = 0;
  const renderOption = (opt) => {
    const navIndex = navCursor++;
    const isActive = navIndex === activeIndex;
    const isSelected = opt.value === value;
    return (
      <button
        key={(opt.__custom ? 'custom:' : '') + opt.value}
        type="button"
        role="option"
        aria-selected={isSelected}
        data-nav-index={navIndex}
        className={[
          'ds-select__option',
          isActive ? 'ds-select__option--active' : '',
          isSelected ? 'ds-select__option--selected' : '',
          opt.__custom ? 'ds-select__custom' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        onMouseEnter={() => setActiveIndex(navIndex)}
        onClick={() => commit(opt)}
      >
        {opt.__custom && <PlusIcon size={13} />}
        <span className="ds-select__option-label">
          {opt.__custom ? `Use "${opt.label}"` : opt.label}
        </span>
        {opt.hint && <span className="ds-select__option-hint">{opt.hint}</span>}
        {isSelected && !opt.__custom && (
          <span className="ds-select__option-check">
            <CheckIcon size={13} />
          </span>
        )}
      </button>
    );
  };

  const popover =
    open && pos
      ? ReactDOM.createPortal(
          <div
            ref={popoverRef}
            className="ds-select__popover"
            style={{
              left: pos.left,
              width: pos.width,
              top: pos.top,
              bottom: pos.bottom,
            }}
          >
            {searchable && (
              <div className="ds-select__search">
                <SearchIcon size={13} />
                <input
                  ref={searchRef}
                  value={query}
                  placeholder="Search…"
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIndex(0);
                  }}
                  onKeyDown={handleKeyDown}
                />
              </div>
            )}
            <div className="ds-select__list" role="listbox" id={listboxId}>
              {navItems.length === 0 && <div className="ds-select__empty">{emptyText}</div>}
              {groups.map((g) => (
                <div key={g.name || '__'}>
                  {g.name && <div className="ds-select__group-label">{g.name}</div>}
                  {g.items.map(renderOption)}
                </div>
              ))}
              {customRow && renderOption(customRow)}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? listboxId : undefined}
        className={triggerCls}
        disabled={disabled}
        onClick={() => (open ? closeMenu() : openMenu())}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        <span
          className={`ds-select__value${selected ? '' : ' ds-select__value--placeholder'}`}
        >
          {selected ? selected.label : value || placeholder}
        </span>
        {loading ? (
          <span className="ds-select__spinner" aria-hidden="true" />
        ) : (
          <span className="ds-select__chevron">
            <ChevronDownIcon size={14} />
          </span>
        )}
      </button>
      {popover}
    </>
  );
}
