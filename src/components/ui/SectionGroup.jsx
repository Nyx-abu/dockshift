/**
 * SectionGroup + SettingRow — the layout primitives for grouped settings.
 *
 * SectionGroup replaces SettingsPanel's old `Section` (no emoji `icon` prop,
 * legible 11px label, proper padding). SettingRow is the label-left /
 * control-right row used ~10× across SettingsPanel and AiSettings; rows inside
 * a group auto-divide with a hairline border.
 */

export function SectionGroup({ title, className = '', children, ...rest }) {
  return (
    <section className={`ds-section ${className}`.trim()} {...rest}>
      {title && <div className="ds-section__title">{title}</div>}
      <div className="ds-section__body">{children}</div>
    </section>
  );
}

/**
 * SettingRow
 *   label        primary label text
 *   description  optional secondary line
 *   control      the right-aligned control node (Switch, Select, Button…)
 *   stack        put the control on its own full-width line below the label
 *   children     extra content rendered below the row (e.g. an input row)
 */
export function SettingRow({ label, description, control, stack = false, children }) {
  return (
    <>
      <div className={`ds-row${stack ? ' ds-row--stack' : ''}`}>
        <div className="ds-row__text">
          {label && <div className="ds-row__label">{label}</div>}
          {description && <div className="ds-row__desc">{description}</div>}
        </div>
        {control && <div className="ds-row__control">{control}</div>}
      </div>
      {children}
    </>
  );
}
