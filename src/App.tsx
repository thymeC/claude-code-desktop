import { useCallback, useEffect, useRef, useState } from 'react'
import { ccd } from './lib/ipc'
import type { AttachmentRef, AuthStatus, ChatEvent, CliStatus, SessionSummary } from './lib/types'
import { Onboarding } from './components/Onboarding'
import { ApiKeyPrompt } from './components/ApiKeyPrompt'
import { ChatTranscript, type ActivityStep, type TranscriptItem } from './components/ChatTranscript'
import { Composer } from './components/Composer'
import { LeftNav } from './components/LeftNav'
import { RightPanel } from './components/RightPanel'
import { PermissionModal } from './components/PermissionModal'
import { SettingsPanel } from './components/SettingsPanel'
import {
  defaultModelCatalog,
  enabledModels,
  ensureSavedModelInCatalog,
  mergeModelCatalog,
  resolveEnabledSelection,
  type ModelEntry,
} from './lib/models'

const DEFAULT_FONT_SIZE = 14

interface SessionUiState {
  items: TranscriptItem[]
  streaming: string
  busy: boolean
  activity: ActivityStep[]
  toolCount: number
  title: string
  error: string | null
}

export function App() {
  const [cli, setCli] = useState<CliStatus | null>(null)
  const [auth, setAuth] = useState<AuthStatus | null>(null)
  const [projectPath, setProjectPath] = useState<string | null>(null)
  const [items, setItems] = useState<TranscriptItem[]>([])
  const [streaming, setStreaming] = useState('')
  const [busy, setBusy] = useState(false)
  const [attachments, setAttachments] = useState<AttachmentRef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [sessionReady, setSessionReady] = useState(false)
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null)
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [permission, setPermission] = useState<ChatEvent | null>(null)
  const [rightOpen, setRightOpen] = useState(true)
  const [toolCount, setToolCount] = useState(0)
  const [activity, setActivity] = useState<ActivityStep[]>([])
  const [title, setTitle] = useState('New chat')
  const [copyToast, setCopyToast] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE)
  const [projects, setProjects] = useState<string[]>([])
  const [selectedModel, setSelectedModel] = useState('')
  const [modelCatalog, setModelCatalog] = useState<ModelEntry[]>(defaultModelCatalog())

  const uiCacheRef = useRef(new Map<string, SessionUiState>())
  const viewedSessionRef = useRef<string | null>(null)
  const snapshotRef = useRef<SessionUiState>({
    items: [],
    streaming: '',
    busy: false,
    activity: [],
    toolCount: 0,
    title: 'New chat',
    error: null,
  })

  // Keep a live snapshot for caching without stale closures
  useEffect(() => {
    snapshotRef.current = {
      items,
      streaming,
      busy,
      activity,
      toolCount,
      title,
      error,
    }
    viewedSessionRef.current = activeSessionId
  }, [items, streaming, busy, activity, toolCount, title, error, activeSessionId])

  function cacheCurrentUi(sessionId: string | null) {
    if (!sessionId) return
    uiCacheRef.current.set(sessionId, { ...snapshotRef.current })
  }

  function applyUi(state: SessionUiState) {
    setItems(state.items)
    setStreaming(state.streaming)
    setBusy(state.busy)
    setActivity(state.activity)
    setToolCount(state.toolCount)
    setTitle(state.title)
    setError(state.error)
  }

  function patchCachedSession(sessionId: string, patch: (prev: SessionUiState) => SessionUiState) {
    const prev = uiCacheRef.current.get(sessionId) ?? {
      items: [],
      streaming: '',
      busy: false,
      activity: [],
      toolCount: 0,
      title: 'Chat',
      error: null,
    }
    uiCacheRef.current.set(sessionId, patch(prev))
  }

  async function refreshCli() {
    const status = await ccd().cliCheck()
    setCli(status)
    return status
  }

  async function refreshAuth() {
    const status = await ccd().authStatus()
    setAuth(status)
    return status
  }

  const refreshSessions = useCallback(async (path: string) => {
    const list = await ccd().sessionList(path)
    setSessions(list)
    return list
  }, [])

  const refreshProjects = useCallback(async () => {
    const list = await ccd().projectList()
    setProjects(list)
    return list
  }, [])

  const openExistingChat = useCallback(
    async (path: string, sessionId: string, sessionList?: SessionSummary[]) => {
      const list = sessionList ?? (await ccd().sessionList(path))
      const live = await ccd().sessionLive()
      const cached = uiCacheRef.current.get(sessionId)
      const preview = list.find((s) => s.id === sessionId)?.preview?.slice(0, 40) || 'Chat'

      // Same chat already in view — refresh from cache (keeps Working…) and ensure ready
      if (sessionId === viewedSessionRef.current) {
        cacheCurrentUi(sessionId)
        setSessions(list)
        setActiveSessionId(sessionId)
        if (cached) applyUi(uiCacheRef.current.get(sessionId) ?? cached)
        if (live.sessionId === sessionId && live.running) {
          setSessionReady(true)
          if (live.pending) setBusy(true)
        }
        return
      }

      cacheCurrentUi(viewedSessionRef.current)

      setSessions(list)
      setActiveSessionId(sessionId)
      setPermission(null)

      // Backend still on this session — keep it alive and restore Working… UI
      if (live.sessionId === sessionId && live.running) {
        await ccd().sessionResume(path, sessionId)
        setSessionReady(true)
        if (cached) {
          applyUi(cached)
        } else {
          const transcript = await ccd().sessionTranscript(path, sessionId)
          applyUi({
            items: transcript.map((m) => ({ id: m.id, role: m.role, text: m.text })),
            streaming: '',
            busy: live.pending,
            activity: live.pending
              ? [
                  {
                    id: crypto.randomUUID(),
                    kind: 'thinking',
                    label: 'Working',
                    detail: 'Still running…',
                    status: 'running',
                  },
                ]
              : [],
            toolCount: 0,
            title: preview,
            error: null,
          })
        }
        return
      }

      // Viewing another chat while one may still be running in the background —
      // do NOT stop/resume (that wiped Working… status on switch-back).
      const transcript = await ccd().sessionTranscript(path, sessionId)
      if (cached) {
        applyUi({
          ...cached,
          items:
            transcript.length > cached.items.length
              ? transcript.map((m) => ({ id: m.id, role: m.role, text: m.text }))
              : cached.items,
          title: cached.title || preview,
        })
      } else {
        applyUi({
          items: transcript.map((m) => ({ id: m.id, role: m.role, text: m.text })),
          streaming: '',
          busy: false,
          activity: [],
          toolCount: 0,
          title: preview,
          error: null,
        })
      }
      setSessionReady(false)

      // Soft-bind backend only when nothing is in-flight on another session
      if (!live.pending) {
        try {
          await ccd().chatStop()
        } catch {
          // ignore
        }
        await ccd().sessionResume(path, sessionId)
        setSessionReady(true)
      }
    },
    [],
  )

  useEffect(() => {
    if (!auth) return
    const provider = auth.provider
    void ccd()
      .settingsGet()
      .then(async (s) => {
        const raw = provider === 'openai' ? (auth.openaiModel ?? s.openaiModel) : s.claudeModel
        const merged = mergeModelCatalog(s.modelCatalog)
        const catalog = ensureSavedModelInCatalog(merged, provider, raw)
        setModelCatalog(catalog)
        setSelectedModel(resolveEnabledSelection(catalog, provider, raw))
        if (catalog !== merged) {
          await ccd().settingsSet({ modelCatalog: catalog })
        }
      })
  }, [auth?.provider, auth?.openaiModel])

  useEffect(() => {
    document.documentElement.style.setProperty('--ui-font-size', `${fontSize}px`)
    document.documentElement.style.setProperty(
      '--assistant-font-size',
      `${Math.max(fontSize + 1, Math.round(fontSize * 1.1))}px`,
    )
  }, [fontSize])

  useEffect(() => {
    void (async () => {
      const status = await refreshCli()
      const authStatus = await refreshAuth()
      const settings = await ccd().settingsGet()
      if (typeof settings.fontSize === 'number') {
        setFontSize(Math.min(18, Math.max(12, settings.fontSize)))
      }
      if (authStatus.provider === 'openai') {
        const raw = authStatus.openaiModel ?? settings.openaiModel
        const merged = mergeModelCatalog(settings.modelCatalog)
        const catalog = ensureSavedModelInCatalog(merged, 'openai', raw)
        setModelCatalog(catalog)
        setSelectedModel(resolveEnabledSelection(catalog, 'openai', raw))
        if (catalog !== merged) await ccd().settingsSet({ modelCatalog: catalog })
      } else {
        const merged = mergeModelCatalog(settings.modelCatalog)
        const catalog = ensureSavedModelInCatalog(merged, 'claude', settings.claudeModel)
        setModelCatalog(catalog)
        setSelectedModel(resolveEnabledSelection(catalog, 'claude', settings.claudeModel))
        if (catalog !== merged) await ccd().settingsSet({ modelCatalog: catalog })
      }
      const canUseApp =
        authStatus.authenticated && (authStatus.provider === 'openai' || status.found)
      if (canUseApp) {
        const list = await refreshProjects()
        const path = (await ccd().projectGet()) ?? list[0] ?? null
        setProjectPath(path)
        if (path) {
          const sessionsList = await refreshSessions(path)
          const settingsLast = settings.lastSessionId
          const preferred =
            (settingsLast && sessionsList.find((s) => s.id === settingsLast)?.id) ||
            sessionsList[0]?.id
          if (preferred) await openExistingChat(path, preferred, sessionsList)
        }
      }
    })()

    return ccd().onChatEvent((event: ChatEvent) => {
      const eventSession = event.sessionId ?? null
      const viewing = viewedSessionRef.current
      const forView = !eventSession || !viewing || eventSession === viewing

      const applyToCache = (sessionId: string, mutate: (s: SessionUiState) => SessionUiState) => {
        patchCachedSession(sessionId, mutate)
      }

      if (event.type === 'partial' && event.text) {
        if (forView) {
          setStreaming((prev) => prev + event.text!)
          setBusy(true)
          setActivity((prev) =>
            prev.map((s) => (s.status === 'running' ? { ...s, status: 'done' as const } : s)),
          )
        }
        if (eventSession) {
          applyToCache(eventSession, (s) => ({
            ...s,
            streaming: s.streaming + event.text!,
            busy: true,
            activity: s.activity.map((a) =>
              a.status === 'running' ? { ...a, status: 'done' as const } : a,
            ),
          }))
        }
      } else if (event.type === 'message' && event.text) {
        const msg = {
          id: crypto.randomUUID(),
          role: (event.role ?? 'assistant') as TranscriptItem['role'],
          text: event.text!,
        }
        if (forView) {
          setStreaming('')
          setItems((prev) => [...prev, msg])
          setBusy(false)
          setActivity([])
        }
        if (eventSession) {
          applyToCache(eventSession, (s) => ({
            ...s,
            streaming: '',
            items: [...s.items, msg],
            busy: false,
            activity: [],
          }))
        }
      } else if (event.type === 'tool') {
        const { label, detail } = formatToolStep(event.toolName, event.toolInput)
        const step: ActivityStep = {
          id: crypto.randomUUID(),
          kind: 'tool',
          label,
          detail,
          status: 'running',
        }
        if (forView) {
          setBusy(true)
          setToolCount((n) => n + 1)
          setActivity((prev) => [
            ...prev.map((s) => (s.status === 'running' ? { ...s, status: 'done' as const } : s)),
            step,
          ])
        }
        if (eventSession) {
          applyToCache(eventSession, (s) => ({
            ...s,
            busy: true,
            toolCount: s.toolCount + 1,
            activity: [
              ...s.activity.map((a) =>
                a.status === 'running' ? { ...a, status: 'done' as const } : a,
              ),
              step,
            ],
          }))
        }
      } else if (event.type === 'permission_request') {
        if (forView) setPermission(event)
      } else if (event.type === 'error' && event.error) {
        if (forView) {
          setError(event.error)
          setBusy(false)
          setActivity((prev) => prev.map((s) => ({ ...s, status: 'done' as const })))
        }
        if (eventSession) {
          applyToCache(eventSession, (s) => ({
            ...s,
            error: event.error!,
            busy: false,
            activity: s.activity.map((a) => ({ ...a, status: 'done' as const })),
          }))
        }
      } else if (event.type === 'done') {
        if (forView) {
          setBusy(false)
          setActivity([])
          setStreaming((prev) => {
            if (prev) {
              setItems((curr) => [
                ...curr,
                { id: crypto.randomUUID(), role: 'assistant', text: prev },
              ])
            }
            return ''
          })
        }
        if (eventSession) {
          applyToCache(eventSession, (s) => {
            const items = s.streaming
              ? [...s.items, { id: crypto.randomUUID(), role: 'assistant' as const, text: s.streaming }]
              : s.items
            return { ...s, busy: false, activity: [], streaming: '', items }
          })
        }
        if (event.sessionId) {
          void (async () => {
            const path = await ccd().projectGet()
            if (path) await refreshSessions(path)
          })()
        }
      }
    })
  }, [refreshSessions, refreshProjects, openExistingChat])

  async function changeFontSize(size: number) {
    setFontSize(size)
    await ccd().settingsSet({ fontSize: size })
  }

  async function changeModel(model: string) {
    if (!auth) return
    const next = resolveEnabledSelection(modelCatalog, auth.provider, model)
    setSelectedModel(next)
    if (auth.provider === 'openai') {
      await ccd().settingsSet({ openaiModel: next.trim() || 'gpt-4o-mini' })
      setAuth(await ccd().authStatus())
    } else {
      await ccd().settingsSet({
        claudeModel: next.trim() ? next.trim() : undefined,
      })
      // Claude CLI reads --model at process start; restart so selection applies
      if (sessionReady && projectPath) {
        const sid = activeSessionId
        try {
          await ccd().chatStop()
        } catch {
          // ignore
        }
        if (sid) await ccd().sessionResume(projectPath, sid)
        else await ccd().sessionNew(projectPath)
        setSessionReady(true)
      }
    }
  }

  async function changeModelCatalog(catalog: ModelEntry[]) {
    const merged = mergeModelCatalog(catalog)
    setModelCatalog(merged)
    await ccd().settingsSet({ modelCatalog: merged })
    if (auth) {
      const next = resolveEnabledSelection(
        merged,
        auth.provider,
        selectedModel,
      )
      if (next !== selectedModel) await changeModel(next)
    }
  }

  async function startNewChat(path = projectPath) {
    if (!path) {
      setError('Add or select a repo first.')
      return
    }
    cacheCurrentUi(viewedSessionRef.current)
    setError(null)
    setBusy(false)
    setStreaming('')
    setItems([])
    setAttachments([])
    setPermission(null)
    setToolCount(0)
    setActivity([])
    setTitle('New chat')
    setActiveSessionId(null)
    try {
      await ccd().chatStop()
      const created = await ccd().sessionNew(path)
      setSessionReady(true)
      if (created.sessionId) setActiveSessionId(created.sessionId)
      await refreshSessions(path)
      await refreshProjects()
    } catch (e) {
      setSessionReady(false)
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function openProject() {
    const path = await ccd().projectOpen()
    if (!path) return
    setProjectPath(path)
    await refreshProjects()
    setSessionReady(false)
    setActiveSessionId(null)
    setItems([])
    setStreaming('')
    const list = await refreshSessions(path)
    if (list[0]) await openExistingChat(path, list[0].id, list)
    else setTitle('New chat')
  }

  async function selectProject(path: string) {
    if (path === projectPath) return
    try {
      await ccd().chatStop()
    } catch {
      // ignore
    }
    await ccd().projectSelect(path)
    setProjectPath(path)
    setSessionReady(false)
    setActiveSessionId(null)
    setItems([])
    setStreaming('')
    setAttachments([])
    setPermission(null)
    setError(null)
    setTitle(basename(path))
    const list = await refreshSessions(path)
    if (list[0]) await openExistingChat(path, list[0].id, list)
  }

  async function reorderProjects(ordered: string[]) {
    setProjects(ordered)
    const saved = await ccd().projectReorder(ordered)
    setProjects(saved)
  }

  async function removeProject(path: string) {
    const list = await ccd().projectRemove(path)
    setProjects(list)
    if (projectPath === path) {
      const next = list[0] ?? null
      setProjectPath(next)
      setSessions([])
      setSessionReady(false)
      setActiveSessionId(null)
      setItems([])
      if (next) {
        await ccd().projectSelect(next)
        const sessionsList = await refreshSessions(next)
        if (sessionsList[0]) await openExistingChat(next, sessionsList[0].id, sessionsList)
      }
    }
  }

  function basename(p: string) {
    const parts = p.split(/[/\\]/)
    return parts[parts.length - 1] || p
  }

  async function send(text: string) {
    if (!projectPath) return
    if (!sessionReady || !activeSessionId) {
      if (activeSessionId) {
        // Bind backend to the chat we're viewing (may stop a background run)
        try {
          await ccd().chatStop()
        } catch {
          // ignore
        }
        await ccd().sessionResume(projectPath, activeSessionId)
        setSessionReady(true)
      } else if (sessions[0]) {
        await openExistingChat(projectPath, sessions[0].id, sessions)
      } else {
        await startNewChat(projectPath)
      }
    } else {
      // Ensure backend matches viewed session before send
      const live = await ccd().sessionLive()
      if (live.sessionId && activeSessionId && live.sessionId !== activeSessionId) {
        try {
          await ccd().chatStop()
        } catch {
          // ignore
        }
        await ccd().sessionResume(projectPath, activeSessionId)
      }
    }
    if (text.trim()) {
      setItems((prev) => [...prev, { id: crypto.randomUUID(), role: 'user', text }])
      if (title === 'New chat' || title === 'Chat') setTitle(text.slice(0, 40))
    }
    setBusy(true)
    setError(null)
    setActivity([
      {
        id: crypto.randomUUID(),
        kind: 'thinking',
        label: 'Thinking',
        detail: 'Reading your request…',
        status: 'running',
      },
    ])
    try {
      await ccd().chatSend(text, attachments)
      setAttachments([])
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setBusy(false)
      setActivity([])
    }
  }

  async function stageFromFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    const paths = files.map((f) => ccd().getPathForFile(f)).filter(Boolean)
    if (paths.length === 0) {
      setError('Could not read file path. Use the attach buttons instead.')
      return
    }
    try {
      const refs = await ccd().filesStagePaths(paths)
      setAttachments((prev) => [...prev, ...refs])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function pasteImage() {
    try {
      const ref = await ccd().filesPasteImage()
      setAttachments((prev) => [...prev, ref])
      setError(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function resume(sessionId: string) {
    if (!projectPath) return
    // Allow re-entry when switching back so cached Working… state is restored
    if (sessionId === activeSessionId && sessionReady && busy) return
    try {
      await openExistingChat(projectPath, sessionId)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  async function copyText(text: string) {
    await ccd().clipboardWriteText(text)
    setCopyToast(true)
    window.setTimeout(() => setCopyToast(false), 1200)
  }

  if (!cli || !auth) {
    return <main className="app-shell">Loading…</main>
  }

  if (auth.provider !== 'openai' && !cli.found) {
    return (
      <main className="app-shell">
        <Onboarding
          status={cli}
          onRecheck={() => void refreshCli()}
          onBrowse={() => void ccd().cliBrowse().then((s) => s && setCli(s))}
        />
      </main>
    )
  }

  if (!auth.authenticated) {
    return (
      <main className="app-shell">
        <ApiKeyPrompt
          hasStoredKey={auth.hasStoredKey}
          source={auth.source}
          initialProvider={auth.provider}
          onSaveClaude={async (apiKey) => {
            const next = await ccd().authSetApiKey(apiKey)
            setAuth(next)
          }}
          onSaveOpenAi={async (payload) => {
            const next = await ccd().authSetOpenAi(payload)
            setAuth(next)
          }}
          onClearClaude={async () => {
            const next = await ccd().authClearApiKey()
            setAuth(next)
          }}
        />
      </main>
    )
  }

  return (
    <div className={`desktop-shell${rightOpen ? ' with-right' : ''}`}>
      <LeftNav
        projectPath={projectPath}
        projects={projects}
        sessions={sessions}
        activeId={activeSessionId}
        onNew={() => void startNewChat()}
        onOpenProject={() => void openProject()}
        onSelectProject={(p) => void selectProject(p)}
        onRemoveProject={(p) => void removeProject(p)}
        onReorderProjects={(ordered) => void reorderProjects(ordered)}
        onSelectSession={(id) => void resume(id)}
        onOpenSettings={() => setSettingsOpen(true)}
      />

      <div
        className="center-pane"
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => {
          e.preventDefault()
          if (e.dataTransfer.files?.length) void stageFromFiles(e.dataTransfer.files)
        }}
      >
        <header className="center-header">
          <div className="title-wrap">
            <h1>{projectPath ? title : 'Claude Code Desktop'}</h1>
          </div>
          <button
            type="button"
            className="icon-btn"
            title={rightOpen ? 'Hide panel' : 'Show panel'}
            onClick={() => setRightOpen((v) => !v)}
          >
            ▤
          </button>
        </header>

        {!projectPath ? (
          <div className="empty">
            <p>Add a repo folder to start coding with Claude.</p>
            <button type="button" className="primary-btn" onClick={() => void openProject()}>
              Add repo
            </button>
          </div>
        ) : (
          <>
            {error ? <div className="error-banner">{error}</div> : null}
            {copyToast ? <div className="toast">Copied</div> : null}
            <ChatTranscript
              items={items}
              streaming={streaming}
              busy={busy}
              activity={activity}
              onCopy={(t) => void copyText(t)}
            />
            <div className="composer-wrap">
              <Composer
                disabled={!!permission}
                attachments={attachments}
                provider={auth.provider}
                model={selectedModel}
                modelCatalog={modelCatalog}
                enabledOptions={enabledModels(modelCatalog, auth.provider)}
                onModelChange={(m) => void changeModel(m)}
                onRemoveAttachment={(p) => setAttachments((prev) => prev.filter((a) => a.path !== p))}
                onAttachFile={() =>
                  void ccd()
                    .filesPick()
                    .then((refs) => setAttachments((prev) => [...prev, ...refs]))
                    .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                }
                onAttachImage={() =>
                  void ccd()
                    .filesPickImages()
                    .then((refs) => setAttachments((prev) => [...prev, ...refs]))
                    .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)))
                }
                onPasteImage={() => void pasteImage()}
                onSend={(t) => void send(t)}
                onStop={() => void ccd().chatStop()}
                busy={busy}
              />
              <p className="disclaimer muted">Claude is AI and can make mistakes. Please double-check responses.</p>
            </div>
          </>
        )}
      </div>

      <RightPanel
        open={rightOpen}
        projectPath={projectPath}
        attachments={attachments}
        toolCount={toolCount}
      />

      {permission?.type === 'permission_request' ? (
        <PermissionModal
          request={permission}
          onDecide={(decision) => {
            const requestId = permission.requestId ?? ''
            void ccd().chatRespondPermission({ requestId, decision })
            setPermission(null)
          }}
        />
      ) : null}

      {settingsOpen ? (
        <SettingsPanel
          fontSize={fontSize}
          onFontSizeChange={(size) => void changeFontSize(size)}
          auth={auth}
          modelCatalog={modelCatalog}
          onModelCatalogChange={async (catalog) => {
            await changeModelCatalog(catalog)
          }}
          onSaveClaudeKey={async (apiKey) => {
            const next = await ccd().authSetApiKey(apiKey)
            setAuth(next)
          }}
          onSaveOpenAi={async (payload) => {
            const next = await ccd().authSetOpenAi(payload)
            setAuth(next)
          }}
          onSwitchProvider={async (provider) => {
            const next = await ccd().authSetProvider(provider)
            setAuth(next)
          }}
          onClearClaudeKey={async () => {
            const next = await ccd().authClearApiKey()
            setAuth(next)
          }}
          onClearOpenAiKey={async () => {
            const next = await ccd().authClearOpenAi()
            setAuth(next)
          }}
          onClose={() => setSettingsOpen(false)}
        />
      ) : null}
    </div>
  )
}

function formatToolStep(
  toolName?: string,
  toolInput?: unknown,
): { label: string; detail?: string } {
  const name = toolName || 'tool'
  const input =
    toolInput && typeof toolInput === 'object'
      ? (toolInput as Record<string, unknown>)
      : typeof toolInput === 'string'
        ? (() => {
            try {
              return JSON.parse(toolInput) as Record<string, unknown>
            } catch {
              return { raw: toolInput }
            }
          })()
        : {}

  if (name === 'read_file' || name === 'Read') {
    return { label: 'Reading file', detail: String(input.path ?? input.file_path ?? '') }
  }
  if (name === 'list_dir' || name === 'LS' || name === 'Glob') {
    return {
      label: 'Listing files',
      detail: String(input.path ?? input.target_directory ?? input.pattern ?? '.'),
    }
  }
  if (name === 'grep' || name === 'Grep') {
    return {
      label: 'Searching',
      detail: String(input.pattern ?? input.query ?? ''),
    }
  }
  if (name === 'Edit' || name === 'Write' || name === 'write_file') {
    return { label: 'Editing', detail: String(input.path ?? input.file_path ?? name) }
  }
  if (name === 'Bash' || name === 'bash') {
    const cmd = String(input.command ?? '')
    return { label: 'Running command', detail: cmd.slice(0, 80) }
  }

  const detail = Object.values(input)
    .filter((v) => typeof v === 'string')
    .map(String)
    .join(' ')
    .slice(0, 80)
  return { label: name, detail: detail || undefined }
}
