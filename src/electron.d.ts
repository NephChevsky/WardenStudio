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
    ipcRenderer?: IpcRenderer;
    electron?: {
      store: SecureStore;
      updater: Updater;
    };
  }
}
