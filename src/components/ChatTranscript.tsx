export interface TranscriptItem {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
}

interface Props {
  items: TranscriptItem[]
  streaming: string
  onCopy: (text: string) => void
}

export function ChatTranscript({ items, streaming, onCopy }: Props) {
  return (
    <div className="transcript">
      {items.map((item) => (
        <article key={item.id} className={`msg ${item.role}`}>
          {item.role === 'assistant' ? <div className="avatar" aria-hidden /> : null}
          <div className="msg-body">
            <div className="msg-text">{item.text}</div>
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
      {streaming ? (
        <article className="msg assistant streaming">
          <div className="avatar" aria-hidden />
          <div className="msg-body">
            <div className="msg-text">{streaming}</div>
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
