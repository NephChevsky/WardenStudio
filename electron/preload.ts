import { ipcRenderer, contextBridge } from 'electron'
import Store from 'electron-store'

// Get encryption key from environment or use a default for development
const encryptionKey = process.env.VITE_ENCRYPTION_KEY || 'warden-studio-dev-key-replace-in-production'

// Initialize encrypted store
const store = new Store({
  name: 'warden-studio-secure',
  encryptionKey: encryptionKey,
})

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

// Expose secure storage API
contextBridge.exposeInMainWorld('electron', {
  store: {
    get(key: string) {
      return store.get(key) as string | undefined
    },
    set(key: string, value: string) {
      store.set(key, value)
    },
    delete(key: string) {
      store.delete(key)
    },
    has(key: string) {
      return store.has(key)
    },
  },
})
