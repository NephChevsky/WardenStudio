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

  setItem(key: string, value: string): void {
    if (this.store) {
      this.store.set(key, value);
    } else {
      // Fallback to localStorage for web/dev environment
      localStorage.setItem(key, value);
    }
  }

  getItem(key: string): string | null {
    if (this.store) {
      return this.store.get(key) ?? null;
    } else {
      // Fallback to localStorage for web/dev environment
      return localStorage.getItem(key);
    }
  }

  removeItem(key: string): void {
    if (this.store) {
      this.store.delete(key);
    } else {
      // Fallback to localStorage for web/dev environment
      localStorage.removeItem(key);
    }
  }

  hasItem(key: string): boolean {
    if (this.store) {
      return this.store.has(key);
    } else {
      // Fallback to localStorage for web/dev environment
      return localStorage.getItem(key) !== null;
    }
  }
}
