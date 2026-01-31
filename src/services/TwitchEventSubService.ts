import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';

export interface MessageDeletedEvent {
  messageId: string;
  userId: string;
  username: string;
  channelId: string;
}

export interface SubscriptionEvent {
  id: string;
  type: 'sub' | 'resub' | 'gift' | 'community-gift';
  userId: string;
  channelId: string;
  timestamp: Date;
  tier: string;
  message?: string;
  cumulativeMonths?: number;
  streakMonths?: number;
  durationMonths?: number;
  isGift?: boolean;
  gifterUserId?: string;
  amount?: number; // For community gifts
}

export class TwitchEventSubService {
  private eventSubListener: EventSubWsListener | null = null;
  private onMessageDeletedCallback: ((event: MessageDeletedEvent) => void) | null = null;
  private onSubscriptionCallback: ((event: SubscriptionEvent) => void) | null = null;

  connect(apiClient: ApiClient, userId: string) {
    this.eventSubListener = new EventSubWsListener({ apiClient });

    // Subscribe to message deletion events
    this.eventSubListener.onChannelChatMessageDelete(
      userId,
      userId,
      (event) => {
        if (this.onMessageDeletedCallback) {
          this.onMessageDeletedCallback({
            messageId: event.messageId,
            userId: event.userId,
            username: event.userName,
            channelId: event.broadcasterId,
          });
        }
      }
    );

    // Subscribe to new subscription events
    this.eventSubListener.onChannelSubscription(
      userId,
      (event) => {
        if (this.onSubscriptionCallback) {
          this.onSubscriptionCallback({
            id: `sub-${event.userId}-${Date.now()}`,
            type: 'sub',
            userId: event.userId,
            channelId: event.broadcasterId,
            timestamp: new Date(),
            tier: event.tier,
            isGift: event.isGift,
          });
        }
      }
    );

    // Subscribe to resubscription events (with message)
    this.eventSubListener.onChannelSubscriptionMessage(
      userId,
      (event) => {
        if (this.onSubscriptionCallback) {
          this.onSubscriptionCallback({
            id: `resub-${event.userId}-${Date.now()}`,
            type: 'resub',
            userId: event.userId,
            channelId: event.broadcasterId,
            timestamp: new Date(),
            tier: event.tier,
            message: event.messageText,
            cumulativeMonths: event.cumulativeMonths,
            streakMonths: event.streakMonths ?? undefined,
            durationMonths: event.durationMonths,
          });
        }
      }
    );

    // Subscribe to gift subscription events
    this.eventSubListener.onChannelSubscriptionGift(
      userId,
      (event) => {
        if (this.onSubscriptionCallback) {
          // Check if it's a community gift (multiple subs) or single gift
          if (event.amount && event.amount > 1) {
            this.onSubscriptionCallback({
              id: `community-gift-${event.gifterId ?? 'anonymous'}-${Date.now()}`,
              type: 'community-gift',
              userId: event.gifterId ?? 'anonymous',
              channelId: event.broadcasterId,
              timestamp: new Date(),
              tier: event.tier,
              amount: event.amount,
              gifterUserId: event.gifterId ?? undefined,
              isGift: true,
            });
          } else {
            this.onSubscriptionCallback({
              id: `gift-${event.gifterId ?? 'anonymous'}-${Date.now()}`,
              type: 'gift',
              userId: event.gifterId ?? 'anonymous',
              channelId: event.broadcasterId,
              timestamp: new Date(),
              tier: event.tier,
              gifterUserId: event.gifterId ?? undefined,
              isGift: true,
            });
          }
        }
      }
    );

    this.eventSubListener.start();
    console.log('EventSub listener started and subscribed to message deletion and subscription events');
  }

  onMessageDeleted(callback: (event: MessageDeletedEvent) => void) {
    this.onMessageDeletedCallback = callback;
  }

  onSubscription(callback: (event: SubscriptionEvent) => void) {
    this.onSubscriptionCallback = callback;
  }

  disconnect() {
    if (this.eventSubListener) {
      this.eventSubListener.stop();
      this.eventSubListener = null;
    }
  }
}
