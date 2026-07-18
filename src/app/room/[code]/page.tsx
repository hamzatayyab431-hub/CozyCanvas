"use client";

import React, { useState, useEffect, use, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../../../lib/supabase';
import { useRoomRealtime, getOrCreatePlayerId } from '../../../hooks/useRoomRealtime';
import { GameController } from '../../../components/GameController';
import { Loader2, Palette, Sparkles, ArrowLeft, Paintbrush, ShieldAlert, Volume2, VolumeX } from 'lucide-react';
import { isSoundEnabled, toggleSound, playPop, getSoundVolume, setSoundVolume } from '../../../lib/sound-utils';
import { WaxSeal } from '../../../components/WaxSeal';

interface PageProps {
  params: Promise<{ code: string }>;
}

interface RoomSettings {
  maxRounds: number;
  roundDuration: number;
  category: string;
  collabMode?: boolean;
}

interface Room {
  id: string;
  code: string;
  host_id: string;
  status: string;
  settings: RoomSettings;
}

export default function RoomPage({ params }: PageProps) {
  const { code } = use(params);
  const router = useRouter();
  const roomCode = code.toUpperCase();

  const [mounted, setMounted] = useState(false);
  const [room, setRoom] = useState<Room | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [soundOn, setSoundOn] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return isSoundEnabled();
    }
    return true;
  });

  const [volume, setVolume] = useState<number>(() => {
    if (typeof window !== 'undefined') {
      return getSoundVolume();
    }
    return 0.5;
  });

  const handleToggleSound = () => {
    const newVal = toggleSound();
    setSoundOn(newVal);
    if (newVal) {
      playPop();
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVol = parseFloat(e.target.value);
    setVolume(newVol);
    setSoundVolume(newVol);
  };

  // Nickname entry state
  const [nicknameInput, setNicknameInput] = useState('');
  const [nicknameConfirmed, setNicknameConfirmed] = useState(false);
  const [savedName, setSavedName] = useState('Painter');
  const [playerId, setPlayerId] = useState('');

  // 1. Initial mounting & local storage check
  useEffect(() => {
    Promise.resolve().then(() => {
      setMounted(true);
      const pid = getOrCreatePlayerId();
      setPlayerId(pid);

      const existingName = localStorage.getItem('drawing_duel_nickname');
      if (existingName) {
        setSavedName(existingName);
        setNicknameInput(existingName);
        setNicknameConfirmed(true);
      } else {
        // Suggest a fun cozy artist name
        const adjectives = ['Cozy', 'Warm', 'Sleepy', 'Creative', 'Happy', 'Tiny', 'Magic'];
        const nouns = ['Panda', 'Koala', 'Rabbit', 'Artist', 'Painter', 'Doodler', 'Squirrel'];
        const randomName = `${adjectives[Math.floor(Math.random() * adjectives.length)]} ${nouns[Math.floor(Math.random() * nouns.length)]}`;
        setNicknameInput(randomName);
      }
    });
  }, []);

  // 2. Fetch room details on mount
  useEffect(() => {
    async function loadRoom() {
      try {
        const { data, error: dbError } = await supabase
          .from('rooms')
          .select('*')
          .eq('code', roomCode)
          .single();

        if (dbError || !data) {
          setError('We couldn\'t find that drawing room. Please check the code and try again.');
        } else {
          setRoom(data as Room);
        }
      } catch (err) {
        console.error('Error fetching room:', err);
        setError('A network error occurred while loading the room.');
      } finally {
        setLoading(false);
      }
    }
    loadRoom();
  }, [roomCode]);

  // 3. Realtime hooks integration
  const onDrawingReceivedCallbackRef = useRef<((payload: { element: any; playerId: string }) => void) | null>(null);
  const onDrawingCompletedCallbackRef = useRef<((payload: { element: any; playerId: string }) => void) | null>(null);
  const onClearCanvasCallbackRef = useRef<(() => void) | null>(null);
  const onCursorMoveReceivedCallbackRef = useRef<((payload: { x: number; y: number; playerId: string }) => void) | null>(null);

  const {
    players,
    error: realtimeError,
    updatePresence,
    broadcastClearCanvas,
    broadcastStroke,
    broadcastDrawingCompleted,
    broadcastCursor,
  } = useRoomRealtime({
    roomCode,
    roomId: room?.id,
    initialNickname: savedName,
    isHost: room?.host_id === playerId,
    onDrawingReceived: (payload) => onDrawingReceivedCallbackRef.current?.(payload),
    onDrawingCompleted: (payload) => onDrawingCompletedCallbackRef.current?.(payload),
    onClearCanvas: () => onClearCanvasCallbackRef.current?.(),
    onCursorMoveReceived: (payload) => onCursorMoveReceivedCallbackRef.current?.(payload),
    onRoomChange: (payload) => {
      if (payload.new) {
        setRoom(payload.new as unknown as Room);
      }
    },
  });

  const handleConfirmNickname = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = nicknameInput.trim();
    if (!trimmed) return;

    localStorage.setItem('drawing_duel_nickname', trimmed);
    setSavedName(trimmed);
    setNicknameConfirmed(true);
  };

  const handleLeaveRoom = () => {
    router.push('/');
  };

  if (!mounted) {
    return (
      <div className="min-h-screen bg-cozy-bg flex items-center justify-center">
        <Loader2 className="animate-spin text-cozy-primary" size={32} />
      </div>
    );
  }

  // Loading Screen
  if (loading) {
    return (
      <div className="min-h-screen bg-cozy-bg flex flex-col items-center justify-center gap-3">
        <div className="p-4 bg-cozy-card rounded-full border border-cozy-border shadow-md animate-pulse">
          <Palette className="text-cozy-primary fill-orange-100" size={32} />
        </div>
        <span className="text-sm font-bold text-cozy-muted animate-pulse">
          Setting up the drawing boards...
        </span>
      </div>
    );
  }

  // Error Screen
  if (error || realtimeError) {
    return (
      <div className="min-h-screen bg-cozy-bg flex items-center justify-center p-4">
        <div className="bg-cozy-card border border-cozy-border max-w-md w-full p-8 rounded-3xl shadow-xl shadow-stone-200/5 text-center flex flex-col gap-5">
          <div className="p-4 bg-rose-50 dark:bg-rose-950/20 text-rose-500 rounded-full w-fit mx-auto border border-rose-100 dark:border-rose-900">
            <ShieldAlert size={36} />
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-xl font-black text-cozy-fg">Room Setup Error</h2>
            <p className="text-sm text-cozy-muted leading-relaxed">
              {error || realtimeError || 'An unexpected error occurred while connecting to the game.'}
            </p>
          </div>
          <button
            onClick={handleLeaveRoom}
            className="flex items-center justify-center gap-2 bg-cozy-primary hover:bg-cozy-primary-hover text-white font-bold py-3 rounded-xl shadow-md active:scale-95 transition-all duration-150 cursor-pointer"
          >
            <ArrowLeft size={16} />
            <span>Return to Lobby</span>
          </button>
        </div>
      </div>
    );
  }

  // Nickname entry card before joining game
  if (!nicknameConfirmed) {
    return (
      <div className="min-h-screen bg-cozy-bg flex items-center justify-center p-4">
        <div className="bg-cozy-card border border-cozy-border max-w-md w-full p-8 rounded-3xl shadow-xl shadow-stone-200/5 flex flex-col gap-6 relative overflow-hidden animate-fade-in-up">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-linear-to-r from-orange-400 to-amber-400" />
          
          <div className="flex flex-col gap-2 text-center">
            <div className="p-3 bg-cozy-accent border border-cozy-border rounded-2xl w-fit mx-auto text-cozy-primary animate-bounce">
              <Paintbrush size={24} />
            </div>
            <h2 className="text-2xl font-black text-cozy-fg mt-1">Choose Your Alias</h2>
            <p className="text-xs text-cozy-muted leading-relaxed">
              You are about to join room <span className="font-extrabold text-cozy-primary">{roomCode}</span>. What should your partner call you?
            </p>
          </div>

          <form onSubmit={handleConfirmNickname} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-cozy-fg">Your Nickname</label>
              <input
                type="text"
                maxLength={15}
                required
                value={nicknameInput}
                onChange={(e) => setNicknameInput(e.target.value)}
                placeholder="Cozy Artist"
                className="w-full text-sm font-semibold p-3.5 rounded-xl border border-cozy-border bg-cozy-bg text-cozy-fg outline-none focus:ring-2 focus:ring-cozy-primary/20 focus:border-cozy-primary focus:bg-cozy-card transition-all shadow-2xs"
              />
            </div>

            <button
              type="submit"
              className="flex items-center justify-center gap-2 bg-cozy-primary hover:bg-cozy-primary-hover text-white font-bold py-3.5 rounded-xl shadow-md active:scale-95 transition-all duration-150 cursor-pointer text-sm"
            >
              <span>Join Duel</span>
              <Sparkles size={16} className="fill-white" />
            </button>
          </form>

          <button
            onClick={handleLeaveRoom}
            className="text-cozy-muted hover:text-cozy-fg text-xs font-semibold text-center mt-1 active:scale-95 transition-all cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  // Active Game screen
  return (
    <div className="min-h-screen bg-cozy-bg flex flex-col paper-texture vignette-overlay">
      {/* Game Header */}
      <header className="bg-cozy-card border-b border-cozy-border px-6 py-4 flex items-center justify-between shadow-xs select-none">
        <div className="flex items-center gap-3">
          <WaxSeal size={34} motif="rose" className="text-cozy-primary" />
          <div className="flex flex-col">
            <h1 className="font-serif font-black text-cozy-fg text-sm tracking-tight leading-none">Cozy Canvas</h1>
            <span className="text-[10px] font-bold text-cozy-muted uppercase tracking-widest mt-1">
              Room Code: {roomCode}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Audio Controls */}
          <div className="flex items-center gap-2 bg-cozy-bg border border-cozy-secondary/50 rounded-xl px-3 py-1.5 shadow-inner">
            <button
              onClick={handleToggleSound}
              className="text-cozy-primary hover:text-cozy-primary-hover transition-colors active:scale-95"
              title={soundOn ? "Mute Sounds" : "Unmute Sounds"}
            >
              {soundOn ? <Volume2 size={16} /> : <VolumeX size={16} />}
            </button>
            
            <input
              type="range"
              min="0"
              max="1"
              step="0.05"
              value={soundOn ? volume : 0}
              onChange={handleVolumeChange}
              disabled={!soundOn}
              className={`w-16 h-1.5 rounded-full appearance-none bg-cozy-secondary/30 outline-none transition-opacity ${!soundOn ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
              style={{
                background: `linear-gradient(to right, var(--color-cozy-primary) ${(soundOn ? volume : 0) * 100}%, transparent ${(soundOn ? volume : 0) * 100}%)`,
              }}
            />
          </div>

          <button
            onClick={handleLeaveRoom}
            className="flex items-center gap-1.5 border border-cozy-secondary hover:bg-cozy-secondary/15 text-cozy-primary font-bold px-4 py-2 rounded-xl text-xs transition-all active:scale-95 cursor-pointer"
          >
            <ArrowLeft size={13} />
            <span>Exit room</span>
          </button>
        </div>
      </header>

      {/* Main Game Area */}
      <main className="flex-1 relative w-full overflow-hidden">
        {room && (
          <GameController
            room={room}
            playerId={playerId}
            nickname={savedName}
            players={players}
            updatePresence={updatePresence}
            broadcastClearCanvas={broadcastClearCanvas}
            broadcastStroke={broadcastStroke}
            broadcastDrawingCompleted={broadcastDrawingCompleted}
            broadcastCursor={broadcastCursor}
            onDrawingReceivedCallbackRef={onDrawingReceivedCallbackRef}
            onDrawingCompletedCallbackRef={onDrawingCompletedCallbackRef}
            onClearCanvasCallbackRef={onClearCanvasCallbackRef}
            onCursorMoveReceivedCallbackRef={onCursorMoveReceivedCallbackRef}
          />
        )}
      </main>
    </div>
  );
}
