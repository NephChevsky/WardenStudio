import { useEffect, useRef } from 'react';
import { TwitchChatService } from '../services/TwitchChatService';
import type { ChatMessage } from '../services/TwitchChatService';

interface UseChatServiceOptions {
  onMessage: (message: ChatMessage) => void;
  channel: string;
  accessToken: string;
  clientId: string;
  enabled: boolean;
}

export function useChatService({
  onMessage,
  channel,
  accessToken,
  clientId,
  enabled,
}: UseChatServiceOptions) {
  const serviceRef = useRef<TwitchChatService>(new TwitchChatService());
  const isConnectedRef = useRef(false);

  useEffect(() => {
    if (!enabled || !channel || !accessToken || !clientId) {
      return;
    }

    const service = serviceRef.current;

    // Register message handler only once
    service.onMessage(onMessage);

    // Connect to chat
    const connect = async () => {
      try {
        await service.connect(channel, accessToken, clientId);
        isConnectedRef.current = true;
      } catch (error) {
        console.error('Failed to connect to chat:', error);
        isConnectedRef.current = false;
        throw error;
      }
    };

    connect();

    // Cleanup on unmount or dependency change
    return () => {
      if (isConnectedRef.current) {
        service.disconnect();
        isConnectedRef.current = false;
      }
    };
  }, [enabled, channel, accessToken, clientId]); // onMessage intentionally excluded to avoid re-connections

  return {
    service: serviceRef.current,
    sendMessage: async (message: string) => {
      if (isConnectedRef.current) {
        await serviceRef.current.sendMessage(message);
      }
    },
  };
}
