import './SubscriptionEvent.css'
import type { SubscriptionEvent as SubscriptionEventType } from '../services/TwitchEventSubService'

interface SubscriptionEventProps {
  event: SubscriptionEventType
}

export function SubscriptionEvent({ event }: SubscriptionEventProps) {
  const getTierDisplay = (tier: string) => {
    switch (tier) {
      case '1000':
        return 'Tier 1'
      case '2000':
        return 'Tier 2'
      case '3000':
        return 'Tier 3'
      case 'prime':
        return 'Prime'
      default:
        return tier
    }
  }

  const getEventMessage = () => {
    switch (event.type) {
      case 'sub':
        if (event.isGift) {
          return `subscribed with a gifted ${getTierDisplay(event.tier)} sub!`
        }
        return `subscribed with ${getTierDisplay(event.tier)}!`
      
      case 'resub':
        const months = event.cumulativeMonths || 1
        const streak = event.streakMonths
        let message = `resubscribed with ${getTierDisplay(event.tier)} for ${months} month${months !== 1 ? 's' : ''}!`
        if (streak && streak > 1) {
          message += ` (${streak} month streak)`
        }
        return message
      
      case 'gift':
        return `gifted a ${getTierDisplay(event.tier)} sub!`
      
      case 'community-gift':
        const amount = event.amount || 1
        return `gifted ${amount} ${getTierDisplay(event.tier)} sub${amount !== 1 ? 's' : ''} to the community!`
      
      default:
        return 'subscribed!'
    }
  }

  return (
    <div className="subscription-event">
      <div className="subscription-event-wrapper">
        <div className="subscription-icon">
          <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
            <path d="M10 2l2.5 6h6l-5 4 2 6-5.5-4-5.5 4 2-6-5-4h6z"/>
          </svg>
        </div>
        <div className="subscription-content">
          <span className="subscription-timestamp">
            {event.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <span className="subscription-message">
            {getEventMessage()}
          </span>
          {event.message && (
            <div className="subscription-user-message">
              "{event.message}"
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
