import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { HEADER_STYLE, TITLE_STYLE, CLOSE_BTN, INPUT_STYLE, SCROLL_AREA } from '../hooks/usePanelPosition';
import ResizablePanel from './ResizablePanel';
import '../styles/panels.css';

// ─── Color Palette ────────────────────────────────────────────────────────────

const TEXT_COLORS = [
  { value: '', label: 'Default', css: 'rgba(255,255,255,0.85)' },
  { value: '#ff6b6b', label: 'Red', css: '#ff6b6b' },
  { value: '#ffd166', label: 'Yellow', css: '#ffd166' },
  { value: '#06d6a0', label: 'Green', css: '#06d6a0' },
  { value: '#4ac1ff', label: 'Blue', css: '#4ac1ff' },
  { value: '#9aa5ff', label: 'Purple', css: '#9aa5ff' },
  { value: '#ff9ff3', label: 'Pink', css: '#ff9ff3' },
  { value: '#ffa94d', label: 'Orange', css: '#ffa94d' },
];

const FONT_SIZES = [
  { value: 12, label: 'S' },
  { value: 14, label: 'M' },
  { value: 16, label: 'L' },
  { value: 18, label: 'XL' },
];

// ─── Toolbar Button ───────────────────────────────────────────────────────────

const TB_BASE = {
  background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
  alignItems: 'center', justifyContent: 'center', borderRadius: 4,
  width: 26, height: 26, flexShrink: 0, transition: 'all 0.12s',
  WebkitAppRegion: 'no-drag', padding: 0,
};

function TBtn({ onClick, active, title, children, style }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button onClick={onClick} title={title} onMouseDown={e => e.preventDefault()}
      onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        ...TB_BASE,
        background: active ? 'var(--ds-accent-bg)' : hovered ? 'var(--ds-bg-hover)' : 'none',
        color: active ? 'var(--ds-accent-light)' : 'var(--ds-text-muted)',
        ...style,
      }}>{children}</button>
  );
}

function Divider() {
  return <div style={{ width: 1, height: 16, background: 'var(--ds-border)', margin: '0 2px', flexShrink: 0 }} />;
}

// ─── Note Card (List View) ───────────────────────────────────────────────────

function NoteCard({ note, onClick, onPin, onDelete }) {
  const [hovered, setHovered] = useState(false);
  // Strip HTML tags for preview
  const preview = note.body ? note.body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().split('\n')[0].slice(0, 80) : 'Empty note';
  const time = (() => { try { return new Date(note.updatedAt || note.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }); } catch { return ''; } })();

  return (
    <div onClick={onClick} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}
      style={{
        padding: '10px 12px', borderRadius: 8, cursor: 'pointer',
        background: hovered ? 'var(--ds-bg-control)' : 'var(--ds-bg-subtle)',
        border: '1px solid var(--ds-border)', transition: 'background 0.15s', WebkitAppRegion: 'no-drag',
      }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        {note.pinned && <span style={{ fontSize: 10 }}>📌</span>}
        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ds-text-primary)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {note.title || 'Untitled'}
        </span>
        <span style={{ fontSize: 10, color: 'var(--ds-text-faint)' }}>{time}</span>
        <button onClick={e => { e.stopPropagation(); onPin(); }} title={note.pinned ? 'Unpin' : 'Pin'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: note.pinned ? '#ffd166' : 'var(--ds-text-dim)', fontSize: 12, WebkitAppRegion: 'no-drag' }}>📌</button>
        <button onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: 'var(--ds-text-dim)', fontSize: 12, WebkitAppRegion: 'no-drag' }}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-danger)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--ds-text-dim)'}>✕</button>
      </div>
      <p style={{ margin: '4px 0 0', fontSize: 11, color: 'var(--ds-text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{preview}</p>
    </div>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

export default function NotesPanel({ isOpen, onClose, anchorRect }) {
  const [notes, setNotes] = useState([]);
  const [view, setView] = useState('list');
  const [editNote, setEditNote] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [showColors, setShowColors] = useState(false);
  const [formats, setFormats] = useState({});
  // 'idle' | 'saving' | 'saved' — drives the subtle auto-save indicator
  const [saveStatus, setSaveStatus] = useState('idle');
  const panelRef = useRef(null);
  const editorRef = useRef(null);
  const loadedNoteId = useRef(null);
  const api = useMemo(() => window.electronAPI, []);

  // Auto-save plumbing: a debounce timer, a mirror of `editNote` readable from
  // stable callbacks, and a dirty flag so flush() knows whether to bother.
  const autoSaveTimer = useRef(null);
  const editNoteRef = useRef(null);
  const dirtyRef = useRef(false);
  useEffect(() => { editNoteRef.current = editNote; }, [editNote]);



  // Load notes on open
  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    api.invoke('notes:list').then(list => { setNotes(Array.isArray(list) ? list : []); setLoading(false); }).catch(() => setLoading(false));
    setView('list'); setEditNote(null); setShowColors(false); loadedNoteId.current = null;
  }, [isOpen, api]);

  // Set editor HTML when a note is opened for editing
  useEffect(() => {
    if (view !== 'editor' || !editorRef.current || !editNote) return;
    // Only set innerHTML when switching to a different note (prevents cursor reset)
    if (loadedNoteId.current !== (editNote.id || '__new__')) {
      editorRef.current.innerHTML = editNote.body || '';
      loadedNoteId.current = editNote.id || '__new__';
      setTimeout(() => {
        editorRef.current?.focus();
        // Place cursor at end
        const sel = window.getSelection();
        if (sel && editorRef.current?.childNodes.length) {
          sel.selectAllChildren(editorRef.current);
          sel.collapseToEnd();
        }
      }, 50);
    }
  }, [view, editNote]);

  // ── Format detection: update toolbar active states on selection change ──
  const updateFormats = useCallback(() => {
    if (!editorRef.current?.contains(document.activeElement === editorRef.current ? document.activeElement : null)
        && document.activeElement !== editorRef.current) return;
    setFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
      strikeThrough: document.queryCommandState('strikeThrough'),
      insertUnorderedList: document.queryCommandState('insertUnorderedList'),
      insertOrderedList: document.queryCommandState('insertOrderedList'),
    });
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', updateFormats);
    return () => document.removeEventListener('selectionchange', updateFormats);
  }, [updateFormats]);

  // ── Execute a formatting command ──
  const exec = useCallback((cmd, value = null) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, value);
    updateFormats();
  }, [updateFormats]);

  // ── Keyboard shortcuts inside the editor ──
  const handleEditorKeyDown = useCallback((e) => {
    if (e.ctrlKey || e.metaKey) {
      switch (e.key.toLowerCase()) {
        case 'b': e.preventDefault(); exec('bold'); break;
        case 'i': e.preventDefault(); exec('italic'); break;
        case 'u': e.preventDefault(); exec('underline'); break;
      }
    }
    // Tab for indent
    if (e.key === 'Tab') {
      e.preventDefault();
      exec(e.shiftKey ? 'outdent' : 'indent');
    }
  }, [exec]);


  // ── Insert checklist item ──
  const insertChecklist = useCallback(() => {
    editorRef.current?.focus();
    document.execCommand('insertHTML', false,
      '<div style="display:flex;align-items:flex-start;gap:4px;margin:2px 0"><input type="checkbox" style="margin-top:4px;accent-color:#6e7dff;cursor:pointer"><span>Task item</span></div>'
    );
  }, []);

  // ── Auto-save ──
  // Persists the in-progress note (debounced) so closing the panel or the app
  // mid-edit doesn't lose work. Stays in the editor — unlike the explicit Save
  // button, which also navigates back to the list.
  const doAutoSave = useCallback(async () => {
    const current = editNoteRef.current;
    if (!current) return;
    const body = editorRef.current?.innerHTML || '';
    const hasBody = body.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim().length > 0;
    if (!current.title?.trim() && !hasBody) return; // nothing worth saving yet

    dirtyRef.current = false;
    setSaveStatus('saving');
    const note = { ...current, body, updatedAt: new Date().toISOString() };
    const isNew = !note.id;
    if (isNew) { note.id = crypto.randomUUID(); note.createdAt = note.updatedAt; }
    try {
      await api.invoke('notes:save', { note });
      if (isNew) {
        // Keep editing the same note: sync the id without letting the
        // editor effect re-set innerHTML (which would reset the caret).
        loadedNoteId.current = note.id;
        setEditNote(p => (p ? { ...p, id: note.id, createdAt: note.createdAt } : p));
      }
      const list = await api.invoke('notes:list');
      setNotes(Array.isArray(list) ? list : []);
      setSaveStatus('saved');
    } catch {
      dirtyRef.current = true; // leave it dirty so a later flush retries
      setSaveStatus('idle');
    }
  }, [api]);

  const scheduleAutoSave = useCallback(() => {
    dirtyRef.current = true;
    setSaveStatus('idle');
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => { autoSaveTimer.current = null; doAutoSave(); }, 900);
  }, [doAutoSave]);

  const flushAutoSave = useCallback(() => {
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    if (dirtyRef.current) doAutoSave();
  }, [doAutoSave]);

  // Flush a pending save when the panel is closed while editing — editNote
  // state survives the close, so the in-progress note is preserved.
  useEffect(() => {
    if (!isOpen) flushAutoSave();
  }, [isOpen, flushAutoSave]);

  // ── CRUD handlers ──
  const handleSave = useCallback(async () => {
    if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
    dirtyRef.current = false;
    if (!editNote?.title?.trim()) return;
    const body = editorRef.current?.innerHTML || '';
    const note = { ...editNote, body, updatedAt: new Date().toISOString() };
    if (!note.id) { note.id = crypto.randomUUID(); note.createdAt = note.updatedAt; }
    await api.invoke('notes:save', { note });
    const list = await api.invoke('notes:list');
    setNotes(Array.isArray(list) ? list : []);
    setView('list'); setEditNote(null); loadedNoteId.current = null;
    setSaveStatus('idle');
  }, [editNote, api]);

  const handleDelete = useCallback(async (id) => {
    if (editNoteRef.current?.id === id || !id) {
      if (autoSaveTimer.current) { clearTimeout(autoSaveTimer.current); autoSaveTimer.current = null; }
      dirtyRef.current = false;
    }
    await api.invoke('notes:delete', { id });
    const list = await api.invoke('notes:list');
    setNotes(Array.isArray(list) ? list : []);
    if (editNote?.id === id) { setView('list'); setEditNote(null); loadedNoteId.current = null; setSaveStatus('idle'); }
  }, [editNote, api]);

  const handleTogglePin = useCallback(async (id) => {
    await api.invoke('notes:togglePin', { id });
    const list = await api.invoke('notes:list');
    setNotes(Array.isArray(list) ? list : []);
  }, [api]);

  if (!isOpen || !anchorRect) return null;

  const filtered = notes.filter(n => {
    if (!search) return true;
    const s = search.toLowerCase();
    const bodyText = (n.body || '').replace(/<[^>]+>/g, '').toLowerCase();
    return n.title.toLowerCase().includes(s) || bodyText.includes(s);
  });
  const sorted = [...filtered].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt);
  });

  const fontSize = editNote?.fontSize || 13;

  const panel = (
    <ResizablePanel
      isOpen={isOpen}
      dockAction="notes"
    >
      {/* ── Header ── */}
      <div style={HEADER_STYLE}>
        {view === 'editor' && (
          <button onClick={() => { flushAutoSave(); setView('list'); setEditNote(null); setShowColors(false); loadedNoteId.current = null; }}
            style={{ ...CLOSE_BTN, color: 'var(--ds-text-muted)', fontSize: 14 }}>←</button>
        )}
        <span style={TITLE_STYLE}>{view === 'editor' ? (editNote?.id ? 'Edit Note' : 'New Note') : '📝 Quick Notes'}</span>
        {view === 'list' && (
          <button onClick={() => { setEditNote({ id: null, title: '', body: '', pinned: false, fontSize: 13 }); setView('editor'); loadedNoteId.current = null; }}
            style={{
              background: 'var(--ds-accent-bg)', border: '1px solid var(--ds-accent-border)',
              borderRadius: 6, color: 'var(--ds-accent-light)', fontSize: 11, padding: '4px 10px',
              cursor: 'pointer', fontWeight: 600, WebkitAppRegion: 'no-drag',
            }}>+ New</button>
        )}
        <button onClick={onClose} style={CLOSE_BTN}
          onMouseEnter={e => e.currentTarget.style.color = 'var(--ds-text-primary)'}
          onMouseLeave={e => e.currentTarget.style.color = 'var(--ds-text-faint)'}>✕</button>
      </div>

      {view === 'list' ? (
        /* ── List View ── */
        <>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search notes..." style={INPUT_STYLE} />
          <div style={SCROLL_AREA}>
            {loading && <p style={{ color: 'var(--ds-text-muted)', fontSize: 12, textAlign: 'center', padding: 24 }}>Loading…</p>}
            {!loading && sorted.length === 0 && (
              <div style={{ textAlign: 'center', padding: 32 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>📝</div>
                <p style={{ color: 'var(--ds-text-faint)', fontSize: 12 }}>{search ? 'No matching notes.' : 'No notes yet. Click + New to create one.'}</p>
              </div>
            )}
            {!loading && sorted.map(note => (
              <NoteCard key={note.id} note={note}
                onClick={() => { setEditNote({ ...note }); setView('editor'); loadedNoteId.current = null; }}
                onPin={() => handleTogglePin(note.id)}
                onDelete={() => handleDelete(note.id)} />
            ))}
          </div>
        </>
      ) : (
        /* ── Editor View ── */
        <>
          {/* Title */}
          <input value={editNote?.title || ''}
            onChange={e => { setEditNote(p => ({ ...p, title: e.target.value })); scheduleAutoSave(); }}
            placeholder="Note title..." style={{ ...INPUT_STYLE, fontSize: 14, fontWeight: 600, padding: '10px 12px' }} />

          {/* ── Formatting Toolbar ── */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0,
            background: 'var(--ds-bg-subtle)', border: '1px solid var(--ds-border)',
            borderRadius: 8, padding: '3px 6px', flexWrap: 'wrap', WebkitAppRegion: 'no-drag',
          }}>
            {/* Text styling */}
            <TBtn onClick={() => exec('bold')} active={formats.bold} title="Bold (Ctrl+B)">
              <span style={{ fontWeight: 800, fontSize: 13 }}>B</span>
            </TBtn>
            <TBtn onClick={() => exec('italic')} active={formats.italic} title="Italic (Ctrl+I)">
              <span style={{ fontStyle: 'italic', fontSize: 13, fontFamily: 'Georgia, serif' }}>I</span>
            </TBtn>
            <TBtn onClick={() => exec('underline')} active={formats.underline} title="Underline (Ctrl+U)">
              <span style={{ textDecoration: 'underline', fontSize: 12 }}>U</span>
            </TBtn>
            <TBtn onClick={() => exec('strikeThrough')} active={formats.strikeThrough} title="Strikethrough">
              <span style={{ textDecoration: 'line-through', fontSize: 12 }}>S</span>
            </TBtn>


            <Divider />

            {/* Headings */}
            <TBtn onClick={() => exec('formatBlock', 'H1')} title="Heading 1">
              <span style={{ fontSize: 13, fontWeight: 800 }}>H<sub style={{ fontSize: 8 }}>1</sub></span>
            </TBtn>
            <TBtn onClick={() => exec('formatBlock', 'H2')} title="Heading 2">
              <span style={{ fontSize: 12, fontWeight: 700 }}>H<sub style={{ fontSize: 8 }}>2</sub></span>
            </TBtn>
            <TBtn onClick={() => exec('formatBlock', 'H3')} title="Heading 3">
              <span style={{ fontSize: 11, fontWeight: 600 }}>H<sub style={{ fontSize: 7 }}>3</sub></span>
            </TBtn>
            <TBtn onClick={() => exec('formatBlock', 'P')} title="Normal text">
              <span style={{ fontSize: 10 }}>¶</span>
            </TBtn>

            <Divider />

            {/* Lists & blocks */}
            <TBtn onClick={() => exec('insertUnorderedList')} active={formats.insertUnorderedList} title="Bullet list">
              <span style={{ fontSize: 13, lineHeight: 1 }}>•≡</span>
            </TBtn>
            <TBtn onClick={() => exec('insertOrderedList')} active={formats.insertOrderedList} title="Numbered list">
              <span style={{ fontSize: 10, fontWeight: 700 }}>1.</span>
            </TBtn>
            <TBtn onClick={insertChecklist} title="Checklist">
              <span style={{ fontSize: 12 }}>☑</span>
            </TBtn>
            <TBtn onClick={() => exec('formatBlock', 'BLOCKQUOTE')} title="Blockquote">
              <span style={{ fontSize: 15, fontWeight: 700, fontFamily: 'Georgia, serif', lineHeight: 1 }}>"</span>
            </TBtn>
            <TBtn onClick={() => exec('insertHorizontalRule')} title="Divider">
              <span style={{ fontSize: 11 }}>—</span>
            </TBtn>

            <div style={{ flex: 1 }} />

            {/* Text color */}
            <TBtn onClick={() => setShowColors(p => !p)} active={showColors} title="Text color"
              style={{ position: 'relative' }}>
              <span style={{ fontSize: 13, fontWeight: 700 }}>A</span>
              <span style={{ position: 'absolute', bottom: 3, left: 5, right: 5, height: 3, borderRadius: 1,
                background: 'linear-gradient(90deg, #ff6b6b, #ffd166, #06d6a0, #4ac1ff, #9aa5ff)' }} />
            </TBtn>

            {/* Font size */}
            {FONT_SIZES.map(fs => (
              <TBtn key={fs.value} onClick={() => setEditNote(p => ({ ...p, fontSize: fs.value }))}
                active={fontSize === fs.value} title={`Size ${fs.label}`}
                style={{ width: 22, fontSize: 10, fontWeight: fontSize === fs.value ? 700 : 400 }}>
                {fs.label}
              </TBtn>
            ))}
          </div>

          {/* Color palette */}
          {showColors && (
            <div style={{ display: 'flex', gap: 6, flexShrink: 0, padding: '2px 0', WebkitAppRegion: 'no-drag' }}>
              {TEXT_COLORS.map(c => (
                <button key={c.label}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => {
                    if (c.value) {
                      exec('foreColor', c.value);
                    } else {
                      exec('removeFormat');
                    }
                    setShowColors(false);
                  }}
                  title={c.label}
                  style={{
                    width: 24, height: 24, borderRadius: '50%',
                    border: '2px solid var(--ds-border-strong)',
                    background: c.css, cursor: 'pointer', padding: 0, flexShrink: 0,
                    transition: 'all 0.15s', WebkitAppRegion: 'no-drag',
                  }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.15)'; e.currentTarget.style.borderColor = 'var(--ds-text-faint)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.borderColor = 'var(--ds-border-strong)'; }}
                />
              ))}
            </div>
          )}

          {/* ── Rich Text Editor (contentEditable) ── */}
          <div
            ref={editorRef}
            className="notes-editor"
            contentEditable
            suppressContentEditableWarning
            onKeyDown={handleEditorKeyDown}
            onInput={scheduleAutoSave}
            style={{
              flex: 1, overflowY: 'auto', minHeight: 0,
              background: 'var(--ds-bg-subtle)', border: '1px solid var(--ds-border)',
              borderRadius: 10, padding: 12,
              color: 'var(--ds-text-secondary)', fontSize: fontSize, lineHeight: 1.65,
              fontFamily: 'inherit',
              scrollbarWidth: 'thin', scrollbarColor: 'var(--ds-text-dim) transparent',
              WebkitAppRegion: 'no-drag',
            }}
          />

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexShrink: 0, alignItems: 'center' }}>
            <span style={{
              fontSize: 10.5, color: 'var(--ds-text-faint)', minWidth: 54,
              transition: 'opacity 0.2s',
            }}>
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? '✓ Saved' : ''}
            </span>
            <button onClick={handleSave} disabled={!editNote?.title?.trim()} style={{
              flex: 1, padding: '8px 0', borderRadius: 8,
              background: editNote?.title?.trim() ? 'var(--ds-accent-bg)' : 'var(--ds-bg-input)',
              border: `1px solid ${editNote?.title?.trim() ? 'var(--ds-accent-border)' : 'var(--ds-border)'}`,
              color: editNote?.title?.trim() ? 'var(--ds-accent-light)' : 'var(--ds-text-dim)',
              fontSize: 12, fontWeight: 600, cursor: editNote?.title?.trim() ? 'pointer' : 'default', WebkitAppRegion: 'no-drag',
            }}>Save Note</button>
            {editNote?.id && (
              <button onClick={() => handleDelete(editNote.id)} style={{
                padding: '8px 16px', borderRadius: 8, background: 'var(--ds-danger-bg)',
                border: '1px solid var(--ds-danger-border)', color: 'var(--ds-danger-text)', fontSize: 12,
                fontWeight: 600, cursor: 'pointer', WebkitAppRegion: 'no-drag',
              }}>Delete</button>
            )}
          </div>
        </>
      )}
    </ResizablePanel>
  );

  return ReactDOM.createPortal(panel, document.body);
}
