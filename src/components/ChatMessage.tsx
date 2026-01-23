import './ChatMessage.css'
import { getEmoteUrl } from '../utils/emoteParser'
import type { ChatMessage as ChatMessageType } from '../services/TwitchChatService'

interface ChatMessageProps {
  message: ChatMessageType
  isRead: boolean
  fontSize: number
  readMessageBackgroundColor: string
  allMessages: ChatMessageType[]
  onMarkAsRead: (id: string) => void
  onUsernameClick: (username: string, e: React.MouseEvent) => void
  onContextMenu: (e: React.MouseEvent, messageId: string) => void
  isContextMenuOpen: boolean
}

export function ChatMessage({
  message: msg,
  isRead,
  fontSize,
  readMessageBackgroundColor,
  allMessages,
  onMarkAsRead,
  onUsernameClick,
  onContextMenu,
  isContextMenuOpen
}: ChatMessageProps) {
  return (
    <div 
      key={msg.id} 
      className={`chat-line ${isRead ? 'read' : ''} ${msg.isFirstMessage ? 'first-time-chatter' : ''} ${msg.isReturningChatter ? 'returning-chatter' : ''} ${msg.isHighlighted ? 'highlighted-message' : ''} ${msg.isDeleted ? 'deleted' : ''}`}
      onClick={() => {
        if (!isContextMenuOpen) {
          onMarkAsRead(msg.id)
        }
      }}
      onContextMenu={(e) => onContextMenu(e, msg.id)}
      style={{ 
        cursor: 'pointer',
        ...(isRead && { background: readMessageBackgroundColor })
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
            ? allMessages.find(m => m.id === msg.replyParentMessageId)
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
            onClick={(e) => onUsernameClick(msg.displayName, e)}
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
  )
}
