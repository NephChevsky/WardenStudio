import { app, BrowserWindow, shell } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:http'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

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
    
    if (token) {
      // This is the token callback from the JavaScript
      res.end('OK')
      
      if (win) {
        const urlWithHash = `http://localhost:3000#access_token=${token}`
        console.log('Received OAuth token, sending to renderer')
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
        '  var token = new URLSearchParams(window.location.hash.substring(1)).get("access_token");' +
        '  console.log("Token:", token);' +
        '  if (token) {' +
        '    fetch("http://localhost:3000?token=" + encodeURIComponent(token))' +
        '      .then(() => {' +
        '        console.log("Sent to app");' +
        '        document.body.innerHTML = "<h1>✓ Success!</h1><p>You can close this window.</p>";' +
        '      })' +
        '      .catch(err => console.error("Failed to send:", err));' +
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
    createOAuthServer()
    createWindow()
  })
}

