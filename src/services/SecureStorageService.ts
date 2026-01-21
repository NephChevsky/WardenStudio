/**
 * SecureStorageService - Wrapper for secure storage
 * Uses electron-store in Electron environment, fallback to localStorage in browser
 */
export class SecureStorageService {
  private store: any = null;

  constructor() {
    // Check if we're in an Electron environment
    if (window.electron?.store) {
      this.store = window.electron.store;
    }
  }

  async setItem(key: string, value: string): Promise<void> {
    if (this.store) {
      await this.store.set(key, value);
    } else {
      // Fallback to localStorage for web/dev environment
      localStorage.setItem(key, value);
    }
  }

  async getItem(key: string): Promise<string | null> {
    if (this.store) {
      const value = await this.store.get(key);
      return value ?? null;
    } else {
      // Fallback to localStorage for web/dev environment
      return localStorage.getItem(key);
    }
  }

  async removeItem(key: string): Promise<void> {
    if (this.store) {
      await this.store.delete(key);
    } else {
      // Fallback to localStorage for web/dev environment
      localStorage.removeItem(key);
    }
  }

  async hasItem(key: string): Promise<boolean> {
    if (this.store) {
      return await this.store.has(key);
    } else {
      // Fallback to localStorage for web/dev environment
      return localStorage.getItem(key) !== null;
    }
  }
}
