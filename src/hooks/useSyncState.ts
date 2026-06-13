import { useCallback, useEffect, useState } from 'react';

const LAST_SYNCED_STORAGE_KEY = 'cars24_lastSynced';

function getRelativeTimeString(date: Date | null) {
  if (!date) return 'Never synced';

  const diffMs = Date.now() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffSecs = Math.floor(diffMs / 1000);

  if (diffSecs < 60) {
    return 'Just now';
  }

  if (diffMins < 60) {
    return `Last synced: ${diffMins}m ago`;
  }

  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) {
    return `Last synced: ${diffHours}h ago`;
  }

  return `Last synced: ${date.toLocaleDateString()} ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
}

export function useSyncState() {
  const [lastSynced, setLastSynced] = useState<Date | null>(() => {
    const value = localStorage.getItem(LAST_SYNCED_STORAGE_KEY);
    return value ? new Date(value) : null;
  });
  const [syncStatusText, setSyncStatusText] = useState<string>('Never synced');

  const updateLastSynced = useCallback((date: Date) => {
    setLastSynced(date);
    localStorage.setItem(LAST_SYNCED_STORAGE_KEY, date.toISOString());
  }, []);

  useEffect(() => {
    const updateText = () => {
      setSyncStatusText(getRelativeTimeString(lastSynced));
    };

    updateText();
    const interval = setInterval(updateText, 10000);
    return () => clearInterval(interval);
  }, [lastSynced]);

  return {
    syncStatusText,
    updateLastSynced,
  };
}
