import { ChatClient } from '@twurple/chat';
import { StaticAuthProvider, getTokenInfo } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { parseMessageWithEmotes } from '../utils/emoteParser';
import type { MessagePart } from '../utils/emoteParser';

export interface ChatBadge {
  id: string;
  version: string;
  imageUrl: string;
  title: string;
}

export interface ChatMessage {
  id: string;
  username: string;
  displayName: string;
  message: string;
  messageParts: MessagePart[];
  timestamp: Date;
  color?: string;
  badges: ChatBadge[];
  isMod: boolean;
  isSubscriber: boolean;
  isVip: boolean;
  isBroadcaster: boolean;
  isFirstMessage: boolean;
  isReturningChatter: boolean; // User returning after being away
  isHighlighted: boolean; // Message highlighted by sender (paid feature)
  isCheer: boolean; // Message contains bits/cheers
  bits?: number; // Amount of bits if isCheer is true
  isReply: boolean; // Message is a reply to another message
  replyParentMessageId?: string; // ID of message being replied to
  replyParentDisplayName?: string; // Display name of user being replied to
  isRead?: boolean;
}

export class TwitchChatService {
  private chatClient: ChatClient | null = null;
  private apiClient: ApiClient | null = null;
  private onMessageCallback: ((message: ChatMessage) => void) | null = null;
  private channel: string = '';
  private currentUser: { id: string; name: string; displayName: string; color?: string } | null = null;
  private badgeCache: Map<string, string> = new Map();
  private broadcasterId: string = '';

  async connect(channel: string, accessToken: string, clientId: string) {
    this.channel = channel;
    const authProvider = new StaticAuthProvider(clientId, accessToken);
    this.apiClient = new ApiClient({ authProvider });
    
    try {
      // Use Twurple's getTokenInfo to get user ID from token
      const tokenInfo = await getTokenInfo(accessToken, clientId);
      
      if (!tokenInfo.userId) {
        throw new Error('Failed to get user ID from token');
      }
      
      // Get authenticated user info using Twurple API
      const authenticatedUser = await this.apiClient.users.getUserById(tokenInfo.userId);
      
      if (!authenticatedUser) {
        throw new Error('Failed to get user information');
      }
      
      this.currentUser = {
        id: authenticatedUser.id,
        name: authenticatedUser.name,
        displayName: authenticatedUser.displayName,
      };
      
      // Get user's chat color using Twurple API
      const userChatColor = await this.apiClient.chat.getColorForUser(authenticatedUser.id);
      if (userChatColor) {
        this.currentUser.color = userChatColor;
      }
      
      // Get broadcaster info using Twurple API
      const broadcaster = await this.apiClient.users.getUserByName(channel);
      if (broadcaster) {
        this.broadcasterId = broadcaster.id;
      }
      
      // Fetch global badges using Twurple API
      const globalBadges = await this.apiClient.chat.getGlobalBadges();
      for (const badgeSet of globalBadges) {
        for (const version of badgeSet.versions) {
          this.badgeCache.set(`${badgeSet.id}:${version.id}`, version.getImageUrl(1));
        }
      }
      
      // Fetch channel badges using Twurple API
      if (this.broadcasterId) {
        const channelBadges = await this.apiClient.chat.getChannelBadges(this.broadcasterId);
        for (const badgeSet of channelBadges) {
          for (const version of badgeSet.versions) {
            this.badgeCache.set(`${badgeSet.id}:${version.id}`, version.getImageUrl(1));
          }
        }
      }
    } catch (err) {
      console.error('Failed to initialize chat service:', err);
      throw err;
    }
    this.chatClient = new ChatClient({
      authProvider,
      channels: [channel],
      requestMembershipEvents: true,
      isAlwaysMod: false, // This ensures proper echo behavior
    });

    this.chatClient.onMessage((_channel, user, text, msg) => {
      if (this.onMessageCallback) {
        const badges: ChatBadge[] = [];
        // Use Twurple's badge info from message
        msg.userInfo.badges.forEach((version, id) => {
          const badgeKey = `${id}:${version}`;
          const imageUrl = this.badgeCache.get(badgeKey);
          if (imageUrl) {
            badges.push({ 
              id, 
              version,
              imageUrl,
              title: id 
            });
          }
        });

        const chatMessage: ChatMessage = {
          id: msg.id,
          username: user,
          displayName: msg.userInfo.displayName,
          message: text,
          // Use Twurple's emoteOffsets directly
          messageParts: parseMessageWithEmotes(text, msg.emoteOffsets),
          timestamp: new Date(),
          color: msg.userInfo.color,
          badges: badges,
          // Use Twurple's user info flags
          isMod: msg.userInfo.isMod,
          isSubscriber: msg.userInfo.isSubscriber,
          isVip: msg.userInfo.isVip,
          isBroadcaster: msg.userInfo.isBroadcaster,
          isFirstMessage: msg.isFirst ?? false,
          isReturningChatter: msg.isReturningChatter ?? false,
          isHighlighted: msg.isHighlight ?? false,
          isCheer: msg.isCheer ?? false,
          bits: msg.bits,
          isReply: msg.isReply ?? false,
          replyParentMessageId: msg.parentMessageId ?? undefined,
          replyParentDisplayName: msg.parentMessageUserDisplayName ?? undefined,
        };
        this.onMessageCallback(chatMessage);
      }
    });

    await this.chatClient.connect();
  }

  onMessage(callback: (message: ChatMessage) => void) {
    this.onMessageCallback = callback;
  }

  async sendMessage(message: string): Promise<void> {
    if (!this.chatClient || !this.channel || !this.currentUser) return;
    
    // Send the message to Twitch
    await this.chatClient.say(this.channel, message);
    
    // Manually echo the message to ensure it appears
    // This handles cases where Twitch doesn't echo back your own messages
    if (this.onMessageCallback && this.currentUser) {
      // Get user's badges if they're the broadcaster
      const badges: ChatBadge[] = [];
      if (this.currentUser.id === this.broadcasterId) {
        const broadcasterBadge = this.badgeCache.get('broadcaster:1');
        if (broadcasterBadge) {
          badges.push({
            id: 'broadcaster',
            version: '1',
            imageUrl: broadcasterBadge,
            title: 'Broadcaster'
          });
        }
      }
      
      const chatMessage: ChatMessage = {
        id: `self-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        username: this.currentUser.name,
        displayName: this.currentUser.displayName,
        message: message,
        messageParts: parseMessageWithEmotes(message, new Map()),
        timestamp: new Date(),
        color: this.currentUser.color,
        badges: badges,
        isMod: false,
        isSubscriber: false,
        isVip: false,
        isBroadcaster: this.currentUser.id === this.broadcasterId,
        isFirstMessage: false,
        isReturningChatter: false,
        isHighlighted: false,
        isCheer: false,
        isReply: false,
      };
      
      this.onMessageCallback(chatMessage);
    }
  }

  disconnect() {
    if (this.chatClient) {
      this.chatClient.quit();
      this.chatClient = null;
    }
  }
}
