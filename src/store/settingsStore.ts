import { create } from 'zustand'

interface SettingsState {
  uiFontSize: number
  chatFontSize: number
  readMessageColor: string
  setUiFontSize: (size: number) => void
  setChatFontSize: (size: number) => void
  setReadMessageColor: (color: string) => void
  loadSettings: () => void
  saveSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  uiFontSize: 13, // Default UI font size in pixels
  chatFontSize: 13, // Default chat message font size in pixels
  readMessageColor: '#333333', // Default read message color (alpha 0.8 is applied when used)
  
  setUiFontSize: (size: number) => set({ uiFontSize: size }),
  setChatFontSize: (size: number) => set({ chatFontSize: size }),
  setReadMessageColor: (color: string) => set({ readMessageColor: color }),
  
  loadSettings: () => {
    const savedSettings = localStorage.getItem('userSettings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        set({ 
          uiFontSize: settings.uiFontSize || settings.fontSize || 13,
          chatFontSize: settings.chatFontSize || settings.fontSize || 13,
          readMessageColor: settings.readMessageColor || '#333333'
        })
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }
  },
  
  saveSettings: () => {
    const { uiFontSize, chatFontSize, readMessageColor } = get()
    const settings = { uiFontSize, chatFontSize, readMessageColor }
    localStorage.setItem('userSettings', JSON.stringify(settings))
  },
}))
