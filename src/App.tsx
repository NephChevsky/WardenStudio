import { useEffect, useRef, useLayoutEffect } from 'react'
import './App.css'
import { TwitchChatService } from './services/TwitchChatService'
import { TwitchOAuthService } from './services/TwitchOAuthService'
import { getEmoteUrl } from './utils/emoteParser'
import { migrateToSecureStorage } from './utils/storageMigration'
import { useAuthStore } from './store/authStore'
import { useChatStore } from './store/chatStore'

function App() {
  // Zustand stores
  const { 
    isAuthenticated, 
    isLoading, 
    authenticatedUser, 
    error,
    setAuthenticated, 
    setLoading, 
    setError,
    logout: storeLogout 
  } = useAuthStore();

  const {
    messages,
    messageInput,
    isConnected,
    readMessageIds,
    shouldScrollToBottom,
    addMessage,
    setMessageInput,
    setConnected,
    markAsRead,
    markAllAsRead,
    setShouldScrollToBottom,
    loadFromLocalStorage,
    clearMessages,
  } = useChatStore();

  // Refs
  const chatServiceRef = useRef<TwitchChatService>(new TwitchChatService())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const oauthServiceRef = useRef<TwitchOAuthService>(
    new TwitchOAuthService(
      import.meta.env.VITE_TWITCH_CLIENT_ID || ''
    )
  )

  useEffect(() => {
    // Migrate localStorage to secure storage
    migrateToSecureStorage();

    // Load saved chat data
    loadFromLocalStorage();

    // Check if user is already authenticated and validate token
    const validateAuth = async () => {
      if (oauthServiceRef.current.hasToken()) {
        const user = await oauthServiceRef.current.validateToken();
        if (user) {
          setAuthenticated({ name: user.name, id: user.id, displayName: user.displayName });
        } else {
          // Token is invalid, clear it
          setAuthenticated(null);
        }
      }
      setLoading(false);
    };
    
    validateAuth();

    // Listen for OAuth callback from Electron
    const handleOAuthCallback = async (_event: any, urlString: string) => {
      console.log('OAuth callback received:', urlString);
      try {
        const token = oauthServiceRef.current.parseTokenFromUrl(urlString);
        console.log('Token parsed:', token ? 'yes' : 'no');
        
        if (token) {
          oauthServiceRef.current.saveToken(token);
          console.log('Token saved, validating...');
          await validateAuth();
        } else {
          console.error('No token found in URL:', urlString);
        }
      } catch (err) {
        console.error('Error handling OAuth callback:', err);
      }
    };

    // Check if window.ipcRenderer exists (Electron environment)
    if (window.ipcRenderer) {
      window.ipcRenderer.on('oauth-callback', handleOAuthCallback);
    }

    // Cleanup
    return () => {
      if (window.ipcRenderer) {
        window.ipcRenderer.off('oauth-callback', handleOAuthCallback);
      }
    };
  }, [loadFromLocalStorage, setAuthenticated, setLoading])

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
  }, [shouldScrollToBottom, setShouldScrollToBottom])

  useEffect(() => {
    // Scroll to bottom when authenticated and messages exist
    if (isAuthenticated && messages.length > 0 && chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }, [isAuthenticated, messages.length])

  useEffect(() => {
    if (!isAuthenticated || !authenticatedUser) return

    const service = chatServiceRef.current
    
    // Only register the message handler once
    service.onMessage((message) => {
      addMessage(message);
    })

    // Auto-connect using OAuth token to the authenticated user's channel
    const channel = authenticatedUser.name
    const accessToken = oauthServiceRef.current.getToken()
    const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID

    if (channel && accessToken && clientId) {
      service.connect(channel, accessToken, clientId)
        .then(() => setConnected(true))
        .catch((err) => {
          console.error('Failed to connect:', err)
          setError('Failed to connect to Twitch chat. Try logging in again.')
          oauthServiceRef.current.clearToken()
          setAuthenticated(null)
        })
    }

    return () => {
      service.disconnect()
    }
  }, [isAuthenticated, authenticatedUser, addMessage, setConnected, setError, setAuthenticated])

  const handleLogin = () => {
    oauthServiceRef.current.openAuthWindow()
  }

  const handleLogout = () => {
    oauthServiceRef.current.clearToken()
    chatServiceRef.current.disconnect()
    storeLogout()
    setConnected(false)
    clearMessages()
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
          {isConnected && authenticatedUser && (
            <span className="channel-name">#{authenticatedUser.name}</span>
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
              className={`chat-line ${readMessageIds.has(msg.id) ? 'read' : ''} ${msg.isFirstMessage ? 'first-time-chatter' : ''} ${msg.isReturningChatter ? 'returning-chatter' : ''} ${msg.isHighlighted ? 'highlighted-message' : ''}`}
              onClick={() => markAsRead(msg.id)}
              style={{ cursor: 'pointer' }}
            >
              {msg.isFirstMessage && (
                <div className="first-time-badge">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM8.5 7.5a1.5 1.5 0 113 0 1.5 1.5 0 01-3 0zM14 14H6v-1.5c0-1.25 2-2.5 4-2.5s4 1.25 4 2.5V14z"/>
                  </svg>
                  <span>First time chatter</span>
                </div>
              )}
              {msg.isReturningChatter && (
                <div className="returning-chatter-badge">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2a8 8 0 100 16 8 8 0 000-16zm0 3a2 2 0 110 4 2 2 0 010-4zm3 10H7v-1.5c0-1 2-2 3-2s3 1 3 2V15z"/>
                  </svg>
                  <span>Returning chatter</span>
                </div>
              )}
              {msg.isHighlighted && (
                <div className="highlighted-indicator">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M10 2l2.5 5.5L18 8.5l-4.5 4 1 6-4.5-2.5L5 18.5l1-6L1.5 8.5l5.5-1z"/>
                  </svg>
                  <span>Highlighted Message</span>
                </div>
              )}
              {msg.isReply && msg.replyParentDisplayName && (
                <div className="reply-thread">
                  <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M8 12l-4-4 4-4v2.5c5 0 8.5 1.5 11 5-1.5-4.5-5-6.5-11-6.5V8z"/>
                  </svg>
                  <span>Replying to @{msg.replyParentDisplayName}</span>
                </div>
              )}
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
              {msg.isCheer && msg.bits && (
                <span className="cheer-amount">
                  <svg width="16" height="16" viewBox="0 0 20 20" fill="currentColor">
                    <path d="M3 12l7-10 7 10h-5v6H8v-6H3z"/>
                  </svg>
                  {msg.bits}
                </span>
              )}
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
            onClick={markAllAsRead} 
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
            Send
          </button>
        </form>
      </div>
    </div>
  )
}

export default App
