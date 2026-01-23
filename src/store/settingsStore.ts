import { create } from 'zustand'

interface SettingsState {
  fontSize: number
  readMessageColor: string
  setFontSize: (size: number) => void
  setReadMessageColor: (color: string) => void
  loadSettings: () => void
  saveSettings: () => void
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  fontSize: 13, // Default font size in pixels (0.8125rem = 13px)
  readMessageColor: '#333333', // Default read message color (alpha 0.8 is applied when used)
  
  setFontSize: (size: number) => set({ fontSize: size }),
  setReadMessageColor: (color: string) => set({ readMessageColor: color }),
  
  loadSettings: () => {
    const savedSettings = localStorage.getItem('userSettings')
    if (savedSettings) {
      try {
        const settings = JSON.parse(savedSettings)
        set({ 
          fontSize: settings.fontSize || 13,
          readMessageColor: settings.readMessageColor || '#333333'
        })
      } catch (error) {
        console.error('Error loading settings:', error)
      }
    }
  },
  
  saveSettings: () => {
    const { fontSize, readMessageColor } = get()
    const settings = { fontSize, readMessageColor }
    localStorage.setItem('userSettings', JSON.stringify(settings))
  },
}))
