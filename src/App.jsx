import { useState, useRef, useEffect } from 'react'
import './App.css'

// Preset questions grounded in Pratham's indexed knowledge base
const SAMPLE_QUESTIONS = [
  {
    topic: 'Flagship RAG',
    text: 'How does DevProfile AI RAG pipeline and Qdrant vector search work?',
  },
  {
    topic: 'API Reverse Eng',
    text: 'How did you build the EatClub queue bypass and Twilio alert system?',
  },
  {
    topic: 'Fleet Systems',
    text: 'Tell me about the browser-based Vehicle Tracker capstone project.',
  },
  {
    topic: 'Autonomous AI',
    text: 'How does the multi-model GitHub and Google Chat agent work?',
  },
  {
    topic: 'IoT & Mobile',
    text: 'How does BeaconBLE control smart lighting offline without cloud delay?',
  },
  {
    topic: 'Enterprise OMS',
    text: 'What Apache NiFi and HotWax OMS integration pipelines did you build?',
  },
  {
    topic: 'Security & VAPT',
    text: 'How did you fix Server-Side Template Injection (SSTI) and VAPT vulnerabilities in Apache OFBiz?',
  },
  {
    topic: 'Education & Stack',
    text: 'Summarize your education, C-DAC PG-DAC credentials, and core tech stack.',
  },
]

// Keywords extracted directly from CV & verified production logs
const CV_KEYWORDS = [
  'Apache NiFi',
  'Qdrant Vector DB',
  'FreeMarker SSTI',
  'VAPT Fixes',
  'Shopify Integration',
  'Spring Boot',
  'AWS SQS',
  'LangChain & Agents',
  'Apache Moqui & OFBiz',
  'Grafana & JWT Telemetry',
  'PredictSpring POS',
  'FastAPI & Python',
  'RAG Pipeline',
  'PG-DAC',
  'Coding Ninjas Rank 1',
]

// Universal template to turn one keyword at a time into a grounded question
const generateKeywordQuestion = (keyword) =>
  `What is Pratham's hands-on experience and work with ${keyword}?`

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

// Reads VITE_API_BASE_URL from .env, defaulting to http://localhost:8080 in local development
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || 'http://localhost:8080').replace(/\/+$/, '')
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
  const [selectedKeyword, setSelectedKeyword] = useState(null)
  const [showAboutModal, setShowAboutModal] = useState(false)
  const messagesEndRef = useRef(null)
  const textareaRef = useRef(null)

  const handleKeywordSelect = (keyword) => {
    if (isLoading) return
    setSelectedKeyword(keyword)
    const prompt = generateKeywordQuestion(keyword)
    setInput(prompt)
    if (textareaRef.current) {
      textareaRef.current.focus()
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 120)}px`
    }
  }

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
    setSelectedKeyword(null)
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
            <span className="brand-subtitle">Grounded Knowledge Assistant • Pratham Kumar Taheem</span>
          </div>
        </div>

        <div className="header-right">
          <a
            href="https://github.com/pratham5816"
            target="_blank"
            rel="noopener noreferrer"
            className="header-social-btn"
            title="GitHub (pratham5816)"
            aria-label="GitHub Profile"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            <span className="header-social-label">GitHub</span>
          </a>

          <a
            href="https://linkedin.com/in/pratham-kumar-taheem"
            target="_blank"
            rel="noopener noreferrer"
            className="header-social-btn"
            title="LinkedIn (pratham-kumar-taheem)"
            aria-label="LinkedIn Profile"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
            </svg>
            <span className="header-social-label">LinkedIn</span>
          </a>

          <button
            className="about-header-btn"
            onClick={() => setShowAboutModal(true)}
            title="About this project"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10"></circle>
              <line x1="12" y1="16" x2="12" y2="12"></line>
              <line x1="12" y1="8" x2="12.01" y2="8"></line>
            </svg>
            <span>About</span>
          </button>

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
            <h1 className="empty-title">Pratham Kumar Taheem</h1>

            {/* About This Project Card */}
            <div className="about-project-card">
              <div className="about-card-header">
                <span className="about-card-badge">About this project</span>
                <span className="about-author-name">Pratham Kumar Taheem</span>
              </div>
              <p className="about-card-text">
                DevProfile AI is a conversational portfolio assistant. Instead of reading a static resume, you can ask questions about my experience, projects, skills and education, and get answers grounded in my own documented work. It was also built to explore how Retrieval-Augmented Generation (RAG) works end to end.
              </p>
              <div className="about-card-links">
                <a
                  href="https://github.com/pratham5816/DevProfile-AI-Powered-Portfolio"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="about-link-pill"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <span>github.com/pratham5816</span>
                </a>
                <a
                  href="https://www.linkedin.com/in/pratham-kumar-taheem-530a18280"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="about-link-pill"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  <span>linkedin.com/in/pratham-kumar-taheem</span>
                </a>
              </div>
            </div>

            <div className="empty-rag-badge">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <ellipse cx="12" cy="5" rx="9" ry="3"></ellipse>
                <path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"></path>
                <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"></path>
              </svg>
              <span>Indexed with Qdrant Cloud & Cohere Command R+</span>
            </div>

            {/* Keyword Explorer */}
            <div className="keywords-section">
              <div className="section-label-row">
                <span className="section-label">⚡ Explore by CV Keywords</span>
                <span className="section-hint">Click a keyword to generate a grounded question</span>
              </div>
              <div className="keywords-cloud">
                {CV_KEYWORDS.map((kw, idx) => (
                  <button
                    key={idx}
                    className={`keyword-chip ${selectedKeyword === kw ? 'active' : ''}`}
                    onClick={() => handleKeywordSelect(kw)}
                    disabled={isLoading}
                    title={`Generate question for ${kw}`}
                  >
                    <span className="keyword-chip-hash">#</span>
                    <span className="keyword-chip-text">{kw}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="preset-section-divider">
              <span className="preset-divider-text">Or choose a pre-asked question</span>
            </div>

            <div className="suggestions-grid">
              {SAMPLE_QUESTIONS.map((q, idx) => (
                <button
                  key={idx}
                  className="suggestion-card"
                  onClick={() => handleSend(q.text)}
                  disabled={isLoading}
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
        {messages.length > 0 && (
          <div className="input-keywords-bar">
            <span className="input-keywords-label">Keywords:</span>
            <div className="input-keywords-scroll">
              {CV_KEYWORDS.map((kw, idx) => (
                <button
                  key={idx}
                  className={`mini-keyword-chip ${selectedKeyword === kw ? 'active' : ''}`}
                  onClick={() => handleKeywordSelect(kw)}
                  disabled={isLoading}
                  title={`Generate question for ${kw}`}
                >
                  #{kw}
                </button>
              ))}
            </div>
          </div>
        )}

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
          <div className="footer-links">
            <a
              href="https://github.com/pratham5816"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
              title="Pratham's GitHub"
            >
              GitHub
            </a>
            <span className="footer-link-divider">•</span>
            <a
              href="https://linkedin.com/in/pratham-kumar-taheem"
              target="_blank"
              rel="noopener noreferrer"
              className="footer-link"
              title="Pratham's LinkedIn"
            >
              LinkedIn
            </a>
          </div>
        </div>
      </footer>

      {/* About Project Modal */}
      {showAboutModal && (
        <div className="modal-backdrop" onClick={() => setShowAboutModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title-group">
                <div className="brand-icon modal-icon">
                  <span>DP</span>
                </div>
                <div>
                  <h3 className="modal-title">About this project</h3>
                  <span className="modal-author">Pratham Kumar Taheem • AI & Backend Engineer</span>
                </div>
              </div>
              <button
                className="icon-btn modal-close-btn"
                onClick={() => setShowAboutModal(false)}
                aria-label="Close modal"
              >
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"></line>
                  <line x1="6" y1="6" x2="18" y2="18"></line>
                </svg>
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-description">
                DevProfile AI is a conversational portfolio assistant. Instead of reading a static resume, you can ask questions about my experience, projects, skills and education, and get answers grounded in my own documented work. It was also built to explore how Retrieval-Augmented Generation (RAG) works end to end.
              </p>

              <div className="modal-tech-stack">
                <span className="modal-stack-title">Core Architecture:</span>
                <div className="modal-stack-tags">
                  <span className="modal-tag">Java 21</span>
                  <span className="modal-tag">Spring Boot 3</span>
                  <span className="modal-tag">Qdrant Cloud (Vector DB)</span>
                  <span className="modal-tag">Cohere Command R+</span>
                  <span className="modal-tag">React 19 & Vite</span>
                  <span className="modal-tag">Docker</span>
                </div>
              </div>

              <div className="modal-links-row">
                <a
                  href="https://github.com/pratham5816"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modal-social-btn"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
                  </svg>
                  <span>github.com/pratham5816</span>
                </a>
                <a
                  href="https://linkedin.com/in/pratham-kumar-taheem"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="modal-social-btn"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M19 0h-14c-2.761 0-5 2.239-5 5v14c0 2.761 2.239 5 5 5h14c2.762 0 5-2.239 5-5v-14c0-2.761-2.238-5-5-5zm-11 19h-3v-11h3v11zm-1.5-12.268c-.966 0-1.75-.79-1.75-1.764s.784-1.764 1.75-1.764 1.75.79 1.75 1.764-.783 1.764-1.75 1.764zm13.5 12.268h-3v-5.604c0-3.368-4-3.113-4 0v5.604h-3v-11h3v1.765c1.396-2.586 7-2.777 7 2.476v6.759z"/>
                  </svg>
                  <span>linkedin.com/in/pratham-kumar-taheem</span>
                </a>
              </div>
            </div>

            <div className="modal-footer">
              <span className="modal-footer-note">Candidate-first grounding & anti-hallucination guardrails.</span>
              <button className="primary-btn" onClick={() => setShowAboutModal(false)}>
                Got it
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
