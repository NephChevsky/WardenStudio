import { StaticAuthProvider, getTokenInfo } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { SecureStorageService } from './SecureStorageService';

export class TwitchOAuthService {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly scopes = [
    'chat:read', 
    'chat:edit', 
    'user:read:email',
    'user:read:chat',
    'moderator:read:chatters', 
    'channel:read:subscriptions', 
    'moderator:read:followers',
    'moderation:read',
    'moderator:manage:banned_users',
    'moderator:manage:chat_messages',
    'channel:manage:vips',
    'channel:manage:moderators',
    'moderator:read:chat_messages'
  ];
  private readonly storage: SecureStorageService;
  private readonly STATE_KEY = 'oauth_state';

  constructor(clientId: string, redirectUri?: string) {
    this.clientId = clientId;
    this.redirectUri = redirectUri || 'http://localhost:3000';
    this.storage = new SecureStorageService();
  }

  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async getAuthUrl(): Promise<string> {
    const state = this.generateState();
    await this.storage.setItem(this.STATE_KEY, state);

    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'token',
      scope: this.scopes.join(' '),
      state: state,
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  async openAuthWindow(): Promise<void> {
    const authUrl = await this.getAuthUrl();
    window.open(authUrl, '_blank');
  }

  async parseTokenFromUrl(urlString: string): Promise<string | null> {
    try {
      const url = new URL(urlString);
      if (url.hash) {
        const params = new URLSearchParams(url.hash.substring(1));
        
        const receivedState = params.get('state');
        const storedState = await this.storage.getItem(this.STATE_KEY);
        
        if (!receivedState || !storedState || receivedState !== storedState) {
          console.error('OAuth state mismatch - possible CSRF attack');
          console.log('Received state:', receivedState);
          console.log('Stored state:', storedState);
          await this.storage.removeItem(this.STATE_KEY);
          return null;
        }
        
        await this.storage.removeItem(this.STATE_KEY);
        
        return params.get('access_token');
      }
      return null;
    } catch {
      return null;
    }
  }

  async saveToken(token: string): Promise<void> {
    await this.storage.setItem('twitch_access_token', token);
  }

  async getToken(): Promise<string | null> {
    return await this.storage.getItem('twitch_access_token');
  }

  async clearToken(): Promise<void> {
    await this.storage.removeItem('twitch_access_token');
    // Also clear any pending OAuth state
    await this.storage.removeItem(this.STATE_KEY);
  }

  async hasToken(): Promise<boolean> {
    return await this.storage.hasItem('twitch_access_token');
  }

  async validateToken(): Promise<{ id: string; name: string; displayName: string } | null> {
    const token = await this.getToken();
    if (!token) return null;

    try {
      const tokenInfo = await getTokenInfo(token, this.clientId);
      
      if (!tokenInfo.userId) {
        this.clearToken();
        return null;
      }
      
      const authProvider = new StaticAuthProvider(this.clientId, token);
      const apiClient = new ApiClient({ authProvider });
      
      const user = await apiClient.users.getUserById(tokenInfo.userId);
      
      if (!user) {
        await this.clearToken();
        return null;
      }
      
      return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
      };
    } catch (error) {
      console.error('Token validation failed:', error);
      await this.clearToken();
      return null;
    }
  }
}
