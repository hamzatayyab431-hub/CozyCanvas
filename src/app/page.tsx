"use client";

import React, { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { supabase } from '../lib/supabase';
import { getOrCreatePlayerId } from '../hooks/useRoomRealtime';
import { Pencil, Users, Plus, ArrowRight, ArrowLeft, Palette, Sparkles, ChevronRight, Sun, Moon } from 'lucide-react';
import { DrawingCanvas, DrawingCanvasRef, LayerConfig } from '../components/DrawingCanvas';
import { DrawingToolbar } from '../components/DrawingToolbar';
import { ToolType, BrushType } from '../lib/drawing-utils';
import { playPop } from '../lib/sound-utils';
import { WaxSeal } from '../components/WaxSeal';

export default function Home() {
  const router = useRouter();
  const canvasRef = useRef<DrawingCanvasRef>(null);

  // Mode Selection: 'menu' | 'sandbox'
  const [mode, setMode] = useState<'menu' | 'sandbox'>('menu');

  // Sandbox drawing settings states
  const [tool, setTool] = useState<ToolType>('pen');
  const [color, setColor] = useState<string>('#E05A47');
  const [size, setSize] = useState<number>(8);
  const [opacity, setOpacity] = useState<number>(1.0);
  const [fillShape, setFillShape] = useState<boolean>(false);
  const [historyState, setHistoryState] = useState({ canUndo: false, canRedo: false });

  // Advanced drawing capabilities states
  const [brushType, setBrushType] = useState<BrushType>('pen');
  const [activeLayerId, setActiveLayerId] = useState<'background' | 'sketch' | 'details'>('sketch');
  const [layers, setLayers] = useState<LayerConfig[]>([
    { id: 'background', name: 'Background Layer', visible: true, opacity: 1.0, locked: false },
    { id: 'sketch', name: 'Sketch Layer', visible: true, opacity: 1.0, locked: false },
    { id: 'details', name: 'Details Layer', visible: true, opacity: 1.0, locked: false },
  ]);
  const [symmetryMode, setSymmetryMode] = useState<'none' | 'vertical' | 'horizontal' | 'both'>('none');
  const [gridVisible, setGridVisible] = useState<boolean>(false);
  const [gridSize, setGridSize] = useState<number>(40);
  const [refImage, setRefImage] = useState<File | null>(null);
  const [refScale, setRefScale] = useState<number>(1.0);
  const [refX, setRefX] = useState<number>(0);
  const [refY, setRefY] = useState<number>(0);
  const [refOpacity, setRefOpacity] = useState<number>(0.3);
  const [activeStamp, setActiveStamp] = useState<string>('❤️');

  // Multiplayer join/create states
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [playerId] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return getOrCreatePlayerId();
    }
    return '';
  });

  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return document.documentElement.classList.contains('dark');
    }
    return false;
  });

  const toggleDarkMode = () => {
    playPop();
    const isDark = document.documentElement.classList.toggle('dark');
    setIsDarkMode(isDark);
  };

  // Generate a random 4-letter room code
  const generateRoomCode = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
  };

  // Create room handler
  const handleCreateRoom = async () => {
    if (isCreating) return;
    setIsCreating(true);
    playPop();

    try {
      const code = generateRoomCode();
      const { error } = await supabase
        .from('rooms')
        .insert({
          code,
          host_id: playerId,
          status: 'waiting',
          settings: { maxRounds: 3, roundDuration: 60, category: 'all' }
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating room:', error);
        alert('Failed to create room. Please try again.');
      } else {
        router.push(`/room/${code}`);
      }
    } catch (err) {
      console.error('Unexpected error creating room:', err);
      alert('An error occurred. Please verify your connection.');
    } finally {
      setIsCreating(false);
    }
  };

  // Join room handler
  const handleJoinRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    playPop();
    const cleanCode = roomCodeInput.trim().toUpperCase();
    if (!cleanCode || isJoining) return;

    setIsJoining(true);
    try {
      const { data, error } = await supabase
        .from('rooms')
        .select('id, code')
        .eq('code', cleanCode)
        .single();

      if (error || !data) {
        alert('Room not found! Check the room code and try again.');
      } else {
        router.push(`/room/${cleanCode}`);
      }
    } catch (err) {
      console.error('Unexpected error joining room:', err);
      alert('An error occurred joining the room.');
    } finally {
      setIsJoining(false);
    }
  };

  // Handle Sandbox PNG export
  const handleExport = () => {
    if (!canvasRef.current) return;
    playPop();
    const dataUrl = canvasRef.current.exportPNG('#ffffff');
    if (!dataUrl) return;

    const link = document.createElement('a');
    link.download = `cozy-canvas-doodle-${Date.now()}.png`;
    link.href = dataUrl;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleLobbyReturn = () => {
    playPop();
    setMode('menu');
  };

  const handleSandboxEnter = () => {
    playPop();
    setMode('sandbox');
  };

  // Render main landing menu
  if (mode === 'menu') {
    return (
      <div className="min-h-screen w-screen bg-cozy-bg flex items-center justify-center p-4 font-sans select-none antialiased relative overflow-hidden transition-colors duration-300 paper-texture vignette-overlay">
        {/* Soft atmospheric background shapes */}
        <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] rounded-full bg-rose-200/20 dark:bg-rose-950/10 blur-3xl pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-10%] w-[50vw] h-[50vw] rounded-full bg-rose-300/10 dark:bg-rose-950/5 blur-3xl pointer-events-none" />

        <div className="max-w-4xl w-full flex flex-col gap-8 items-center text-center relative z-10">
          {/* Header Title */}
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-3 mb-2">
              <WaxSeal className="text-cozy-primary animate-cozy-float" size={56} motif="heart" />
              <h1 className="text-4xl md:text-5xl font-serif font-black text-cozy-fg tracking-wide mt-2">
                Cozy Canvas
              </h1>
            </div>
            <p className="text-sm font-serif font-semibold text-cozy-muted max-w-sm leading-relaxed italic">
              Create, duel, and rate lovely drawings in real time.
            </p>
          </div>

          {/* Action Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full max-w-3xl mt-4">
            
            {/* Multiplayer Card */}
            <div className="bg-cozy-card border border-cozy-border p-6 rounded-3xl shadow-xl shadow-stone-200/10 flex flex-col justify-between text-left gap-6 transition-all hover:shadow-2xl cozy-interactive">
              <div className="flex flex-col gap-2">
                <div className="p-3 bg-cozy-bg border border-cozy-border rounded-2xl w-fit text-cozy-primary shadow-xs">
                  <Users size={24} />
                </div>
                <h2 className="text-xl font-serif font-black text-cozy-fg">Cozy Canvas</h2>
                <p className="text-xs text-cozy-muted leading-relaxed">
                  Join a real-time multiplayer duel. Draw matching prompts and vote on your favorites with heart, star, and crown reactions.
                </p>
              </div>

              <div className="flex flex-col gap-3">
                {/* Join Form - Vintage Cream Envelope styling */}
                <form onSubmit={handleJoinRoom} className="flex gap-2 p-1 bg-cozy-card border-2 border-cozy-primary rounded-2xl shadow-inner">
                  <input
                    type="text"
                    placeholder="ENTER ROOM CODE"
                    required
                    maxLength={10}
                    value={roomCodeInput}
                    onChange={(e) => setRoomCodeInput(e.target.value.toUpperCase())}
                    className="flex-1 bg-transparent border-0 px-4 py-3 text-xs font-bold tracking-widest text-cozy-fg placeholder-cozy-muted/60 outline-none uppercase"
                  />
                  <button
                    type="submit"
                    disabled={isJoining}
                    className="bg-cozy-primary hover:bg-cozy-primary-hover text-white font-serif font-extrabold px-5 py-3 rounded-xl text-xs flex items-center justify-center gap-1 active:scale-95 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <span>Join</span>
                    <ArrowRight size={14} />
                  </button>
                </form>

                <div className="flex items-center gap-3 text-cozy-border">
                  <div className="h-px bg-cozy-border flex-1" />
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">or</span>
                  <div className="h-px bg-cozy-border flex-1" />
                </div>

                {/* Create Room Button */}
                <button
                  onClick={handleCreateRoom}
                  disabled={isCreating}
                  className="w-full bg-cozy-primary hover:bg-cozy-primary-hover text-white font-bold py-3.5 rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all shadow-md shadow-orange-500/10 cursor-pointer disabled:opacity-50"
                >
                  <Plus size={15} />
                  <span>{isCreating ? 'Creating Room...' : 'Create Duel Room'}</span>
                </button>
              </div>
            </div>

            {/* Sandbox Mode Card */}
            <div className="bg-cozy-card border border-cozy-border p-6 rounded-3xl shadow-xl shadow-stone-200/10 flex flex-col justify-between text-left gap-6 transition-all hover:shadow-2xl cozy-interactive">
              <div className="flex flex-col gap-2">
                <div className="p-3 bg-cozy-bg border border-cozy-border rounded-2xl w-fit text-cozy-accent shadow-xs">
                  <Palette size={24} />
                </div>
                <h2 className="text-xl font-serif font-black text-cozy-fg">Solo Sandbox</h2>
                <p className="text-xs text-cozy-muted leading-relaxed">
                  Practice your drawing skills without a timer. Use perfect-freehand brushes, shape selectors, flood fill, text, and exports.
                </p>
              </div>

              <button
                onClick={handleSandboxEnter}
                className="w-full bg-cozy-accent hover:opacity-90 border border-cozy-border text-cozy-fg font-extrabold py-4 rounded-xl text-xs flex items-center justify-center gap-1.5 active:scale-95 transition-all cursor-pointer"
              >
                <span>Enter Sandbox Canvas</span>
                <ChevronRight size={15} />
              </button>
            </div>

          </div>

          {/* Quick Info & Toggle Footer */}
          <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-cozy-muted bg-cozy-card border border-cozy-border px-3.5 py-1.5 rounded-full">
              <Sparkles size={12} className="text-orange-400" />
              <span>Cozy, playful art engine built on Supabase Realtime</span>
            </div>

            {/* Dark Mode Toggle */}
            <button
              onClick={toggleDarkMode}
              className="flex items-center gap-1.5 text-[11px] font-bold text-cozy-fg bg-cozy-card border border-cozy-border px-3.5 py-1.5 rounded-full hover:bg-cozy-accent transition-all active:scale-95 cursor-pointer shadow-xs"
            >
              {isDarkMode ? <Sun size={12} className="text-amber-500" /> : <Moon size={12} className="text-indigo-400" />}
              <span>{isDarkMode ? "Light Mode" : "Dark Mode"}</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Render Sandbox drawing mode
  return (
    <div className="flex flex-col md:flex-row h-screen w-screen bg-cozy-bg overflow-hidden font-sans select-none antialiased transition-colors duration-300">
      {/* Sidebar Controls */}
      <aside className="w-full md:w-96 p-4 md:p-6 flex flex-col gap-6 border-b md:border-b-0 md:border-r border-cozy-border bg-cozy-card overflow-y-auto shrink-0 shadow-sm z-10">
        
        {/* Header Back Link */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-cozy-primary flex items-center justify-center text-white">
              <Pencil size={15} className="transform rotate-90" />
            </div>
            <span className="font-extrabold text-cozy-fg text-sm">Sandbox Mode</span>
          </div>

          <button
            onClick={handleLobbyReturn}
            className="flex items-center gap-1 border border-cozy-border hover:bg-cozy-bg text-cozy-muted font-bold px-2.5 py-1.5 rounded-lg text-[10px] uppercase tracking-wider transition-all cursor-pointer"
          >
            <ArrowLeft size={10} />
            <span>Lobby</span>
          </button>
        </div>

        {/* Toolbar Component */}
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
          canUndo={historyState.canUndo}
          canRedo={historyState.canRedo}
          onUndo={() => canvasRef.current?.undo()}
          onRedo={() => canvasRef.current?.redo()}
          onClear={() => canvasRef.current?.clear()}
          onZoomIn={() => canvasRef.current?.zoomIn()}
          onZoomOut={() => canvasRef.current?.zoomOut()}
          onResetZoom={() => canvasRef.current?.resetZoomPan()}
          onExport={handleExport}

          brushType={brushType}
          setBrushType={setBrushType}
          activeLayerId={activeLayerId}
          setActiveLayerId={setActiveLayerId}
          layers={layers}
          setLayers={setLayers}
          symmetryMode={symmetryMode}
          setSymmetryMode={setSymmetryMode}
          gridVisible={gridVisible}
          setGridVisible={setGridVisible}
          gridSize={gridSize}
          setGridSize={setGridSize}
          refImage={refImage}
          setRefImage={setRefImage}
          refScale={refScale}
          setRefScale={setRefScale}
          refX={refX}
          setRefX={setRefX}
          refY={refY}
          setRefY={setRefY}
          refOpacity={refOpacity}
          setRefOpacity={setRefOpacity}
          activeStamp={activeStamp}
          setActiveStamp={setActiveStamp}
          onClearLayer={(layerId) => canvasRef.current?.clearLayer(layerId)}
        />

        {/* Instructions */}
        <div className="hidden md:flex flex-col gap-2 mt-auto p-4 bg-cozy-accent border border-cozy-border rounded-2xl">
          <h3 className="text-xs font-bold text-cozy-fg uppercase tracking-wide">
            Drawing Shortcuts
          </h3>
          <ul className="text-[11px] text-cozy-muted space-y-1 font-medium list-disc list-inside">
            <li>Hold <kbd className="px-1 py-0.5 bg-cozy-card rounded border border-cozy-border shadow-2xs font-mono text-[10px]">Space</kbd> + Drag to Pan</li>
            <li>Use Mouse Scroll to Zoom</li>
            <li>Pinch to Zoom on Touchpads/Mobile</li>
            <li>Double tap zoom indicators to reset</li>
          </ul>
        </div>
      </aside>

      {/* Main Canvas Workspace */}
      <main className="flex-1 relative h-full w-full bg-cozy-bg">
        <DrawingCanvas
          ref={canvasRef}
          tool={tool}
          color={color}
          size={size}
          opacity={opacity}
          fillShape={fillShape}
          onHistoryChange={(canUndo, canRedo) =>
            setHistoryState({ canUndo, canRedo })
          }

          brushType={brushType}
          activeLayerId={activeLayerId}
          layers={layers}
          symmetryMode={symmetryMode}
          gridVisible={gridVisible}
          gridSize={gridSize}
          refImage={refImage}
          refScale={refScale}
          refX={refX}
          refY={refY}
          refOpacity={refOpacity}
          activeStamp={activeStamp}
          onColorSelect={setColor}
          onRefImageChange={(x, y) => {
            setRefX(x);
            setRefY(y);
          }}
        />
      </main>
    </div>
  );
}
