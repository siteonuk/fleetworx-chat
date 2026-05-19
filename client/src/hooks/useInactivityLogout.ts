import { useEffect, useCallback } from 'react';
import { throttle } from 'lodash';

const LAST_ACTIVITY_KEY = 'lastActivityTimestamp';
const INACTIVITY_LIMIT_MS = 5 * 60 * 60 * 1000;
const THROTTLE_MS = 60 * 1000;

const ACTIVITY_EVENTS: Array<keyof WindowEventMap> = [
  'mousedown',
  'mousemove',
  'keydown',
  'scroll',
  'touchstart',
  'click',
];

export function isInactivityExpired(): boolean {
  const lastActivity = localStorage.getItem(LAST_ACTIVITY_KEY);
  if (!lastActivity) {
    return false;
  }
  return Date.now() - Number(lastActivity) > INACTIVITY_LIMIT_MS;
}

export function clearLastActivity(): void {
  localStorage.removeItem(LAST_ACTIVITY_KEY);
}

export default function useInactivityLogout(
  isAuthenticated: boolean,
  logout: () => void,
) {
  const checkInactivity = useCallback(() => {
    if (isInactivityExpired()) {
      clearLastActivity();
      logout();
      return true;
    }
    return false;
  }, [logout]);

  useEffect(() => {
    if (!isAuthenticated) {
      return;
    }

    if (checkInactivity()) {
      return;
    }

    localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));

    const updateActivity = throttle(() => {
      localStorage.setItem(LAST_ACTIVITY_KEY, String(Date.now()));
    }, THROTTLE_MS);

    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, updateActivity, { passive: true });
    }

    return () => {
      updateActivity.cancel();
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, updateActivity);
      }
    };
  }, [isAuthenticated, checkInactivity]);
}
