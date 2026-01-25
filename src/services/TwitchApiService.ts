import { ApiClient } from '@twurple/api';
import { StaticAuthProvider, getTokenInfo } from '@twurple/auth';
import { setBadgeCache } from '../utils/badgeParser';

export class TwitchApiService {
  private apiClient: ApiClient | null = null;
  private currentUser: { id: string; name: string; displayName: string; color?: string } | null = null;
  private badgeCache: Map<string, string> = new Map();
  private broadcasterId: string = '';

  async initialize(channel: string, accessToken: string, clientId: string) {
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

      // Share badge cache with badge parser utility
      setBadgeCache(this.badgeCache);
    } catch (err) {
      console.error('Failed to initialize API service:', err);
      throw err;
    }
  }

  getApiClient(): ApiClient | null {
    return this.apiClient;
  }

  getBroadcasterId(): string {
    return this.broadcasterId;
  }

  getCurrentUserId(): string | null {
    return this.currentUser?.id || null;
  }

  getCurrentUser(): { id: string; name: string; displayName: string; color?: string } | null {
    return this.currentUser;
  }

  getBadgeUrl(badgeKey: string): string | null {
    return this.badgeCache.get(badgeKey) || null;
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

  async getUserSubscriptionInfo(userId: string): Promise<{
    isSubscribed: boolean;
    subscriptionTier: string;
  }> {
    if (!this.apiClient || !this.broadcasterId) {
      return { isSubscribed: false, subscriptionTier: 'None' };
    }

    let isSubscribed = false;
    let subscriptionTier = 'None';

    try {
      const subscription = await this.apiClient.subscriptions.getSubscriptionForUser(this.broadcasterId, userId);
      if (subscription) {
        isSubscribed = true;
        // Get subscription tier (1000 = Tier 1, 2000 = Tier 2, 3000 = Tier 3)
        const tier = subscription.tier;
        subscriptionTier = tier === '3000' ? 'Tier 3' : tier === '2000' ? 'Tier 2' : 'Tier 1';
      }
    } catch (err) {
      // User is not subscribed or we don't have permission to check
      isSubscribed = false;
      subscriptionTier = 'None';
    }

    return { isSubscribed, subscriptionTier };
  }

  async getUserBanInfos(userId: string): Promise<{
    isBanned: boolean;
    isTimedOut: boolean;
    timeoutExpiresAt: Date | null;
  }> {
    if (!this.apiClient || !this.broadcasterId) {
      return { isBanned: false, isTimedOut: false, timeoutExpiresAt: null };
    }

    let isBanned = false;
    let isTimedOut = false;
    let timeoutExpiresAt: Date | null = null;

    try {
      const bans = await this.apiClient.moderation.getBannedUsers(this.broadcasterId, { userId });
      if (bans.data.length > 0) {
        const ban = bans.data[0];
        if (ban.expiryDate) {
          // Has expiry date means it's a timeout
          isTimedOut = ban.expiryDate > new Date();
          timeoutExpiresAt = ban.expiryDate;
        } else {
          // No expiry date means permanent ban
          isBanned = true;
        }
      }
    } catch (err) {
      // User is not banned or we don't have permission to check
      isBanned = false;
      isTimedOut = false;
      timeoutExpiresAt = null;
    }

    return { isBanned, isTimedOut, timeoutExpiresAt };
  }

  async getVips(): Promise<string[]> {
    if (!this.apiClient || !this.broadcasterId) {
      return [];
    }

    try {
      const vips = await this.apiClient.channels.getVips(this.broadcasterId);
      return vips.data.map(vip => vip.id);
    } catch (err) {
      console.log('Failed to fetch VIPs:', err);
      return [];
    }
  }

  async getModerators(): Promise<string[]> {
    if (!this.apiClient || !this.broadcasterId) {
      return [];
    }

    try {
      const mods = await this.apiClient.moderation.getModerators(this.broadcasterId);
      return mods.data.map(mod => mod.userId);
    } catch (err) {
      console.log('Failed to fetch moderators:', err);
      return [];
    }
  }

  async getUserInfo(userId: string): Promise<{
    id: string
    displayName: string
    profileImageUrl: string
    createdAt: Date
    followingSince: Date | null
    isBroadcaster: boolean
  } | null> {
    if (!this.apiClient || !this.broadcasterId) {
      return null;
    }

    try {
      // Get user by username
      const user = await this.apiClient.users.getUserById(userId);
      if (!user) {
        return null;
      }

      // Check follow status
      let followingSince: Date | null = null;
      try {
        const follow = await this.apiClient.channels.getChannelFollowers(this.broadcasterId, user.id);
        if (follow.data.length > 0) {
          followingSince = follow.data[0].followDate;
        }
      } catch (err) {
        console.log('Follow check failed for', userId, ':', err);
      }

      return {
        id: user.id,
        displayName: user.displayName,
        profileImageUrl: user.profilePictureUrl,
        createdAt: user.creationDate,
        followingSince,
        isBroadcaster: user.id === this.broadcasterId,
      };
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      return null;
    }
  }

  async timeoutUser(userId: string, duration: number = 600, reason?: string): Promise<boolean> {
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
        userId: userId,
        duration
      });

      await this.apiClient.moderation.banUser(
        this.broadcasterId,
        {
          user: userId,
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

  async banUser(userId: string, reason?: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId || !this.currentUser) {
      return false;
    }

    try {
      await this.apiClient.moderation.banUser(
        this.broadcasterId,
        {
          user: userId,
          reason: reason || 'Banned by moderator'
        }
      );
      return true;
    } catch (err) {
      console.error('Failed to ban user:', err);
      return false;
    }
  }

  async unbanUser(userId: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.unbanUser(this.broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to unban user:', err);
      return false;
    }
  }

  async addVip(userId: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.channels.addVip(this.broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to add VIP:', err);
      return false;
    }
  }

  async removeVip(userId: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.channels.removeVip(this.broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to remove VIP:', err);
      return false;
    }
  }

  async addModerator(userId: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.addModerator(this.broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to add moderator:', err);
      return false;
    }
  }

  async removeModerator(userId: string): Promise<boolean> {
    if (!this.apiClient || !this.broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.removeModerator(this.broadcasterId, userId);
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
}
