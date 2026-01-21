import { StaticAuthProvider, getTokenInfo } from '@twurple/auth';
import { ApiClient } from '@twurple/api';
import { SecureStorageService } from './SecureStorageService';

export class TwitchOAuthService {
  private readonly clientId: string;
  private readonly redirectUri: string;
  private readonly scopes = ['chat:read', 'chat:edit', 'user:read:email'];
  private readonly storage: SecureStorageService;
  private readonly STATE_KEY = 'oauth_state';

  constructor(clientId: string, redirectUri?: string) {
    this.clientId = clientId;
    // Twitch requires http/https URLs, so we use localhost for both dev and production
    this.redirectUri = redirectUri || 'http://localhost:3000';
    this.storage = new SecureStorageService();
  }

  /**
   * Generate a cryptographically secure random state parameter
   */
  private generateState(): string {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return Array.from(array, byte => byte.toString(16).padStart(2, '0')).join('');
  }

  async getAuthUrl(): Promise<string> {
    // Generate and store state parameter for CSRF protection
    const state = this.generateState();
    sessionStorage.setItem(this.STATE_KEY, state);

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

  parseTokenFromUrl(urlString: string): string | null {
    try {
      const url = new URL(urlString);
      // Check hash fragment first (implicit flow)
      if (url.hash) {
        const params = new URLSearchParams(url.hash.substring(1));
        
        // Validate state parameter for CSRF protection
        const receivedState = params.get('state');
        const storedState = sessionStorage.getItem(this.STATE_KEY);
        
        if (!receivedState || !storedState || receivedState !== storedState) {
          console.error('OAuth state mismatch - possible CSRF attack');
          sessionStorage.removeItem(this.STATE_KEY);
          return null;
        }
        
        // Clear state after successful validation
        sessionStorage.removeItem(this.STATE_KEY);
        
        return params.get('access_token');
      }
      return null;
    } catch {
      return null;
    }
  }

  saveToken(token: string): void {
    this.storage.setItem('twitch_access_token', token);
  }

  getToken(): string | null {
    return this.storage.getItem('twitch_access_token');
  }

  clearToken(): void {
    this.storage.removeItem('twitch_access_token');
    // Also clear any pending OAuth state
    sessionStorage.removeItem(this.STATE_KEY);
  }

  hasToken(): boolean {
    return this.storage.hasItem('twitch_access_token');
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
