import { MarkdownBody } from './MarkdownBody'

export interface TranscriptItem {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
}

export interface ActivityStep {
  id: string
  kind: 'thinking' | 'tool'
  label: string
  detail?: string
  status: 'running' | 'done'
}

interface Props {
  items: TranscriptItem[]
  streaming: string
  busy: boolean
  activity: ActivityStep[]
  onCopy: (text: string) => void
}

export function ChatTranscript({ items, streaming, busy, activity, onCopy }: Props) {
  const showWorking = busy || Boolean(streaming) || activity.length > 0

  return (
    <div className="transcript">
      {items.map((item) => (
        <article key={item.id} className={`msg ${item.role}`}>
          {item.role === 'assistant' ? <div className="avatar" aria-hidden /> : null}
          <div className="msg-body">
            {item.role === 'assistant' ? (
              <MarkdownBody text={item.text} className="msg-text" onCopyCode={onCopy} />
            ) : (
              <div className="msg-text plain">{item.text}</div>
            )}
            {item.role === 'assistant' ? (
              <button
                type="button"
                className="icon-btn copy-btn"
                title="Copy"
                aria-label="Copy message"
                onClick={() => onCopy(item.text)}
              >
                <CopyIcon />
              </button>
            ) : null}
          </div>
        </article>
      ))}

      {showWorking ? (
        <article className="msg assistant working">
          <div className="avatar" aria-hidden />
          <div className="msg-body">
            {(busy || activity.length > 0) && (
              <div className="working-panel" aria-live="polite">
                <div className="working-header">
                  <span className={`working-spinner${busy ? ' on' : ''}`} aria-hidden />
                  <span className="working-title">
                    {busy
                      ? streaming
                        ? 'Writing…'
                        : activity.some((s) => s.kind === 'tool')
                          ? 'Working…'
                          : 'Thinking…'
                      : 'Done'}
                  </span>
                </div>
                {activity.length > 0 ? (
                  <ul className="working-steps">
                    {activity.map((step) => (
                      <li key={step.id} className={`working-step ${step.status}`}>
                        <span className="working-step-icon" aria-hidden>
                          {step.status === 'running' ? '◐' : '✓'}
                        </span>
                        <span className="working-step-label">{step.label}</span>
                        {step.detail ? (
                          <span className="working-step-detail muted">{step.detail}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : busy && !streaming ? (
                  <p className="working-hint muted">Planning next steps…</p>
                ) : null}
              </div>
            )}
            {streaming ? <MarkdownBody text={streaming} className="msg-text" onCopyCode={onCopy} /> : null}
          </div>
        </article>
      ) : null}
    </div>
  )
}

function CopyIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V5a2 2 0 0 1 2-2h10" />
    </svg>
  )
}
