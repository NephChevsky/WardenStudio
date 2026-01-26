import { create } from 'zustand';
import type { ChatMessage } from '../services/TwitchChatService';

interface ChatStore {
  messages: ChatMessage[];
  messageInput: string;
  isConnected: boolean;
  lastReadMessageId: string | null;
  shouldScrollToBottom: boolean;

  addMessage: (message: ChatMessage) => void;
  setMessages: (messages: ChatMessage[]) => void;
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

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ 
    messages: [], 
    lastReadMessageId: null
  }),

  deleteMessage: (messageId) => set((state) => {
    const newMessages = state.messages.map(msg => 
      msg.id === messageId ? { ...msg, isDeleted: true } : msg
    );

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

      const { broadcasterId } = await import('../store/authStore').then(m => m.useAuthStore.getState());
      if (!broadcasterId) return;

      const dbMessages = await window.electron.database.getRecentMessages(broadcasterId);

      if (dbMessages && dbMessages.length > 0) {
        // Convert database messages to ChatMessage format
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
        
        set({ messages, shouldScrollToBottom: true });
      }

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
    return get().messages.find(msg => msg.id === messageId);
  },
}));
