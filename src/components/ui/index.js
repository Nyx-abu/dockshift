/**
 * DockShift shared UI library — import primitives from here:
 *   import { Button, Select, Switch, SectionGroup, SettingRow } from '@/components/ui';
 *
 * Styles load once via ui.css (side-effect import below). All components are
 * theme-token driven, keyboard-accessible, and never window-drag regions.
 */
import './ui.css';

export { default as Button } from './Button';
export { default as IconButton } from './IconButton';
export { default as Input } from './Input';
export { default as Select } from './Select';
export { default as Switch } from './Switch';
export { default as SegmentedControl } from './SegmentedControl';
export { default as Badge } from './Badge';
export { default as Callout } from './Callout';
export { SectionGroup, SettingRow } from './SectionGroup';
export { default as Kbd, KbdSep, Keys } from './Kbd';
export * from './icons';
