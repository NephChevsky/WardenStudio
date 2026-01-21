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
  setMessageInput: (input: string) => void;
  setConnected: (connected: boolean) => void;
  markAsRead: (messageId: string) => void;
  markAllAsRead: () => void;
  setShouldScrollToBottom: (should: boolean) => void;
  loadFromLocalStorage: () => void;
  saveToLocalStorage: () => void;
}

const MAX_STORED_MESSAGES = 500;

export const useChatStore = create<ChatStore>((set, get) => ({
  messages: [],
  messageInput: '',
  isConnected: false,
  readMessageIds: new Set<string>(),
  shouldScrollToBottom: false,

  addMessage: (message) => set((state) => {
    // Prevent duplicates
    const isDuplicate = state.messages.some(m => 
      m.id === message.id || 
      (m.username === message.username && 
       m.message === message.message && 
       Math.abs(m.timestamp.getTime() - message.timestamp.getTime()) < 2000)
    );
    
    if (isDuplicate) return state;

    const newMessages = [...state.messages, message];
    
    // Auto-save to localStorage (last 500 messages)
    setTimeout(() => {
      const messagesToSave = newMessages.slice(-MAX_STORED_MESSAGES);
      localStorage.setItem('chatMessages', JSON.stringify(messagesToSave));
    }, 0);

    return { messages: newMessages };
  }),

  setMessages: (messages) => set({ messages }),

  clearMessages: () => set({ 
    messages: [], 
    readMessageIds: new Set() 
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

    // Save to localStorage
    localStorage.setItem('readMessageIds', JSON.stringify(Array.from(newReadIds)));

    return { readMessageIds: newReadIds };
  }),

  markAllAsRead: () => set((state) => {
    const newReadIds = new Set(state.messages.map(msg => msg.id));
    localStorage.setItem('readMessageIds', JSON.stringify(Array.from(newReadIds)));
    return { readMessageIds: newReadIds };
  }),

  setShouldScrollToBottom: (should) => set({ shouldScrollToBottom: should }),

  loadFromLocalStorage: () => {
    try {
      // Load messages
      const savedMessages = localStorage.getItem('chatMessages');
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        const messagesWithDates = parsed.map((msg: any) => ({
          ...msg,
          timestamp: new Date(msg.timestamp),
          badges: msg.badges || [],
          isMod: msg.isMod || false,
          isSubscriber: msg.isSubscriber || false,
          isVip: msg.isVip || false,
          isBroadcaster: msg.isBroadcaster || false,
          isFirstMessage: msg.isFirstMessage || false,
          isReturningChatter: msg.isReturningChatter || false,
          isHighlighted: msg.isHighlighted || false,
          isCheer: msg.isCheer || false,
          isReply: msg.isReply || false,
        }));
        set({ messages: messagesWithDates, shouldScrollToBottom: true });
      }

      // Load read message IDs
      const savedReadIds = localStorage.getItem('readMessageIds');
      if (savedReadIds) {
        const parsed = JSON.parse(savedReadIds);
        set({ readMessageIds: new Set(parsed) });
      }
    } catch (err) {
      console.error('Failed to load saved data:', err);
    }
  },

  saveToLocalStorage: () => {
    const state = get();
    if (state.messages.length > 0) {
      const messagesToSave = state.messages.slice(-MAX_STORED_MESSAGES);
      localStorage.setItem('chatMessages', JSON.stringify(messagesToSave));
    }
    if (state.readMessageIds.size > 0) {
      localStorage.setItem('readMessageIds', JSON.stringify(Array.from(state.readMessageIds)));
    }
  },
}));
