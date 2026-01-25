import { useEffect } from 'react'
import './ContextMenu.css'
import type { ChatMessage } from '../services/TwitchChatService'

interface ContextMenuProps {
  x: number
  y: number
  messageId: string
  username: string
  userId: string
  messages: ChatMessage[]
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
  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => onClose()
    document.addEventListener('click', handleClick)
    return () => document.removeEventListener('click', handleClick)
  }, [onClose])

  const message = messages.find(m => m.id === messageId)
  const isBroadcaster = message?.badges.some(badge => 
    badge.toLowerCase().startsWith('broadcaster:')
  ) || false

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
      {!isBroadcaster && (
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
