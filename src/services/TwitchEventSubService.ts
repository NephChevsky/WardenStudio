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

  connect(apiClient: ApiClient, broadcasterId: string, userId: string) {
    this.eventSubListener = new EventSubWsListener({ apiClient });

    this.eventSubListener.onChannelChatMessageDelete(
      broadcasterId,
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

    this.eventSubListener.start();
    console.log('EventSub listener started and subscribed to message deletion events');
  }

  onMessageDeleted(callback: (event: MessageDeletedEvent) => void) {
    this.onMessageDeletedCallback = callback;
  }

  disconnect() {
    if (this.eventSubListener) {
      this.eventSubListener.stop();
      this.eventSubListener = null;
    }
  }
}
