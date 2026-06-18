import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';

// ─── OAuth Popup Handler ──────────────────────────────────────────────────────
// Detect if this tab/window was opened as a popup/child window for Google OAuth
if (window.opener && window.opener !== window) {
  // Let Supabase client automatically parse hashes/params to restore session.
  // Wait a moment for Supabase to initialize, get the session, notify parent, and close.
  import('./lib/supabaseClient').then(({ supabase }) => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        window.opener.postMessage({ type: 'AUTH_COMPLETE', session }, '*');
        setTimeout(() => window.close(), 0);
      } else {
        // If not loaded yet, listen to auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
          if (session) {
            window.opener.postMessage({ type: 'AUTH_COMPLETE', session }, '*');
            setTimeout(() => {
              subscription.unsubscribe();
            }, 0);
            window.close();
          }
        });
        // Safety timeout
        setTimeout(() => {
          subscription.unsubscribe();
          window.close();
        }, 15000);
      }
    });
  });
} else {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}
