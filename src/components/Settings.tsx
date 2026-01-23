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
    fontSize,
    readMessageColor,
    setFontSize,
    setReadMessageColor,
    saveSettings,
  } = useSettingsStore()

  const [tempFontSize, setTempFontSize] = useState(fontSize)
  const [tempReadMessageColor, setTempReadMessageColor] = useState(readMessageColor)
  const [originalFontSize, setOriginalFontSize] = useState(fontSize)
  const [originalReadMessageColor, setOriginalReadMessageColor] = useState(readMessageColor)
  const [isInitialized, setIsInitialized] = useState(false)

  // Initialize temp values when opening
  useEffect(() => {
    if (isOpen && !isInitialized) {
      setOriginalFontSize(fontSize)
      setOriginalReadMessageColor(readMessageColor)
      setTempFontSize(fontSize)
      setTempReadMessageColor(readMessageColor)
      setIsInitialized(true)
    } else if (!isOpen && isInitialized) {
      setIsInitialized(false)
    }
  }, [isOpen, fontSize, readMessageColor, isInitialized])

  // Close settings without saving (restore original values)
  const handleClose = () => {
    setFontSize(originalFontSize)
    setReadMessageColor(originalReadMessageColor)
    onClose()
  }

  // Save settings and close panel
  const handleSave = () => {
    setFontSize(tempFontSize)
    setReadMessageColor(tempReadMessageColor)
    saveSettings()
    onClose()
  }

  // Restore default settings
  const handleRestoreDefaults = () => {
    const defaultFontSize = 13
    const defaultReadMessageColor = '#333333'
    setTempFontSize(defaultFontSize)
    setTempReadMessageColor(defaultReadMessageColor)
    setFontSize(defaultFontSize)
    setReadMessageColor(defaultReadMessageColor)
    saveSettings()
    onClose()
  }

  // Update settings immediately for preview
  const handleFontSizeChange = (size: number) => {
    setTempFontSize(size)
    setFontSize(size)
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
            <label htmlFor="font-size" className="setting-label">
              Chat Font Size
            </label>
            <div className="setting-control">
              <input 
                type="range" 
                id="font-size" 
                min="10" 
                max="20" 
                step="1" 
                value={tempFontSize} 
                onChange={(e) => handleFontSizeChange(Number(e.target.value))} 
                className="setting-slider" 
              />
              <span className="setting-value">{tempFontSize}px</span>
            </div>
            <p className="setting-description">
              Adjust the size of chat messages
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
