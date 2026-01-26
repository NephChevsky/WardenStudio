import { EventSubWsListener } from '@twurple/eventsub-ws';
import { ApiClient } from '@twurple/api';

export interface MessageDeletedEvent {
  messageId: string;
  userId: string;
  username: string;
  channelId: string;
}

export class TwitchEventSubService {
  private eventSubListener: EventSubWsListener | null = null;
  private onMessageDeletedCallback: ((event: MessageDeletedEvent) => void) | null = null;

  /**
   * Initialize EventSub listener and subscribe to message deletion events
   */
  async connect(apiClient: ApiClient, broadcasterId: string, userId: string) {
    // Create EventSub WebSocket listener
    this.eventSubListener = new EventSubWsListener({ apiClient });

    // Subscribe to chat message deletion events
    // This event fires when a message is deleted by a moderator or the broadcaster
    await this.eventSubListener.onChannelChatMessageDelete(
      broadcasterId,
      userId, // The authenticated user (must be a moderator or broadcaster)
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

    // Start the EventSub listener
    await this.eventSubListener.start();
    console.log('EventSub listener started and subscribed to message deletion events');
  }

  /**
   * Register callback for when a message is deleted
   */
  onMessageDeleted(callback: (event: MessageDeletedEvent) => void) {
    this.onMessageDeletedCallback = callback;
  }

  /**
   * Disconnect and cleanup EventSub listener
   */
  async disconnect() {
    if (this.eventSubListener) {
      await this.eventSubListener.stop();
      this.eventSubListener = null;
    }
  }
}
