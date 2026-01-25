import { ApiClient } from '@twurple/api';
import { StaticAuthProvider, getTokenInfo } from '@twurple/auth';
import { setBadgeCache } from '../utils/badgeParser';
import { useAuthStore } from '../store/authStore';

export class TwitchApiService {
  private apiClient: ApiClient | null = null;
  private badgeCache: Map<string, string> = new Map();

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

      // Get user's chat color using Twurple API
      const userChatColor = await this.apiClient.chat.getColorForUser(authenticatedUser.id);

      // Store current user in authStore
      useAuthStore.getState().setCurrentUser(
        authenticatedUser.id,
        authenticatedUser.name,
        authenticatedUser.displayName,
        userChatColor ?? undefined
      );

      // Get broadcaster info using Twurple API
      const broadcaster = await this.apiClient.users.getUserByName(channel);
      if (broadcaster) {
        // Store broadcaster ID in authStore
        useAuthStore.getState().setBroadcasterId(broadcaster.id);
      }

      // Fetch global badges using Twurple API
      const globalBadges = await this.apiClient.chat.getGlobalBadges();
      for (const badgeSet of globalBadges) {
        for (const version of badgeSet.versions) {
          this.badgeCache.set(`${badgeSet.id}:${version.id}`, version.getImageUrl(1));
        }
      }

      // Fetch channel badges using Twurple API
      const { broadcasterId } = useAuthStore.getState();
      if (broadcasterId) {
        const channelBadges = await this.apiClient.chat.getChannelBadges(broadcasterId);
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
    return useAuthStore.getState().broadcasterId || '';
  }

  getCurrentUserId(): string | null {
    return useAuthStore.getState().currentUserId;
  }

  getCurrentUser(): { id: string; name: string; displayName: string; color?: string } | null {
    const { currentUserId, currentUserName, currentUserDisplayName, currentUserColor } = useAuthStore.getState();
    if (!currentUserId || !currentUserName) return null;
    return {
      id: currentUserId,
      name: currentUserName,
      displayName: currentUserDisplayName || currentUserName,
      color: currentUserColor
    };
  }

  getBadgeUrl(badgeKey: string): string | null {
    return this.badgeCache.get(badgeKey) || null;
  }

  async getChatters(): Promise<string[]> {
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || !currentUserId) {
      return [];
    }

    try {
      const chatters = await this.apiClient.asUser(currentUserId, async (ctx) => {
        const chattersResponse = await ctx.chat.getChatters(broadcasterId);
        return chattersResponse.data.map(chatter => chatter.userDisplayName);
      });
      return chatters;
    } catch (err) {
      console.error('Failed to fetch chatters:', err);
      return [];
    }
  }

  async getUserSubscriptionInfo(userId: string): Promise<{
    isSubscribed: boolean;
    subscriptionTier: string;
  }> {
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || broadcasterId !== currentUserId) {
      return { isSubscribed: false, subscriptionTier: 'None' };
    }

    let isSubscribed = false;
    let subscriptionTier = 'None';

    try {
      const subscription = await this.apiClient.subscriptions.getSubscriptionForUser(broadcasterId, userId);
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
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || broadcasterId !== currentUserId) {
      return { isBanned: false, isTimedOut: false, timeoutExpiresAt: null };
    }

    let isBanned = false;
    let isTimedOut = false;
    let timeoutExpiresAt: Date | null = null;

    try {
      const bans = await this.apiClient.moderation.getBannedUsers(broadcasterId, { userId });
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
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || broadcasterId !== currentUserId) {
      return [];
    }

    try {
      const vips = await this.apiClient.channels.getVips(broadcasterId);
      return vips.data.map(vip => vip.id);
    } catch (err) {
      console.log('Failed to fetch VIPs:', err);
      return [];
    }
  }

  async getModerators(): Promise<string[]> {
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || broadcasterId !== currentUserId) {
      return [];
    }

    try {
      const mods = await this.apiClient.moderation.getModerators(broadcasterId);
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
    const { broadcasterId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId) {
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
        const follow = await this.apiClient.channels.getChannelFollowers(broadcasterId, user.id);
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
        isBroadcaster: user.id === broadcasterId,
      };
    } catch (err) {
      console.error('Failed to fetch user info:', err);
      return null;
    }
  }

  async timeoutUser(userId: string, duration: number = 600, reason?: string): Promise<boolean> {
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || !currentUserId) {
      console.error('Missing required data:', {
        hasApiClient: !!this.apiClient,
        broadcasterId: broadcasterId,
        currentUserId: currentUserId
      });
      return false;
    }

    try {
      console.log('Attempting timeout:', {
        broadcasterId: broadcasterId,
        moderatorId: currentUserId,
        userId: userId,
        duration
      });

      await this.apiClient.moderation.banUser(
        broadcasterId,
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
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || !currentUserId) {
      return false;
    }

    try {
      await this.apiClient.moderation.banUser(
        broadcasterId,
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
    const { broadcasterId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.unbanUser(broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to unban user:', err);
      return false;
    }
  }

  async addVip(userId: string): Promise<boolean> {
    const { broadcasterId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.channels.addVip(broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to add VIP:', err);
      return false;
    }
  }

  async removeVip(userId: string): Promise<boolean> {
    const { broadcasterId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.channels.removeVip(broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to remove VIP:', err);
      return false;
    }
  }

  async addModerator(userId: string): Promise<boolean> {
    const { broadcasterId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.addModerator(broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to add moderator:', err);
      return false;
    }
  }

  async removeModerator(userId: string): Promise<boolean> {
    const { broadcasterId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId) {
      return false;
    }

    try {
      await this.apiClient.moderation.removeModerator(broadcasterId, userId);
      return true;
    } catch (err) {
      console.error('Failed to remove moderator:', err);
      return false;
    }
  }

  async deleteMessage(messageId: string): Promise<boolean> {
    const { broadcasterId, currentUserId } = useAuthStore.getState();
    if (!this.apiClient || !broadcasterId || !currentUserId) {
      return false;
    }

    try {
      await this.apiClient.moderation.deleteChatMessages(broadcasterId, messageId);
      return true;
    } catch (err) {
      console.error('Failed to delete message:', err);
      return false;
    }
  }
}
