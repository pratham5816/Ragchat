import { useState, useRef, useEffect } from 'react'
import './App.css'

// Preset questions grounded in Pratham's indexed knowledge base
const SAMPLE_QUESTIONS = [
  {
    topic: 'Flagship Project',
    text: 'How does DevProfile AI RAG pipeline work?',
  },
  {
    topic: 'Backend & Stack',
    text: 'What is your core expertise in Java & Spring Boot?',
  },
  {
    topic: 'Distributed Systems',
    text: 'Tell me about the Vehicle Tracker capstone project.',
  },
  {
    topic: 'Background',
    text: 'Summarize your education & CDAC PG-DAC credentials.',
  },
]

// Lightweight, safe markdown formatter for responses
function renderFormattedMessage(content) {
  if (!content) return null

  // Split into paragraphs / lines
  const lines = content.split('\n')
  const elements = []
  let currentList = []
  let codeBlock = []
  let inCodeBlock = false

  const flushList = () => {
    if (currentList.length > 0) {
      elements.push(
        <ul key={`ul-${elements.length}`}>
          {currentList.map((item, idx) => (
            <li key={idx}>{parseInlineFormatting(item)}</li>
          ))}
        </ul>
      )
      currentList = []
    }
  }

  const flushCodeBlock = () => {
    if (codeBlock.length > 0) {
      elements.push(
        <pre key={`code-${elements.length}`}>
          <code>{codeBlock.join('\n')}</code>
        </pre>
      )
      codeBlock = []
      inCodeBlock = false
    }
  }

  lines.forEach((line, index) => {
    // Code fence toggle
    if (line.trim().startsWith('```')) {
      if (inCodeBlock) {
        flushCodeBlock()
      } else {
        flushList()
        inCodeBlock = true
      }
      return
    }

    if (inCodeBlock) {
      codeBlock.push(line)
      return
    }

    const trimmed = line.trim()

    // Bullet point
    if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
      currentList.push(trimmed.slice(2))
      return
    }

    // Numbered list
    if (/^\d+\.\s/.test(trimmed)) {
      currentList.push(trimmed.replace(/^\d+\.\s/, ''))
      return
    }

    flushList()

    if (trimmed === '') {
      return
    }

    elements.push(
      <p key={`p-${index}`}>
        {parseInlineFormatting(line)}
      </p>
    )
  })

  flushList()
  flushCodeBlock()

  return <div className="formatted-content">{elements}</div>
}

function parseInlineFormatting(text) {
  // Simple regex parser for **bold** and `code`
  const parts = []
  let cursor = 0
  const regex = /(\*\*.*?\*\*|`.*?`)/g
  let match

  while ((match = regex.exec(text)) !== null) {
    if (match.index > cursor) {
      parts.push(text.substring(cursor, match.index))
    }
    const token = match[0]
    if (token.startsWith('**') && token.endsWith('**')) {
      parts.push(<strong key={match.index}>{token.slice(2, -2)}</strong>)
    } else if (token.startsWith('`') && token.endsWith('`')) {
      parts.push(<code key={match.index}>{token.slice(1, -1)}</code>)
    }
    cursor = regex.lastIndex
  }

  if (cursor < text.length) {
    parts.push(text.substring(cursor))
  }

  return parts
}

let idCounter = 0
function generateUniqueId(prefix) {
  idCounter += 1
  return `${prefix}-${idCounter}`
}

function getFormattedTime() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

const API_TIMEOUT_SECONDS = 60
const API_TIMEOUT_MS = API_TIMEOUT_SECONDS * 1000

// In production, reads VITE_API_BASE_URL (e.g. https://api.yourdomain.com).
// In local dev, defaults to "" so Vite's proxy forwards requests to http://127.0.0.1:8080.
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const API_KEY = import.meta.env.VITE_API_KEY || ''

// Simple, user-friendly error strings for visitors
function getUserFriendlyError(status) {
  if (status === 429) {
    return 'Daily limit reached. Please try again later.'
  }
  return 'Something went wrong. Please try again later.'
}

function App() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [elapsedSeconds, setElapsedSeconds] = useState(0)
  const [backendNotice, setBackendNotice] = useState(null)
  const [copiedId, setCopiedId] = useState(null)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages, isLoading])

  // Timer while loading to display elapsed time towards the 60s timeout
  useEffect(() => {
    if (!isLoading) return

    const interval = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1)
    }, 1000)

    return () => clearInterval(interval)
  }, [isLoading])

  // Handle textarea auto-resizing
  const handleInputChange = (e) => {
    setInput(e.target.value)
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

  const handleCopy = (id, text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedId(id)
      setTimeout(() => setCopiedId(null), 2000)
    })
  }

  const handleClearChat = () => {
    setMessages([])
    setBackendNotice(null)
  }

  const handleSend = async (customPrompt) => {
    const query = (customPrompt || input).trim()
    if (!query || isLoading) return

    const userMessageId = generateUniqueId('user')
    const botMessageId = generateUniqueId('bot')

    const newMessages = [
      ...messages,
      {
        id: userMessageId,
        role: 'user',
        content: query,
        timestamp: getFormattedTime(),
      },
    ]

    setMessages(newMessages)
    setInput('')
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
    }
    setIsLoading(true)
    setElapsedSeconds(0)

    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort(new DOMException('TIMEOUT', 'AbortError'))
    }, API_TIMEOUT_MS)

    const endpoint = `${API_BASE_URL}/chat/cohere/rag/v1`
    const requestHeaders = {
      'Content-Type': 'application/json',
    }
    if (API_KEY) {
      requestHeaders['X-API-KEY'] = API_KEY
    }

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: requestHeaders,
        body: JSON.stringify({
          messages: [{ role: 'user', content: query }],
          stream: false,
        }),
        signal: controller.signal,
      })

      clearTimeout(timeoutId)

      if (!response.ok) {
        const err = new Error(getUserFriendlyError(response.status))
        err.status = response.status
        throw err
      }

      const rawText = await response.text()
      let cleanAnswer = rawText

      // Check if response is JSON-wrapped
      try {
        const parsed = JSON.parse(rawText)
        if (typeof parsed === 'string') {
          cleanAnswer = parsed
        } else if (parsed.text) {
          cleanAnswer = parsed.text
        } else if (parsed.message?.content?.[0]?.text) {
          cleanAnswer = parsed.message.content[0].text
        }
      } catch {
        // Raw plain text response
      }

      setBackendNotice(null)
      setMessages((prev) => [
        ...prev,
        {
          id: botMessageId,
          role: 'assistant',
          content: cleanAnswer,
          grounded: true,
          timestamp: getFormattedTime(),
        },
      ])
    } catch (err) {
      clearTimeout(timeoutId)
      console.warn('Backend request failed:', err.name, err.message)

      const isTimeout = err.name === 'AbortError' || controller.signal.aborted

      if (isTimeout) {
        const timeoutMsg = 'The request took too long to respond. Please try again later.'
        setBackendNotice({
          type: 'timeout',
          text: timeoutMsg,
        })

        setMessages((prev) => [
          ...prev,
          {
            id: botMessageId,
            role: 'assistant',
            isTimeout: true,
            content: timeoutMsg,
            queryToRetry: query,
            timestamp: getFormattedTime(),
          },
        ])
      } else if (err.status) {
        const friendlyMessage = getUserFriendlyError(err.status)

        setBackendNotice({
          type: 'error',
          status: err.status,
          text: friendlyMessage,
        })

        setMessages((prev) => [
          ...prev,
          {
            id: botMessageId,
            role: 'assistant',
            isError: true,
            errorStatus: err.status,
            content: friendlyMessage,
            queryToRetry: query,
            grounded: false,
            timestamp: getFormattedTime(),
          },
        ])
      } else {
        const friendlyMessage = 'Something went wrong. Please try again later.'
        setBackendNotice({
          type: 'error',
          text: friendlyMessage,
        })

        setMessages((prev) => [
          ...prev,
          {
            id: botMessageId,
            role: 'assistant',
            isError: true,
            content: friendlyMessage,
            queryToRetry: query,
            grounded: false,
            timestamp: getFormattedTime(),
          },
        ])
      }
    } finally {
      clearTimeout(timeoutId)
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="app-container">
      {/* Header */}
      <header className="chat-header">
        <div className="header-left">
          <div className="brand-icon">
            <span>DP</span>
          </div>
          <div className="brand-details">
            <div className="brand-title-row">
              <span className="brand-title">DevProfile AI</span>
              <span className="rag-pill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5" />
                </svg>
                RAG
              </span>
            </div>
            <span className="brand-subtitle">Grounded Knowledge Assistant • Pratham</span>
          </div>
        </div>

        <div className="header-right">
          <div className="status-badge" title="Assistant Status">
            <span className={`status-dot ${backendNotice?.type === 'timeout' || backendNotice?.type === 'error' ? 'timeout' : ''}`}></span>
            <span>
              {backendNotice?.type === 'timeout'
                ? 'Unavailable'
                : backendNotice?.type === 'error'
                ? (backendNotice.status === 429 ? 'Daily Limit' : 'Unavailable')
                : 'Ready'}
            </span>
          </div>

          {messages.length > 0 && (
            <button
              className="icon-btn"
              onClick={handleClearChat}
              title="Clear conversation"
              aria-label="Clear conversation"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="3 6 5 6 21 6"></polyline>
                <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
              </svg>
            </button>
          )}
        </div>
      </header>

      {/* Messages Feed */}
      <main className="messages-container">
        {messages.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon-wrap">
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
              </svg>
            </div>
            <h1 className="empty-title">Pratham's Engineering Knowledge Base</h1>
            <p className="empty-description">
              Ask anything about technical projects, system architecture, Spring Boot microservices, or work history. All answers are strictly grounded in vector-indexed engineering logs.
            </p>

            <div className="empty-rag-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
              <span>Indexed with Qdrant Cloud & Cohere Command R+</span>
            </div>

            <div className="suggestions-grid">
              {SAMPLE_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  className="suggestion-card"
                  onClick={() => handleSend(q.text)}
                >
                  <span className="suggestion-topic">{q.topic}</span>
                  <span className="suggestion-text">{q.text}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((msg) => (
            <div key={msg.id} className={`message-row ${msg.role}`}>
              {msg.role === 'assistant' && (
                <div className="avatar bot-avatar" title="DevProfile RAG">
                  AI
                </div>
              )}

              <div className="message-bubble-wrapper">
                <div className={`message-bubble ${msg.role === 'user' ? 'user-bubble' : 'bot-bubble'} ${msg.isTimeout ? 'timeout-bubble' : ''} ${msg.isError ? 'error-bubble' : ''}`}>
                  {msg.role === 'assistant' && msg.isTimeout && (
                    <div className="rag-grounding-tag timeout-tag">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <polyline points="12 6 12 12 16 14"></polyline>
                      </svg>
                      <span>Timeout</span>
                    </div>
                  )}

                  {msg.role === 'assistant' && msg.isError && (
                    <div className="rag-grounding-tag error-tag">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10"></circle>
                        <line x1="12" y1="8" x2="12" y2="12"></line>
                        <line x1="12" y1="16" x2="12.01" y2="16"></line>
                      </svg>
                      <span>{msg.errorStatus === 429 ? 'Daily Limit' : 'Notice'}</span>
                    </div>
                  )}

                  {msg.role === 'assistant' && !msg.isTimeout && !msg.isError && (
                    <div className="rag-grounding-tag">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12"></polyline>
                      </svg>
                      <span>Retrieved & Grounded</span>
                    </div>
                  )}

                  {msg.role === 'assistant' ? (
                    renderFormattedMessage(msg.content)
                  ) : (
                    msg.content
                  )}

                  {(msg.isTimeout || msg.isError) && msg.queryToRetry && (
                    <div>
                      <button
                        className="retry-btn"
                        onClick={() => handleSend(msg.queryToRetry)}
                        disabled={isLoading}
                        title="Retry this query"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="23 4 23 10 17 10"></polyline>
                          <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                        </svg>
                        <span>Retry Request</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="message-meta">
                  <span>{msg.timestamp}</span>
                  {msg.role === 'assistant' && (
                    <button
                      className="copy-btn"
                      onClick={() => handleCopy(msg.id, msg.content)}
                      title="Copy response"
                    >
                      {copiedId === msg.id ? (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12"></polyline>
                          </svg>
                          <span>Copied</span>
                        </>
                      ) : (
                        <>
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
                          </svg>
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  )}
                </div>
              </div>

              {msg.role === 'user' && (
                <div className="avatar user-avatar" title="You">
                  You
                </div>
              )}
            </div>
          ))
        )}

        {/* Loading Indicator */}
        {isLoading && (
          <div className="message-row assistant">
            <div className="avatar bot-avatar">AI</div>
            <div className="typing-bubble">
              <div className="typing-dots">
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
                <span className="typing-dot"></span>
              </div>
              <div className="typing-text">
                <span>Retrieving vector embeddings & synthesizing answer...</span>
                <span className={`timer-badge ${elapsedSeconds >= 45 ? 'warning' : ''}`}>
                  ⏱️ {elapsedSeconds}s / 60s
                </span>
              </div>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </main>

      {/* Backend Notification Banner if needed */}
      {backendNotice && (
        <div className={`notice-banner ${backendNotice?.type === 'timeout' ? 'error' : ''}`}>
          <span>{typeof backendNotice === 'string' ? backendNotice : backendNotice.text}</span>
          <button
            className="notice-action-btn"
            onClick={() => setBackendNotice(null)}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Input Area */}
      <footer className="chat-input-area">
        <div className="input-box-wrapper">
          <textarea
            ref={textareaRef}
            className="chat-textarea"
            placeholder="Ask anything about projects, tech stack, architecture..."
            rows={1}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={isLoading}
          />
          <button
            className="send-btn"
            onClick={() => handleSend()}
            disabled={!input.trim() || isLoading}
            aria-label="Send message"
            title="Send (Enter)"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13"></line>
              <polygon points="22 2 15 22 11 13 2 9 22 2"></polygon>
            </svg>
          </button>
        </div>

        <div className="input-footer-info">
          <span className="rag-footnote">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            Grounded RAG: Responses strictly backed by indexed portfolio logs
          </span>
          <span className="kbd-shortcut">
            Press <strong>Enter</strong> to send, <strong>Shift + Enter</strong> for newline
          </span>
        </div>
      </footer>
    </div>
  )
}

export default App
