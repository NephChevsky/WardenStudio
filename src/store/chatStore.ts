import { create } from 'zustand';
import type { ChatMessage } from '../services/TwitchChatService';
import type { SubscriptionEvent } from '../services/TwitchEventSubService';

export type ChatItem = ChatMessage | SubscriptionEvent;

// Type guard to check if item is a ChatMessage
export function isChatMessage(item: ChatItem): item is ChatMessage {
  return 'message' in item && 'displayName' in item;
}

// Type guard to check if item is a SubscriptionEvent
export function isSubscriptionEvent(item: ChatItem): item is SubscriptionEvent {
  return 'type' in item && ('sub' === item.type || 'resub' === item.type || 'gift' === item.type || 'community-gift' === item.type);
}

interface ChatStore {
  messages: ChatItem[];
  messageInput: string;
  isConnected: boolean;
  lastReadMessageId: string | null;
  shouldScrollToBottom: boolean;

  addMessage: (message: ChatMessage) => void;
  addSubscription: (subscription: SubscriptionEvent) => void;
  setMessages: (messages: ChatItem[]) => void;
  clearMessages: () => void;
  deleteMessage: (messageId: string) => void;
  setMessageInput: (input: string) => void;
  setConnected: (connected: boolean) => void;
  markAsRead: (messageId: string) => void;
  markAllAsRead: () => void;
  setShouldScrollToBottom: (should: boolean) => void;
  loadFromDatabase: () => void;
  getMessageById: (messageId: string) => ChatMessage | undefined;
}

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  messageInput: '',
  isConnected: false,
  lastReadMessageId: null,
  shouldScrollToBottom: false,

  addMessage: (message) => set((state) => {
    // Check for exact ID duplicate
    const exactDuplicate = state.messages.find(m => m.id === message.id);
    if (exactDuplicate) return state;
    
    // Check if this is an echoed message from the current user (replacing a self- message)
    // This happens when Twitch echoes back the message we sent
    const isSelfMessage = message.id.startsWith('self-');
    if (!isSelfMessage) {
      // Look for a recent self- message from same user with same content
      const selfMessageIndex = state.messages.findIndex(m => 
        isChatMessage(m) &&
        m.id.startsWith('self-') &&
        m.username === message.username &&
        m.message === message.message &&
        Math.abs(m.timestamp.getTime() - message.timestamp.getTime()) < 5000
      );
      
      if (selfMessageIndex !== -1) {
        // Replace the self- message with the real one from Twitch (has badges, etc.)
        const newMessages = [...state.messages];
        newMessages[selfMessageIndex] = message;
        
        return { messages: newMessages };
      }
    }

    const newMessages = [...state.messages, message];

    return { messages: newMessages };
  }),

  addSubscription: (subscription) => set((state) => {
    // Check for exact ID duplicate
    const exactDuplicate = state.messages.find(m => m.id === subscription.id);
    if (exactDuplicate) return state;

    const newMessages = [...state.messages, subscription];
    return { messages: newMessages };
  }),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ 
    messages: [], 
    lastReadMessageId: null
  }),

  deleteMessage: (messageId) => set((state) => {
    const newMessages = state.messages.map(item => {
      if (isChatMessage(item) && item.id === messageId) {
        return { ...item, isDeleted: true };
      }
      return item;
    });

    return { messages: newMessages };
  }),

  setMessageInput: (input) => set({ messageInput: input }),

  setConnected: (connected) => set({ isConnected: connected }),

  markAsRead: (messageId) => set((state) => {
    const messageIndex = state.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex === -1) return state;

    // Save to localStorage
    localStorage.setItem('lastReadMessageId', messageId);

    return { lastReadMessageId: messageId };
  }),

  markAllAsRead: () => set((state) => {
    if (state.messages.length === 0) return state;
    
    const lastMessageId = state.messages[state.messages.length - 1].id;
    // Save to localStorage
    localStorage.setItem('lastReadMessageId', lastMessageId);
    return { lastReadMessageId: lastMessageId };
  }),

  setShouldScrollToBottom: (should) => set({ shouldScrollToBottom: should }),

  loadFromDatabase: async () => {
    try {
      // Load messages from database
      if (!window.electron) return;

      const { currentUserId } = await import('../store/authStore').then(m => m.useAuthStore.getState());
      if (!currentUserId) return;

      const [dbMessages, dbSubscriptions] = await Promise.all([
        window.electron.database.getRecentMessages(currentUserId),
        window.electron.database.getRecentSubscriptions(currentUserId)
      ]);

      const items: ChatItem[] = [];

      // Convert database messages to ChatMessage format
      if (dbMessages && dbMessages.length > 0) {
        const messages = dbMessages.map((msg: any) => ({
          id: msg.id,
          userId: msg.userId,
          username: msg.username,
          displayName: msg.displayName,
          message: msg.message,
          timestamp: new Date(msg.timestamp),
          color: msg.color,
          badges: msg.badges || [],
          isFirstMessage: msg.isFirstMessage || false,
          isReturningChatter: msg.isReturningChatter || false,
          isHighlighted: msg.isHighlighted || false,
          bits: msg.bits,
          replyParentMessageId: msg.replyParentMessageId,
          emoteOffsets: msg.emoteOffsets,
          isDeleted: msg.isDeleted || false,
        }));
        items.push(...messages);
      }

      // Convert database subscriptions to SubscriptionEvent format
      if (dbSubscriptions && dbSubscriptions.length > 0) {
        const subscriptions = dbSubscriptions.map((sub: any) => ({
          id: sub.id,
          type: sub.type,
          userId: sub.userId,
          channelId: sub.channelId,
          timestamp: new Date(sub.timestamp),
          tier: sub.tier,
          message: sub.message,
          cumulativeMonths: sub.cumulativeMonths,
          streakMonths: sub.streakMonths,
          durationMonths: sub.durationMonths,
          isGift: sub.isGift,
          gifterUserId: sub.gifterUserId,
          amount: sub.amount,
        }));
        items.push(...subscriptions);
      }

      // Sort by timestamp
      items.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
      
      set({ messages: items, shouldScrollToBottom: true });

      // Load read message IDs from localStorage
      const savedLastReadId = localStorage.getItem('lastReadMessageId');
      if (savedLastReadId) {
        set({ lastReadMessageId: savedLastReadId });
      }
    } catch (err) {
      console.error('Failed to load messages from database:', err);
    }
  },

  getMessageById: (messageId) => {
    const item = get().messages.find(item => item.id === messageId);
    if (item && isChatMessage(item)) {
      return item;
    }
    return undefined;
  },
}));
