import { autoUpdater } from 'electron-updater';
import { BrowserWindow, ipcMain } from 'electron';
import log from 'electron-log';

/**
 * Setup auto-updater for the application
 * Handles checking for updates, downloading, and notifying the user
 */
export function setupAutoUpdater(mainWindow: BrowserWindow) {
  // Configure logging
  autoUpdater.logger = log;
  log.transports.file.level = 'info';
  log.info('Auto-updater initialized');

  // Configuration
  autoUpdater.autoDownload = false; // Let user decide when to download
  autoUpdater.autoInstallOnAppQuit = true; // Install when app closes

  const CHECK_INTERVAL = 10 * 60 * 1000; // Check every 10 minutes

  // Event: Update available
  autoUpdater.on('update-available', (info) => {
    log.info('Update available:', info.version);
    mainWindow.webContents.send('update-available', {
      version: info.version,
      releaseNotes: info.releaseNotes,
      releaseDate: info.releaseDate,
    });
  });

  // Event: No update available
  autoUpdater.on('update-not-available', (info) => {
    log.info('No updates available. Current version:', info.version);
  });

  // Event: Download progress
  autoUpdater.on('download-progress', (progress) => {
    log.info(`Download progress: ${progress.percent.toFixed(2)}%`);
    mainWindow.webContents.send('update-progress', {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  // Event: Update downloaded
  autoUpdater.on('update-downloaded', (info) => {
    log.info('Update downloaded:', info.version);
    mainWindow.webContents.send('update-downloaded', {
      version: info.version,
    });
  });

  // Event: Error
  autoUpdater.on('error', (error) => {
    log.error('Update error:', error);
    mainWindow.webContents.send('update-error', error.message);
  });

  // IPC Handlers for renderer process
  ipcMain.handle('check-for-updates', async () => {
    if (process.env.NODE_ENV === 'development') {
      log.info('Skipping update check in development mode');
      return null;
    }

    try {
      log.info('Manually checking for updates...');
      const result = await autoUpdater.checkForUpdates();
      return result?.updateInfo || null;
    } catch (error) {
      log.error('Check for updates failed:', error);
      return null;
    }
  });

  ipcMain.handle('download-update', async () => {
    try {
      log.info('Starting update download...');
      await autoUpdater.downloadUpdate();
      return true;
    } catch (error) {
      log.error('Download update failed:', error);
      return false;
    }
  });

  ipcMain.handle('install-update', () => {
    log.info('Installing update and restarting...');
    // false = don't force run after finish, true = restart app
    autoUpdater.quitAndInstall(false, true);
  });

  ipcMain.handle('get-app-version', () => {
    return autoUpdater.currentVersion.version;
  });

  // Check for updates on startup (wait 5s for app to fully load)
  if (process.env.NODE_ENV === 'production') {
    setTimeout(() => {
      log.info('Checking for updates on startup...');
      autoUpdater.checkForUpdates().catch((err) => {
        log.error('Startup update check failed:', err);
      });
    }, 5000);

    // Periodic checks
    setInterval(() => {
      log.info('Periodic update check...');
      autoUpdater.checkForUpdates().catch((err) => {
        log.error('Periodic update check failed:', err);
      });
    }, CHECK_INTERVAL);
  } else {
    log.info('Auto-updater disabled in development mode');
  }
}
