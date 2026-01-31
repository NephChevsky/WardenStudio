import { useEffect } from 'react'
import './ContextMenu.css'
import type { ChatItem } from '../store/chatStore'
import { isChatMessage } from '../store/chatStore'
import { useAuthStore } from '../store/authStore'

interface ContextMenuProps {
  x: number
  y: number
  messageId: string
  username: string
  userId: string
  messages: ChatItem[]
  onDeleteMessage: () => void
  onTimeoutUser: () => void
  onBanUser: () => void
  onClose: () => void
}

export function ContextMenu({
  x,
  y,
  messageId,
  messages,
  onDeleteMessage,
  onTimeoutUser,
  onBanUser,
  onClose
}: ContextMenuProps) {
  const currentUserId = useAuthStore(state => state.currentUserId)
  
  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => onClose()
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [onClose])

  const message = messages.find(m => m.id === messageId)
  const isBroadcasterMessage = (message && isChatMessage(message)) 
    ? message.userId === currentUserId
    : false

  return (
    <div
      className="context-menu"
      style={{
        position: 'fixed',
        left: `${x}px`,
        top: `${y}px`,
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <button className="context-menu-item" onClick={onDeleteMessage}>
        Delete Message
      </button>
      {!isBroadcasterMessage && (
        <>
          <button className="context-menu-item" onClick={onTimeoutUser}>
            Timeout
          </button>
          <button className="context-menu-item" onClick={onBanUser}>
            Ban
          </button>
        </>
      )}
    </div>
  )
}
