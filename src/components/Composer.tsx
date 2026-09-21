import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AttachmentRef } from '../lib/types'

interface Props {
  disabled?: boolean
  attachments: AttachmentRef[]
  onRemoveAttachment: (path: string) => void
  onAttach: () => void
  onSend: (text: string) => void
  onStop: () => void
  busy: boolean
}

export function Composer({
  disabled,
  attachments,
  onRemoveAttachment,
  onAttach,
  onSend,
  onStop,
  busy,
}: Props) {
  const [text, setText] = useState('')

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = text.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <form className="composer" onSubmit={submit}>
      {attachments.length > 0 ? (
        <div className="attach-chips">
          {attachments.map((a) => (
            <span key={a.path} className="chip">
              {a.name}
              <button type="button" aria-label={`Remove ${a.name}`} onClick={() => onRemoveAttachment(a.path)}>
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder="Message Claude Code…"
        rows={3}
        disabled={disabled}
      />
      <div className="row">
        <button type="button" className="secondary" onClick={onAttach} disabled={disabled}>
          Attach
        </button>
        {busy ? (
          <button type="button" className="danger" onClick={onStop}>
            Stop
          </button>
        ) : (
          <button type="submit" disabled={disabled || !text.trim()}>
            Send
          </button>
        )}
      </div>
    </form>
  )
}
