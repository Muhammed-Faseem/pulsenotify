import React, { useEffect, useState, useRef } from 'react';
import axios from 'axios';

interface Notification {
  id: string;
  title: string;
  body: string;
  status: string;
  created_at: string;
}

interface Props {
  userId: string;
  tenantId: string;
  apiKey: string;
}

export function NotificationFeed({ userId, tenantId, apiKey }: Props) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [connected, setConnected] = useState(false);
  const wsRef = useRef<WebSocket | null>(null);

  // Load existing notifications from REST API
  useEffect(() => {
    axios.get(`/api/notifications?userId=${userId}`, {
      headers: { 'X-API-Key': apiKey }
    }).then(res => setNotifications(res.data.notifications));
  }, [userId, apiKey]);

  // Connect WebSocket for real-time updates
  useEffect(() => {
    const wsUrl = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws?userId=${userId}&tenantId=${tenantId}`;
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);

    ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      if (msg.type === 'notification') {
        setNotifications(prev => [msg.data, ...prev]);
      }
    };

    // Keep-alive ping every 30s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ping' }));
      }
    }, 30000);

    return () => {
      clearInterval(pingInterval);
      ws.close();
    };
  }, [userId, tenantId]);

  const markRead = async (id: string) => {
    await axios.patch(`/api/notifications/${id}/read`, {}, {
      headers: { 'X-API-Key': apiKey }
    });
    setNotifications(prev =>
      prev.map(n => n.id === id ? { ...n, status: 'read' } : n)
    );
  };

  return (
    <div>
      <div>Status: {connected ? '🟢 Connected' : '🔴 Disconnected'}</div>
      <div>
        {notifications.map(n => (
          <div key={n.id} style={{ opacity: n.status === 'read' ? 0.5 : 1 }}>
            <strong>{n.title}</strong>
            <p>{n.body}</p>
            <small>{new Date(n.created_at).toLocaleString()}</small>
            {n.status !== 'read' && (
              <button onClick={() => markRead(n.id)}>Mark read</button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
