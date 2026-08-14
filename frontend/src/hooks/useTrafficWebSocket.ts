import { useEffect, useState, useRef, useCallback } from 'react';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';

export interface TrafficData {
  node: string;
  density: number;
  status?: string;
  light?: string | Record<string, string>;
  timestamp: number;
}

export const useTrafficWebSocket = () => {
  const [nodes, setNodes] = useState<Record<string, TrafficData>>({});
  const [history, setHistory] = useState<TrafficData[]>([]);
  const [connected, setConnected] = useState(false);
  const clientRef = useRef<Client | null>(null);

  useEffect(() => {
    const client = new Client({
      webSocketFactory: () => new SockJS('http://localhost:8080/traffic-ws'),
      reconnectDelay: 5000,
      heartbeatIncoming: 4000,
      heartbeatOutgoing: 4000,
      onConnect: () => {
        setConnected(true);
        client.subscribe('/topic/traffic', (message) => {
          if (message.body) {
            try {
              const data: TrafficData = JSON.parse(message.body);
              setNodes((prevNodes) => ({
                ...prevNodes,
                [data.node]: data
              }));
              setHistory((prevHistory) => {
                const newHistory = [...prevHistory, data];
                if (newHistory.length > 20) {
                  return newHistory.slice(newHistory.length - 20);
                }
                return newHistory;
              });
            } catch (e) {
              console.error("Failed to parse message body:", message.body, e);
            }
          }
        });
      },
      onDisconnect: () => {
        setConnected(false);
      },
      onStompError: (frame) => {
        console.error('Broker reported error: ' + frame.headers['message']);
        console.error('Additional details: ' + frame.body);
      },
      onWebSocketClose: () => {
         setConnected(false);
      }
    });

    client.activate();
    clientRef.current = client;

    return () => {
      client.deactivate();
      clientRef.current = null;
    };
  }, []);

  const sendTopologyUpdate = useCallback((msg: any) => {
    if (clientRef.current && clientRef.current.connected) {
      clientRef.current.publish({
        destination: '/app/topology',
        body: JSON.stringify(msg)
      });
    }
  }, []);

  return { nodes, history, connected, sendTopologyUpdate };
};
