import type { SessionSummary } from '../lib/types'

interface Props {
  projectPath: string | null
  sessions: SessionSummary[]
  activeId?: string | null
  onNew: () => void
  onOpenProject: () => void
  onSelect: (id: string) => void
}

export function LeftNav({ projectPath, sessions, activeId, onNew, onOpenProject, onSelect }: Props) {
  return (
    <aside className="left-nav">
      <div className="mode-toggle" role="tablist" aria-label="Mode">
        <button type="button" className="mode-btn" disabled title="Coming soon">
          Cowork
        </button>
        <button type="button" className="mode-btn active" role="tab" aria-selected>
          Code
        </button>
      </div>

      <nav className="nav-actions">
        <button type="button" className="nav-item primary" onClick={onNew} disabled={!projectPath}>
          <span className="nav-plus">+</span> New
        </button>
        <button type="button" className="nav-item" onClick={onOpenProject}>
          Projects
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          Artifacts
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          Scheduled
        </button>
        <button type="button" className="nav-item" disabled title="Coming soon">
          Customize
        </button>
      </nav>

      <div className="tasks-block">
        <div className="tasks-label">Tasks</div>
        <ul className="task-list">
          {sessions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className={s.id === activeId ? 'task active' : 'task'}
                onClick={() => onSelect(s.id)}
              >
                {s.preview?.trim() || `Chat ${s.id.slice(0, 8)}`}
              </button>
            </li>
          ))}
          {sessions.length === 0 ? <li className="task-empty muted">No chats yet</li> : null}
        </ul>
      </div>

      <footer className="nav-footer">
        <span className="brand-mark" aria-hidden />
        <div>
          <div className="brand-name">Claude Code Desktop</div>
          <div className="brand-sub muted">{projectPath ? basename(projectPath) : 'No project'}</div>
        </div>
      </footer>
    </aside>
  )
}

function basename(p: string) {
  const parts = p.split(/[/\\]/)
  return parts[parts.length - 1] || p
}
