import { useState, type ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Components } from 'react-markdown'

interface Props {
  text: string
  className?: string
  onCopyCode?: (text: string) => void
}

function extractText(node: ReactNode): string {
  if (node == null || typeof node === 'boolean') return ''
  if (typeof node === 'string' || typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(extractText).join('')
  if (typeof node === 'object' && 'props' in node) {
    return extractText((node as { props?: { children?: ReactNode } }).props?.children)
  }
  return ''
}

function CodeBlock({
  className,
  children,
  onCopyCode,
}: {
  className?: string
  children?: ReactNode
  onCopyCode?: (text: string) => void
}) {
  const [copied, setCopied] = useState(false)
  const code = extractText(children).replace(/\n$/, '')
  const lang = className?.match(/language-([^\s]+)/)?.[1]

  async function copy() {
    if (!code) return
    if (onCopyCode) onCopyCode(code)
    else if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="md-code-wrap">
      <div className="md-code-toolbar">
        <span className="md-code-lang">{lang || 'code'}</span>
        <button type="button" className="md-code-copy" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre className="md-pre">
        <code className={`md-code-block ${className ?? ''}`}>{children}</code>
      </pre>
    </div>
  )
}

export function MarkdownBody({ text, className, onCopyCode }: Props) {
  const components: Components = {
    a: ({ href, children }) => (
      <a href={href} target="_blank" rel="noreferrer noopener">
        {children}
      </a>
    ),
    pre: ({ children }) => <>{children}</>,
    code: ({ className: codeClass, children, ...props }) => {
      const isBlock =
        Boolean(codeClass?.includes('language-')) || String(children).includes('\n')
      if (isBlock) {
        return (
          <CodeBlock className={codeClass} onCopyCode={onCopyCode}>
            {children}
          </CodeBlock>
        )
      }
      return (
        <code className="md-inline-code" {...props}>
          {children}
        </code>
      )
    },
  }

  return (
    <div className={`md-body ${className ?? ''}`.trim()}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {text}
      </ReactMarkdown>
    </div>
  )
}
