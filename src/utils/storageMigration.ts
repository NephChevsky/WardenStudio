/**
 * Migration utility to move tokens from localStorage to secure storage
 * This should run once on app startup to migrate existing users
 */
export function migrateToSecureStorage(): void {
  // Check if we're in Electron environment with secure storage
  if (!window.electron?.store) {
    console.warn('Secure storage not available, skipping migration');
    return;
  }

  // Check if migration has already been done
  const migrationKey = 'storage_migration_completed';
  if (window.electron.store.has(migrationKey)) {
    return;
  }

  console.log('Migrating to secure storage...');

  // Migrate token
  const oldToken = localStorage.getItem('twitch_access_token');
  if (oldToken) {
    window.electron.store.set('twitch_access_token', oldToken);
    localStorage.removeItem('twitch_access_token');
    console.log('Token migrated to secure storage');
  }

  // Mark migration as complete
  window.electron.store.set(migrationKey, 'true');
  console.log('Migration complete');
}
