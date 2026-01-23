import { useEffect, useRef, useLayoutEffect, useState } from 'react'
import './App.css'
import { TwitchChatService } from './services/TwitchChatService'
import { TwitchOAuthService } from './services/TwitchOAuthService'
import { getEmoteUrl } from './utils/emoteParser'
import { useAuthStore } from './store/authStore'
import { useChatStore } from './store/chatStore'
import { useSettingsStore } from './store/settingsStore'
import { UpdateNotification } from './components/UpdateNotification'
import { Settings } from './components/Settings'
import { UserCard } from './components/UserCard'

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
    deleteMessage,
    setShouldScrollToBottom,
    loadFromLocalStorage,
    clearMessages,
  } = useChatStore();

  const {
    fontSize,
    readMessageColor,
    loadSettings,
  } = useSettingsStore();

  // Convert hex color to rgba with 0.8 alpha
  const getReadMessageColorWithAlpha = () => {
    if (readMessageColor.startsWith('#')) {
      const hex = readMessageColor.replace('#', '')
      const r = parseInt(hex.substring(0, 2), 16)
      const g = parseInt(hex.substring(2, 4), 16)
      const b = parseInt(hex.substring(4, 6), 16)
      return `rgba(${r}, ${g}, ${b}, 0.8)`
    }
    return readMessageColor
  }

  // State
  const [isSettingsOpen, setIsSettingsOpen] = useState(false)
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState<string[]>([])
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState(0)
  const [showAutocomplete, setShowAutocomplete] = useState(false)
  const [chatters, setChatters] = useState<string[]>([])
  const [selectedUser, setSelectedUser] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string; username: string; userId: string } | null>(null)

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
    // Load saved chat data
    loadFromLocalStorage();
    // Load user settings
    loadSettings();

    // Check if user is already authenticated and validate token
    const validateAuth = async () => {
      if (await oauthServiceRef.current.hasToken()) {
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
        const token = await oauthServiceRef.current.parseTokenFromUrl(urlString);
        console.log('Token parsed:', token ? 'yes' : 'no');
        
        if (token) {
          await oauthServiceRef.current.saveToken(token);
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
  }, [loadFromLocalStorage, setAuthenticated, setLoading, loadSettings])

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
    });

    // Auto-connect using OAuth token to the authenticated user's channel
    (async () => {
      const channel = authenticatedUser.name
      const accessToken = await oauthServiceRef.current.getToken()
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID

      if (channel && accessToken && clientId) {
        service.connect(channel, accessToken, clientId)
          .then(() => setConnected(true))
          .catch(async (err) => {
            console.error('Failed to connect:', err)
            setError('Failed to connect to Twitch chat. Try logging in again.')
            await oauthServiceRef.current.clearToken()
            setAuthenticated(null)
          })
      }
    })()

    return () => {
      service.disconnect()
    }
  }, [isAuthenticated, authenticatedUser, addMessage, setConnected, setError, setAuthenticated])

  // Fetch chatters list every minute
  useEffect(() => {
    if (!isConnected) return

    const fetchChatters = async () => {
      const chattersData = await chatServiceRef.current.getChatters()
      setChatters(chattersData)
    }

    // Fetch immediately
    fetchChatters()

    // Set up interval to fetch every minute
    const intervalId = setInterval(fetchChatters, 60000)

    return () => {
      clearInterval(intervalId)
    }
  }, [isConnected])

  const handleLogin = () => {
    oauthServiceRef.current.openAuthWindow()
  }

  const handleLogout = async () => {
    await oauthServiceRef.current.clearToken()
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
      const messageToSend = messageInput
      setMessageInput('')
      await chatServiceRef.current.sendMessage(messageToSend)
    } catch (err) {
      console.error('Failed to send message:', err)
    }
  }

  const handleScrollToBottom = () => {
    if (chatMessagesRef.current) {
      chatMessagesRef.current.scrollTop = chatMessagesRef.current.scrollHeight
    }
  }

  const getUniqueUsernames = (): string[] => {
    const usernamesSet = new Set<string>()
    
    // Add usernames from messages
    messages.forEach(msg => {
      usernamesSet.add(msg.displayName)
    })
    
    // Add chatters from API
    chatters.forEach(chatter => {
      usernamesSet.add(chatter)
    })
    
    return Array.from(usernamesSet).sort()
  }

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && showAutocomplete && autocompleteSuggestions.length > 0) {
      e.preventDefault()
      // Complete with selected suggestion
      const selectedUsername = autocompleteSuggestions[selectedSuggestionIndex]
      const words = messageInput.split(' ')
      words[words.length - 1] = selectedUsername
      
      setMessageInput(words.join(' ') + ' ')
      setShowAutocomplete(false)
      setAutocompleteSuggestions([])
    } else if (e.key === 'Tab') {
      e.preventDefault()
      
      if (showAutocomplete && autocompleteSuggestions.length > 0) {
        // Complete with selected suggestion
        const selectedUsername = autocompleteSuggestions[selectedSuggestionIndex]
        const words = messageInput.split(' ')
        words[words.length - 1] = selectedUsername
        
        setMessageInput(words.join(' ') + ' ')
        setShowAutocomplete(false)
        setAutocompleteSuggestions([])
      } else {
        // Trigger autocomplete
        const words = messageInput.split(' ')
        const lastWord = words[words.length - 1]
        
        if (lastWord.length > 0) {
          const usernames = getUniqueUsernames()
          const searchTerm = lastWord.startsWith('@') ? lastWord.slice(1) : lastWord
          
          const filtered = usernames.filter(username => 
            username.toLowerCase().startsWith(searchTerm.toLowerCase())
          )
          
          if (filtered.length > 0) {
            setAutocompleteSuggestions(filtered)
            setSelectedSuggestionIndex(0)
            setShowAutocomplete(true)
          }
        }
      }
    } else if (e.key === 'ArrowDown' && showAutocomplete) {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => 
        prev < autocompleteSuggestions.length - 1 ? prev + 1 : prev
      )
    } else if (e.key === 'ArrowUp' && showAutocomplete) {
      e.preventDefault()
      setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : prev)
    } else if (e.key === 'Escape' && showAutocomplete) {
      e.preventDefault()
      setShowAutocomplete(false)
      setAutocompleteSuggestions([])
    }
  }

  const handleUsernameClick = async (username: string, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedUser(username)
  }

  const handleContextMenu = (e: React.MouseEvent, messageId: string) => {
    e.preventDefault()
    e.stopPropagation()
    const message = messages.find(m => m.id === messageId)
    if (message) {
      setContextMenu({ 
        x: e.clientX, 
        y: e.clientY, 
        messageId,
        username: message.username,
        userId: message.username // We'll need to get the actual user ID from the chat service
      })
    }
  }

  const handleDeleteMessage = async () => {
    if (contextMenu) {
      // Call Twitch API to delete the message
      const success = await chatServiceRef.current.deleteMessage(contextMenu.messageId)
      
      // Mark as deleted locally (strikethrough)
      deleteMessage(contextMenu.messageId)
      
      if (!success) {
        console.warn('Failed to delete message via Twitch API, but marked as deleted locally')
      }
      
      setContextMenu(null)
    }
  }

  const handleTimeoutUser = async () => {
    if (contextMenu) {
      // Get user info to get the user ID
      const userInfo = await chatServiceRef.current.getUserInfo(contextMenu.username)
      if (userInfo) {
        const success = await chatServiceRef.current.timeoutUser(userInfo.id, 600) // 10 minute timeout
        if (!success) {
          console.error('Failed to timeout user')
        }
      }
      setContextMenu(null)
    }
  }

  const handleBanUser = async () => {
    if (contextMenu) {
      // Get user info to get the user ID
      const userInfo = await chatServiceRef.current.getUserInfo(contextMenu.username)
      if (userInfo) {
        const success = await chatServiceRef.current.banUser(userInfo.id)
        if (!success) {
          console.error('Failed to ban user')
        }
      }
      setContextMenu(null)
    }
  }

  // Close context menu on click outside
  useEffect(() => {
    if (contextMenu) {
      const handleClick = () => setContextMenu(null)
      document.addEventListener('click', handleClick)
      return () => document.removeEventListener('click', handleClick)
    }
  }, [contextMenu])

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = e.target.value
    setMessageInput(newValue)
    
    // Check if we should trigger autocomplete
    const words = newValue.split(' ')
    const lastWord = words[words.length - 1]
    
    if (lastWord.startsWith('@') && lastWord.length > 1) {
      // Typing after @, show filtered suggestions
      const usernames = getUniqueUsernames()
      const searchTerm = lastWord.slice(1)
      
      const filtered = usernames.filter(username => 
        username.toLowerCase().startsWith(searchTerm.toLowerCase())
      )
      
      if (filtered.length > 0) {
        setAutocompleteSuggestions(filtered)
        setSelectedSuggestionIndex(0)
        setShowAutocomplete(true)
      } else {
        setShowAutocomplete(false)
        setAutocompleteSuggestions([])
      }
    } else if (lastWord === '@') {
      // Just typed @, show all usernames
      const usernames = getUniqueUsernames()
      if (usernames.length > 0) {
        setAutocompleteSuggestions(usernames)
        setSelectedSuggestionIndex(0)
        setShowAutocomplete(true)
      }
    } else {
      // Hide autocomplete when not typing @mention
      if (showAutocomplete) {
        setShowAutocomplete(false)
        setAutocompleteSuggestions([])
      }
    }
  }


  if (isLoading || !isAuthenticated) {
    return (
      <div className="app">
        <UpdateNotification />
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
      <UpdateNotification />
      <div className="chat-header">
        <div className="channel-info">
          <span className="stream-chat-label">STREAM CHAT</span>
          {isConnected && authenticatedUser && (
            <span className="channel-name">#{authenticatedUser.name}</span>
          )}
        </div>
        <div className="header-actions">
          <button onClick={() => setIsSettingsOpen(true)} className="settings-button" title="Settings">
            <img src="/gear.svg" alt="Settings" />
          </button>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
      </div>
      
      {error && <div className="error">{error}</div>}

      <div className="chat-messages" ref={chatMessagesRef}>
        <div className="messages-list">
          {messages.map((msg) => (
            <div 
              key={msg.id} 
              className={`chat-line ${readMessageIds.has(msg.id) ? 'read' : ''} ${msg.isFirstMessage ? 'first-time-chatter' : ''} ${msg.isReturningChatter ? 'returning-chatter' : ''} ${msg.isHighlighted ? 'highlighted-message' : ''} ${msg.isDeleted ? 'deleted' : ''}`}
              onClick={() => {
                if (!contextMenu) {
                  markAsRead(msg.id)
                }
              }}
              onContextMenu={(e) => handleContextMenu(e, msg.id)}
              style={{ 
                cursor: 'pointer',
                ...(readMessageIds.has(msg.id) && { background: getReadMessageColorWithAlpha() })
              }}
            >
              <div className="chat-line-wrapper">
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
                {msg.isReply && msg.replyParentDisplayName && (() => {
                  const parentMessage = msg.replyParentMessageId 
                    ? messages.find(m => m.id === msg.replyParentMessageId)
                    : null;
                  const parentText = parentMessage?.message || msg.replyParentMessage || '';
                  return (
                    <div className="reply-thread">
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M8 12l-4-4 4-4v2.5c5 0 8.5 1.5 11 5-1.5-4.5-5-6.5-11-6.5V8z"/>
                      </svg>
                      <span className="reply-text">Replying to @{msg.replyParentDisplayName}: {parentText}</span>
                    </div>
                  );
                })()}
                <div className="chat-line-content">
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
              <span 
                className="chat-username" 
                style={{ color: msg.color || '#9147ff', fontSize: `${fontSize}px`, cursor: 'pointer' }}
                onClick={(e) => handleUsernameClick(msg.displayName, e)}
              >
                {msg.displayName}
              </span>
              <span className="chat-colon" style={{ fontSize: `${fontSize}px` }}>:</span>
              <span className="chat-message" style={{ fontSize: `${fontSize}px` }}>
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
                  if (part.type === 'link' && part.url) {
                    return (
                      <a
                        key={index}
                        href={part.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="chat-link"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {part.content}
                      </a>
                    );
                  }
                  return <span key={index}>{part.content}</span>;
                })}
              </span>
                </div>
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
        {selectedUser && (
          <UserCard
            username={selectedUser}
            chatService={chatServiceRef.current}
            onClose={() => setSelectedUser(null)}
          />
        )}
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
        {showAutocomplete && autocompleteSuggestions.length > 0 && (
          <div className="autocomplete-suggestions">
            {autocompleteSuggestions.map((username, index) => (
              <div
                key={username}
                className={`autocomplete-item ${index === selectedSuggestionIndex ? 'selected' : ''}`}
                onClick={() => {
                  const words = messageInput.split(' ')
                  words[words.length - 1] = username
                  
                  setMessageInput(words.join(' ') + ' ')
                  setShowAutocomplete(false)
                  setAutocompleteSuggestions([])
                }}
              >
                {username}
              </div>
            ))}
          </div>
        )}
        <form onSubmit={handleSendMessage} className="chat-input-form">
          <input
            type="text"
            className="chat-input"
            placeholder={isConnected ? `Send a message` : 'Connecting...'}
            value={messageInput}
            onChange={handleInputChange}
            onKeyDown={handleInputKeyDown}
            disabled={!isConnected}
          />
          <button type="submit" className="chat-send-button" disabled={!isConnected || !messageInput.trim()}>
            Send
          </button>
        </form>
      </div>

      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: 'fixed',
            left: `${contextMenu.x}px`,
            top: `${contextMenu.y}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <button className="context-menu-item" onClick={handleDeleteMessage}>
            Delete Message
          </button>
          <button className="context-menu-item" onClick={handleTimeoutUser}>
            Timeout
          </button>
          <button className="context-menu-item" onClick={handleBanUser}>
            Ban
          </button>
        </div>
      )}

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}

export default App
