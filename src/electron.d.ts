export interface IpcRenderer {
  on(channel: string, listener: (event: any, ...args: any[]) => void): void;
  off(channel: string, listener: (event: any, ...args: any[]) => void): void;
  send(channel: string, ...args: any[]): void;
  invoke(channel: string, ...args: any[]): Promise<any>;
}

export interface SecureStore {
  get(key: string): Promise<any>;
  set(key: string, value: string): Promise<void>;
  delete(key: string): Promise<void>;
  has(key: string): Promise<boolean>;
}

export interface Updater {
  checkForUpdates(): Promise<any>;
  downloadUpdate(): Promise<boolean>;
  installUpdate(): void;
  getAppVersion(): Promise<string>;
  onUpdateAvailable(callback: (info: UpdateInfo) => void): () => void;
  onUpdateProgress(callback: (progress: UpdateProgress) => void): () => void;
  onUpdateDownloaded(callback: () => void): () => void;
  onUpdateError(callback: (error: string) => void): () => void;
}

export interface Viewer {
  id: string;
  username: string;
  displayName: string;
}

export interface Database {
  upsertViewer(id: string, username: string, displayName: string): Promise<void>;
  getViewer(id: string): Promise<Viewer | null>;
  getAllViewers(): Promise<Viewer[]>;
  insertMessage(message: any): Promise<void>;
  findRecentSelfMessage(userId: string, channelId: string, messageText: string, withinMs: number): Promise<{ id: string } | null>;
  updateMessage(oldId: string, updates: any): Promise<void>;
  getRecentMessages(channelId: string, limit?: number): Promise<any[]>;
  getMessagesByUserId(userId: string, channelId: string, limit?: number): Promise<any[]>;
  getMessageCountByUserId(userId: string, channelId: string): Promise<number>;
  markMessageAsDeleted(messageId: string): Promise<void>;
  insertSubscription(subscription: any): Promise<void>;
  getRecentSubscriptions(channelId: string, limit?: number): Promise<any[]>;
}

export interface UpdateInfo {
  version: string;
  releaseNotes?: string;
  releaseDate?: string;
}

export interface UpdateProgress {
  percent: number;
  transferred: number;
  total: number;
  bytesPerSecond: number;
}

declare global {
  interface Window {
    electron?: {
      store: SecureStore;
      database: Database;
      updater: Updater;
      onOAuthCallback: (callback: (url: string) => void) => () => void;
      onMainProcessMessage: (callback: (message: string) => void) => () => void;
    };
  }
}
