import { useState, useEffect } from 'react'
import { HexColorPicker } from 'react-colorful'
import { useSettingsStore } from '../store/settingsStore'
import './Settings.css'

interface SettingsProps {
  isOpen: boolean
  onClose: () => void
}

export function Settings({ isOpen, onClose }: SettingsProps) {
  const {
    uiFontSize,
    chatFontSize,
    readMessageColor,
    setUiFontSize,
    setChatFontSize,
    setReadMessageColor,
    saveSettings,
  } = useSettingsStore()

  const [tempUiFontSize, setTempUiFontSize] = useState(uiFontSize)
  const [tempChatFontSize, setTempChatFontSize] = useState(chatFontSize)
  const [tempReadMessageColor, setTempReadMessageColor] = useState(readMessageColor)
  const [originalUiFontSize, setOriginalUiFontSize] = useState(uiFontSize)
  const [originalChatFontSize, setOriginalChatFontSize] = useState(chatFontSize)
  const [originalReadMessageColor, setOriginalReadMessageColor] = useState(readMessageColor)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize temp values when opening
  useEffect(() => {
    if (isOpen && !isInitialized) {
      setOriginalUiFontSize(uiFontSize)
      setOriginalChatFontSize(chatFontSize)
      setOriginalReadMessageColor(readMessageColor)
      setTempUiFontSize(uiFontSize)
      setTempChatFontSize(chatFontSize)
      setTempReadMessageColor(readMessageColor)
      setIsInitialized(true)
    } else if (!isOpen && isInitialized) {
      setIsInitialized(false)
    }
  }, [isOpen, uiFontSize, chatFontSize, readMessageColor, isInitialized])

  // Close settings without saving (restore original values)
  const handleClose = () => {
    setUiFontSize(originalUiFontSize)
    setChatFontSize(originalChatFontSize)
    setReadMessageColor(originalReadMessageColor)
    onClose()
  }

  // Save settings and close panel
  const handleSave = () => {
    setUiFontSize(tempUiFontSize)
    setChatFontSize(tempChatFontSize)
    setReadMessageColor(tempReadMessageColor)
    saveSettings()
    onClose()
  }

  // Restore default settings
  const handleRestoreDefaults = () => {
    const defaultUiFontSize = 13
    const defaultChatFontSize = 13
    const defaultReadMessageColor = '#333333'
    setTempUiFontSize(defaultUiFontSize)
    setTempChatFontSize(defaultChatFontSize)
    setTempReadMessageColor(defaultReadMessageColor)
    setUiFontSize(defaultUiFontSize)
    setChatFontSize(defaultChatFontSize)
    setReadMessageColor(defaultReadMessageColor)
    saveSettings()
    onClose()
  }

  // Update settings immediately for preview
  const handleUiFontSizeChange = (size: number) => {
    setTempUiFontSize(size)
    setUiFontSize(size)
  }

  const handleChatFontSizeChange = (size: number) => {
    setTempChatFontSize(size)
    setChatFontSize(size)
  }

  const handleColorChange = (color: string) => {
    setTempReadMessageColor(color)
    setReadMessageColor(color)
  }

  if (!isOpen) return null

  return (
    <>
      <div className="settings-overlay" onClick={handleClose} />
      <div className="settings-panel">
        <div className="settings-header">
          <h2>Settings</h2>
          <button onClick={handleClose} className="close-settings-button">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path d="M8.5 10L4 5.5 5.5 4 10 8.5 14.5 4 16 5.5 11.5 10l4.5 4.5-1.5 1.5-4.5-4.5L5.5 16 4 14.5 8.5 10z"/>
            </svg>
          </button>
        </div>
        <div className="settings-content">
          <div className="setting-group">
            <label htmlFor="ui-font-size" className="setting-label">
              UI Font Size
            </label>
            <div className="setting-control">
              <input 
                type="range" 
                id="ui-font-size" 
                min="10" 
                max="20" 
                step="1" 
                value={tempUiFontSize} 
                onChange={(e) => handleUiFontSizeChange(Number(e.target.value))} 
                className="setting-slider" 
              />
              <span className="setting-value">{tempUiFontSize}px</span>
            </div>
            <p className="setting-description">
              Adjust the font size of UI elements (settings, buttons, etc.)
            </p>
          </div>

          <div className="setting-group">
            <label htmlFor="chat-font-size" className="setting-label">
              Chat Message Font Size
            </label>
            <div className="setting-control">
              <input 
                type="range" 
                id="chat-font-size" 
                min="10" 
                max="20" 
                step="1" 
                value={tempChatFontSize} 
                onChange={(e) => handleChatFontSizeChange(Number(e.target.value))} 
                className="setting-slider" 
              />
              <span className="setting-value">{tempChatFontSize}px</span>
            </div>
            <p className="setting-description">
              Adjust the font size of chat messages
            </p>
          </div>

          <div className="setting-group">
            <label htmlFor="read-message-color" className="setting-label">
              Read Message Highlight Color
            </label>
            <div className="setting-control">
              <HexColorPicker color={tempReadMessageColor} onChange={handleColorChange} />
            </div>
            <p className="setting-description">
              Color for messages you've already read
            </p>
          </div>
          
          <div className="settings-actions">
            <button onClick={handleRestoreDefaults} className="restore-defaults-button">
              Restore Defaults
            </button>
            <button onClick={handleSave} className="save-settings-button">
              Save Settings
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
