import { useState, useEffect, useRef, useLayoutEffect } from 'react'
import './App.css'
import { TwitchChatService } from './services/TwitchChatService'
import type { ChatMessage } from './services/TwitchChatService'
import { TwitchOAuthService } from './services/TwitchOAuthService'
import { getEmoteUrl } from './utils/emoteParser'

function App() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [messageInput, setMessageInput] = useState('')
  const [isConnected, setIsConnected] = useState(false)
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [readMessageIds, setReadMessageIds] = useState<Set<string>>(new Set())
  const [shouldScrollToBottom, setShouldScrollToBottom] = useState(false)
  const chatServiceRef = useRef<TwitchChatService>(new TwitchChatService())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const oauthServiceRef = useRef<TwitchOAuthService>(
    new TwitchOAuthService(
      import.meta.env.VITE_TWITCH_CLIENT_ID || '',
      window.location.origin + '/callback'
    )
  )

  useEffect(() => {
    // Check if user is already authenticated and validate token
    const validateAuth = async () => {
      if (oauthServiceRef.current.hasToken()) {
        const user = await oauthServiceRef.current.validateToken();
        if (user) {
          setIsAuthenticated(true);
        } else {
          // Token is invalid, clear it
          setIsAuthenticated(false);
        }
      }
      setIsLoading(false);
    };
    
    validateAuth();

    // Load saved messages from localStorage
    const savedMessages = localStorage.getItem('chatMessages')
    if (savedMessages) {
      try {
        const parsed = JSON.parse(savedMessages)
        // Convert timestamp strings back to Date objects and ensure badges array exists
        const messagesWithDates = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          badges: msg.badges || [],
          isMod: msg.isMod || false,
          isSubscriber: msg.isSubscriber || false,
          isVip: msg.isVip || false,
          isBroadcaster: msg.isBroadcaster || false,
        }))
        setMessages(messagesWithDates)
        setShouldScrollToBottom(true)
      } catch (err) {
        console.error('Failed to load saved messages:', err)
      }
    }

    // Load saved read message IDs from localStorage
    const savedReadIds = localStorage.getItem('readMessageIds')
    if (savedReadIds) {
      try {
        const parsed = JSON.parse(savedReadIds)
        setReadMessageIds(new Set(parsed))
      } catch (err) {
        console.error('Failed to load read message IDs:', err)
      }
    }
  }, [])

  useLayoutEffect(() => {
    // Scroll to bottom when messages change (for new messages)
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [messages])

  useEffect(() => {
    // Force scroll to bottom on initial load
    if (shouldScrollToBottom && chatMessagesRef.current) {
      setTimeout(() => {
        if (chatMessagesRef.current) {
          chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
        }
        setShouldScrollToBottom(false)
      }, 100)
    }
  }, [shouldScrollToBottom])

  useEffect(() => {
    // Save messages to localStorage (keep last 500 messages)
    if (messages.length > 0) {
      const messagesToSave = messages.slice(-500)
      localStorage.setItem('chatMessages', JSON.stringify(messagesToSave))
    }
  }, [messages])

  useEffect(() => {
    // Save read message IDs to localStorage
    if (readMessageIds.size > 0) {
      localStorage.setItem('readMessageIds', JSON.stringify(Array.from(readMessageIds)))
    }
  }, [readMessageIds])

  useEffect(() => {
    // Scroll to bottom when authenticated and messages exist
    if (isAuthenticated && messages.length > 0 && chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return

    const service = chatServiceRef.current
    
    service.onMessage((message) => {
      setMessages((prev) => [...prev, message])
    })

    // Auto-connect using OAuth token
    const channel = import.meta.env.VITE_TWITCH_CHANNEL
    const accessToken = oauthServiceRef.current.getToken()
    const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID

    if (channel && accessToken && clientId) {
      service.connect(channel, accessToken, clientId)
        .then(() => setIsConnected(true))
        .catch((err) => {
          console.error('Failed to connect:', err)
          setError('Failed to connect to Twitch chat. Try logging in again.')
          oauthServiceRef.current.clearToken()
          setIsAuthenticated(false)
        })
    } else {
      setError('Missing Twitch channel in .env file')
    }

    return () => {
      service.disconnect()
    }
  }, [isAuthenticated])

  const handleLogin = () => {
    const authUrl = oauthServiceRef.current.getAuthUrl()
    window.location.href = authUrl
  }

  const handleLogout = () => {
    oauthServiceRef.current.clearToken()
    chatServiceRef.current.disconnect()
    setIsAuthenticated(false)
    setIsConnected(false)
    setMessages([])
    setReadMessageIds(new Set())
    setError(null)
    localStorage.removeItem('chatMessages')
    localStorage.removeItem('readMessageIds')
  }

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!messageInput.trim() || !isConnected) return

    try {
      await chatServiceRef.current.sendMessage(messageInput)
      setMessageInput('')
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const handleMarkAsRead = (messageId: string) => {
    const messageIndex = messages.findIndex(msg => msg.id === messageId)
    if (messageIndex === -1) return

    const newReadIds = new Set(readMessageIds)
    // Mark this message and all messages before it as read
    for (let i = 0; i <= messageIndex; i++) {
      newReadIds.add(messages[i].id)
    }
    setReadMessageIds(newReadIds)
  }

  const handleMarkAllAsRead = () => {
    const newReadIds = new Set(messages.map(msg => msg.id))
    setReadMessageIds(newReadIds)
  }

  const handleScrollToBottom = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }

  if (isLoading || !isAuthenticated) {
    return (
      <div className="app">
        <div className="login-container">
          <h1>Warden Studio</h1>
          {isLoading ? (
            <p>Loading...</p>
          ) : (
            <button onClick={handleLogin} className="login-button">
              Login with Twitch
            </button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="chat-container">
      <div className="chat-header">
        <div className="channel-info">
          <span className="stream-chat-label">STREAM CHAT</span>
          {isConnected && (
            <span className="channel-name">#{import.meta.env.VITE_TWITCH_CHANNEL}</span>
          )}
        </div>
        <button onClick={handleLogout} className="logout-button">Logout</button>
      </div>
      
      {error && <div className="error">{error}</div>}

      <div className="chat-messages" ref={chatMessagesRef}>
        <div className="messages-list">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`chat-line ${readMessageIds.has(msg.id) ? 'read' : ''}`}
              onClick={() => handleMarkAsRead(msg.id)}
              style={{ cursor: 'pointer' }}
            >
              <span className="chat-timestamp">
                {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
              <span className="chat-badges">
                {msg.badges.map((badge, index) => (
                  <img
                    key={index}
                    src={badge.imageUrl}
                    alt={badge.title}
                    title={badge.title}
                    className="chat-badge"
                  />
                ))}
              </span>
              <span className="chat-username" style={{ color: msg.color || '#9147ff' }}>
                {msg.displayName}
              </span>
              <span className="chat-colon">:</span>
              <span className="chat-message">
                {msg.messageParts.map((part, index) => {
                  if (part.type === 'emote' && part.emoteId) {
                    return (
                      <img
                        key={index}
                        src={getEmoteUrl(part.emoteId, '2.0')}
                        alt={part.content}
                        title={part.content}
                        className="chat-emote"
                      />
                    );
                  }
                  return <span key={index}>{part.content}</span>;
                })}
              </span>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-input-container">
        <div className="chat-actions">
          <button 
            onClick={handleMarkAllAsRead} 
            className="mark-all-read-button"
            disabled={messages.length === 0 || readMessageIds.size === messages.length}
          >
            Mark All as Read
          </button>
          <button 
            onClick={handleScrollToBottom} 
            className="scroll-to-bottom-button"
            disabled={messages.length === 0}
          >
            Scroll to Bottom
          </button>
        </div>
        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input
            type="text"
            className="chat-input"
            placeholder={isConnected ? `Send a message` : 'Connecting...'}
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            disabled={!isConnected}
          />
          <button type="submit" className="chat-send-button" disabled={!isConnected || !messageInput.trim()}>
            Chat
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
