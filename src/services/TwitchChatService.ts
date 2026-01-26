import { ChatClient } from '@twurple/chat';
import { StaticAuthProvider } from '@twurple/auth';
import { useAuthStore } from '../store/authStore';

export interface ChatMessage {
  id: string;
  username: string;
  userId: string;
  displayName: string;
  message: string;
  timestamp: Date;
  color?: string;
  badges: string[];
  isFirstMessage: boolean;
  isReturningChatter: boolean; // User returning after being away
  isHighlighted: boolean; // Message highlighted by sender (paid feature)
  bits?: number; // Amount of bits (cheer message)
  replyParentMessageId?: string; // ID of message being replied to
  emoteOffsets?: string; // Serialized emote offset data for parsing
  isRead?: boolean;
  isDeleted?: boolean; // Message has been deleted by user
}

export class TwitchChatService {
  private chatClient: ChatClient | null = null;
  private onMessageCallback: ((message: ChatMessage) => void) | null = null;
  private channel: string = '';
  private userBadges: string[] = [];
  private recentMessageCache = new Map<string, number>(); // messageText -> timestamp
  private readonly CACHE_DURATION = 5000; // 5 seconds

  async connect(
    channel: string, 
    accessToken: string, 
    clientId: string
  ) {
    this.channel = channel;

    const authProvider = new StaticAuthProvider(clientId, accessToken);
    
    this.chatClient = new ChatClient({
      authProvider,
      channels: [channel],
      requestMembershipEvents: true,
      isAlwaysMod: true,
      botLevel: "known"
    });

    this.chatClient.onMessage(async (_channel, user, text, msg) => {
      if (this.onMessageCallback) {
        const { currentUserName } = useAuthStore.getState();
        
        const badges: string[] = [];
        // Use Twurple's badge info from message
        msg.userInfo.badges.forEach((version, id) => {
          badges.push(`${id}:${version}`);
        });
        
        // Store user's own badges for use in sendMessage
        if (user === currentUserName) {
          this.userBadges = badges;
        }

        // Track viewer in database
        if (window.electron?.database && msg.userInfo.userId) {
          try {
            await window.electron.database.upsertViewer(
              msg.userInfo.userId,
              user,
              msg.userInfo.displayName
            );
          } catch (err) {
            console.error('Failed to track viewer:', err);
          }
        }

        const chatMessage: ChatMessage = {
          id: msg.id,
          username: user,
          userId: msg.userInfo.userId,
          displayName: msg.userInfo.displayName,
          message: text,
          timestamp: new Date(),
          color: msg.userInfo.color,
          badges: badges,
          isFirstMessage: msg.isFirst ?? false,
          isReturningChatter: msg.isReturningChatter ?? false,
          isHighlighted: msg.isHighlight ?? false,
          bits: msg.bits,
          replyParentMessageId: msg.parentMessageId ?? undefined,
          emoteOffsets: msg.emoteOffsets && msg.emoteOffsets.size > 0 ? (() => {
            const emoteOffsetsObj: Record<string, string[]> = {};
            msg.emoteOffsets.forEach((positions, id) => {
              emoteOffsetsObj[id] = positions;
            });
            return JSON.stringify(emoteOffsetsObj);
          })() : undefined,
        };

        // Save message to database
        if (window.electron?.database && msg.userInfo.userId) {
          try {
            const { currentUserId, broadcasterId } = useAuthStore.getState();
            let shouldInsert = true;
            
            // Check if this is a message sent by the current user
            if (msg.userInfo.userId === currentUserId) {
              // Use cache to check if we sent this message recently
              const cacheKey = `${msg.userInfo.userId}:${text}`;
              const cachedTime = this.recentMessageCache.get(cacheKey);
              const now = Date.now();
              
              // Only query database if we have a recent cache hit
              if (cachedTime && (now - cachedTime) < this.CACHE_DURATION) {
                // Look for a recent self-sent message that matches
                const recentSelfMessage = await window.electron.database.findRecentSelfMessage(
                  msg.userInfo.userId,
                  broadcasterId || '',
                  text,
                  2000 // within 2 seconds
                );
                
                // Clear from cache
                this.recentMessageCache.delete(cacheKey);
              
                if (recentSelfMessage) {
                // Update the existing message with the real message ID and info
                await window.electron.database.updateMessage(recentSelfMessage.id, {
                  id: msg.id,
                  badges: badges,
                  timestamp: new Date(),
                  isFirstMessage: msg.isFirst ?? false,
                  isReturningChatter: msg.isReturningChatter ?? false,
                  isHighlighted: msg.isHighlight ?? false,
                  bits: msg.bits,
                  replyParentMessageId: msg.parentMessageId ?? undefined,
                  emoteOffsets: chatMessage.emoteOffsets,
                });
                shouldInsert = false;
                }
              }
            }
            
            // Insert message if it's not a duplicate self-message
            if (shouldInsert) {
              const { broadcasterId } = useAuthStore.getState();
              await window.electron.database.insertMessage({
                ...chatMessage,
                userId: msg.userInfo.userId,
                channelId: broadcasterId || '',
                badges: badges,
              });
            }
          } catch (err) {
            console.error('Failed to save message to database:', err);
          }
        }

        this.onMessageCallback(chatMessage);
      }
    });

    this.chatClient.connect();
  }

  onMessage(callback: (message: ChatMessage) => void) {
    this.onMessageCallback = callback;
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.chatClient || !this.channel) return;
    
    const { currentUserId, currentUserName, currentUserDisplayName, currentUserColor, broadcasterId } = useAuthStore.getState();
    
    if (!currentUserId) return;
    
    await this.chatClient.say(this.channel, message);
    
    if (this.onMessageCallback && currentUserId) {
      
      const badges: string[] = [];
      
      if (this.userBadges.length > 0) {
        badges.push(...this.userBadges);
      } else {
        if (currentUserId === broadcasterId) {
          badges.push('broadcaster:1');
        }
      }
      
      const chatMessage: ChatMessage = {
        id: `self-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        username: currentUserName || '',
        userId: currentUserId,
        displayName: currentUserDisplayName || '',
        message: message,
        timestamp: new Date(),
        color: currentUserColor,
        badges: badges,
        isFirstMessage: false,
        isReturningChatter: false,
        isHighlighted: false,
      };
      
      // Add to cache for deduplication
      const cacheKey = `${currentUserId}:${message}`;
      this.recentMessageCache.set(cacheKey, Date.now());
      
      // Clean old cache entries
      for (const [key, timestamp] of this.recentMessageCache.entries()) {
        if (Date.now() - timestamp > this.CACHE_DURATION) {
          this.recentMessageCache.delete(key);
        }
      }

      // Save message to database
      if (window.electron?.database && currentUserId) {
        try {
          await window.electron.database.insertMessage({
            ...chatMessage,
            userId: currentUserId,
            channelId: broadcasterId || '',
            badges: badges,
            emoteOffsets: null // Self-sent messages don't have emotes initially
          });
        } catch (err) {
          console.error('Failed to save sent message to database:', err);
        }
      }
      
      this.onMessageCallback(chatMessage);
    }
  }

  async disconnect() {
    if (this.chatClient) {
      this.chatClient.quit();
      this.chatClient = null;
    }
  }
}
