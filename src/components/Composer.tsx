import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AttachmentRef, ChatProvider } from '../lib/types'
import {
  CUSTOM_MODEL_ID,
  displayModelLabel,
  modelsForProvider,
} from '../lib/models'

interface Props {
  disabled?: boolean
  attachments: AttachmentRef[]
  provider: ChatProvider
  model: string
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
  const [customMode, setCustomMode] = useState(false)
  const [customDraft, setCustomDraft] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const options = modelsForProvider(provider)
  const known = options.some((o) => o.id === model)
  const label = displayModelLabel(provider, model)

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

  function pick(id: string) {
    if (id === CUSTOM_MODEL_ID) {
      setCustomMode(true)
      setCustomDraft(known ? '' : model)
      return
    }
    setCustomMode(false)
    setMenuOpen(false)
    onModelChange(id)
  }

  function applyCustom() {
    const next = customDraft.trim()
    if (!next && provider === 'openai') return
    onModelChange(next)
    setCustomMode(false)
    setMenuOpen(false)
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
              disabled={disabled}
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
                {options.map((opt) => (
                  <button
                    key={opt.id || 'default'}
                    type="button"
                    role="option"
                    className={
                      (!model && !opt.id) || model === opt.id ? 'model-option active' : 'model-option'
                    }
                    aria-selected={(!model && !opt.id) || model === opt.id}
                    onClick={() => pick(opt.id)}
                  >
                    {opt.label}
                  </button>
                ))}
                <button
                  type="button"
                  className={!known && model ? 'model-option active' : 'model-option'}
                  onClick={() => pick(CUSTOM_MODEL_ID)}
                >
                  Custom…
                </button>
                {customMode ? (
                  <div className="model-custom-row">
                    <input
                      autoFocus
                      spellCheck={false}
                      placeholder={provider === 'openai' ? 'model-id' : 'sonnet / model-id'}
                      value={customDraft}
                      onChange={(e) => setCustomDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          applyCustom()
                        }
                      }}
                    />
                    <button type="button" className="secondary" onClick={applyCustom}>
                      Use
                    </button>
                  </div>
                ) : null}
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
