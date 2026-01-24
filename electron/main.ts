import { app, BrowserWindow, shell, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'
import { setupAutoUpdater } from './updater'
import Store from 'electron-store'
import log from 'electron-log'
import { databaseService } from './database'

// Configure logging
log.transports.file.level = 'info'
log.info('Application starting...')

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Initialize encrypted store in main process
// IMPORTANT: VITE_ENCRYPTION_KEY must be set via environment variable or .env file
// Never use a hardcoded fallback in production!
const encryptionKey = process.env.VITE_ENCRYPTION_KEY
log.info('Encryption key status:', encryptionKey ? 'SET' : 'NOT SET')
if (!encryptionKey) {
  log.error('ERROR: VITE_ENCRYPTION_KEY environment variable is not set!')
  log.error('Available env vars:', Object.keys(process.env).filter(k => k.startsWith('VITE')))
  app.quit()
}
let store: Store
try {
  log.info('Initializing secure store...')
  store = new Store({
    name: 'warden-studio-secure',
    encryptionKey: encryptionKey,
    clearInvalidConfig: true, // Clear corrupted config on startup
  })
  log.info('Secure store initialized successfully')
} catch (error) {
  log.error('Failed to initialize store:', error)
  throw error
}

// Setup IPC handlers for secure storage
ipcMain.handle('store-get', (_event, key: string) => {
  return store.get(key)
})

ipcMain.handle('store-set', (_event, key: string, value: string) => {
  store.set(key, value)
})

ipcMain.handle('store-delete', (_event, key: string) => {
  store.delete(key)
})

ipcMain.handle('store-has', (_event, key: string) => {
  return store.has(key)
})

// Setup IPC handlers for database
ipcMain.handle('db-upsert-viewer', (_event, id: string, username: string, displayName: string) => {
  databaseService.upsertViewer(id, username, displayName)
})

ipcMain.handle('db-get-viewer', (_event, id: string) => {
  return databaseService.getViewer(id)
})

ipcMain.handle('db-get-all-viewers', () => {
  return databaseService.getAllViewers()
})

ipcMain.handle('db-insert-message', (_event, message: any) => {
  databaseService.insertMessage(message)
})

ipcMain.handle('db-find-recent-self-message', (_event, userId: string, messageText: string, withinMs: number) => {
  return databaseService.findRecentSelfMessage(userId, messageText, withinMs)
})

ipcMain.handle('db-update-message', (_event, oldId: string, updates: any) => {
  databaseService.updateMessage(oldId, updates)
})

// The built directory structure
//
// ├─┬─┬ dist
// │ │ └── index.html
// │ │
// │ ├─┬ dist-electron
// │ │ ├── main.js
// │ │ └── preload.js
// │
process.env.DIST = path.join(__dirname, '../dist')
process.env.VITE_PUBLIC = app.isPackaged ? process.env.DIST : path.join(process.env.DIST, '../public')

let win: BrowserWindow | null
let oauthServer: any = null

const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']

// Create a local HTTP server for OAuth callback
function createOAuthServer() {
  oauthServer = createServer((req, res) => {
    // Add CORS headers for any requests
    res.writeHead(200, { 
      'Content-Type': 'text/html',
      'Access-Control-Allow-Origin': '*',
    })
    
    // Check if this is a token submission
    const url = new URL(req.url!, 'http://localhost:3000')
    const token = url.searchParams.get('token')
    const state = url.searchParams.get('state')
    
    if (token && state) {
      // This is the token callback from the JavaScript
      res.end('OK')
      
      if (win) {
        const urlWithHash = `http://localhost:3000#access_token=${token}&state=${state}`
        console.log('Received OAuth token with state, sending to renderer')
        win.webContents.send('oauth-callback', urlWithHash)
        
        if (win.isMinimized()) win.restore()
        win.focus()
      }
    } else {
      // This is the initial OAuth redirect - serve the callback page
      res.end(
        '<!DOCTYPE html>' +
        '<html>' +
        '<head><title>Authentication</title></head>' +
        '<body style="font-family: system-ui; text-align: center; padding: 50px;">' +
        '<h1>✓ Authentication Successful</h1>' +
        '<p>Processing authentication...</p>' +
        '<script>' +
        'console.log("Hash:", window.location.hash);' +
        'if (window.location.hash) {' +
        '  var params = new URLSearchParams(window.location.hash.substring(1));' +
        '  var token = params.get("access_token");' +
        '  var state = params.get("state");' +
        '  console.log("Token:", token ? "present" : "missing");' +
        '  console.log("State:", state ? "present" : "missing");' +
        '  if (token && state) {' +
        '    var urlParams = new URLSearchParams();' +
        '    urlParams.set("token", token);' +
        '    urlParams.set("state", state);' +
        '    fetch("http://localhost:3000?" + urlParams.toString())' +
        '      .then(() => {' +
        '        console.log("Sent to app");' +
        '        document.body.innerHTML = "<h1>Success!</h1><p>You can close this window.</p>";' +
        '      })' +
        '      .catch(err => console.error("Failed to send:", err));' +
        '  } else {' +
        '    document.body.innerHTML = "<h1>✗ Error</h1><p>Authentication failed. Missing required parameters.</p>";' +
        '  }' +
        '}' +
        '</script>' +
        '</body>' +
        '</html>'
      )
    }
  })
  
  oauthServer.listen(3000, 'localhost', () => {
    console.log('OAuth callback server listening on http://localhost:3000')
  })
}

function createWindow() {
  log.info('Creating main window...')
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    title: 'Warden Studio',
    icon: path.join(process.env.VITE_PUBLIC!, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.mjs'),
      nodeIntegration: false,
      contextIsolation: true,
    },
  })

  // Set Content Security Policy
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          // In development, allow vite dev server and inline scripts for HMR
          VITE_DEV_SERVER_URL
            ? "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' wss://irc-ws.chat.twitch.tv https://id.twitch.tv https://api.twitch.tv ws://localhost:*;"
            : "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https: static-cdn.jtvnw.net; connect-src 'self' wss://irc-ws.chat.twitch.tv https://id.twitch.tv https://api.twitch.tv;"
        ]
      }
    })
  })

  // Test active push message to Renderer-process.
  win.webContents.on('did-finish-load', () => {
    win?.webContents.send('main-process-message', (new Date).toLocaleString())
  })

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  if (VITE_DEV_SERVER_URL) {
    win.loadURL(VITE_DEV_SERVER_URL)
    // Only open dev tools in development
    if (process.env.NODE_ENV !== 'production') {
      win.webContents.openDevTools()
    }
  } else {
    win.loadFile(path.join(process.env.DIST!, 'index.html'))
  }

  // Enable F5 to reload the page
  win.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F5') {
      win?.webContents.reload()
      event.preventDefault()
    }
    if (input.key === 'F12') {
      win?.webContents.toggleDevTools()
      event.preventDefault()
    }
  })

  return win
}

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    // Close OAuth server
    if (oauthServer) {
      oauthServer.close()
    }
    // Close database
    databaseService.close()
    app.quit()
    win = null
  }
})

app.on('activate', () => {
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow()
  }
})

// Handle OAuth callback
const gotTheLock = app.requestSingleInstanceLock()

if (!gotTheLock) {
  app.quit()
} else {
  app.on('second-instance', (_event, _commandLine) => {
    // Someone tried to run a second instance, we should focus our window.
    if (win) {
      if (win.isMinimized()) win.restore()
      win.focus()
    }
  })

  app.whenReady().then(() => {
    log.info('App is ready, initializing...')
    try {
      // Initialize database
      databaseService.initialize()
      log.info('Database initialized successfully')
      
      createOAuthServer()
      const window = createWindow()
      
      // Setup auto-updater
      if (window) {
        setupAutoUpdater(window)
      }
      log.info('Application initialized successfully')
    } catch (error) {
      log.error('Failed to initialize application:', error)
      throw error
    }
  }).catch(error => {
    log.error('App ready error:', error)
  })
}

