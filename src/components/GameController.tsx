"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import { DrawingCanvas, DrawingCanvasRef } from './DrawingCanvas';
import { DrawingToolbar } from './DrawingToolbar';
import { RoomPresence } from './RoomPresence';
import { Gallery, GalleryDrawing } from './Gallery';
import { PlayerPresence } from '../hooks/useRoomRealtime';
import { promptCategories, getRandomPrompt } from '../lib/prompts';
import { ToolType } from '../lib/drawing-utils';
import {
  Play,
  Clock,
  Settings,
  Heart,
  Star,
  Crown,
  History,
  Timer,
  CheckCircle,
  Trophy,
  RotateCcw,
  ArrowRight,
  ChevronRight,
  Smile
} from 'lucide-react';
import confetti from 'canvas-confetti';
import { playPop, playChime, playFanfare, playWarning } from '../lib/sound-utils';
import { WaxSeal } from './WaxSeal';

interface RoomSettings {
  maxRounds: number;
  roundDuration: number; // in seconds, 0 = untimed
  category: string; // 'animals', 'objects', etc.
}

interface Round {
  id: string;
  room_id: string;
  round_number: number;
  prompt: string;
  status: 'waiting' | 'drawing' | 'reveal' | 'completed';
  duration_seconds: number;
  started_at: string | null;
  reveal_started_at: string | null;
  created_at?: string;
}

interface GameControllerProps {
  room: {
    id: string;
    code: string;
    host_id: string;
    status: string;
    settings: RoomSettings;
  };
  playerId: string;
  nickname: string;
  players: PlayerPresence[];
  updatePresence: (fields: Partial<Omit<PlayerPresence, 'playerId'>>) => Promise<void>;
  broadcastClearCanvas: () => void;
}

export const GameController: React.FC<GameControllerProps> = ({
  room,
  playerId,
  nickname,
  players,
  updatePresence,
  broadcastClearCanvas,
}) => {
  const isHost = room.host_id === playerId;

  // Drawing tools states
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>('#E05A47');
  const [size, setSize] = useState<number>(8);
  const [opacity, setOpacity] = useState<number>(1.0);
  const [fillShape, setFillShape] = useState<boolean>(false);
  const [canUndo, setCanUndo] = useState<boolean>(false);
  const [canRedo, setCanRedo] = useState<boolean>(false);

  // Canvas Reference
  const canvasRef = useRef<DrawingCanvasRef>(null);

  // Game/Round State
  const [rounds, setRounds] = useState<Round[]>([]);
  const [drawings, setDrawings] = useState<GalleryDrawing[]>([]);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  // Host setup states
  const [maxRounds, setMaxRounds] = useState<number>(room.settings?.maxRounds || 3);
  const [roundDuration, setRoundDuration] = useState<number>(room.settings?.roundDuration || 60);
  const [category, setCategory] = useState<string>(room.settings?.category || 'all');



  // Fetch all rounds and drawings in the room
  const fetchRoomData = useCallback(async () => {
    try {
      // Fetch rounds
      const { data: roundsData } = await supabase
        .from('rounds')
        .select('*')
        .eq('room_id', room.id)
        .order('round_number', { ascending: true });

      setRounds((roundsData as Round[]) || []);

      // Fetch drawings
      const { data: drawingsData } = await supabase
        .from('drawings')
        .select('*, round:rounds(round_number, prompt, status)')
        .eq('room_id', room.id);

      setDrawings((drawingsData as GalleryDrawing[]) || []);
    } catch (err) {
      console.error('Error fetching room data:', err);
    }
  }, [room.id]);

  useEffect(() => {
    Promise.resolve().then(() => {
      fetchRoomData();
    });
  }, [room.status, fetchRoomData]);

  // Subscribe to rounds and drawings changes
  useEffect(() => {
    const channel = supabase
      .channel(`room_controller:${room.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rounds', filter: `room_id=eq.${room.id}` },
        () => {
          fetchRoomData();
        }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'drawings', filter: `room_id=eq.${room.id}` },
        () => {
          fetchRoomData();
        }
      )
      .subscribe();

    return () => {
      channel.unsubscribe();
    };
  }, [room.id, fetchRoomData]);

  // Current active round
  const currentRound = rounds[rounds.length - 1];

  // Check if current player has submitted drawing for the current round
  const hasSubmitted = currentRound
    ? drawings.some((d) => d.round_id === currentRound.id && d.player_id === playerId)
    : false;

  // Timer low warning sound effect
  useEffect(() => {
    if (timeLeft !== null && timeLeft <= 5 && timeLeft > 0 && !hasSubmitted) {
      playWarning();
    }
  }, [timeLeft, hasSubmitted]);

  // Audio transitions for rounds
  const lastRoundState = useRef<{ id: string; status: string } | null>(null);
  useEffect(() => {
    if (!currentRound) {
      lastRoundState.current = null;
      return;
    }
    const prev = lastRoundState.current;
    lastRoundState.current = { id: currentRound.id, status: currentRound.status };

    if (!prev) {
      // Transition from lobby to first round drawing
      if (currentRound.status === 'drawing') {
        playChime();
      }
      return;
    }

    if (currentRound.status === 'drawing' && (prev.id !== currentRound.id || prev.status !== 'drawing')) {
      playChime();
    }
    if (currentRound.status === 'reveal' && prev.status !== 'reveal') {
      playFanfare();
    }
  }, [currentRound]);

  // Audio transitions for room finished
  const lastRoomStatus = useRef<string | null>(null);
  useEffect(() => {
    const prev = lastRoomStatus.current;
    lastRoomStatus.current = room.status;
    if (!prev) return;
    if (room.status === 'finished' && prev !== 'finished') {
      playFanfare();
    }
  }, [room.status]);

  // Helper to convert base64 to Blob
  const dataURIToBlob = (dataURI: string) => {
    const byteString = atob(dataURI.split(',')[1]);
    const mimeString = dataURI.split(',')[0].split(':')[1].split(';')[0];
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeString });
  };

  // Submit Drawing Action
  const submitDrawing = useCallback(async () => {
    if (!currentRound || hasSubmitted || isSubmitting) return;

    setIsSubmitting(true);
    try {
      // Get base64 PNG from canvas
      const pngData = canvasRef.current?.exportPNG('#ffffff') || '';
      if (!pngData) {
        throw new Error('Could not export drawing.');
      }

      const blob = dataURIToBlob(pngData);
      const filename = `${room.id}/${currentRound.id}/${playerId}.png`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('drawings')
        .upload(filename, blob, {
          contentType: 'image/png',
          upsert: true,
        });

      if (uploadError) {
        throw uploadError;
      }

      // Get public URL
      const { data: { publicUrl } } = supabase.storage
        .from('drawings')
        .getPublicUrl(filename);

      // Insert/Upsert into drawings table
      const { error: dbError } = await supabase
        .from('drawings')
        .upsert({
          room_id: room.id,
          round_id: currentRound.id,
          player_id: playerId,
          player_name: nickname,
          canvas_data: { elements: [] }, // Placeholder
          image_url: publicUrl,
        }, {
          onConflict: 'room_id,round_id,player_id'
        });

      if (dbError) {
        throw dbError;
      }

      // Update Presence done status
      await updatePresence({ isDone: true, isDrawing: false });

      // Play pop sound
      playPop();

      // Trigger visual confetti for the self-completion
      confetti({
        particleCount: 40,
        spread: 40,
        origin: { y: 0.8 }
      });

    } catch (err) {
      console.error('Error submitting drawing:', err);
      alert('Failed to submit drawing. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  }, [currentRound, hasSubmitted, isSubmitting, room.id, playerId, nickname, updatePresence]);

  // Auto-submit blank or incomplete canvas if timer hits 0
  const handleAutoSubmit = useCallback(async () => {
    await submitDrawing();
  }, [submitDrawing]);

  // Manage Timer countdown
  useEffect(() => {
    if (!currentRound || currentRound.status !== 'drawing' || currentRound.duration_seconds === 0) {
      Promise.resolve().then(() => {
        setTimeLeft(null);
      });
      return;
    }

    const calculateTimeLeft = () => {
      const startedAt = currentRound.started_at ? new Date(currentRound.started_at).getTime() : Date.now();
      const durationMs = currentRound.duration_seconds * 1000;
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, Math.ceil((durationMs - elapsed) / 1000));
      setTimeLeft(remaining);

      // Auto-submit if time runs out
      if (remaining <= 0 && !hasSubmitted && !isSubmitting) {
        handleAutoSubmit();
      }
    };

    calculateTimeLeft();
    const interval = setInterval(calculateTimeLeft, 1000);

    return () => clearInterval(interval);
  }, [currentRound, hasSubmitted, isSubmitting, handleAutoSubmit]);

  // Host action to update settings
  const handleSaveSettings = async () => {
    if (!isHost) return;

    try {
      await supabase
        .from('rooms')
        .update({
          settings: { maxRounds, roundDuration, category }
        })
        .eq('id', room.id);
    } catch (err) {
      console.error('Error updating settings:', err);
    }
  };

  // Host action to start the game
  const handleStartGame = async () => {
    if (!isHost) return;

    try {
      // Update room status
      await supabase
        .from('rooms')
        .update({
          status: 'playing',
          settings: { maxRounds, roundDuration, category }
        })
        .eq('id', room.id);

      // Select random prompt
      const { prompt } = getRandomPrompt(category);

      // Insert first round
      await supabase
        .from('rounds')
        .insert({
          room_id: room.id,
          round_number: 1,
          prompt,
          status: 'drawing',
          duration_seconds: roundDuration,
          started_at: new Date().toISOString()
        });

      // Clear drawing states in presence
      await updatePresence({ isDone: false, isDrawing: false });

    } catch (err) {
      console.error('Error starting game:', err);
    }
  };

  // Advance to reveal stage
  const handleReveal = useCallback(async () => {
    if (!currentRound) return;

    try {
      await supabase
        .from('rounds')
        .update({ status: 'reveal' })
        .eq('id', currentRound.id);
    } catch (err) {
      console.error('Error revealing drawings:', err);
    }
  }, [currentRound]);

  // Check if both players have submitted (or if all active players are done)
  useEffect(() => {
    if (
      isHost &&
      currentRound &&
      currentRound.status === 'drawing' &&
      players.length >= 1
    ) {
      const allDone = players.every((p) => p.isDone);
      if (allDone) {
        handleReveal();
      }
    }
  }, [players, currentRound, isHost, handleReveal]);

  // Reaction action
  const handleReact = async (drawingId: string, reactionType: 'heart' | 'star' | 'crown') => {
    const drawingToUpdate = drawings.find((d) => d.id === drawingId);
    if (!drawingToUpdate) return;

    try {
      const canvasData = drawingToUpdate.canvas_data || {};
      const currentReactions = (canvasData.reactions as Record<string, string>) || {};
      
      // Update reaction: if clicked again, remove it; otherwise set/override it
      const updatedReactions = { ...currentReactions };
      if (updatedReactions[playerId] === reactionType) {
        delete updatedReactions[playerId];
      } else {
        updatedReactions[playerId] = reactionType;
      }

      const updatedCanvasData = {
        ...canvasData,
        reactions: updatedReactions
      };

      await supabase
        .from('drawings')
        .update({ canvas_data: updatedCanvasData })
        .eq('id', drawingId);

      playPop();

      // Sprinkle confetti for special crown/star reactions
      if (reactionType === 'crown') {
        confetti({ particleCount: 20, colors: ['#f59e0b', '#fbbf24'] });
      } else if (reactionType === 'heart') {
        confetti({ particleCount: 15, colors: ['#f43f5e', '#fda4af'] });
      }

    } catch (err) {
      console.error('Error updating reaction:', err);
    }
  };

  // Next round setup
  const handleNextRound = async () => {
    if (!isHost || !currentRound) return;

    try {
      if (currentRound.round_number >= room.settings.maxRounds) {
        // Game Over! Update room status
        await supabase
          .from('rooms')
          .update({ status: 'finished' })
          .eq('id', room.id);
        
        // Trigger large victory confetti
        confetti({ particleCount: 150, spread: 80 });
      } else {
        // Pick new random prompt
        const { prompt } = getRandomPrompt(room.settings.category);

        // Reset presence done states
        // In actual app, each client resets their own, but host updates db
        // Broadcast clear canvas
        broadcastClearCanvas();

        // Create new round
        await supabase
          .from('rounds')
          .insert({
            room_id: room.id,
            round_number: currentRound.round_number + 1,
            prompt,
            status: 'drawing',
            duration_seconds: room.settings.roundDuration,
            started_at: new Date().toISOString()
          });

        // Reset our presence Done status
        await updatePresence({ isDone: false, isDrawing: false });
      }
    } catch (err) {
      console.error('Error transitioning round:', err);
    }
  };

  // Play again lobby reset
  const handlePlayAgain = async () => {
    if (!isHost) return;

    try {
      // Clear rounds and drawings
      await supabase
        .from('rounds')
        .delete()
        .eq('room_id', room.id);

      // Reset room status
      await supabase
        .from('rooms')
        .update({ status: 'waiting' })
        .eq('id', room.id);

      await updatePresence({ isDone: false, isDrawing: false });
    } catch (err) {
      console.error('Error resetting lobby:', err);
    }
  };

  // Calculate scores and streaks
  const getRoundDrawings = () => {
    if (!currentRound) return [];
    return drawings.filter((d) => d.round_id === currentRound.id);
  };

  // Calculate total scores across all drawings in the session
  const calculateTotalScores = () => {
    const scores: Record<string, { name: string; score: number; hearts: number; stars: number; crowns: number }> = {};
    
    // Initialize with all connected players
    players.forEach((p) => {
      scores[p.playerId] = { name: p.nickname, score: 0, hearts: 0, stars: 0, crowns: 0 };
    });

    drawings.forEach((drawing) => {
      const canvasData = drawing.canvas_data || {};
      const reactions = canvasData.reactions || {};
      
      if (!scores[drawing.player_id]) {
        scores[drawing.player_id] = { name: drawing.player_name, score: 0, hearts: 0, stars: 0, crowns: 0 };
      }

      Object.values(reactions).forEach((type) => {
        if (type === 'heart') {
          scores[drawing.player_id].score += 1;
          scores[drawing.player_id].hearts += 1;
        } else if (type === 'star') {
          scores[drawing.player_id].score += 3;
          scores[drawing.player_id].stars += 1;
        } else if (type === 'crown') {
          scores[drawing.player_id].score += 5;
          scores[drawing.player_id].crowns += 1;
        }
      });
    });

    return Object.entries(scores)
      .map(([id, stats]) => ({ playerId: id, ...stats }))
      .sort((a, b) => b.score - a.score);
  };

  const totalScores = calculateTotalScores();

  // Helper to format remaining time
  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  // ==========================================
  // RENDER: WAITING LOBBY
  // ==========================================
  if (room.status === 'waiting') {
    return (
      <div className="max-w-4xl mx-auto flex flex-col gap-6 p-4 select-none">
        <div className="bg-cozy-card border-2 border-cozy-secondary p-8 rounded-3xl shadow-lg shadow-stone-200/5 text-center flex flex-col gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-1.5 bg-cozy-primary" />
          
          <div className="flex flex-col gap-2">
            <span className="text-[11px] font-serif font-extrabold uppercase tracking-wider text-cozy-primary bg-cozy-secondary/30 px-3 py-1 rounded-sm w-fit mx-auto">
              Lobby Code: {room.code}
            </span>
            <h1 className="text-3xl font-serif font-black text-cozy-fg tracking-tight mt-2 flex items-center justify-center gap-2">
              <WaxSeal size={32} motif="heart" className="text-cozy-primary animate-cozy-float" />
              Cozy Canvas Duel
            </h1>
            <p className="text-sm font-serif text-cozy-muted max-w-md mx-auto italic">
              Choose your parameters, invite your drawing partner, and let the duel begin.
            </p>
          </div>

          {/* Lobby Settings Panel */}
          <div className="border border-cozy-border bg-cozy-bg/50 p-6 rounded-2xl text-left flex flex-col gap-5">
            <h3 className="text-xs font-serif font-bold uppercase tracking-wider text-cozy-accent flex items-center gap-2 border-b-2 border-cozy-accent pb-2">
              <Settings size={14} />
              Round Settings {isHost ? '(Host controls)' : '(View settings)'}
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-5 font-serif">
              {/* Category Selector */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-cozy-fg">Prompt Category</label>
                {isHost ? (
                  <select
                    value={category}
                    onChange={(e) => { setCategory(e.target.value); handleSaveSettings(); playPop(); }}
                    className="w-full text-sm p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg outline-none focus:ring-2 focus:ring-cozy-primary/20 focus:border-cozy-primary transition-all"
                  >
                    <option value="all">🎲 All Categories Combined</option>
                    {promptCategories.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg text-sm font-semibold flex items-center gap-2">
                    {category === 'all'
                      ? '🎲 All Categories'
                      : promptCategories.find((c) => c.id === category)?.name || 'Default'}
                  </div>
                )}
              </div>

              {/* Round Duration */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-cozy-fg">Timer Duration</label>
                {isHost ? (
                  <select
                    value={roundDuration}
                    onChange={(e) => { setRoundDuration(Number(e.target.value)); handleSaveSettings(); playPop(); }}
                    className="w-full text-sm p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg outline-none focus:ring-2 focus:ring-cozy-primary/20 focus:border-cozy-primary transition-all"
                  >
                    <option value={60}>⏱️ 1 Minute (Fast Duel)</option>
                    <option value={180}>⏱️ 3 Minutes (Standard)</option>
                    <option value={300}>⏱️ 5 Minutes (Cozy Artist)</option>
                    <option value={600}>⏱️ 10 Minutes (Detail master)</option>
                    <option value={0}>♾️ Untimed (Chill mode)</option>
                  </select>
                ) : (
                  <div className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg text-sm font-semibold flex items-center gap-2">
                    <Clock size={16} className="text-cozy-muted" />
                    {roundDuration === 0 ? 'Untimed (Infinite)' : `${roundDuration / 60} min`}
                  </div>
                )}
              </div>

              {/* Max Rounds */}
              <div className="flex flex-col gap-1.5">
                <label className="text-xs font-bold text-cozy-fg">Total Rounds</label>
                {isHost ? (
                  <select
                    value={maxRounds}
                    onChange={(e) => { setMaxRounds(Number(e.target.value)); handleSaveSettings(); playPop(); }}
                    className="w-full text-sm p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg outline-none focus:ring-2 focus:ring-cozy-primary/20 focus:border-cozy-primary transition-all"
                  >
                    <option value={1}>1 Round</option>
                    <option value={3}>3 Rounds</option>
                    <option value={5}>5 Rounds</option>
                    <option value={8}>8 Rounds</option>
                    <option value={10}>10 Rounds</option>
                  </select>
                ) : (
                  <div className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg text-sm font-semibold">
                    {maxRounds} Rounds
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Connected players counter */}
          <div className="flex flex-col gap-3">
            <RoomPresence players={players} currentPlayerId={playerId} />
          </div>

          {/* Action buttons */}
          <div className="flex justify-center mt-3">
            {isHost ? (
              <button
                onClick={() => { handleStartGame(); playPop(); }}
                disabled={players.length < 1}
                className="flex items-center gap-2 bg-cozy-primary hover:bg-cozy-primary-hover text-white font-serif font-bold px-8 py-4 rounded-2xl shadow-lg active:scale-95 transition-all duration-200 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <Play size={18} className="fill-white" />
                <span>Start Cozy Canvas Duel</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-stone-100 border border-stone-200 text-stone-500 font-semibold px-6 py-3 rounded-2xl text-sm animate-pulse">
                <span>Waiting for host to start...</span>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: GAME OVER / FINISHED
  // ==========================================
  if (room.status === 'finished') {
    
    return (
      <div className="max-w-4xl mx-auto flex flex-col gap-6 p-4">
        <div className="bg-white/80 backdrop-blur-md border border-stone-200/80 p-8 rounded-3xl shadow-xl shadow-stone-200/40 text-center flex flex-col gap-6 relative overflow-hidden">
          <div className="absolute top-0 left-0 right-0 h-2 bg-linear-to-r from-orange-400 via-amber-400 to-rose-400" />

          <div className="flex flex-col gap-2">
            <Trophy size={48} className="text-amber-500 fill-amber-100 stroke-amber-600 mx-auto animate-bounce" />
            <h1 className="text-3xl font-black text-stone-850 tracking-tight">
              Duel Complete!
            </h1>
            <p className="text-sm text-stone-500">
              The canvas has dried. Here is how you both performed:
            </p>
          </div>

          {/* Scoreboard List */}
          <div className="flex flex-col gap-3 max-w-md mx-auto w-full mt-4">
            {totalScores.map((scoreCard, index) => {
              const isWinner = index === 0 && scoreCard.score > 0;
              return (
                <div
                  key={scoreCard.playerId}
                  className={`flex items-center justify-between p-5 rounded-2xl border transition-all ${
                    isWinner 
                      ? 'bg-amber-50/50 border-amber-200 shadow-md shadow-amber-500/5 ring-1 ring-amber-300' 
                      : 'bg-stone-50 border-stone-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`p-3 rounded-xl text-lg font-black ${
                      isWinner ? 'bg-amber-100 text-amber-700' : 'bg-stone-200 text-stone-600'
                    }`}>
                      #{index + 1}
                    </div>
                    <div className="flex flex-col text-left">
                      <span className="font-extrabold text-stone-800 text-base flex items-center gap-1.5">
                        {scoreCard.name}
                        {isWinner && <Crown size={16} className="fill-amber-400 stroke-amber-600 animate-pulse" />}
                        {scoreCard.playerId === playerId && (
                          <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded-md font-bold">You</span>
                        )}
                      </span>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-xs text-stone-400 flex items-center gap-0.5">
                          <Heart size={11} className="fill-rose-400 stroke-rose-500" /> {scoreCard.hearts}
                        </span>
                        <span className="text-xs text-stone-400 flex items-center gap-0.5">
                          <Star size={11} className="fill-amber-400 stroke-amber-500" /> {scoreCard.stars}
                        </span>
                        <span className="text-xs text-stone-400 flex items-center gap-0.5">
                          <Crown size={11} className="fill-purple-400 stroke-purple-500" /> {scoreCard.crowns}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <span className={`text-2xl font-black ${
                      isWinner ? 'text-amber-600' : 'text-stone-700'
                    }`}>
                      {scoreCard.score} pts
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Show full gallery of drawings below */}
          <div className="mt-6 text-left">
            <Gallery drawings={drawings} currentPlayerId={playerId} />
          </div>

          {/* Reset lobby options */}
          <div className="flex justify-center gap-4 mt-6">
            {isHost ? (
              <button
                onClick={() => { handlePlayAgain(); playPop(); }}
                className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white font-bold px-6 py-3.5 rounded-2xl shadow-md active:scale-95 transition-all duration-200 cursor-pointer"
              >
                <RotateCcw size={16} />
                <span>Play Again</span>
              </button>
            ) : (
              <div className="text-sm font-semibold text-stone-500 animate-pulse bg-stone-100 px-4 py-2.5 rounded-xl border border-stone-250">
                Waiting for host to reset lobby...
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: DRAWING SCREEN
  // ==========================================
  if (currentRound && currentRound.status === 'drawing') {
    return (
      <div className="w-full flex flex-col lg:flex-row gap-6 p-4">
        {/* Main Canvas Area */}
        <div className="flex-1 flex flex-col gap-4">
          {/* Round Header */}
          <div className="bg-white/85 backdrop-blur-md border border-stone-200/80 p-4 sm:p-5 rounded-2xl shadow-lg shadow-stone-200/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex flex-col gap-1 min-w-0">
              <span className="text-[10px] font-serif font-bold text-white bg-cozy-primary px-2 py-0.5 rounded-sm w-fit">
                Round {currentRound.round_number} of {room.settings?.maxRounds}
              </span>
              <h2 className="text-lg font-serif font-black text-cozy-fg truncate mt-1 italic">
                &quot;{currentRound.prompt}&quot;
              </h2>
            </div>

            {/* Timer or Status badge */}
            <div className="flex items-center gap-2 self-start sm:self-center font-serif">
              {timeLeft !== null ? (
                <div className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-sm font-bold border-cozy-border bg-cozy-bg text-cozy-muted ${
                  timeLeft <= 10 ? 'animate-pulse' : ''
                }`}>
                  <Timer size={14} className="text-cozy-primary" />
                  <span>{formatTime(timeLeft)}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm border border-cozy-border bg-cozy-bg text-cozy-muted text-xs font-semibold">
                  <Clock size={12} />
                  <span>Untimed</span>
                </div>
              )}

              {/* Submit Button */}
              {!hasSubmitted ? (
                <button
                  onClick={() => { submitDrawing(); playPop(); }}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 bg-orange-500 hover:bg-orange-600 disabled:bg-stone-300 text-white font-bold px-4 py-2 rounded-xl text-sm shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  {isSubmitting ? 'Submitting...' : 'Submit Draft'}
                </button>
              ) : (
                <div className="flex items-center gap-1 bg-emerald-100 border border-emerald-200 text-emerald-700 px-3 py-1.5 rounded-xl text-xs font-bold">
                  <CheckCircle size={14} />
                  <span>Submitted</span>
                </div>
              )}
            </div>
          </div>

          {/* Drawing Canvas and controls */}
          {!hasSubmitted ? (
            <div className="flex-1 flex flex-col gap-4 min-h-[500px]">
              <div className="flex-1 border border-stone-250 rounded-2xl overflow-hidden bg-stone-50 relative min-h-[400px]">
                <DrawingCanvas
                  ref={canvasRef}
                  tool={tool}
                  color={color}
                  size={size}
                  opacity={opacity}
                  fillShape={fillShape}
                  onHistoryChange={(undo, redo) => {
                    setCanUndo(undo);
                    setCanRedo(redo);
                    // Sync drawing status with other player
                    updatePresence({ isDrawing: true });
                  }}
                />
              </div>

              <DrawingToolbar
                tool={tool}
                setTool={setTool}
                color={color}
                setColor={setColor}
                size={size}
                setSize={setSize}
                opacity={opacity}
                setOpacity={setOpacity}
                fillShape={fillShape}
                setFillShape={setFillShape}
                canUndo={canUndo}
                canRedo={canRedo}
                onUndo={() => canvasRef.current?.undo()}
                onRedo={() => canvasRef.current?.redo()}
                onClear={() => {
                  canvasRef.current?.clear();
                  updatePresence({ isDrawing: false });
                }}
                onZoomIn={() => canvasRef.current?.zoomIn()}
                onZoomOut={() => canvasRef.current?.zoomOut()}
                onResetZoom={() => canvasRef.current?.resetZoomPan()}
                onExport={submitDrawing}
              />
            </div>
          ) : (
            // WAITING ROOM SCREEN AFTER SUBMITTING
            <div className="flex-1 bg-cozy-card border-2 border-cozy-secondary rounded-2xl p-8 flex flex-col items-center justify-center text-center gap-4 py-16 shadow-lg">
              <div className="p-5 bg-cozy-bg border border-cozy-primary text-cozy-primary rounded-full animate-bounce">
                <Smile size={32} className="text-cozy-primary" />
              </div>
              <div className="flex flex-col gap-1 max-w-sm font-serif">
                <span className="text-lg font-bold text-cozy-fg">Drawing Submitted!</span>
                <p className="text-xs text-cozy-muted leading-relaxed mt-1 italic">
                  Nice work! Your artwork has been framed. Waiting for your opponent to put down their brush...
                </p>
              </div>

              {/* Show preview of own drawing */}
              {drawings.find((d) => d.round_id === currentRound.id && d.player_id === playerId)?.image_url && (
                <div className="mt-4 border-8 border-cozy-card bg-cozy-card shadow-md aspect-4/3 max-w-[320px] ring-1 ring-cozy-border relative">
                  <img
                    src={drawings.find((d) => d.round_id === currentRound.id && d.player_id === playerId)?.image_url || ''}
                    alt="My submitted drawing"
                    className="object-contain w-full h-full bg-cozy-bg border border-cozy-border"
                  />
                  <WaxSeal
                    motif="heart"
                    size={40}
                    className="absolute -top-3 -right-3 z-10 text-cozy-primary rotate-12"
                  />
                </div>
              )}

              {isHost && (
                <button
                  onClick={() => { handleReveal(); playPop(); }}
                  className="mt-6 flex items-center gap-1.5 bg-cozy-primary hover:bg-cozy-primary-hover text-white font-serif font-bold px-5 py-2.5 rounded-xl text-sm shadow-md active:scale-95 transition-all cursor-pointer"
                >
                  <span>Skip Timer & Reveal</span>
                  <ArrowRight size={14} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Side Panel (Presence & History) */}
        <div className="w-full lg:w-[320px] flex flex-col gap-6 shrink-0">
          <RoomPresence players={players} currentPlayerId={playerId} />
          <Gallery drawings={drawings} currentPlayerId={playerId} />
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: REVEAL & RATE SCREEN
  // ==========================================
  if (currentRound && currentRound.status === 'reveal') {
    const roundDrawings = getRoundDrawings();

    return (
      <div className="w-full flex flex-col lg:flex-row gap-6 p-4">
        {/* Main Exhibition Area */}
        <div className="flex-1 flex flex-col gap-6 bg-cozy-card border border-cozy-border p-6 rounded-2xl shadow-[0_4px_12px_rgba(232,180,184,0.15)] select-none">
          
          {/* Header */}
          <div className="flex flex-col gap-1 border-b border-cozy-border pb-4 text-center">
            <span className="text-[10px] font-serif font-bold text-white bg-cozy-primary px-3 py-0.5 rounded-sm w-fit mx-auto uppercase tracking-wider">
              Round {currentRound.round_number} Exhibition
            </span>
            <h2 className="text-xl font-serif font-black text-cozy-fg italic mt-2">
              &quot;{currentRound.prompt}&quot;
            </h2>
            <p className="text-xs text-cozy-muted mt-1 italic">
              Tap a wax seal reaction below your partner&apos;s canvas to appreciate their masterpiece!
            </p>
          </div>

          {/* Exhibition Canvas Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch mt-3">
            {players.map((player) => {
              const drawing = roundDrawings.find((d) => d.player_id === player.playerId);
              const isMyDrawing = player.playerId === playerId;
              
              // Reactions for this drawing
              const reactions = (drawing?.canvas_data?.reactions as Record<string, string>) || {};
              const reactsByPlayer = Object.entries(reactions).map(([pid, type]) => ({
                playerId: pid,
                playerName: players.find((p) => p.playerId === pid)?.nickname || 'Artist',
                type: type as 'heart' | 'star' | 'crown'
              }));

              return (
                <div
                  key={player.playerId}
                  className={`flex flex-col gap-3 p-3 bg-cozy-card border-8 border-cozy-card shadow-md relative ${
                    isMyDrawing ? 'ring-2 ring-cozy-primary' : 'ring-1 ring-cozy-border'
                  }`}
                >
                  {/* Artist Tag */}
                  <div className="flex justify-between items-center font-serif">
                    <span className="font-bold text-cozy-fg text-sm flex items-center gap-1">
                      {player.nickname}
                      {isMyDrawing && <span className="text-[9px] font-bold text-white bg-cozy-primary px-1 rounded-sm ml-1">You</span>}
                    </span>
                    {player.isHost && <Crown size={12} className="text-cozy-primary fill-cozy-secondary/50 stroke-cozy-primary" />}
                  </div>

                  {/* Artwork Showcase - matted frame style */}
                  <div className="relative aspect-4/3 w-full bg-cozy-bg border-4 border-cozy-border p-3 flex items-center justify-center shadow-inner overflow-hidden">
                    {drawing?.image_url ? (
                      <>
                        <img
                          src={drawing.image_url}
                          alt={`${player.nickname}'s artwork`}
                          className="object-contain w-full h-full bg-white border border-cozy-border shadow-xs"
                        />
                        {/* Stamp WaxSeal completion badge */}
                        <WaxSeal
                          motif="rose"
                          size={46}
                          className="absolute -top-3 -right-3 z-10 text-cozy-primary rotate-12"
                        />
                      </>
                    ) : (
                      <div className="flex flex-col items-center justify-center gap-2 text-cozy-muted">
                        <History size={36} className="stroke-cozy-border animate-spin" />
                        <span className="text-xs font-semibold text-cozy-muted">Loading drawing...</span>
                      </div>
                    )}
                  </div>

                  {/* Reaction Buttons */}
                  {drawing && (
                    <div className="flex flex-col gap-2 mt-1">
                      {/* Active Reaction selector for opponent's drawing */}
                      {/* Active Reaction selector for opponent's drawing */}
                      {!isMyDrawing && (
                        <div className="flex items-center justify-center gap-3 bg-cozy-bg p-2 rounded-xl border border-cozy-border shadow-2xs">
                          <button
                            onClick={() => handleReact(drawing.id, 'heart')}
                            className={`flex items-center justify-center p-2 rounded-xl transition-all active:scale-75 cursor-pointer border ${
                              reactions[playerId] === 'heart'
                                ? 'bg-cozy-secondary/30 border-cozy-primary text-cozy-primary scale-110 shadow-xs'
                                : 'bg-transparent border-transparent text-cozy-muted hover:text-cozy-primary'
                            }`}
                            title="Heart this"
                          >
                            <Heart size={18} className={reactions[playerId] === 'heart' ? 'fill-cozy-primary stroke-cozy-primary' : 'stroke-cozy-muted'} />
                          </button>
                          
                          <button
                            onClick={() => handleReact(drawing.id, 'star')}
                            className={`flex items-center justify-center p-2 rounded-xl transition-all active:scale-75 cursor-pointer border ${
                              reactions[playerId] === 'star'
                                ? 'bg-cozy-secondary/30 border-cozy-primary text-cozy-primary scale-110 shadow-xs'
                                : 'bg-transparent border-transparent text-cozy-muted hover:text-cozy-primary'
                            }`}
                            title="Star this"
                          >
                            <Star size={18} className={reactions[playerId] === 'star' ? 'fill-cozy-primary stroke-cozy-primary' : 'stroke-cozy-muted'} />
                          </button>

                          <button
                            onClick={() => handleReact(drawing.id, 'crown')}
                            className={`flex items-center justify-center p-2 rounded-xl transition-all active:scale-75 cursor-pointer border ${
                              reactions[playerId] === 'crown'
                                ? 'bg-cozy-secondary/30 border-cozy-primary text-cozy-primary scale-110 shadow-xs'
                                : 'bg-transparent border-transparent text-cozy-muted hover:text-cozy-primary'
                            }`}
                            title="Crown this"
                          >
                            <Crown size={18} className={reactions[playerId] === 'crown' ? 'fill-cozy-primary stroke-cozy-primary' : 'stroke-cozy-muted'} />
                          </button>
                        </div>
                      )}

                      {/* Display of awarded reactions */}
                      <div className="flex flex-wrap gap-1.5 justify-center min-h-[30px] items-center mt-1">
                        {reactsByPlayer.map((react) => (
                          <div
                            key={react.playerId}
                            className="flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-sm border border-cozy-primary bg-transparent text-cozy-primary shadow-[1px_1px_0px_0px_rgba(92,26,43,0.1)]"
                          >
                            {react.type === 'heart' && <Heart size={10} className="fill-cozy-primary stroke-cozy-primary" />}
                            {react.type === 'star' && <Star size={10} className="fill-cozy-primary stroke-cozy-primary" />}
                            {react.type === 'crown' && <Crown size={10} className="fill-cozy-primary stroke-cozy-primary" />}
                            <span className="font-serif ml-0.5">{react.playerName}</span>
                          </div>
                        ))}
                        {reactsByPlayer.length === 0 && (
                          <span className="text-[10px] text-cozy-muted/60 italic font-semibold font-serif">No stamp reviews yet...</span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Action Footer */}
          <div className="flex justify-center border-t border-cozy-border pt-5 mt-4">
            {isHost ? (
              <button
                onClick={() => { handleNextRound(); playPop(); }}
                className="flex items-center gap-2 bg-cozy-primary hover:bg-cozy-primary-hover text-white font-serif font-bold px-8 py-3.5 rounded-xl shadow-md active:scale-95 transition-all cursor-pointer"
              >
                <span>
                  {currentRound.round_number >= room.settings?.maxRounds 
                    ? 'Finish Game & View Leaderboard' 
                    : 'Next Round'}
                </span>
                <ChevronRight size={16} />
              </button>
            ) : (
              <div className="text-sm font-serif font-semibold text-cozy-muted animate-pulse bg-cozy-bg px-4 py-2.5 rounded-xl border border-cozy-border">
                Waiting for host to transition...
              </div>
            )}
          </div>

        </div>

        {/* Side Panel (Leaderboard & History) */}
        <div className="w-full lg:w-[320px] flex flex-col gap-6 shrink-0 font-serif">
          <div className="bg-cozy-card border border-cozy-border p-5 rounded-2xl shadow-[0_4px_12px_rgba(232,180,184,0.12)]">
            <h3 className="text-xs font-bold uppercase tracking-wider text-cozy-primary flex items-center gap-1.5 border-b border-cozy-border pb-2 mb-3">
              <Trophy size={14} className="text-cozy-primary fill-cozy-secondary/50" />
              Real-time Scorecard
            </h3>
            
            <div className="flex flex-col gap-2.5">
              {totalScores.map((scoreCard, index) => (
                <div key={scoreCard.playerId} className="flex justify-between items-center text-sm">
                  <span className="font-bold text-cozy-fg flex items-center gap-1">
                    <span className="text-[10px] bg-cozy-bg border border-cozy-border px-1.5 py-0.5 rounded text-cozy-muted font-mono">#{index+1}</span>
                    {scoreCard.name}
                  </span>
                  <span className="font-black text-cozy-primary">{scoreCard.score} pts</span>
                </div>
              ))}
            </div>
          </div>
          <Gallery drawings={drawings} currentPlayerId={playerId} />
        </div>
      </div>
    );
  }

  return null;
};
GameController.displayName = 'GameController';
