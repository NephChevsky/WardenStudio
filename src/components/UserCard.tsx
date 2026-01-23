import { useState, useEffect } from 'react'
import './UserCard.css'
import { TwitchChatService } from '../services/TwitchChatService'

interface UserCardProps {
    username: string
    chatService: TwitchChatService
    onClose: () => void
}

export function UserCard({
    username,
    chatService,
    onClose
}: UserCardProps) {
    const [userInfo, setUserInfo] = useState<{
        id: string
        displayName: string
        profileImageUrl: string
        createdAt: Date
        isSubscribed: boolean
        subscriptionMonths: number
        subscriptionTier: string
        followingSince: Date | null
        isVip: boolean
        isMod: boolean
    } | null>(null)
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const fetchUserInfo = async () => {
            setIsLoading(true)
            const info = await chatService.getUserInfo(username)
            if (info) {
                setUserInfo({
                    id: info.id,
                    displayName: info.displayName,
                    profileImageUrl: info.profileImageUrl,
                    createdAt: info.createdAt,
                    isSubscribed: info.isSubscribed,
                    subscriptionMonths: info.subscriptionMonths,
                    subscriptionTier: info.subscriptionTier,
                    followingSince: info.followingSince,
                    isVip: info.isVip,
                    isMod: info.isMod
                })
            }
            setIsLoading(false)
        }

        fetchUserInfo()
    }, [username, chatService])

    const formatDate = (date: Date) => {
        return date.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })
    }

    const getSubscriptionText = () => {
        if (!userInfo) return ''
        if (userInfo.isSubscribed && userInfo.subscriptionMonths > 0) {
            return `${userInfo.subscriptionTier} - ${userInfo.subscriptionMonths} month${userInfo.subscriptionMonths !== 1 ? 's' : ''}`
        } else if (userInfo.subscriptionMonths > 0) {
            return `Previously subscribed (${userInfo.subscriptionMonths} month${userInfo.subscriptionMonths !== 1 ? 's' : ''})`
        } else {
            return 'Never subscribed'
        }
    }

    const handleTimeout = async () => {
        if (!userInfo) return
        await chatService.timeoutUser(userInfo.id)
        onClose()
    }

    const handleBan = async () => {
        if (!userInfo) return
        await chatService.banUser(userInfo.id)
        onClose()
    }

    const handleVip = async () => {
        if (!userInfo) return
        if (userInfo.isVip) {
            await chatService.removeVip(userInfo.id)
        } else {
            await chatService.addVip(userInfo.id)
        }
        onClose()
    }

    const handleMod = async () => {
        if (!userInfo) return
        if (userInfo.isMod) {
            await chatService.removeModerator(userInfo.id)
        } else {
            await chatService.addModerator(userInfo.id)
        }
        onClose()
    }

    return (
        <div className="user-card">
            <div className="user-card-header">
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

                                <div className="user-card-info-item">
                                    <svg width="20" height="20" viewBox="0 0 24 24" aria-label="Subscriber" fill="currentColor">
                                        <path d="M10.883 2.72c.43-.96 1.803-.96 2.234 0l2.262 5.037 5.525.578c1.052.11 1.477 1.406.69 2.11l-4.127 3.691 1.153 5.395c.22 1.028-.89 1.828-1.808 1.303L12 18.08l-4.812 2.755c-.917.525-2.028-.275-1.808-1.303l1.153-5.395-4.127-3.691c-.786-.704-.362-2 .69-2.11l5.525-.578 2.262-5.037Z" />
                                    </svg>
                                    <span>{getSubscriptionText()}</span>
                                </div>

                            </div>
                        </div>
                    </div>

                    <div className="user-card-actions">
                        <button className="user-card-action-btn timeout" title="Timeout User" onClick={handleTimeout}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm.5-13H11v6l5.2 3.2.8-1.3-4.5-2.7V7z" />
                            </svg>
                        </button>

                        <button className="user-card-action-btn ban" title="Ban User" onClick={handleBan}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zM4 12c0-4.42 3.58-8 8-8 1.85 0 3.55.63 4.9 1.69L5.69 16.9C4.63 15.55 4 13.85 4 12zm8 8c-1.85 0-3.55-.63-4.9-1.69L18.31 7.1C19.37 8.45 20 10.15 20 12c0 4.42-3.58 8-8 8z" />
                            </svg>
                        </button>

                        <button className="user-card-action-btn vip" title={userInfo?.isVip ? "Remove VIP" : "VIP User"} onClick={handleVip}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 17.27L18.18 21l-1.64-7.03L22 9.24l-7.19-.61L12 2 9.19 8.63 2 9.24l5.46 4.73L5.82 21z" />
                            </svg>
                        </button>

                        <button className="user-card-action-btn mod" title={userInfo?.isMod ? "Remove Mod" : "Mod User"} onClick={handleMod}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4zm0 10.99h7c-.53 4.12-3.28 7.79-7 8.94V12H5V6.3l7-3.11v8.8z" />
                            </svg>
                        </button>
                    </div>
                </>
            ) : (
                <div className="user-card-error">
                    <p>Failed to load user info</p>
                </div>
            )}
        </div>
    )
}
