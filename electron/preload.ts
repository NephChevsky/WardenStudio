import { ipcRenderer, contextBridge } from 'electron'

// --------- Expose some API to the Renderer process ---------
contextBridge.exposeInMainWorld('ipcRenderer', {
  on(...args: Parameters<typeof ipcRenderer.on>) {
    const [channel, listener] = args
    return ipcRenderer.on(channel, (event, ...args) => listener(event, ...args))
  },
  off(...args: Parameters<typeof ipcRenderer.off>) {
    const [channel, ...omit] = args
    return ipcRenderer.off(channel, ...omit)
  },
  send(...args: Parameters<typeof ipcRenderer.send>) {
    const [channel, ...omit] = args
    return ipcRenderer.send(channel, ...omit)
  },
  invoke(...args: Parameters<typeof ipcRenderer.invoke>) {
    const [channel, ...omit] = args
    return ipcRenderer.invoke(channel, ...omit)
  },
})

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
    findRecentSelfMessage(userId: string, messageText: string, withinMs: number) {
      return ipcRenderer.invoke('db-find-recent-self-message', userId, messageText, withinMs)
    },
    updateMessage(oldId: string, updates: any) {
      return ipcRenderer.invoke('db-update-message', oldId, updates)
    },
    getRecentMessages(limit: number) {
      return ipcRenderer.invoke('db-get-recent-messages', limit)
    },
    getMessagesByUserId(userId: string, limit: number) {
      return ipcRenderer.invoke('db-get-messages-by-user-id', userId, limit)
    },
    getMessageCountByUserId(userId: string) {
      return ipcRenderer.invoke('db-get-message-count-by-user-id', userId)
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
  },
})
