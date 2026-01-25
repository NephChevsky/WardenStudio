import { create } from 'zustand';
import type { ChatMessage } from '../services/TwitchChatService';

interface ChatStore {
  messages: ChatMessage[];
  messageInput: string;
  isConnected: boolean;
  readMessageIds: Set<string>;
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
}

export const useChatStore = create<ChatStore>((set) => ({
  messages: [],
  messageInput: '',
  isConnected: false,
  readMessageIds: new Set<string>(),
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
    readMessageIds: new Set() 
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

    const newReadIds = new Set(state.readMessageIds);
    // Mark this message and all messages before it as read
    for (let i = 0; i <= messageIndex; i++) {
      newReadIds.add(state.messages[i].id);
    }

    return { readMessageIds: newReadIds };
  }),

  markAllAsRead: () => set((state) => {
    const newReadIds = new Set(state.messages.map(msg => msg.id));
    return { readMessageIds: newReadIds };
  }),

  setShouldScrollToBottom: (should) => set({ shouldScrollToBottom: should }),

  loadFromDatabase: async () => {
    try {
      // Load messages from database
      if (!window.electron) return;

      const dbMessages = await window.electron.database.getRecentMessages();

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
          isMod: false, // These aren't stored in DB yet
          isSubscriber: false,
          isVip: false,
          isBroadcaster: false,
          isFirstMessage: msg.isFirstMessage || false,
          isReturningChatter: msg.isReturningChatter || false,
          isHighlighted: msg.isHighlighted || false,
          isCheer: msg.isCheer || false,
          bits: msg.bits,
          isReply: msg.isReply || false,
          replyParentMessageId: msg.replyParentMessageId,
          emoteOffsets: msg.emoteOffsets,
        }));
        
        set({ messages, shouldScrollToBottom: true });
      }
    } catch (err) {
      console.error('Failed to load messages from database:', err);
    }
  },
}));
