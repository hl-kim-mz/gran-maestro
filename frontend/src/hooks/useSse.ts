import { useState, useEffect, useCallback, useRef } from 'react';

export type SSEStatus = 'connected' | 'disconnected' | 'connecting';

export function useSse(token: string, onEvent: (event: any) => void) {
  const [status, setStatus] = useState<SSEStatus>('disconnected');
  const esRef = useRef<EventSource | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connect = useCallback(() => {
    if (!token) return;

    // 기존 연결 종료
    if (esRef.current) {
      esRef.current.close();
      esRef.current = null;
    }

    setStatus('connecting');
    const url = `/events?token=${token}`;
    const es = new EventSource(url);
    esRef.current = es;

    es.onopen = () => {
      setStatus('connected');
    };

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(data);
      } catch (err) {
        console.error('Failed to parse SSE event:', err);
      }
    };

    es.onerror = () => {
      setStatus('disconnected');
      es.close();
      if (esRef.current === es) {
        esRef.current = null;
      }
      // 재연결 타이머 등록 (중복 방지)
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        timerRef.current = null;
        connect();
      }, 3000);
    };
  }, [token, onEvent]);

  useEffect(() => {
    connect();
    return () => {
      // 재연결 타이머 취소
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      // 현재 EventSource 종료
      if (esRef.current) {
        esRef.current.close();
        esRef.current = null;
      }
    };
  }, [connect]);

  return { status };
}
