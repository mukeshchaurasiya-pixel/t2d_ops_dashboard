import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuditLog, UserSession } from '../types';

type ViewMode = 'dashboard' | 'admin';

type UseAdminDataArgs = {
  userEmail?: string | null;
  demoMode: boolean;
  viewMode: ViewMode;
};

export function useAdminData({ userEmail, demoMode, viewMode }: UseAdminDataArgs) {
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [userSessions, setUserSessions] = useState<UserSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState<boolean>(false);
  const [globalAuditLogs, setGlobalAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAudits, setLoadingAudits] = useState<boolean>(false);

  const isAdmin = useMemo(() => {
    const emailLower = String(userEmail || '').toLowerCase().trim();
    return emailLower === 'mukesh.chaurasiya@cars24.com' || emailLower === 'chourasiyamukesh008@gmail.com';
  }, [userEmail]);

  const fetchAdminData = useCallback(async () => {
    if (!isAdmin) return;

    setLoadingSessions(true);
    setLoadingAudits(true);

    try {
      const { getUserSessions, getAllAuditLogs } = await import('../lib/supabaseDb');

      const sessionPromise = getUserSessions()
        .then(setUserSessions)
        .catch(err => console.warn(err));

      const auditPromise = getAllAuditLogs()
        .then(setGlobalAuditLogs)
        .catch(err => console.warn(err));

      await Promise.all([sessionPromise, auditPromise]);
    } catch (err) {
      console.warn('Failed to load admin logs:', err);
    } finally {
      setLoadingSessions(false);
      setLoadingAudits(false);
    }
  }, [isAdmin]);

  useEffect(() => {
    if (!userEmail || demoMode) {
      setActiveSessionId(null);
      return;
    }

    let sessionId: string | null = null;
    let heartbeatInterval: ReturnType<typeof setInterval> | null = null;

    const initSession = async () => {
      try {
        const { startUserSession, heartbeatUserSession } = await import('../lib/supabaseDb');
        sessionId = await startUserSession(userEmail);
        setActiveSessionId(sessionId);

        heartbeatInterval = setInterval(async () => {
          if (sessionId) {
            await heartbeatUserSession(sessionId);
          }
        }, 60000);
      } catch (err) {
        console.warn('Could not track user session activity:', err);
      }
    };

    initSession();

    return () => {
      if (heartbeatInterval) {
        clearInterval(heartbeatInterval);
      }
    };
  }, [userEmail, demoMode]);

  useEffect(() => {
    if (viewMode === 'admin' && isAdmin) {
      void fetchAdminData();
    }
  }, [viewMode, isAdmin, fetchAdminData]);

  return {
    isAdmin,
    activeSessionId,
    userSessions,
    loadingSessions,
    globalAuditLogs,
    loadingAudits,
    fetchAdminData,
  };
}
