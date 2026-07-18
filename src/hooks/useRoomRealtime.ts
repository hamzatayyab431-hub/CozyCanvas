import { useEffect, useState, useRef, useCallback } from 'react';
import { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { DrawingElement } from '../lib/drawing-utils';

export interface PlayerPresence {
  playerId: string;
  nickname: string;
  isDrawing: boolean;
  isTyping: boolean;
  isHost: boolean;
  isDone?: boolean;
  joinedAt: string;
  color: string;
}

export interface UseRoomRealtimeProps {
  roomCode: string;
  roomId?: string | null; // Database room UUID (required for Postgres changes)
  initialNickname?: string;
  isHost?: boolean;
  onRoundChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onRoomChange?: (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => void;
  onDrawingReceived?: (payload: { element: DrawingElement; playerId: string }) => void;
  onDrawingCompleted?: (payload: { element: DrawingElement; playerId: string }) => void;
  onClearCanvas?: () => void;
  onDrawingStateChange?: (payload: { playerId: string; isDrawing: boolean }) => void;
  onCursorMoveReceived?: (payload: { x: number; y: number; playerId: string }) => void;
}

// Helper to generate/retrieve persistent player ID
export const getOrCreatePlayerId = (): string => {
  if (typeof window === 'undefined') return '';
  let id = localStorage.getItem('drawing_duel_player_id');
  if (!id) {
    id = `player_${Math.random().toString(36).substring(2, 11)}`;
    localStorage.setItem('drawing_duel_player_id', id);
  }
  return id;
};

// Helper to get saved nickname
export const getSavedNickname = (fallback = 'Painter'): string => {
  if (typeof window === 'undefined') return fallback;
  return localStorage.getItem('drawing_duel_nickname') || fallback;
};

// Helper to calculate a deterministic cozy player color
export const getPlayerColor = (playerId: string): string => {
  const colors = [
    '#E05A47', // Terracotta
    '#F4A261', // Peach
    '#E9C46A', // Mustard
    '#A2B18A', // Sage Green
    '#4D908E', // Muted Teal
    '#264653', // Deep Cozy Blue
    '#A89FDF', // Lavender
    '#9B2226', // Burgundy
    '#8C6239', // Brown
    '#3D2E2B', // Dark Chocolate
  ];
  if (!playerId) return colors[0];
  let hash = 0;
  for (let i = 0; i < playerId.length; i++) {
    hash = playerId.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % colors.length;
  return colors[index];
};

export const useRoomRealtime = ({
  roomCode,
  roomId,
  initialNickname,
  isHost = false,
  onRoundChange,
  onRoomChange,
  onDrawingReceived,
  onDrawingCompleted,
  onClearCanvas,
  onDrawingStateChange,
  onCursorMoveReceived,
}: UseRoomRealtimeProps) => {
  const [playerId, setPlayerId] = useState<string>('');
  const [nickname, setNicknameState] = useState<string>('Painter');
  const [players, setPlayers] = useState<PlayerPresence[]>([]);
  const [isJoined, setIsJoined] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const channelRef = useRef<RealtimeChannel | null>(null);

  // Create refs for callbacks to prevent subscription recreation
  const onRoomChangeRef = useRef(onRoomChange);
  const onRoundChangeRef = useRef(onRoundChange);
  const onDrawingReceivedRef = useRef(onDrawingReceived);
  const onDrawingCompletedRef = useRef(onDrawingCompleted);
  const onClearCanvasRef = useRef(onClearCanvas);
  const onDrawingStateChangeRef = useRef(onDrawingStateChange);
  const onCursorMoveReceivedRef = useRef(onCursorMoveReceived);

  // Update refs when props change
  useEffect(() => {
    onRoomChangeRef.current = onRoomChange;
    onRoundChangeRef.current = onRoundChange;
    onDrawingReceivedRef.current = onDrawingReceived;
    onDrawingCompletedRef.current = onDrawingCompleted;
    onClearCanvasRef.current = onClearCanvas;
    onDrawingStateChangeRef.current = onDrawingStateChange;
    onCursorMoveReceivedRef.current = onCursorMoveReceived;
  }, [
    onRoomChange,
    onRoundChange,
    onDrawingReceived,
    onDrawingCompleted,
    onClearCanvas,
    onDrawingStateChange,
    onCursorMoveReceived,
  ]);
  
  // Store presence status locally to allow easy partial updates
  const presenceStateRef = useRef<PlayerPresence>({
    playerId: '',
    nickname: 'Painter',
    isDrawing: false,
    isTyping: false,
    isHost: false,
    isDone: false,
    joinedAt: new Date().toISOString(),
    color: '#E05A47',
  });

  // Handle local storage synchronization for player ID and nickname
  useEffect(() => {
    Promise.resolve().then(() => {
      const pid = getOrCreatePlayerId();
      setPlayerId(pid);

      const savedName = initialNickname || getSavedNickname('Cozy Artist');
      setNicknameState(savedName);
      if (!localStorage.getItem('drawing_duel_nickname')) {
        localStorage.setItem('drawing_duel_nickname', savedName);
      }

      const playerColor = getPlayerColor(pid);

      const nextPresence = {
        playerId: pid,
        nickname: savedName,
        isDrawing: presenceStateRef.current.isDrawing,
        isTyping: presenceStateRef.current.isTyping,
        isHost,
        isDone: presenceStateRef.current.isDone,
        joinedAt: presenceStateRef.current.playerId ? presenceStateRef.current.joinedAt : new Date().toISOString(),
        color: playerColor,
      };

      presenceStateRef.current = nextPresence;

      // If already connected, track the new state immediately
      if (channelRef.current && isJoined) {
        channelRef.current.track(nextPresence).catch((err) => {
          console.error('Failed to track updated presence:', err);
        });
      }
    });
  }, [initialNickname, isHost, isJoined]);

  // Update presence status (e.g. isDrawing, isTyping)
  const updatePresence = useCallback(async (fields: Partial<Omit<PlayerPresence, 'playerId' | 'color'>>) => {
    if (!channelRef.current || !playerId) return;

    const nextPresence = {
      ...presenceStateRef.current,
      ...fields,
      playerId,
    };

    presenceStateRef.current = nextPresence;

    try {
      await channelRef.current.track(nextPresence);
    } catch (err) {
      console.error('Failed to update presence state:', err);
    }
  }, [playerId]);

  // Update nickname and sync with presence
  const setNickname = useCallback((newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    localStorage.setItem('drawing_duel_nickname', trimmed);
    setNicknameState(trimmed);

    updatePresence({ nickname: trimmed });
  }, [updatePresence]);

  // Broadcast functions
  const broadcastStroke = useCallback((element: DrawingElement) => {
    if (!channelRef.current || !playerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'stroke',
      payload: { element, playerId },
    });
  }, [playerId]);

  const broadcastDrawingCompleted = useCallback((element: DrawingElement) => {
    if (!channelRef.current || !playerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'drawing_completed',
      payload: { element, playerId },
    });
  }, [playerId]);

  const broadcastClearCanvas = useCallback(() => {
    if (!channelRef.current || !playerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'clear_canvas',
      payload: { playerId },
    });
  }, [playerId]);

  const broadcastCursor = useCallback((x: number, y: number) => {
    if (!channelRef.current || !playerId) return;
    channelRef.current.send({
      type: 'broadcast',
      event: 'cursor_move',
      payload: { x, y, playerId },
    });
  }, [playerId]);

  // Subscribe to Realtime channel — only depends on roomCode + playerId
  // NOT roomId, so the channel is not torn down when the room object loads.
  useEffect(() => {
    if (!roomCode || !playerId) return;

    // Properly remove any previous channel to avoid stale SDK cache
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    const channelName = `room:${roomCode.toUpperCase()}`;
    const channel = supabase.channel(channelName, {
      config: {
        presence: {
          key: playerId,
        },
      },
    });

    channelRef.current = channel;

    // Presence synchronizer helper
    const syncPresence = () => {
      const rawState = channel.presenceState();
      const syncedPlayers: PlayerPresence[] = [];

      Object.keys(rawState).forEach((key) => {
        const presences = rawState[key] as unknown as PlayerPresence[];
        if (presences && presences.length > 0) {
          // Take the newest presence entry
          const sorted = [...presences].sort(
            (a, b) => new Date(b.joinedAt).getTime() - new Date(a.joinedAt).getTime()
          );
          syncedPlayers.push(sorted[0]);
        }
      });

      setPlayers(syncedPlayers);
    };

    // 1. Presence Listeners
    channel
      .on('presence', { event: 'sync' }, syncPresence)
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        console.log(`Player(s) joined:`, newPresences);
        syncPresence();
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        console.log(`Player(s) left:`, leftPresences);
        syncPresence();
      });

    // 2. Broadcast Listeners (Live canvas collaboration & draw status)
    channel
      .on('broadcast', { event: 'stroke' }, ({ payload }) => {
        if (payload.playerId !== playerId && onDrawingReceivedRef.current) {
          onDrawingReceivedRef.current(payload);
        }
      })
      .on('broadcast', { event: 'drawing_completed' }, ({ payload }) => {
        if (payload.playerId !== playerId && onDrawingCompletedRef.current) {
          onDrawingCompletedRef.current(payload);
        }
      })
      .on('broadcast', { event: 'clear_canvas' }, () => {
        if (onClearCanvasRef.current) {
          onClearCanvasRef.current();
        }
      })
      .on('broadcast', { event: 'drawing_state' }, ({ payload }) => {
        if (payload.playerId !== playerId && onDrawingStateChangeRef.current) {
          onDrawingStateChangeRef.current(payload);
        }
      })
      .on('broadcast', { event: 'cursor_move' }, ({ payload }) => {
        if (payload.playerId !== playerId && onCursorMoveReceivedRef.current) {
          onCursorMoveReceivedRef.current(payload);
        }
      });

    // Subscribe to channel
    channel.subscribe((status, err) => {
      if (status === 'SUBSCRIBED') {
        setIsJoined(true);
        setError(null);
        // Start tracking our presence inside the channel
        channel.track(presenceStateRef.current).catch((trackErr) => {
          console.error('Failed to track initial presence:', trackErr);
        });
      } else if (status === 'CHANNEL_ERROR') {
        setIsJoined(false);
        setError(`Failed to connect to the game server: ${err ? (err.message || JSON.stringify(err)) : 'Realtime channel error'}`);
      } else if (status === 'TIMED_OUT') {
        setIsJoined(false);
        setError('Connection timed out.');
      }
    });

    const handleBeforeUnload = () => {
      if (channelRef.current) {
        channelRef.current.unsubscribe();
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      supabase.removeChannel(channel);
      setIsJoined(false);
      channelRef.current = null;
    };
  }, [roomCode, playerId]);

  // Postgres Changes Listeners — separate effect so the main channel
  // is NOT destroyed when roomId loads asynchronously.
  useEffect(() => {
    if (!roomId) return;

    const channelName = `postgres:${roomCode.toUpperCase()}:${roomId}`;
    const pgChannel = supabase.channel(channelName);

    // Listen to room settings or status changes
    pgChannel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rooms',
        filter: `id=eq.${roomId}`,
      },
      (payload) => {
        if (onRoomChangeRef.current) {
          onRoomChangeRef.current(payload);
        }
      }
    );

    // Listen to round starts, changes, status updates
    pgChannel.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'rounds',
        filter: `room_id=eq.${roomId}`,
      },
      (payload) => {
        if (onRoundChangeRef.current) {
          onRoundChangeRef.current(payload);
        }
      }
    );

    pgChannel.subscribe();

    return () => {
      supabase.removeChannel(pgChannel);
    };
  }, [roomCode, roomId]);

  return {
    playerId,
    nickname,
    setNickname,
    players,
    isJoined,
    error,
    updatePresence,
    broadcastStroke,
    broadcastDrawingCompleted,
    broadcastClearCanvas,
    broadcastCursor,
  };
};
