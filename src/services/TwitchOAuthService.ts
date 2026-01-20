import { StaticAuthProvider, getTokenInfo } from '@twurple/auth';
import { ApiClient } from '@twurple/api';

export class TwitchOAuthService {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly scopes = ['chat:read', 'chat:edit', 'user:read:email'];

  constructor(clientId: string, redirectUri: string) {
    this.clientId = clientId;
    this.redirectUri = redirectUri;
  }

  getAuthUrl(): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.redirectUri,
      response_type: 'token',
      scope: this.scopes.join(' '),
    });

    return `https://id.twitch.tv/oauth2/authorize?${params.toString()}`;
  }

  parseTokenFromHash(hash: string): string | null {
    const params = new URLSearchParams(hash.substring(1));
    return params.get('access_token');
  }

  saveToken(token: string): void {
    localStorage.setItem('twitch_access_token', token);
  }

  getToken(): string | null {
    return localStorage.getItem('twitch_access_token');
  }

  clearToken(): void {
    localStorage.removeItem('twitch_access_token');
  }

  hasToken(): boolean {
    return this.getToken() !== null;
  }

  /**
   * Validates the current token using Twurple's getTokenInfo
   * Returns the authenticated user if valid, null otherwise
   */
  async validateToken(): Promise<{ id: string; name: string; displayName: string } | null> {
    const token = this.getToken();
    if (!token) return null;

    try {
      // Use Twurple's getTokenInfo to validate token and get user ID
      const tokenInfo = await getTokenInfo(token, this.clientId);
      
      if (!tokenInfo.userId) {
        this.clearToken();
        return null;
      }
      
      const authProvider = new StaticAuthProvider(this.clientId, token);
      const apiClient = new ApiClient({ authProvider });
      
      // Get full user data using the user ID from token
      const user = await apiClient.users.getUserById(tokenInfo.userId);
      
      if (!user) {
        this.clearToken();
        return null;
      }
      
      return {
        id: user.id,
        name: user.name,
        displayName: user.displayName,
      };
    } catch (error) {
      // Token is invalid or expired
      console.error('Token validation failed:', error);
      this.clearToken();
      return null;
    }
  }
}
