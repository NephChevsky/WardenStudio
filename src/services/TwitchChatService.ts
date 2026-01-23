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
  replyParentMessage?: string; // Text of the message being replied to
  isRead?: boolean;
  isDeleted?: boolean; // Message has been deleted by user
}

export class TwitchChatService {
  private chatClient: ChatClient | null = null;
  private apiClient: ApiClient | null = null;
  private onMessageCallback: ((message: ChatMessage) => void) | null = null;
  private channel: string = '';
  private currentUser: { id: string; name: string; displayName: string; color?: string } | null = null;
  private badgeCache: Map<string, string> = new Map();
  private broadcasterId: string = '';
  private userBadges: ChatBadge[] = [];

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
      isAlwaysMod: true,
      botLevel: "known"
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
        
        // Store user's own badges for use in sendMessage
        if (this.currentUser && user === this.currentUser.name) {
          this.userBadges = badges;
        }

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
          replyParentMessage: msg.parentMessageText ?? undefined,
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
    
    await this.chatClient.say(this.channel, message);
    
    if (this.onMessageCallback && this.currentUser) {
      
      const badges: ChatBadge[] = [];
      
      if (this.userBadges.length > 0) {
        badges.push(...this.userBadges);
      } else {
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

  async getChatters(): Promise<string[]> {
    if (!this.apiClient || !this.broadcasterId) {
      return [];
    }

    try {
      const chattersResponse = await this.apiClient.chat.getChatters(this.broadcasterId);
      return chattersResponse.data.map(chatter => chatter.userDisplayName);
    } catch (err) {
      console.error('Failed to fetch chatters:', err);
      return [];
    }
  }

  async getUserInfo(username: string): Promise<{
    id: string
    displayName: string
    profileImageUrl: string
    createdAt: Date
    isSubscribed: boolean
    subscriptionMonths: number
    subscriptionTier: string
    followingSince: Date | null
    isVip: boolean
    isMod: boolean
    isBanned: boolean
    isTimedOut: boolean
  } | null> {
    if (!this.apiClient || !this.broadcasterId) {
      return null;
    }
    try {
      // Get user by username
      const user = await this.apiClient.users.getUserByName(username);
      if (!user) {
        return null;
      }

      // Check subscription status
      let isSubscribed = false;
      let subscriptionMonths = 0;
      let subscriptionTier = 'None';

      try {
        const subscription = await this.apiClient.subscriptions.getSubscriptionForUser(this.broadcasterId, user.id);
        console.log('Subscription data for', username, ':', subscription);
        if (subscription) {
          isSubscribed = true;
          // Get cumulative months if available
          subscriptionMonths = 1;
          // Get subscription tier (1000 = Tier 1, 2000 = Tier 2, 3000 = Tier 3)
          const tier = subscription.tier;
          subscriptionTier = tier === '3000' ? 'Tier 3' : tier === '2000' ? 'Tier 2' : 'Tier 1';
        }
      } catch (err) {
        // User is not subscribed or we don't have permission to check
        console.log('Subscription check failed for', username, ':', err);
        isSubscribed = false;
        subscriptionMonths = 0;
        subscriptionTier = 'None';
      }

      // Check follow status
      let followingSince: Date | null = null;
      try {
        const follow = await this.apiClient.channels.getChannelFollowers(this.broadcasterId, user.id);
        if (follow.data.length > 0) {
          followingSince = follow.data[0].followDate;
        }
      } catch (err) {
        console.log('Follow check failed for', username, ':', err);
      }

      // Check VIP status
      let isVip = false;
      try {
        const vips = await this.apiClient.channels.getVips(this.broadcasterId);
        isVip = vips.data.some(vip => vip.id === user.id);
      } catch (err) {
        console.log('VIP check failed for', username, ':', err);
      }

      // Check mod status
      let isMod = false;
      try {
        const mods = await this.apiClient.moderation.getModerators(this.broadcasterId);
        isMod = mods.data.some(mod => mod.userId === user.id);
      } catch (err) {
        console.log('Mod check failed for', username, ':', err);
      }

      // Check ban/timeout status
      let isBanned = false;
      let isTimedOut = false;
      try {
        const bans = await this.apiClient.moderation.getBannedUsers(this.broadcasterId, { userId: user.id });
        if (bans.data.length > 0) {
          const ban = bans.data[0];
          if (ban.expiryDate) {
            // Has expiry date means it's a timeout
            isTimedOut = ban.expiryDate > new Date();
          } else {
            // No expiry date means permanent ban
            isBanned = true;
          }
        }
      } catch (err) {
        console.log('Ban check failed for', username, ':', err);
      }

      return {
        id: user.id,
        displayName: user.displayName,
        profileImageUrl: user.profilePictureUrl,
        createdAt: user.creationDate,
        isSubscribed,
        subscriptionMonths,
        subscriptionTier,
        followingSince,
        isVip,
        isMod,
        isBanned,
        isTimedOut
      };
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      return null;
    }
  }

  async timeoutUser(id: string, duration: number = 600, reason?: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId || !this.currentUser) {
      console.error('Missing required data:', { 
        hasApiClient: !!this.apiClient, 
        broadcasterId: this.broadcasterId,
        currentUser: this.currentUser 
      });
      return false;
    }

    try {
        console.log('Attempting timeout:', {
        broadcasterId: this.broadcasterId,
        moderatorId: this.currentUser.id,
        userId: id,
        duration
      });

      await this.apiClient.moderation.banUser(
        this.broadcasterId,
        {
          user: id,
          duration,
          reason: reason || `Timed out for ${duration} seconds`
        }
      );
      return true;
    } catch (err) {
      console.error('Failed to timeout user:', err);
      return false;
    }
  }

  async banUser(id: string, reason?: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId || !this.currentUser) {
      return false;
    }

    try {
      await this.apiClient.moderation.banUser(
        this.broadcasterId,
        {
          user: id,
          reason: reason || 'Banned by moderator'
        }
      );
      return true;
    } catch (err) {
      console.error('Failed to ban user:', err);
      return false;
    }
  }

  async unbanUser(id: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.unbanUser(this.broadcasterId, id);
      return true;
    } catch (err) {
      console.error('Failed to unban user:', err);
      return false;
    }
  }

  async addVip(id: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.channels.addVip(this.broadcasterId, id);
      return true;
    } catch (err) {
      console.error('Failed to add VIP:', err);
      return false;
    }
  }

  async removeVip(id: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.channels.removeVip(this.broadcasterId, id);
      return true;
    } catch (err) {
      console.error('Failed to remove VIP:', err);
      return false;
    }
  }

  async addModerator(id: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.addModerator(this.broadcasterId, id);
      return true;
    } catch (err) {
      console.error('Failed to add moderator:', err);
      return false;
    }
  }

  async removeModerator(id: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.removeModerator(this.broadcasterId, id);
      return true;
    } catch (err) {
      console.error('Failed to remove moderator:', err);
      return false;
    }
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId || !this.currentUser) {
      return false;
    }

    try {
      await this.apiClient.moderation.deleteChatMessages(this.broadcasterId, messageId);
      return true;
    } catch (err) {
      console.error('Failed to delete message:', err);
      return false;
    }
  }

  disconnect() {
    if (this.chatClient) {
      this.chatClient.quit();
      this.chatClient = null;
    }
  }
}
