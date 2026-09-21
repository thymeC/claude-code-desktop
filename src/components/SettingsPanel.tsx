import { useEffect, useState } from 'react'
import { ccd } from '../lib/ipc'
import type { AuthStatus, ChatProvider } from '../lib/types'
import {
  enabledModels,
  mergeModelCatalog,
  modelsForProvider,
  syncRemoteModels,
  upsertCustomModel,
  type ModelEntry,
} from '../lib/models'

interface Props {
  fontSize: number
  onFontSizeChange: (size: number) => void
  auth: AuthStatus
  modelCatalog: ModelEntry[]
  onModelCatalogChange: (catalog: ModelEntry[]) => Promise<void>
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
  modelCatalog,
  onModelCatalogChange,
  onSaveClaudeKey,
  onSaveOpenAi,
  onSwitchProvider,
  onClearClaudeKey,
  onClearOpenAiKey,
  onClose,
}: Props) {
  const [openaiEnabled, setOpenaiEnabled] = useState(auth.provider === 'openai')
  const [baseUrl, setBaseUrl] = useState(auth.openaiBaseUrl ?? 'https://api.openai.com/v1')
  const [openaiKey, setOpenaiKey] = useState('')
  const [claudeKey, setClaudeKey] = useState('')
  const [customId, setCustomId] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const catalog = mergeModelCatalog(modelCatalog)
  const provider: ChatProvider = openaiEnabled ? 'openai' : 'claude'
  const providerModels = modelsForProvider(catalog, provider)

  useEffect(() => {
    setOpenaiEnabled(auth.provider === 'openai')
    setBaseUrl(auth.openaiBaseUrl ?? 'https://api.openai.com/v1')
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

  async function toggleModel(id: string, enabled: boolean) {
    const next = catalog.map((m) =>
      m.provider === provider && m.id === id ? { ...m, enabled } : m,
    )
    await onModelCatalogChange(next)
  }

  async function removeCustom(id: string) {
    const next = catalog.filter((m) => !(m.provider === provider && m.id === id && m.custom))
    await onModelCatalogChange(next)
  }

  async function addCustom() {
    const id = customId.trim()
    if (!id) {
      setError('Enter a model id.')
      return
    }
    const next = upsertCustomModel(catalog, provider, id)
    await onModelCatalogChange(next)
    setCustomId('')
    setMessage(`Added ${id}.`)
    setError(null)
  }

  async function refreshFromApi() {
    await run(async () => {
      const res = await ccd().openaiListModels()
      if (!res.ok || !res.models?.length) {
        throw new Error(res.error ?? 'Failed to fetch models')
      }
      // Replace OpenAI catalog with the live /models list
      const next = syncRemoteModels(catalog, 'openai', res.models)
      await onModelCatalogChange(next)
    }, 'Synced models from API.')
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
                    const enabled = enabledModels(catalog, 'openai')
                    const current = auth.openaiModel?.trim() || 'gpt-4o-mini'
                    const model =
                      enabled.find((m) => m.id === current)?.id ||
                      enabled[0]?.id ||
                      'gpt-4o-mini'
                    await onSaveOpenAi({
                      apiKey: openaiKey.trim() || undefined,
                      baseUrl: baseUrl.trim().replace(/\/$/, ''),
                      model,
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

        <hr className="settings-divider" />

        <div className="settings-row">
          <div className="settings-label">Models</div>
          <div className="muted settings-hint">
            Enable models for {provider === 'openai' ? 'OpenAI' : 'Claude'}. Only enabled models appear
            in the chat picker.
            {provider === 'openai'
              ? ' Refresh replaces the OpenAI list with your gateway’s real /models response.'
              : ''}
          </div>
          {provider === 'openai' ? (
            <div className="row settings-actions" style={{ marginTop: '0.35rem' }}>
              <button
                type="button"
                className="secondary"
                disabled={busy}
                onClick={() => void refreshFromApi()}
              >
                {busy ? 'Refreshing…' : 'Refresh from API'}
              </button>
            </div>
          ) : null}
          <ul className="model-catalog-list">
            {providerModels.map((m) => (
              <li key={`${m.provider}-${m.id || 'default'}`} className="model-catalog-row">
                <label className="toggle-row model-catalog-toggle">
                  <input
                    type="checkbox"
                    checked={m.enabled}
                    disabled={busy}
                    onChange={(e) => void toggleModel(m.id, e.target.checked)}
                  />
                  <span>
                    <span className="model-catalog-name">
                      {m.label}
                      {m.fromApi ? <span className="muted"> · api</span> : null}
                    </span>
                    {m.id ? <span className="muted model-catalog-id">{m.id}</span> : null}
                  </span>
                </label>
                {m.custom ? (
                  <button
                    type="button"
                    className="icon-btn"
                    title="Remove"
                    disabled={busy}
                    onClick={() => void removeCustom(m.id)}
                  >
                    ×
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
          <div className="model-custom-row" style={{ marginTop: '0.5rem' }}>
            <input
              type="text"
              spellCheck={false}
              value={customId}
              onChange={(e) => setCustomId(e.target.value)}
              placeholder="Add custom model id"
              disabled={busy}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  void addCustom()
                }
              }}
            />
            <button type="button" className="secondary" disabled={busy} onClick={() => void addCustom()}>
              Add
            </button>
          </div>
        </div>

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
