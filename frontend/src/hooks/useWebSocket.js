import { useState, useEffect, useRef, useCallback } from 'react';

// Use environment variable for production, proxy for development
const WS_URL = import.meta.env.VITE_API_URL
  ? `${import.meta.env.VITE_API_URL.replace('http://', 'ws://').replace('https://', 'wss://')}/ws`
  : `ws://${window.location.host}/ws`;
const MAX_BACKOFF = 30_000;

/**
 * Auto-reconnecting WebSocket hook.
 * Exponential backoff: 1s → 2s → 4s … capped at 30s.
 *
 * @returns {{ messages: object[], lastMessage: object|null, isConnected: boolean }}
 */
export function useWebSocket() {
  const [messages, setMessages]       = useState([]);
  const [lastMessage, setLastMessage] = useState(null);
  const [isConnected, setIsConnected] = useState(false);

  const wsRef      = useRef(null);
  const backoffRef = useRef(1000);
  const mountedRef = useRef(true);

  const connect = useCallback(() => {
    if (!mountedRef.current) return;
    const ws = new WebSocket(WS_URL);
    wsRef.current = ws;

    ws.onopen = () => {
      if (!mountedRef.current) return;
      setIsConnected(true);
      backoffRef.current = 1000;   // reset on successful connect
    };

    ws.onmessage = event => {
      if (!mountedRef.current) return;
      try {
        const msg = JSON.parse(event.data);
        setMessages(prev => [...prev.slice(-199), msg]);  // keep last 200
        setLastMessage(msg);
      } catch {
        // malformed message — ignore
      }
    };

    ws.onclose = () => {
      if (!mountedRef.current) return;
      setIsConnected(false);
      const delay = Math.min(backoffRef.current, MAX_BACKOFF);
      backoffRef.current = Math.min(backoffRef.current * 2, MAX_BACKOFF);
      setTimeout(connect, delay);
    };

    ws.onerror = () => ws.close();
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    connect();
    return () => {
      mountedRef.current = false;
      wsRef.current?.close();
    };
  }, [connect]);

  return { messages, lastMessage, isConnected };
}
