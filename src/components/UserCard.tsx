import { useState, useEffect, useRef } from 'react'
import './UserCard.css'
import './ChatMessage.css'
import { TwitchApiService } from '../services/TwitchApiService'
import { useChatStore, isChatMessage } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'
import { useSettingsStore } from '../store/settingsStore'
import type { ChatMessage } from '../services/TwitchChatService'
import { ChatMessage as ChatMessageComponent } from './ChatMessage'

interface UserCardProps {
    username: string
    userId: string
    apiService: TwitchApiService
    onClose: () => void
    initialX?: number
    initialY?: number
}

export function UserCard({
    username,
    userId,
    apiService,
    onClose,
    initialX,
    initialY
}: UserCardProps) {
    const [userInfo, setUserInfo] = useState<{
        id: string
        displayName: string
        profileImageUrl: string
        createdAt: Date
        isSubscribed: boolean
        subscriptionTier: string
        followingSince: Date | null
        isVip: boolean
        isMod: boolean
        isBanned: boolean
        isTimedOut: boolean
        timeoutExpiresAt: Date | null
    } | null>(null)
    const [isLoading, setIsLoading] = useState(true)
    const [isDragging, setIsDragging] = useState(false)
    const [position, setPosition] = useState({ 
        x: initialX !== undefined ? initialX + 10 : window.innerWidth / 2 - 175, 
        y: initialY !== undefined ? initialY - 200 : 100  // Open above cursor, estimated height offset
    })
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 })
    const [showMessages, setShowMessages] = useState(false)
    const [userMessages, setUserMessages] = useState<ChatMessage[]>([])
    const [messageCount, setMessageCount] = useState(0)
    const [isAtBottom, setIsAtBottom] = useState(true)
    const cardRef = useRef<HTMLDivElement>(null)
    const messagesListRef = useRef<HTMLDivElement>(null)
    const currentUserId = useAuthStore(state => state.currentUserId)
    const uiFontSize = useSettingsStore(state => state.uiFontSize)

    const constrainPosition = (x: number, y: number) => {
        const cardWidth = 350
        const cardHeight = cardRef.current?.offsetHeight || 500
        const padding = 10

        let newX = x
        let newY = y

        // Keep within horizontal bounds
        if (newX + cardWidth + padding > window.innerWidth) {
            newX = window.innerWidth - cardWidth - padding
        }
        if (newX < padding) {
            newX = padding
        }

        // Keep within vertical bounds
        if (newY + cardHeight + padding > window.innerHeight) {
            newY = window.innerHeight - cardHeight - padding
        }
        if (newY < padding) {
            newY = padding
        }

        return { x: newX, y: newY }
    }

    useEffect(() => {
        // Update position when initialX or initialY changes (new user clicked)
        if (initialX !== undefined && initialY !== undefined) {
            // Position card above cursor - use actual card height if available
            const cardHeight = cardRef.current?.offsetHeight || 200
            const constrained = constrainPosition(initialX + 10, initialY - cardHeight - 10)
            setPosition(constrained)
        }
    }, [initialX, initialY])

    useEffect(() => {
        // Constrain position after content loads and height is known
        if (cardRef.current) {
            const constrained = constrainPosition(position.x, position.y)
            if (constrained.x !== position.x || constrained.y !== position.y) {
                setPosition(constrained)
            }
        }
    }, [userInfo, isLoading, showMessages, userMessages])

    useEffect(() => {
        const fetchUserInfo = async () => {
            setUserInfo(null)
            setIsLoading(true)
            // Fetch subscription info, ban info, VIPs and moderators lists using userId
            const [info,subscriptionInfo, banInfo, vipIds, modIds] = await Promise.all([
                apiService.getUserInfo(userId),
                apiService.getUserSubscriptionInfo(userId),
                apiService.getUserBanInfos(userId),
                apiService.getVips(),
                apiService.getModerators()
            ])
            
            if (info)
            {
                setUserInfo({
                    id: userId,
                    displayName: info.displayName,
                    profileImageUrl: info.profileImageUrl,
                    createdAt: info.createdAt,
                    isSubscribed: subscriptionInfo.isSubscribed,
                    subscriptionTier: subscriptionInfo.subscriptionTier,
                    followingSince: info.followingSince,
                    isVip: vipIds.includes(userId),
                    isMod: modIds.includes(userId),
                    isBanned: banInfo.isBanned,
                    isTimedOut: banInfo.isTimedOut,
                    timeoutExpiresAt: banInfo.timeoutExpiresAt
                })
            }
            setIsLoading(false)
        }

        fetchUserInfo()
    }, [username, userId, apiService])

    // Track user message count from database and subscribe to updates
    useEffect(() => {
        const loadMessageCount = async () => {
            if (!window.electron) return

            if (!currentUserId) return

            try {
                const count = await window.electron.database.getMessageCountByUserId(userId, currentUserId)
                setMessageCount(count)
            } catch (err) {
                console.error('Failed to load message count from database:', err)
            }
        }

        loadMessageCount()

        // Subscribe to chat store for new messages
        const unsubscribe = useChatStore.subscribe((state, prevState) => {
            // Check if a new message was added for this user
            const newMessages = state.messages.filter(msg => 
                isChatMessage(msg) &&
                msg.userId === userId && 
                !msg.isDeleted &&
                !prevState.messages.find(m => m.id === msg.id)
            )
            
            if (newMessages.length > 0) {
                setMessageCount(prev => prev + newMessages.length)
            }
        })

        return () => unsubscribe()
    }, [userId])

    // Load messages only when showMessages is true
    useEffect(() => {
        if (showMessages) {
            const loadMessages = async () => {
                if (!window.electron) return

                if (!currentUserId) return

                try {
                    // Get messages from database
                    const dbMessages = await window.electron.database.getMessagesByUserId(userId, currentUserId, 100)

                    if (dbMessages && dbMessages.length > 0) {
                        // Convert database messages to ChatMessage format
                        const messages = dbMessages.map((msg: any) => ({
                            id: msg.id,
                            userId: msg.userId,
                            username: msg.username,
                            displayName: msg.displayName,
                            message: msg.message,
                            timestamp: new Date(msg.timestamp),
                            color: msg.color,
                            badges: msg.badges || [],
                            isFirstMessage: msg.isFirstMessage || false,
                            isReturningChatter: msg.isReturningChatter || false,
                            isHighlighted: msg.isHighlighted || false,
                            bits: msg.bits,
                            replyParentMessageId: msg.replyParentMessageId,
                            emoteOffsets: msg.emoteOffsets,
                            isDeleted: msg.isDeleted || false,
                        }))

                        setUserMessages(messages)
                    }
                } catch (err) {
                    console.error('Failed to load user messages from database:', err)
                }
            }

            loadMessages()

            // Subscribe to chat store for new messages
            const unsubscribe = useChatStore.subscribe((state) => {
                const newMessages = state.messages.filter((msg): msg is ChatMessage => 
                    isChatMessage(msg) && msg.userId === userId && !msg.isDeleted
                )
                // Keep last 100 messages
                setUserMessages(prev => {
                    const combined = [...prev, ...newMessages.filter(nm => !prev.find(pm => pm.id === nm.id))]
                    return combined.slice(-100)
                })
            })

            return () => unsubscribe()
        }
    }, [showMessages, userId])

    // Scroll to bottom when message history is opened or messages are loaded (only if user is at bottom)
    useEffect(() => {
        if (showMessages && messagesListRef.current && userMessages.length > 0 && isAtBottom) {
            messagesListRef.current.scrollTop = messagesListRef.current.scrollHeight
        }
    }, [showMessages, userMessages, isAtBottom])

    const handleMouseDown = (e: React.MouseEvent) => {
        if (cardRef.current) {
            setIsDragging(true)
            setDragOffset({
                x: e.clientX - position.x,
                y: e.clientY - position.y
            })
        }
    }

    const handleMouseMove = (e: MouseEvent) => {
        if (isDragging) {
            const newX = e.clientX - dragOffset.x
            const newY = e.clientY - dragOffset.y
            const constrained = constrainPosition(newX, newY)
            setPosition(constrained)
        }
    }

    const handleMouseUp = () => {
        setIsDragging(false)
    }

    useEffect(() => {
        if (isDragging) {
            document.addEventListener('mousemove', handleMouseMove)
            document.addEventListener('mouseup', handleMouseUp)
            return () => {
                document.removeEventListener('mousemove', handleMouseMove)
                document.removeEventListener('mouseup', handleMouseUp)
            }
        }
    }, [isDragging, dragOffset])

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const formatDateTime = (date: Date) => {
        return date.toLocaleString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric',
            hour: 'numeric',
            minute: '2-digit',
            hour12: true
        })
    }

    const handleTimeout = async () => {
        if (!userInfo) return
        if (userInfo.isTimedOut) {
            await apiService.unbanUser(userInfo.id)
        } else {
            await apiService.timeoutUser(userInfo.id)
        }
        onClose()
    }

    const handleBan = async () => {
        if (!userInfo) return
        if (userInfo.isBanned) {
            await apiService.unbanUser(userInfo.id)
        } else {
            await apiService.banUser(userInfo.id)
        }
        onClose()
    }

    const handleVip = async () => {
        if (!userInfo) return
        if (userInfo.isVip) {
            await apiService.removeVip(userInfo.id)
        } else {
            await apiService.addVip(userInfo.id)
        }
        onClose()
    }

    const handleMod = async () => {
        if (!userInfo) return
        if (userInfo.isMod) {
            await apiService.removeModerator(userInfo.id)
        } else {
            await apiService.addModerator(userInfo.id)
        }
        onClose()
    }

    const handleToggleMessages = () => {
        setShowMessages(!showMessages)
        setIsAtBottom(true) // Reset to bottom when toggling
    }

    const handleScroll = () => {
        if (!messagesListRef.current) return
        
        const { scrollTop, scrollHeight, clientHeight } = messagesListRef.current
        const isBottom = Math.abs(scrollHeight - scrollTop - clientHeight) < 10 // 10px threshold
        setIsAtBottom(isBottom)
    }

    return (
        <div 
            ref={cardRef}
            className="user-card"
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'default',
                '--ui-font-size': `${uiFontSize}px`
            } as React.CSSProperties}>
            <div className="user-card-header" onMouseDown={handleMouseDown} style={{ cursor: 'grab' }}>
                <h3>{userInfo?.displayName || username}</h3>
                <button className="user-card-close" onClick={onClose}>
                    <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                        <path d="M10 8.586L3.707 2.293a1 1 0 10-1.414 1.414L8.586 10l-6.293 6.293a1 1 0 001.414 1.414L10 11.414l6.293 6.293a1 1 0 001.414-1.414L11.414 10l6.293-6.293a1 1 0 00-1.414-1.414L10 8.586z" />
                    </svg>
                </button>
            </div>

            {isLoading ? (
                <div className="user-card-loading">
                    <p>Loading user info...</p>
                </div>
            ) : userInfo ? (
                <>
                    <div className="user-card-content">
                        <img src={userInfo.profileImageUrl} alt={userInfo.displayName} className="user-card-avatar" />

                        <div className="user-card-details">
                            <div className="user-card-info">

                                <div className="user-card-info-item">
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                        <path fillRule="evenodd" d="M11 2h2v4h7a2 2 0 0 1 2 2v14H2V8a2 2 0 0 1 2-2h7V2Zm9 6H4v4.773l1.507-1.34a3 3 0 0 1 3.986 0l1.843 1.639a1 1 0 0 0 1.328 0l1.843-1.638a3 3 0 0 1 3.986 0L20 12.774V8Zm0 7.449-2.836-2.52a1 1 0 0 0-1.328 0l-1.843 1.637a3 3 0 0 1-3.986 0l-1.843-1.638a1 1 0 0 0-1.328 0L4 15.45V20h16v-4.551Z" clipRule="evenodd" />
                                    </svg>
                                    <span>Account created: {formatDate(userInfo.createdAt)}</span>
                                </div>

                                {userInfo.followingSince && (
                                    <div className="user-card-info-item">
                                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                            <path d="M16.5 3c-1.74 0-3.41.81-4.5 2.09C10.91 3.81 9.24 3 7.5 3 4.42 3 2 5.42 2 8.5c0 3.78 3.4 6.86 8.55 11.54L12 21.35l1.45-1.32C18.6 15.36 22 12.28 22 8.5 22 5.42 19.58 3 16.5 3zm-4.4 15.55l-.1.1-.1-.1C7.14 14.24 4 11.39 4 8.5 4 6.5 5.5 5 7.5 5c1.54 0 3.04.99 3.57 2.36h1.87C13.46 5.99 14.96 5 16.5 5c2 0 3.5 1.5 3.5 3.5 0 2.89-3.14 5.74-7.9 10.05z" />
                                        </svg>
                                        <span>Following since: {formatDate(userInfo.followingSince)}</span>
                                    </div>
                                )}

                                {userInfo.isSubscribed && (
                                    <div className="user-card-info-item">
                                        <svg width="20" height="20" viewBox="0 0 24 24" aria-label="Subscriber" fill="currentColor">
                                            <path d="M10.883 2.72c.43-.96 1.803-.96 2.234 0l2.262 5.037 5.525.578c1.052.11 1.477 1.406.69 2.11l-4.127 3.691 1.153 5.395c.22 1.028-.89 1.828-1.808 1.303L12 18.08l-4.812 2.755c-.917.525-2.028-.275-1.808-1.303l1.153-5.395-4.127-3.691c-.786-.704-.362-2 .69-2.11l5.525-.578 2.262-5.037Z" />
                                        </svg>
                                        <span>{userInfo.subscriptionTier}</span>
                                    </div>
                                )}

                            </div>
                        </div>
                    </div>

                    {userId !== currentUserId && (
                        <div className="user-card-actions">
                            <button className={`user-card-action-btn timeout${userInfo?.isTimedOut ? ' active' : ''}`} title={userInfo?.isTimedOut ? "Remove Timeout" : "Timeout User"} onClick={handleTimeout}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" />
                            </svg>
                        </button>

                        <button className={`user-card-action-btn ban${userInfo?.isBanned ? ' active' : ''}`} title={userInfo?.isBanned ? "Unban User" : "Ban User"} onClick={handleBan}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z" />
                            </svg>
                        </button>

                        <button className={`user-card-action-btn vip${userInfo?.isVip ? ' active' : ''}`} title={userInfo?.isVip ? "Remove VIP" : "VIP User"} onClick={handleVip}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                        </button>

                        <button className={`user-card-action-btn mod${userInfo?.isMod ? ' active' : ''}`} title={userInfo?.isMod ? "Remove Mod" : "Mod User"} onClick={handleMod}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                            </svg>
                        </button>
                    </div>
                    )}

                    <div className="user-card-message-count-container" onClick={handleToggleMessages} title="Click to view message history">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M20 2H4c-1.1 0-1.99.9-1.99 2L2 22l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 9h12v2H6V9zm8 5H6v-2h8v2zm4-6H6V6h12v2z" />
                        </svg>
                        <span>{messageCount} message{messageCount !== 1 ? 's' : ''} sent</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className={`chevron ${showMessages ? 'open' : ''}`}>
                            <path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z" />
                        </svg>
                    </div>

                    {showMessages && userMessages.length > 0 && (
                        <div className="user-card-messages">
                            <div className="user-card-messages-list" ref={messagesListRef} onScroll={handleScroll}>
                                {userMessages.map((msg) => (
                                    <ChatMessageComponent
                                        key={msg.id}
                                        message={msg}
                                    />
                                ))}
                            </div>
                        </div>
                    )}

                    {(userInfo.isBanned || userInfo.isTimedOut) && (
                        <div className="user-card-status-badges">
                            {userInfo.isBanned && (
                                <div className="user-card-badge banned">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z" />
                                    </svg>
                                    <div className="user-card-badge-content">
                                        <span className="user-card-badge-title">Banned</span>
                                    </div>
                                </div>
                            )}
                            {userInfo.isTimedOut && (
                                <div className="user-card-badge timed-out">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" />
                                    </svg>
                                    <div className="user-card-badge-content">
                                        <span className="user-card-badge-title">Timed Out</span>
                                        {userInfo.timeoutExpiresAt && (
                                            <span className="user-card-badge-time">Expires: {formatDateTime(userInfo.timeoutExpiresAt)}</span>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </>
            ) : (
                <div className="user-card-error">
                    <p>Failed to load user info</p>
                </div>
            )}
        </div>
    )
}
