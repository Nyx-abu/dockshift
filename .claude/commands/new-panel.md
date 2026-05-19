---
description: Scaffold a new <Name>Panel.jsx wrapped in ResizablePanel and wire it into the dock
argument-hint: <Name>
---

Scaffold a new panel component named `$ARGUMENTS` following existing conventions.

## Steps

1. **Pick a reference panel** to copy from. Read one of the simpler existing panels for the layout pattern (e.g. `src/components/NotesPanel.jsx` or `src/components/AiPanel.jsx`). Match its structure for props, ResizablePanel wrapping, and styling.

2. **Create `src/components/$ARGUMENTSPanel.jsx`** wrapped in `ResizablePanel`:
   - Accept `{ onClose, ... }` props consistent with sibling panels
   - Use the `usePanelPosition` hook only if you need custom drag math (most panels rely on `ResizablePanel`'s built-in handling)
   - Use the `@` Vite alias for imports: `import ResizablePanel from '@/components/ResizablePanel'`

3. **Wire into `src/App.jsx`** — add `'$ARGUMENTS'` (lowercase) to the `activePanel` switch and import the new component.

4. **Add a dock entry in `src/components/DockMenu.jsx`** — add a button/icon that sets `activePanel` to the new value. Match the existing icon + label pattern.

5. **If the panel needs persistence**, create a JSON file under `app.getPath('userData')` and add an IPC namespace for it (use `/add-ipc <namespace>:load`, `/add-ipc <namespace>:save`, etc.). Per-feature files only — don't add to an existing store.

## Reminders

- New panels are renderer-only and hot-reload via Vite — no Electron restart needed unless you also added IPC handlers.
- Match the existing visual style (the project uses Tailwind-style utility classes inline; check siblings before introducing new patterns).
- No tests to run — verify manually with `npm run dev` and open the new panel from the dock.
