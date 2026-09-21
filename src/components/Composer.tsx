import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AttachmentRef, ChatProvider } from '../lib/types'
import { displayModelLabel, type ModelEntry, type ModelOption } from '../lib/models'

interface Props {
  disabled?: boolean
  attachments: AttachmentRef[]
  provider: ChatProvider
  model: string
  modelCatalog: ModelEntry[]
  enabledOptions: ModelOption[]
  onModelChange: (model: string) => void
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
  provider,
  model,
  modelCatalog,
  enabledOptions,
  onModelChange,
  onRemoveAttachment,
  onAttachFile,
  onAttachImage,
  onPasteImage,
  onSend,
  onStop,
  busy,
}: Props) {
  const [text, setText] = useState('')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  const label = displayModelLabel(modelCatalog, provider, model)

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [])

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
          <div className="model-picker" ref={menuRef}>
            <button
              type="button"
              className="model-picker-btn"
              title="Select model"
              disabled={disabled || enabledOptions.length === 0}
              aria-expanded={menuOpen}
              aria-haspopup="listbox"
              onClick={() => setMenuOpen((v) => !v)}
            >
              <span className="model-label">{label}</span>
              <span className="model-caret" aria-hidden>
                ▾
              </span>
            </button>
            {menuOpen ? (
              <div className="model-menu" role="listbox">
                {enabledOptions.length === 0 ? (
                  <div className="model-menu-note muted">Enable models in Settings</div>
                ) : (
                  <div className="model-menu-scroll">
                    {enabledOptions.map((opt) => (
                      <button
                        key={opt.id || 'default'}
                        type="button"
                        role="option"
                        className={
                          (!model && !opt.id) || model === opt.id
                            ? 'model-option active'
                            : 'model-option'
                        }
                        aria-selected={(!model && !opt.id) || model === opt.id}
                        onClick={() => {
                          onModelChange(opt.id)
                          setMenuOpen(false)
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </div>
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
