import { useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AttachmentRef } from '../lib/types'

interface Props {
  disabled?: boolean
  attachments: AttachmentRef[]
  modelLabel: string
  onRemoveAttachment: (path: string) => void
  onAttachFile: () => void
  onAttachImage: () => void
  onPasteImage: () => void
  onSend: (text: string) => void
  onStop: () => void
  busy: boolean
}

export function Composer({
  disabled,
  attachments,
  modelLabel,
  onRemoveAttachment,
  onAttachFile,
  onAttachImage,
  onPasteImage,
  onSend,
  onStop,
  busy,
}: Props) {
  const [text, setText] = useState('')

  function submit(e?: FormEvent) {
    e?.preventDefault()
    const trimmed = text.trim()
    if ((!trimmed && attachments.length === 0) || disabled) return
    onSend(trimmed)
    setText('')
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'v') {
      // Prefer clipboard image when present (handled async by parent via paste event too)
    }
  }

  return (
    <form
      className="composer-card"
      onSubmit={submit}
      onPaste={(e) => {
        const items = e.clipboardData?.items
        if (!items) return
        for (const item of Array.from(items)) {
          if (item.type.startsWith('image/')) {
            e.preventDefault()
            onPasteImage()
            return
          }
        }
      }}
    >
      {attachments.length > 0 ? (
        <div className="attach-chips">
          {attachments.map((a) => (
            <span key={a.path} className="chip">
              {a.mimeType.startsWith('image/') && a.previewDataUrl ? (
                <img src={a.previewDataUrl} alt={a.name} className="chip-thumb" />
              ) : null}
              <span>{a.name}</span>
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
        placeholder="Write a message..."
        rows={2}
        disabled={disabled}
      />
      <div className="composer-toolbar">
        <div className="composer-left">
          <button type="button" className="icon-btn" title="Attach image" disabled={disabled} onClick={onAttachImage}>
            <PlusIcon />
          </button>
          <button type="button" className="icon-btn" title="Attach file" disabled={disabled} onClick={onAttachFile}>
            <FolderPlusIcon />
          </button>
        </div>
        <div className="composer-right">
          <span className="model-label">{modelLabel}</span>
          {busy ? (
            <button type="button" className="send-btn stop" onClick={onStop} title="Stop">
              ■
            </button>
          ) : (
            <button
              type="submit"
              className="send-btn"
              disabled={disabled || (!text.trim() && attachments.length === 0)}
              title="Send"
            >
              <SendIcon />
            </button>
          )}
        </div>
      </div>
    </form>
  )
}

function PlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

function FolderPlusIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M3 7h6l2 2h10v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z" />
      <path d="M12 12v6M9 15h6" />
    </svg>
  )
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
      <path d="M12 19V5M5 12l7-7 7 7" />
    </svg>
  )
}
