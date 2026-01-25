import { ipcRenderer, contextBridge } from 'electron'

// Whitelist of allowed IPC channels for security
const ALLOWED_CHANNELS = {
  // OAuth channels
  OAUTH_CALLBACK: 'oauth-callback',
  // Main process message
  MAIN_PROCESS_MESSAGE: 'main-process-message',
  // Updater channels
  UPDATE_AVAILABLE: 'update-available',
  UPDATE_PROGRESS: 'update-progress',
  UPDATE_DOWNLOADED: 'update-downloaded',
  UPDATE_ERROR: 'update-error',
} as const

// --------- Expose specific APIs to the Renderer process ---------
// Note: We expose only specific, whitelisted methods instead of the entire ipcRenderer
// to prevent arbitrary IPC calls which could be a security vulnerability

// Expose secure storage API via IPC to main process
contextBridge.exposeInMainWorld('electron', {
  store: {
    get(key: string) {
      return ipcRenderer.invoke('store-get', key)
    },
    set(key: string, value: string) {
      return ipcRenderer.invoke('store-set', key, value)
    },
    delete(key: string) {
      return ipcRenderer.invoke('store-delete', key)
    },
    has(key: string) {
      return ipcRenderer.invoke('store-has', key)
    },
  },
  // Database API
  database: {
    upsertViewer(id: string, username: string, displayName: string) {
      return ipcRenderer.invoke('db-upsert-viewer', id, username, displayName)
    },
    getViewer(id: string) {
      return ipcRenderer.invoke('db-get-viewer', id)
    },
    getAllViewers() {
      return ipcRenderer.invoke('db-get-all-viewers')
    },
    insertMessage(message: any) {
      return ipcRenderer.invoke('db-insert-message', message)
    },
    findRecentSelfMessage(userId: string, channelId: string, messageText: string, withinMs: number) {
      return ipcRenderer.invoke('db-find-recent-self-message', userId, channelId, messageText, withinMs)
    },
    updateMessage(oldId: string, updates: any) {
      return ipcRenderer.invoke('db-update-message', oldId, updates)
    },
    getRecentMessages(channelId: string, limit?: number) {
      return ipcRenderer.invoke('db-get-recent-messages', channelId, limit)
    },
    getMessagesByUserId(userId: string, channelId: string, limit?: number) {
      return ipcRenderer.invoke('db-get-messages-by-user-id', userId, channelId, limit)
    },
    getMessageCountByUserId(userId: string, channelId: string) {
      return ipcRenderer.invoke('db-get-message-count-by-user-id', userId, channelId)
    },
    markMessageAsDeleted(messageId: string) {
      return ipcRenderer.invoke('db-mark-message-deleted', messageId)
    },
  },
  // Auto-updater API
  updater: {
    checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
    downloadUpdate: () => ipcRenderer.invoke('download-update'),
    installUpdate: () => ipcRenderer.invoke('install-update'),
    getAppVersion: () => ipcRenderer.invoke('get-app-version'),
    onUpdateAvailable: (callback: (info: any) => void) => {
      const listener = (_event: any, info: any) => callback(info)
      ipcRenderer.on(ALLOWED_CHANNELS.UPDATE_AVAILABLE, listener)
      return () => ipcRenderer.removeListener(ALLOWED_CHANNELS.UPDATE_AVAILABLE, listener)
    },
    onUpdateProgress: (callback: (progress: any) => void) => {
      const listener = (_event: any, progress: any) => callback(progress)
      ipcRenderer.on(ALLOWED_CHANNELS.UPDATE_PROGRESS, listener)
      return () => ipcRenderer.removeListener(ALLOWED_CHANNELS.UPDATE_PROGRESS, listener)
    },
    onUpdateDownloaded: (callback: () => void) => {
      const listener = () => callback()
      ipcRenderer.on(ALLOWED_CHANNELS.UPDATE_DOWNLOADED, listener)
      return () => ipcRenderer.removeListener(ALLOWED_CHANNELS.UPDATE_DOWNLOADED, listener)
    },
    onUpdateError: (callback: (error: string) => void) => {
      const listener = (_event: any, error: string) => callback(error)
      ipcRenderer.on(ALLOWED_CHANNELS.UPDATE_ERROR, listener)
      return () => ipcRenderer.removeListener(ALLOWED_CHANNELS.UPDATE_ERROR, listener)
    },
  },
  // OAuth callback listener
  onOAuthCallback: (callback: (url: string) => void) => {
    const listener = (_event: any, url: string) => callback(url)
    ipcRenderer.on(ALLOWED_CHANNELS.OAUTH_CALLBACK, listener)
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(ALLOWED_CHANNELS.OAUTH_CALLBACK, listener)
    }
  },
  // Main process message listener
  onMainProcessMessage: (callback: (message: string) => void) => {
    const listener = (_event: any, message: string) => callback(message)
    ipcRenderer.on(ALLOWED_CHANNELS.MAIN_PROCESS_MESSAGE, listener)
    // Return cleanup function
    return () => {
      ipcRenderer.removeListener(ALLOWED_CHANNELS.MAIN_PROCESS_MESSAGE, listener)
    }
  },
})
