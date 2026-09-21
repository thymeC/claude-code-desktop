import type { AttachmentRef } from '../lib/types'

interface Props {
  projectPath: string | null
  attachments: AttachmentRef[]
  toolCount: number
  open: boolean
}

export function RightPanel({ projectPath, attachments, toolCount, open }: Props) {
  if (!open) return null
  return (
    <aside className="right-panel">
      <section>
        <h3>Progress</h3>
        <div className="progress-dots" aria-hidden>
          <span className={toolCount > 0 ? 'dot done' : 'dot'} />
          <span className={toolCount > 1 ? 'dot done' : 'dot'} />
          <span className="dot" />
        </div>
        <p className="panel-hint muted">See task progress for longer tasks.</p>
      </section>
      <section>
        <h3>Working folder</h3>
        <p className="folder-path">{projectPath ?? 'Not selected'}</p>
      </section>
      <section>
        <h3>Context</h3>
        <div className="context-icons">
          {attachments.length === 0 ? (
            <p className="panel-hint muted">Track tools and referenced files used in this task.</p>
          ) : (
            attachments.map((a) => (
              <div key={a.path} className="context-chip" title={a.path}>
                {a.mimeType.startsWith('image/') ? '🖼' : '📄'} {a.name}
              </div>
            ))
          )}
        </div>
      </section>
    </aside>
  )
}
