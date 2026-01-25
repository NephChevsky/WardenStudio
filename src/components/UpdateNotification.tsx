import { useEffect, useState } from 'react';
import type { UpdateInfo, UpdateProgress } from '../electron';

export function UpdateNotification() {
  const [updateAvailable, setUpdateAvailable] = useState<UpdateInfo | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState<UpdateProgress | null>(null);
  const [readyToInstall, setReadyToInstall] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (!window.electron?.updater) return;

    // Listen for update events using the new secure API
    const cleanupAvailable = window.electron.updater.onUpdateAvailable((info: UpdateInfo) => {
      setUpdateAvailable(info);
      setDismissed(false);
    });

    const cleanupProgress = window.electron.updater.onUpdateProgress((progress: UpdateProgress) => {
      setDownloadProgress(progress);
    });

    const cleanupDownloaded = window.electron.updater.onUpdateDownloaded(() => {
      setDownloading(false);
      setReadyToInstall(true);
      setDownloadProgress(null);
    });

    const cleanupError = window.electron.updater.onUpdateError((errorMessage: string) => {
      setError(errorMessage);
      setDownloading(false);
      setDownloadProgress(null);
    });

    return () => {
      cleanupAvailable();
      cleanupProgress();
      cleanupDownloaded();
      cleanupError();
    };
  }, []);

  const handleDownload = async () => {
    if (!window.electron?.updater) return;
    
    setError(null);
    setDownloading(true);
    const success = await window.electron.updater.downloadUpdate();
    
    if (!success) {
      setDownloading(false);
      setError('Failed to download update');
    }
  };

  const handleInstall = () => {
    if (!window.electron?.updater) return;
    window.electron.updater.installUpdate();
  };

  const handleDismiss = () => {
    setDismissed(true);
    setError(null);
  };

  if (dismissed || (!updateAvailable && !error)) return null;

  return (
    <div style={{
      position: 'fixed',
      top: 20,
      right: 20,
      background: '#0e0e10',
      border: '1px solid #9147ff',
      borderRadius: 8,
      padding: '16px',
      maxWidth: '400px',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.5)',
      zIndex: 9999,
    }}>
      {error ? (
        <div>
          <h3 style={{ margin: '0 0 8px 0', color: '#ff4444', fontSize: '16px' }}>
            ⚠️ Update Error
          </h3>
          <p style={{ color: '#adadb8', margin: '0 0 12px 0', fontSize: '14px' }}>
            {error}
          </p>
          <button
            onClick={handleDismiss}
            style={{
              background: 'transparent',
              color: '#adadb8',
              border: '1px solid #464649',
              borderRadius: 4,
              padding: '6px 12px',
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            Dismiss
          </button>
        </div>
      ) : downloading ? (
        <div>
          <h3 style={{ margin: '0 0 8px 0', color: '#efeff1', fontSize: '16px' }}>
            📥 Downloading Update
          </h3>
          <p style={{ color: '#adadb8', margin: '0 0 8px 0', fontSize: '14px' }}>
            {downloadProgress ? (
              <>
                {downloadProgress.percent.toFixed(1)}% • 
                {(downloadProgress.transferred / 1024 / 1024).toFixed(1)} MB / 
                {(downloadProgress.total / 1024 / 1024).toFixed(1)} MB
              </>
            ) : (
              'Preparing download...'
            )}
          </p>
          <div style={{
            height: 4,
            background: '#18181b',
            borderRadius: 2,
            overflow: 'hidden',
          }}>
            <div style={{
              height: '100%',
              background: '#9147ff',
              width: `${downloadProgress?.percent || 0}%`,
              transition: 'width 0.3s',
            }} />
          </div>
        </div>
      ) : readyToInstall ? (
        <div>
          <h3 style={{ margin: '0 0 8px 0', color: '#efeff1', fontSize: '16px' }}>
            ✅ Update Ready
          </h3>
          <p style={{ color: '#adadb8', margin: '0 0 12px 0', fontSize: '14px' }}>
            Version {updateAvailable?.version} has been downloaded and is ready to install.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleInstall}
              style={{
                background: '#9147ff',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              Restart & Install
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                color: '#adadb8',
                border: '1px solid #464649',
                borderRadius: 4,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Later
            </button>
          </div>
        </div>
      ) : updateAvailable ? (
        <div>
          <h3 style={{ margin: '0 0 8px 0', color: '#efeff1', fontSize: '16px' }}>
            🎉 Update Available
          </h3>
          <p style={{ color: '#adadb8', margin: '0 0 12px 0', fontSize: '14px' }}>
            Version {updateAvailable.version} is available. Download now?
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleDownload}
              style={{
                background: '#9147ff',
                color: '#fff',
                border: 'none',
                borderRadius: 4,
                padding: '8px 16px',
                cursor: 'pointer',
                fontWeight: 600,
                fontSize: '13px',
              }}
            >
              Download Update
            </button>
            <button
              onClick={handleDismiss}
              style={{
                background: 'transparent',
                color: '#adadb8',
                border: '1px solid #464649',
                borderRadius: 4,
                padding: '8px 16px',
                cursor: 'pointer',
                fontSize: '13px',
              }}
            >
              Later
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
