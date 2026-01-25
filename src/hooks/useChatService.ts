import { useEffect, useRef } from 'react';
import { TwitchChatService } from '../services/TwitchChatService';
import { TwitchApiService } from '../services/TwitchApiService';
import { TwitchEventSubService } from '../services/TwitchEventSubService';
import type { ChatMessage } from '../services/TwitchChatService';

interface UseChatServiceOptions {
  onMessage: (message: ChatMessage) => void;
  onMessageDeleted?: (messageId: string) => void;
  channel: string;
  accessToken: string;
  clientId: string;
  enabled: boolean;
}

export function useChatService({
  onMessage,
  onMessageDeleted,
  channel,
  accessToken,
  clientId,
  enabled,
}: UseChatServiceOptions) {
  const apiServiceRef = useRef<TwitchApiService>(new TwitchApiService());
  const chatServiceRef = useRef<TwitchChatService>(new TwitchChatService());
  const eventSubServiceRef = useRef<TwitchEventSubService>(new TwitchEventSubService());
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !channel || !accessToken || !clientId) {
      return;
    }

    const apiService = apiServiceRef.current;
    const chatService = chatServiceRef.current;
    const eventSubService = eventSubServiceRef.current;

    // Register message handler only once
    chatService.onMessage(onMessage);

    // Connect to all services
    const connect = async () => {
      try {
        // Initialize API service first
        await apiService.initialize(channel, accessToken, clientId);

        // Get necessary data from API service
        const currentUser = apiService.getCurrentUser();
        const broadcasterId = apiService.getBroadcasterId();

        if (!currentUser || !broadcasterId) {
          throw new Error('Failed to get user or broadcaster info');
        }

        // Initialize chat service (user info now comes from authStore)
        await chatService.connect(
          channel,
          accessToken,
          clientId
        );

        // Initialize EventSub service
        const apiClient = apiService.getApiClient();
        if (apiClient) {
          await eventSubService.connect(apiClient, broadcasterId, currentUser.id);

          // Register message deletion handler if provided
          if (onMessageDeleted) {
            eventSubService.onMessageDeleted((event) => {
              console.log('Message deleted via EventSub:', event);
              onMessageDeleted(event.messageId);
            });
          }
        }

        isConnectedRef.current = true;
      } catch (error) {
        console.error('Failed to connect services:', error);
        isConnectedRef.current = false;
        throw error;
      }
    };

    connect();

    // Cleanup on unmount or dependency change
    return () => {
      if (isConnectedRef.current) {
        eventSubService.disconnect();
        chatService.disconnect();
        isConnectedRef.current = false;
      }
    };
  }, [enabled, channel, accessToken, clientId]); // onMessage intentionally excluded to avoid re-connections

  return {
    apiService: apiServiceRef.current,
    chatService: chatServiceRef.current,
    eventSubService: eventSubServiceRef.current,
    sendMessage: async (message: string) => {
      if (isConnectedRef.current) {
        await chatServiceRef.current.sendMessage(message);
      }
    },
  };
}
