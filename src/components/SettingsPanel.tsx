import { useEffect, useState } from 'react'
import type { AuthStatus, ChatProvider } from '../lib/types'

interface Props {
  fontSize: number
  onFontSizeChange: (size: number) => void
  auth: AuthStatus
  onSaveClaudeKey: (apiKey: string) => Promise<void>
  onSaveOpenAi: (payload: { apiKey?: string; baseUrl: string; model: string }) => Promise<void>
  onSwitchProvider: (provider: ChatProvider) => Promise<void>
  onClearClaudeKey?: () => Promise<void>
  onClearOpenAiKey?: () => Promise<void>
  onClose: () => void
}

const MIN = 12
const MAX = 18

export function SettingsPanel({
  fontSize,
  onFontSizeChange,
  auth,
  onSaveClaudeKey,
  onSaveOpenAi,
  onSwitchProvider,
  onClearClaudeKey,
  onClearOpenAiKey,
  onClose,
}: Props) {
  const [openaiEnabled, setOpenaiEnabled] = useState(auth.provider === 'openai')
  const [baseUrl, setBaseUrl] = useState(auth.openaiBaseUrl ?? 'https://api.openai.com/v1')
  const [model, setModel] = useState(auth.openaiModel ?? 'gpt-4o-mini')
  const [openaiKey, setOpenaiKey] = useState('')
  const [claudeKey, setClaudeKey] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setOpenaiEnabled(auth.provider === 'openai')
    setBaseUrl(auth.openaiBaseUrl ?? 'https://api.openai.com/v1')
    setModel(auth.openaiModel ?? 'gpt-4o-mini')
  }, [auth])

  async function run(action: () => Promise<void>, ok: string) {
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      await action()
      setMessage(ok)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="settings-title">
      <div className="modal settings-modal">
        <header className="settings-header">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <label className="settings-row" htmlFor="font-size">
          <div>
            <div className="settings-label">Font size</div>
            <div className="muted settings-hint">Chat and UI text ({fontSize}px)</div>
          </div>
          <div className="font-size-controls">
            <button
              type="button"
              className="secondary"
              disabled={fontSize <= MIN}
              onClick={() => onFontSizeChange(Math.max(MIN, fontSize - 1))}
            >
              A−
            </button>
            <input
              id="font-size"
              type="range"
              min={MIN}
              max={MAX}
              step={1}
              value={fontSize}
              onChange={(e) => onFontSizeChange(Number(e.target.value))}
            />
            <button
              type="button"
              className="secondary"
              disabled={fontSize >= MAX}
              onClick={() => onFontSizeChange(Math.min(MAX, fontSize + 1))}
            >
              A+
            </button>
          </div>
        </label>

        <hr className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label">OpenAI test mode</div>
          <div className="muted settings-hint">
            Active provider: {auth.provider === 'openai' ? 'OpenAI' : 'Claude Code'}
          </div>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={openaiEnabled}
              disabled={busy}
              onChange={(e) => {
                const on = e.target.checked
                setOpenaiEnabled(on)
                setError(null)
                setMessage(null)
                if (!on && auth.provider === 'openai') {
                  void run(() => onSwitchProvider('claude'), 'Switched to Claude Code.')
                }
              }}
            />
            <span>Enable OpenAI URL / API key</span>
          </label>
        </div>

        {openaiEnabled ? (
          <div className="settings-openai">
            <label className="field-label" htmlFor="settings-base-url">
              Base URL
            </label>
            <input
              id="settings-base-url"
              type="url"
              spellCheck={false}
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://api.openai.com/v1"
              disabled={busy}
            />
            <label className="field-label" htmlFor="settings-model">
              Model
            </label>
            <input
              id="settings-model"
              type="text"
              spellCheck={false}
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="gpt-4o-mini"
              disabled={busy}
            />
            <label className="field-label" htmlFor="settings-openai-key">
              API key
              {auth.provider === 'openai' && auth.hasStoredKey ? ' (saved — leave blank to keep)' : ''}
            </label>
            <input
              id="settings-openai-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={openaiKey}
              onChange={(e) => setOpenaiKey(e.target.value)}
              placeholder="sk-…"
              disabled={busy}
            />
            <div className="row settings-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await onSaveOpenAi({
                      apiKey: openaiKey.trim() || undefined,
                      baseUrl: baseUrl.trim().replace(/\/$/, ''),
                      model: model.trim() || 'gpt-4o-mini',
                    })
                    setOpenaiKey('')
                  }, 'OpenAI settings saved.')
                }
              >
                {busy ? 'Saving…' : 'Save OpenAI'}
              </button>
              {onClearOpenAiKey ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      await onClearOpenAiKey()
                      setOpenaiEnabled(false)
                    }, 'OpenAI key cleared.')
                  }
                >
                  Clear OpenAI key
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <div className="settings-openai">
            <label className="field-label" htmlFor="settings-claude-key">
              Anthropic API key
              {auth.provider === 'claude' && auth.hasStoredKey ? ' (saved — leave blank to keep)' : ''}
            </label>
            <input
              id="settings-claude-key"
              type="password"
              autoComplete="off"
              spellCheck={false}
              value={claudeKey}
              onChange={(e) => setClaudeKey(e.target.value)}
              placeholder="sk-ant-…"
              disabled={busy}
            />
            <div className="row settings-actions">
              <button
                type="button"
                className="primary-btn"
                disabled={busy || !claudeKey.trim()}
                onClick={() =>
                  void run(async () => {
                    await onSaveClaudeKey(claudeKey.trim())
                    setClaudeKey('')
                  }, 'Anthropic API key saved.')
                }
              >
                {busy ? 'Saving…' : 'Save Anthropic key'}
              </button>
              {onClearClaudeKey ? (
                <button
                  type="button"
                  className="secondary"
                  disabled={busy}
                  onClick={() => void run(() => onClearClaudeKey(), 'Anthropic key cleared.')}
                >
                  Clear Anthropic key
                </button>
              ) : null}
            </div>
          </div>
        )}

        {error ? <p className="field-error">{error}</p> : null}
        {message ? <p className="settings-ok">{message}</p> : null}

        <div className="perm-actions">
          <button type="button" className="primary-btn" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  )
}
