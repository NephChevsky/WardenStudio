import { useEffect, useRef, useLayoutEffect, useState } from 'react'
import './App.css'
import { TwitchApiService } from './services/TwitchApiService'
import { TwitchChatService } from './services/TwitchChatService'
import { TwitchEventSubService } from './services/TwitchEventSubService'
import { TwitchOAuthService } from './services/TwitchOAuthService'
import { useAuthStore } from './store/authStore'
import { useChatStore } from './store/chatStore'
import { useSettingsStore } from './store/settingsStore'
import { UpdateNotification } from './components/UpdateNotification'
import { Settings } from './components/Settings'
import { ContextMenu } from './components/ContextMenu'
import { ChatMessage } from './components/ChatMessage'
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
    lastReadMessageId,
    shouldScrollToBottom,
    addMessage,
    setMessageInput,
    setConnected,
    markAsRead,
    markAllAsRead,
    deleteMessage,
    setShouldScrollToBottom,
    loadFromDatabase,
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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; messageId: string; username: string; userId: string } | null>(null)
  const [userCardInfo, setUserCardInfo] = useState<{ username: string; userId: string; x: number; y: number } | null>(null)

  // Refs
  const apiServiceRef = useRef<TwitchApiService>(new TwitchApiService())
  const chatServiceRef = useRef<TwitchChatService>(new TwitchChatService())
  const eventSubServiceRef = useRef<TwitchEventSubService>(new TwitchEventSubService())
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const chatMessagesRef = useRef<HTMLDivElement>(null)
  const oauthServiceRef = useRef<TwitchOAuthService>(
    new TwitchOAuthService(
      import.meta.env.VITE_TWITCH_CLIENT_ID || ''
    )
  )

  useEffect(() => {
    // Load saved chat data from database
    loadFromDatabase();
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
  }, [loadFromDatabase, setAuthenticated, setLoading, loadSettings])

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

    const apiService = apiServiceRef.current
    const chatService = chatServiceRef.current
    const eventSubService = eventSubServiceRef.current
    
    // Only register the message handler once
    chatService.onMessage((message) => {
      addMessage(message);
    });

    // Auto-connect using OAuth token to the authenticated user's channel
    (async () => {
      const channel = authenticatedUser.name
      const accessToken = await oauthServiceRef.current.getToken()
      const clientId = import.meta.env.VITE_TWITCH_CLIENT_ID

      if (channel && accessToken && clientId) {
        try {
          // Initialize API service first
          await apiService.initialize(channel, accessToken, clientId)

          // Get necessary data from API service
          const currentUser = apiService.getCurrentUser()
          const broadcasterId = apiService.getBroadcasterId()

          if (!currentUser || !broadcasterId) {
            throw new Error('Failed to get user or broadcaster info')
          }

          // Initialize chat service with data from API service
          await chatService.connect(
            channel,
            accessToken,
            clientId,
            currentUser.id,
            currentUser.name,
            currentUser.displayName,
            currentUser.color,
            broadcasterId
          )

          setConnected(true)

          // Initialize EventSub service independently
          const apiClient = apiService.getApiClient()

          if (apiClient) {
            await eventSubService.connect(apiClient, broadcasterId, currentUser.id)

            // Register message deletion handler
            eventSubService.onMessageDeleted(async (event) => {
              console.log('Message deleted event received:', event.messageId);
              deleteMessage(event.messageId);
              
              // Update database to mark message as deleted
              if (window.electron?.database) {
                try {
                  await window.electron.database.markMessageAsDeleted(event.messageId);
                } catch (err) {
                  console.error('Failed to mark message as deleted in database:', err);
                }
              }
            });
          }
        } catch (err) {
          console.error('Failed to connect:', err)
          setError('Failed to connect to Twitch chat. Try logging in again.')
          await oauthServiceRef.current.clearToken()
          setAuthenticated(null)
        }
      }
    })()

    return () => {
      eventSubService.disconnect()
      chatService.disconnect()
    }
  }, [isAuthenticated, authenticatedUser, addMessage, deleteMessage, setConnected, setError, setAuthenticated])

  // Fetch chatters list every minute
  useEffect(() => {
    if (!isConnected) return

    const fetchChatters = async () => {
      const chattersData = await apiServiceRef.current.getChatters()
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
        userId: message.userId
      })
    }
  }

  const handleUsernameClick = (username: string, userId: string, x: number, y: number) => {
    setUserCardInfo({ username, userId, x, y })
  }

  const handleDeleteMessage = async () => {
    if (contextMenu) {
      // Call Twitch API to delete the message
      const success = await apiServiceRef.current.deleteMessage(contextMenu.messageId)
      
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
      const success = await apiServiceRef.current.timeoutUser(contextMenu.userId, 600) // 10 minute timeout
      if (!success) {
        console.error('Failed to timeout user')
      }
      setContextMenu(null)
    }
  }

  const handleBanUser = async () => {
    if (contextMenu) {
      const success = await apiServiceRef.current.banUser(contextMenu.userId)
      if (!success) {
        console.error('Failed to ban user')
      }
      setContextMenu(null)
    }
  }

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
    <div className="chat-container" style={{ '--base-font-size': `${fontSize}px` } as React.CSSProperties}>
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
            <svg width="20" height="20" viewBox="0 0 100 100" fill="currentColor">
              <path d="M60.1,88.7c-0.1,0-0.3,0-0.4,0c-2.1-0.4-4-1.8-5-3.7c-0.1-0.1-0.1-0.2-0.2-0.3c-0.1-0.2-0.9-1.7-3.2-1.8c0,0-0.1,0-0.1,0  c-0.8,0-1.5,0-2.3,0c0,0-0.1,0-0.1,0c-2.4,0-3.2,1.7-3.2,1.8c-0.1,0.1-0.1,0.2-0.2,0.3c-1,1.9-2.9,3.3-5,3.7c-0.3,0.1-0.6,0.1-0.9,0  c-1.9-0.5-3.9-1.2-5.7-2.1c-0.3-0.1-0.5-0.3-0.7-0.5c-1.3-1.7-1.9-4-1.4-6.1c0-0.1,0-0.2,0.1-0.4c0-0.2,0.4-1.9-1.3-3.4  c0,0-0.1-0.1-0.1-0.1c-0.6-0.5-1.2-1-1.8-1.5c0,0,0,0,0,0c-0.8-0.6-1.6-0.9-2.5-0.9c-0.7,0-1.2,0.2-1.2,0.2  c-0.1,0.1-0.2,0.1-0.4,0.1c-2,0.8-4.4,0.7-6.3-0.4c-0.3-0.1-0.5-0.3-0.6-0.6c-1.1-1.6-2.1-3.3-3-5.1c-0.1-0.3-0.2-0.5-0.2-0.8  c0-2.2,1.1-4.4,2.8-5.7c0.1-0.1,0.2-0.2,0.3-0.2c0.1-0.1,1.5-1.2,1.2-3.5c0,0,0,0,0-0.1c-0.2-0.7-0.3-1.5-0.4-2.3c0-0.1,0-0.1,0-0.1  c-0.4-2.3-2.3-2.8-2.3-2.8c-0.1,0-0.2-0.1-0.4-0.1c-2.1-0.7-3.9-2.4-4.6-4.5c-0.1-0.3-0.1-0.5-0.1-0.8c0.2-1.8,0.5-3.7,1-5.6  c0.1-0.3,0.2-0.5,0.4-0.7c1.5-1.8,3.7-2.8,5.9-2.7c0.1,0,0.2,0,0.4,0c0.5,0,2.1-0.1,3.1-1.9c0,0,0-0.1,0.1-0.1  c0.3-0.6,0.7-1.3,1.2-2c0,0,0-0.1,0.1-0.1c1.1-2,0.2-3.5,0.1-3.7c-0.1-0.1-0.1-0.2-0.2-0.3c-1.2-2-1.5-4.4-0.6-6.6  c0.1-0.2,0.2-0.5,0.4-0.7c1.3-1.3,2.7-2.5,4.2-3.5c0.2-0.2,0.5-0.3,0.7-0.3c2.3-0.5,4.7,0.2,6.4,1.7c0.1,0.1,0.2,0.1,0.3,0.2  c0,0,0.9,0.8,2.2,0.8c0.4,0,0.9-0.1,1.4-0.2c0,0,0,0,0,0c0.8-0.3,1.6-0.6,2.3-0.8c2.1-0.8,2.4-2.6,2.4-2.8c0-0.1,0-0.2,0.1-0.3  c0.3-2.3,1.7-4.4,3.8-5.5c0.2-0.1,0.5-0.2,0.7-0.2c2-0.1,3.4-0.1,5.4,0c0.3,0,0.5,0.1,0.7,0.2c2.1,1.1,3.5,3.1,3.8,5.4  c0,0.1,0.1,0.2,0.1,0.4c0,0.2,0.3,1.9,2.4,2.8c0,0,0,0,0,0c0.8,0.2,1.6,0.5,2.3,0.8c0,0,0,0,0,0c0.5,0.2,1,0.3,1.4,0.3  c1.4,0,2.2-0.8,2.2-0.8c0.1-0.1,0.2-0.2,0.3-0.2c1.7-1.5,4.1-2.2,6.4-1.7c0.3,0.1,0.5,0.2,0.7,0.3c1.5,1.1,2.9,2.3,4.2,3.5  c0.2,0.2,0.3,0.4,0.4,0.7c0.8,2.2,0.6,4.6-0.6,6.6c0,0.1-0.1,0.2-0.2,0.3c-0.1,0.1-1,1.7,0.1,3.7c0,0,0,0.1,0.1,0.1  c0.4,0.7,0.8,1.3,1.2,2c0,0,0,0.1,0.1,0.1c1,1.7,2.6,1.9,3.1,1.9c0.1,0,0.3,0,0.4,0c2.2-0.1,4.5,0.9,5.9,2.7  c0.2,0.2,0.3,0.5,0.4,0.7c0.5,1.8,0.8,3.7,1,5.6c0,0.3,0,0.5-0.1,0.8c-0.8,2.2-2.5,3.8-4.6,4.5c-0.1,0.1-0.2,0.1-0.4,0.1  c-0.2,0-1.9,0.6-2.3,2.9c0,0,0,0.1,0,0.1c-0.1,0.8-0.2,1.6-0.4,2.3c0,0,0,0.1,0,0.1C81,59.9,82.5,61,82.5,61  c0.1,0.1,0.2,0.2,0.3,0.3c1.7,1.4,2.8,3.5,2.8,5.7c0,0.3-0.1,0.6-0.2,0.8c-0.8,1.7-1.8,3.5-3,5.1c-0.2,0.2-0.4,0.4-0.6,0.6  c-1.1,0.6-2.3,0.9-3.6,0.9l0,0c-0.9,0-1.9-0.2-2.7-0.5c-0.1,0-0.2-0.1-0.4-0.1c0,0,0,0,0,0c0,0-0.5-0.2-1.2-0.2  c-0.9,0-1.7,0.3-2.4,0.9c0,0,0,0-0.1,0c-0.5,0.5-1.1,1-1.8,1.5c0,0-0.1,0-0.1,0.1c-1.5,1.3-1.5,2.7-1.4,3.3c0.1,0.2,0.1,0.4,0.1,0.6  c0,0,0,0,0,0c0.4,2.1-0.1,4.3-1.5,5.9c-0.2,0.2-0.4,0.4-0.7,0.5c-1.8,0.8-3.8,1.5-5.7,2.1C60.4,88.7,60.2,88.7,60.1,88.7z   M35.7,83.4c1.4,0.6,2.8,1.1,4.2,1.5c1-0.3,1.8-1,2.2-1.9c0.1-0.1,0.1-0.2,0.2-0.4c0.8-1.4,2.8-3.4,6.2-3.5c0.1,0,0.1,0,0.1,0  c0,0,0.1,0,0.1,0c0.8,0,1.5,0,2.3,0c0,0,0.1,0,0.1,0c0,0,0.1,0,0.1,0c3.3,0.1,5.4,2.1,6.2,3.5c0.1,0.1,0.2,0.2,0.2,0.4  c0.4,0.9,1.2,1.6,2.2,1.9c1.4-0.4,2.9-0.9,4.2-1.5c0.5-0.9,0.7-1.9,0.4-2.9c0-0.1-0.1-0.3-0.1-0.4c-0.3-1.6,0-4.4,2.5-6.7  c0,0,0.1-0.1,0.1-0.1c0,0,0.1-0.1,0.1-0.1c0.7-0.5,1.2-1,1.8-1.5c0,0,0.1-0.1,0.1-0.1c0,0,0.1,0,0.1-0.1c1.4-1.1,3-1.7,4.7-1.7  c1,0,1.8,0.2,2.3,0.4c0.1,0,0.3,0.1,0.4,0.1c0.5,0.2,1,0.3,1.5,0.3l0,0c0.5,0,1-0.1,1.4-0.3c0.8-1.2,1.6-2.5,2.2-3.8  c-0.1-1-0.7-2-1.5-2.6c-0.1-0.1-0.2-0.2-0.3-0.3c-1.3-1.1-2.9-3.4-2.4-6.7c0,0,0-0.1,0-0.1c0,0,0-0.1,0-0.1c0.2-0.7,0.3-1.5,0.4-2.3  c0-0.1,0-0.1,0-0.2c0,0,0-0.1,0-0.1c0.7-3.3,3-4.9,4.5-5.5c0.1-0.1,0.2-0.1,0.4-0.2c1-0.3,1.9-1,2.4-2c-0.2-1.4-0.4-2.8-0.7-4.1  c-0.8-0.8-1.8-1.2-2.9-1.1c-0.2,0-0.3,0-0.5,0c-1.1,0-4.1-0.4-6.1-3.6c0,0-0.1-0.1-0.1-0.1c-0.4-0.8-0.8-1.4-1.2-2.1  c0,0-0.1-0.1-0.1-0.1c0,0,0-0.1-0.1-0.1c-1.6-3-0.9-5.7-0.1-7.1c0.1-0.1,0.1-0.2,0.2-0.4c0.6-0.9,0.8-2,0.5-3.1  c-1-0.9-2-1.8-3.1-2.6c-1.1-0.1-2.2,0.3-3,1c-0.1,0.1-0.2,0.2-0.4,0.3C67.3,24,65.8,25,63.5,25c-0.8,0-1.7-0.1-2.5-0.4  c0,0-0.1,0-0.1,0c0,0-0.1,0-0.1,0c-0.7-0.3-1.5-0.6-2.2-0.8c0,0-0.1,0-0.1,0c0,0,0,0-0.1,0c-3.1-1.2-4.4-3.8-4.7-5.4  c0-0.1-0.1-0.3-0.1-0.4c-0.1-1.1-0.7-2.1-1.6-2.7c-1.5-0.1-2.5-0.1-4,0c-0.9,0.6-1.5,1.6-1.6,2.7c0,0.1,0,0.3-0.1,0.4  c-0.3,1.6-1.5,4.2-4.7,5.4c0,0,0,0-0.1,0c0,0-0.1,0-0.1,0c-0.7,0.2-1.5,0.5-2.2,0.8c0,0-0.1,0-0.1,0c0,0-0.1,0-0.1,0  c-0.8,0.3-1.6,0.4-2.5,0.4c-2.3,0-3.8-1-4.5-1.6c-0.1-0.1-0.2-0.2-0.4-0.3c-0.8-0.8-1.9-1.2-3-1c-1.1,0.8-2.1,1.7-3.1,2.6  c-0.3,1.1-0.1,2.2,0.5,3.1c0.1,0.1,0.1,0.2,0.2,0.4c0.8,1.4,1.5,4.2-0.1,7.1c0,0,0,0.1,0,0.1c0,0-0.1,0.1-0.1,0.1  c-0.4,0.7-0.8,1.3-1.2,2c0,0.1-0.1,0.1-0.1,0.2c-2,3.2-5,3.6-6.1,3.6c-0.1,0-0.3,0-0.4,0c-1.1-0.1-2.1,0.3-2.9,1.1  c-0.3,1.4-0.6,2.8-0.7,4.1c0.5,1,1.3,1.7,2.4,2c0.1,0,0.3,0.1,0.4,0.2c1.5,0.6,3.8,2.2,4.5,5.5c0,0,0,0.1,0,0.1c0,0.1,0,0.1,0,0.2  c0.1,0.8,0.2,1.5,0.4,2.3c0,0,0,0.1,0,0.1c0,0,0,0.1,0,0.1c0.5,3.3-1.1,5.6-2.4,6.7c-0.1,0.1-0.2,0.2-0.3,0.3  c-0.9,0.6-1.4,1.6-1.5,2.6c0.7,1.3,1.4,2.6,2.2,3.8c0.9,0.4,2,0.4,3-0.1c0.1-0.1,0.3-0.1,0.4-0.1c0.5-0.2,1.3-0.4,2.3-0.4  c1.7,0,3.3,0.6,4.7,1.7c0,0,0,0,0.1,0c0.1,0,0.1,0.1,0.2,0.1c0.5,0.5,1.1,1,1.8,1.5c0,0,0.1,0.1,0.1,0.1c0,0,0.1,0.1,0.1,0.1  c2.5,2.2,2.8,5.1,2.5,6.7c0,0.1,0,0.3-0.1,0.4C35,81.5,35.2,82.5,35.7,83.4z M50,70.2c-10.8,0-19.5-8.8-19.5-19.5S39.2,31.1,50,31.1  s19.5,8.8,19.5,19.5S60.8,70.2,50,70.2z M50,34.8c-8.7,0-15.9,7.1-15.9,15.9S41.3,66.5,50,66.5s15.9-7.1,15.9-15.9  S58.7,34.8,50,34.8z"/>
            </svg>
          </button>
          <button onClick={handleLogout} className="logout-button">Logout</button>
        </div>
      </div>
      
      {error && <div className="error">{error}</div>}

      <div className="chat-messages" ref={chatMessagesRef}>
        <div className="messages-list">
          {messages.map((msg, index) => {
            // Message is read if it's at or before the last read message
            const lastReadIndex = lastReadMessageId 
              ? messages.findIndex(m => m.id === lastReadMessageId)
              : -1;
            const isRead = lastReadIndex >= 0 && index <= lastReadIndex;
            
            return (
              <ChatMessage
                key={msg.id}
                message={msg}
                isRead={isRead}
                readMessageBackgroundColor={getReadMessageColorWithAlpha()}
                onMarkAsRead={markAsRead}
                onContextMenu={handleContextMenu}
                isContextMenuOpen={contextMenu !== null}
                onUsernameClick={handleUsernameClick}
              />
            );
          })}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="chat-input-container">
        <div className="chat-actions">
          <button 
            onClick={markAllAsRead} 
            className="mark-all-read-button"
            disabled={messages.length === 0 || (messages.length > 0 && lastReadMessageId === messages[messages.length - 1].id)}
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
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          messageId={contextMenu.messageId}
          username={contextMenu.username}
          userId={contextMenu.userId}
          messages={messages}
          onDeleteMessage={handleDeleteMessage}
          onTimeoutUser={handleTimeoutUser}
          onBanUser={handleBanUser}
          onClose={() => setContextMenu(null)}
        />
      )}

      {userCardInfo && (
        <UserCard
          username={userCardInfo.username}
          userId={userCardInfo.userId}
          apiService={apiServiceRef.current}
          onClose={() => setUserCardInfo(null)}
          initialX={userCardInfo.x}
          initialY={userCardInfo.y}
        />
      )}

      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  )
}

export default App
