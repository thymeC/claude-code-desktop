import type { SessionSummary } from '../lib/types'

interface Props {
  sessions: SessionSummary[]
  activeId?: string | null
  onNew: () => void
  onSelect: (id: string) => void
}

export function SessionSidebar({ sessions, activeId, onNew, onSelect }: Props) {
  return (
    <aside className="session-sidebar">
      <button type="button" className="new-session" onClick={onNew}>
        New chat
      </button>
      <ul>
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={s.id === activeId ? 'active' : ''}
              onClick={() => onSelect(s.id)}
            >
              <span className="preview">{s.preview || s.id.slice(0, 8)}</span>
              <span className="muted time">{new Date(s.mtime).toLocaleString()}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  )
}
