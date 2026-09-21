import type { ChatProvider } from './types'

export interface ModelOption {
  id: string
  label: string
}

/** Claude Code CLI --model aliases / common IDs */
export const CLAUDE_MODEL_OPTIONS: ModelOption[] = [
  { id: '', label: 'Default' },
  { id: 'sonnet', label: 'Sonnet' },
  { id: 'opus', label: 'Opus' },
  { id: 'haiku', label: 'Haiku' },
]

/** Common OpenAI-compatible chat models */
export const OPENAI_MODEL_OPTIONS: ModelOption[] = [
  { id: 'gpt-4o-mini', label: 'gpt-4o-mini' },
  { id: 'gpt-4o', label: 'gpt-4o' },
  { id: 'gpt-4.1-mini', label: 'gpt-4.1-mini' },
  { id: 'gpt-4.1', label: 'gpt-4.1' },
  { id: 'o4-mini', label: 'o4-mini' },
  { id: 'o3-mini', label: 'o3-mini' },
]

export const CUSTOM_MODEL_ID = '__custom__'

export function modelsForProvider(provider: ChatProvider): ModelOption[] {
  return provider === 'openai' ? OPENAI_MODEL_OPTIONS : CLAUDE_MODEL_OPTIONS
}

export function displayModelLabel(provider: ChatProvider, model: string | undefined): string {
  if (provider === 'openai') {
    const id = model?.trim() || 'gpt-4o-mini'
    return OPENAI_MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id
  }
  const id = model?.trim() ?? ''
  if (!id) return 'Claude'
  return CLAUDE_MODEL_OPTIONS.find((m) => m.id === id)?.label ?? id
}
