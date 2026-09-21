import { useState, type DragEvent } from 'react'
import type { SessionSummary } from '../lib/types'

interface Props {
  projectPath: string | null
  projects: string[]
  sessions: SessionSummary[]
  activeId?: string | null
  onNew: () => void
  onOpenProject: () => void
  onSelectProject: (path: string) => void
  onRemoveProject: (path: string) => void
  onReorderProjects: (orderedPaths: string[]) => void
  onSelectSession: (id: string) => void
  onOpenSettings: () => void
}

export function LeftNav({
  projectPath,
  projects,
  sessions,
  activeId,
  onNew,
  onOpenProject,
  onSelectProject,
  onRemoveProject,
  onReorderProjects,
  onSelectSession,
  onOpenSettings,
}: Props) {
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [overIndex, setOverIndex] = useState<number | null>(null)

  function onDragStart(index: number) {
    setDragIndex(index)
  }

  function onDragOver(e: DragEvent, index: number) {
    e.preventDefault()
    if (dragIndex === null || dragIndex === index) return
    setOverIndex(index)
  }

  function onDrop(index: number) {
    if (dragIndex === null || dragIndex === index) {
      setDragIndex(null)
      setOverIndex(null)
      return
    }
    const next = [...projects]
    const [moved] = next.splice(dragIndex, 1)
    next.splice(index, 0, moved)
    onReorderProjects(next)
    setDragIndex(null)
    setOverIndex(null)
  }

  function onDragEnd() {
    setDragIndex(null)
    setOverIndex(null)
  }

  return (
    <aside className="left-nav">
      <nav className="nav-actions">
        <button type="button" className="nav-item primary" onClick={onNew} disabled={!projectPath}>
          <span className="nav-plus">+</span> New chat
        </button>
        <button type="button" className="nav-item" onClick={onOpenProject}>
          + Add repo
        </button>
      </nav>

      <div className="tasks-block repo-tree">
        <div className="tasks-label">Repos</div>
        <ul className="task-list">
          {projects.map((p, index) => {
            const active = p === projectPath
            return (
              <li
                key={p}
                className={`repo-node${active ? ' open' : ''}${overIndex === index ? ' drag-over' : ''}${dragIndex === index ? ' dragging' : ''}`}
                draggable
                onDragStart={() => onDragStart(index)}
                onDragOver={(e) => onDragOver(e, index)}
                onDrop={() => onDrop(index)}
                onDragEnd={onDragEnd}
              >
                <div className="repo-item">
                  <span className="repo-drag" title="Drag to reorder" aria-hidden>
                    ⋮⋮
                  </span>
                  <button
                    type="button"
                    className={active ? 'task active' : 'task'}
                    title={p}
                    onClick={() => onSelectProject(p)}
                  >
                    <span className="repo-chevron" aria-hidden>
                      {active ? '▾' : '▸'}
                    </span>
                    <span className="repo-text">
                      <span className="repo-name">{basename(p)}</span>
                      <span className="repo-path muted">{parentDir(p)}</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="repo-remove"
                    title="Remove from list"
                    aria-label={`Remove ${basename(p)}`}
                    onClick={(e) => {
                      e.stopPropagation()
                      onRemoveProject(p)
                    }}
                  >
                    ×
                  </button>
                </div>

                {active ? (
                  <ul className="chat-list">
                    {sessions.map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={s.id === activeId ? 'task chat-task active' : 'task chat-task'}
                          onClick={() => onSelectSession(s.id)}
                        >
                          {s.preview?.trim() || `Chat ${s.id.slice(0, 8)}`}
                        </button>
                      </li>
                    ))}
                    {sessions.length === 0 ? (
                      <li className="task-empty muted nested">No chats yet</li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            )
          })}
          {projects.length === 0 ? (
            <li className="task-empty muted">No repos yet — add a folder</li>
          ) : null}
        </ul>
      </div>

      <footer className="nav-footer">
        <button
          type="button"
          className="avatar-btn"
          title="Settings"
          aria-label="Open settings"
          onClick={onOpenSettings}
        >
          <span className="brand-mark" aria-hidden />
        </button>
        <div className="nav-footer-text">
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

function parentDir(p: string) {
  const parts = p.split(/[/\\]/).filter(Boolean)
  if (parts.length < 2) return p
  return parts.slice(0, -1).slice(-2).join('/')
}
