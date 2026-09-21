export interface TranscriptItem {
  id: string
  role: 'user' | 'assistant' | 'system'
  text: string
}

interface Props {
  items: TranscriptItem[]
  streaming: string
}

export function ChatTranscript({ items, streaming }: Props) {
  return (
    <div className="transcript">
      {items.map((item) => (
        <article key={item.id} className={`bubble ${item.role}`}>
          <div className="role">{item.role}</div>
          <pre>{item.text}</pre>
        </article>
      ))}
      {streaming ? (
        <article className="bubble assistant streaming">
          <div className="role">assistant</div>
          <pre>{streaming}</pre>
        </article>
      ) : null}
    </div>
  )
}
