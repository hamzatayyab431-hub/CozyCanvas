"use client";

import React, { useState } from 'react';
import {
  Pencil,
  Eraser,
  PaintBucket,
  Minus,
  Square,
  Circle,
  Type,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize,
  Trash2,
  Download,
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  Grid,
  FileImage,
  Sparkles,
} from 'lucide-react';
import { ToolType, BrushType } from '../lib/drawing-utils';
import { LayerConfig } from './DrawingCanvas';
import { playPop } from '../lib/sound-utils';

export interface DrawingToolbarProps {
  tool: ToolType;
  setTool: (tool: ToolType) => void;
  color: string;
  setColor: (color: string) => void;
  size: number;
  setSize: (size: number) => void;
  opacity: number;
  setOpacity: (opacity: number) => void;
  fillShape: boolean;
  setFillShape: (fill: boolean) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetZoom: () => void;
  onExport: () => void;

  // Advanced capability states
  brushType?: BrushType;
  setBrushType?: (brush: BrushType) => void;
  activeLayerId?: 'background' | 'sketch' | 'details';
  setActiveLayerId?: (id: 'background' | 'sketch' | 'details') => void;
  layers?: LayerConfig[];
  setLayers?: React.Dispatch<React.SetStateAction<LayerConfig[]>>;
  symmetryMode?: 'none' | 'vertical' | 'horizontal' | 'both';
  setSymmetryMode?: (mode: 'none' | 'vertical' | 'horizontal' | 'both') => void;
  gridVisible?: boolean;
  setGridVisible?: (visible: boolean) => void;
  gridSize?: number;
  setGridSize?: (size: number) => void;
  refImage?: File | null;
  setRefImage?: (file: File | null) => void;
  refScale?: number;
  setRefScale?: (scale: number) => void;
  refX?: number;
  setRefX?: (x: number) => void;
  refY?: number;
  setRefY?: (y: number) => void;
  refOpacity?: number;
  setRefOpacity?: (opacity: number) => void;
  activeStamp?: string;
  setActiveStamp?: (stamp: string) => void;
  onClearLayer?: (layerId: 'background' | 'sketch' | 'details') => void;
}

const COZY_PALETTE = [
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
  '#ffffff', // White
  '#000000', // Black
];

const STAMPS_LIST = ['❤️', '✨', '👑', '🌸', '🦄', '🌟', '🍕', '🎨', '🐱', '🍀', '☕', '🧸'];

// Helper to convert hex to rgb
function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16);
    const g = parseInt(clean[1] + clean[1], 16);
    const b = parseInt(clean[2] + clean[2], 16);
    return { r, g, b };
  }
  if (clean.length === 6) {
    const r = parseInt(clean.substring(0, 2), 16);
    const g = parseInt(clean.substring(2, 4), 16);
    const b = parseInt(clean.substring(4, 6), 16);
    return { r, g, b };
  }
  return null;
}

export const DrawingToolbar: React.FC<DrawingToolbarProps> = ({
  tool,
  setTool,
  color,
  setColor,
  size,
  setSize,
  opacity,
  setOpacity,
  fillShape,
  setFillShape,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onClear,
  onZoomIn,
  onZoomOut,
  onResetZoom,
  onExport,

  brushType = 'pen',
  setBrushType = () => {},
  activeLayerId = 'sketch',
  setActiveLayerId = () => {},
  layers = [
    { id: 'background', name: 'Background Layer', visible: true, opacity: 1.0, locked: false },
    { id: 'sketch', name: 'Sketch Layer', visible: true, opacity: 1.0, locked: false },
    { id: 'details', name: 'Details Layer', visible: true, opacity: 1.0, locked: false },
  ],
  setLayers = () => {},
  symmetryMode = 'none',
  setSymmetryMode = () => {},
  gridVisible = false,
  setGridVisible = () => {},
  gridSize = 40,
  setGridSize = () => {},
  refImage = null,
  setRefImage = () => {},
  refScale = 1.0,
  setRefScale = () => {},
  refX = 0,
  setRefX = () => {},
  refY = 0,
  setRefY = () => {},
  refOpacity = 0.3,
  setRefOpacity = () => {},
  activeStamp = '❤️',
  setActiveStamp = () => {},
  onClearLayer = () => {},
}) => {
  // Toolbar section tabs: 'draw' | 'layers' | 'colors' | 'guides'
  const [activeTab, setActiveTab] = useState<'draw' | 'layers' | 'colors' | 'guides'>('draw');

  // Color Mixer states
  const [colorA, setColorA] = useState('#E05A47');
  const [colorB, setColorB] = useState('#264653');
  const [mixRatio, setMixRatio] = useState(0.5);

  const [recentColors, setRecentColors] = useState<string[]>([
    '#E05A47',
    '#F4A261',
    '#E9C46A',
    '#A2B18A',
    '#4D908E',
    '#264653',
    '#A89FDF',
    '#3D2E2B',
  ]);

  const selectColor = (newColor: string) => {
    setColor(newColor);
    playPop();
    setRecentColors((prev) => {
      const filtered = prev.filter((c) => c.toLowerCase() !== newColor.toLowerCase());
      return [newColor, ...filtered].slice(0, 8);
    });
  };

  const handleMixColors = () => {
    const rgbA = hexToRgb(colorA) || { r: 0, g: 0, b: 0 };
    const rgbB = hexToRgb(colorB) || { r: 0, g: 0, b: 0 };

    const r = Math.round(rgbA.r + (rgbB.r - rgbA.r) * mixRatio);
    const g = Math.round(rgbA.g + (rgbB.g - rgbA.g) * mixRatio);
    const b = Math.round(rgbA.b + (rgbB.b - rgbA.b) * mixRatio);

    const toHex = (c: number) => {
      const s = c.toString(16);
      return s.length === 1 ? '0' + s : s;
    };
    const blended = `#${toHex(r)}${toHex(g)}${toHex(b)}`;
    selectColor(blended);
  };

  // Toggle visibility of a layer
  const toggleLayerVisibility = (layerId: string) => {
    playPop();
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, visible: !l.visible } : l))
    );
  };

  // Toggle lock of a layer
  const toggleLayerLock = (layerId: string) => {
    playPop();
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, locked: !l.locked } : l))
    );
  };

  // Adjust opacity of a layer
  const handleLayerOpacityChange = (layerId: string, val: number) => {
    setLayers((prev) =>
      prev.map((l) => (l.id === layerId ? { ...l, opacity: val } : l))
    );
  };

  const handleTabChange = (tab: typeof activeTab) => {
    playPop();
    setActiveTab(tab);
  };

  const tools: { type: ToolType; label: string; icon: React.ReactNode }[] = [
    { type: 'pen', label: 'Pen', icon: <Pencil size={16} /> },
    { type: 'eraser', label: 'Eraser', icon: <Eraser size={16} /> },
    { type: 'fill', label: 'Bucket', icon: <PaintBucket size={16} /> },
    { type: 'line', label: 'Line', icon: <Minus size={16} /> },
    { type: 'rectangle', label: 'Rect', icon: <Square size={16} /> },
    { type: 'circle', label: 'Circle', icon: <Circle size={16} /> },
    { type: 'triangle', label: 'Triangle', icon: <span className="text-[10px] font-bold">▲</span> },
    { type: 'text', label: 'Text', icon: <Type size={16} /> },
    { type: 'stamp', label: 'Stickers', icon: <Sparkles size={16} /> },
    { type: 'select', label: 'Select', icon: <span className="text-[11px] font-bold">⬚</span> },
    { type: 'eyedropper', label: 'Dropper', icon: <span className="text-[11px] font-bold">🧪</span> },
  ];

  const brushes: { type: BrushType; label: string }[] = [
    { type: 'pen', label: 'Ink Pen' },
    { type: 'marker', label: 'Marker' },
    { type: 'airbrush', label: 'Airbrush' },
    { type: 'pencil', label: 'Pencil' },
  ];

  // Mixed Color calculations for mixer preview swatch
  const rgbA = hexToRgb(colorA) || { r: 0, g: 0, b: 0 };
  const rgbB = hexToRgb(colorB) || { r: 0, g: 0, b: 0 };
  const previewR = Math.round(rgbA.r + (rgbB.r - rgbA.r) * mixRatio);
  const previewG = Math.round(rgbA.g + (rgbB.g - rgbA.g) * mixRatio);
  const previewB = Math.round(rgbA.b + (rgbB.b - rgbA.b) * mixRatio);
  const previewHex = `#${[previewR, previewG, previewB]
    .map((c) => {
      const s = c.toString(16);
      return s.length === 1 ? '0' + s : s;
    })
    .join('')}`;

  return (
    <div className="flex flex-col gap-4 w-full bg-cozy-card p-4 border border-cozy-border rounded-2xl shadow-xl shadow-stone-200/40 select-none">
      
      {/* Tab Navigation header */}
      <div className="flex border-b border-cozy-border pb-2 gap-1 overflow-x-auto select-none">
        <button
          onClick={() => handleTabChange('draw')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'draw' ? 'bg-cozy-primary text-white' : 'text-cozy-muted hover:bg-cozy-bg'
          }`}
        >
          Draw & Tools
        </button>
        <button
          onClick={() => handleTabChange('layers')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'layers' ? 'bg-cozy-primary text-white' : 'text-cozy-muted hover:bg-cozy-bg'
          }`}
        >
          Layers
        </button>
        <button
          onClick={() => handleTabChange('colors')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'colors' ? 'bg-cozy-primary text-white' : 'text-cozy-muted hover:bg-cozy-bg'
          }`}
        >
          Mixer
        </button>
        <button
          onClick={() => handleTabChange('guides')}
          className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
            activeTab === 'guides' ? 'bg-cozy-primary text-white' : 'text-cozy-muted hover:bg-cozy-bg'
          }`}
        >
          Guides
        </button>
      </div>

      {/* Tab content panels */}
      <div className="flex-1 min-h-[260px] max-h-[400px] overflow-y-auto pr-1">
        
        {/* TAB 1: DRAW & TOOLS */}
        {activeTab === 'draw' && (
          <div className="flex flex-col gap-4">
            
            {/* Tool picker grid */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">Tool</span>
              <div className="grid grid-cols-4 gap-1.5">
                {tools.map((item) => (
                  <button
                    key={item.type}
                    onClick={() => {
                      setTool(item.type);
                      playPop();
                    }}
                    title={item.label}
                    className={`flex items-center justify-center gap-1.5 p-2 rounded-xl border text-xs font-bold transition-all active:scale-95 cursor-pointer ${
                      tool === item.type
                        ? 'bg-cozy-primary text-white border-cozy-primary shadow-sm shadow-orange-500/10'
                        : 'bg-cozy-bg text-cozy-fg border-cozy-border hover:bg-cozy-border'
                    }`}
                  >
                    {item.icon}
                    <span className="hidden lg:inline text-[10px]">{item.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Brush settings panel */}
            <div className="flex flex-col gap-3 bg-cozy-bg p-3 border border-cozy-border rounded-xl">
              
              {/* Brush Type Selector (only for pen tool) */}
              {tool === 'pen' && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">Brush Style</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {brushes.map((b) => (
                      <button
                        key={b.type}
                        onClick={() => {
                          setBrushType(b.type);
                          playPop();
                        }}
                        className={`py-1.5 px-2 rounded-lg text-[10px] font-bold border transition-all cursor-pointer ${
                          brushType === b.type
                            ? 'bg-cozy-fg text-cozy-bg border-cozy-fg'
                            : 'bg-cozy-card text-cozy-fg border-cozy-border hover:bg-cozy-border'
                        }`}
                      >
                        {b.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Stamp Sticker selection */}
              {tool === 'stamp' && (
                <div className="flex flex-col gap-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">Choose Sticker</span>
                  <div className="grid grid-cols-6 gap-1.5">
                    {STAMPS_LIST.map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => {
                          setActiveStamp(emoji);
                          playPop();
                        }}
                        className={`text-xl p-1 rounded-lg border transition-all active:scale-75 cursor-pointer ${
                          activeStamp === emoji
                            ? 'bg-cozy-primary/10 border-cozy-primary scale-110'
                            : 'bg-cozy-card border-cozy-border hover:bg-cozy-border'
                        }`}
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Size Slider */}
              <div className="flex flex-col gap-1">
                <div className="flex justify-between items-center text-xs font-semibold text-cozy-fg">
                  <span>Size / Thickness</span>
                  <span className="bg-cozy-card px-1.5 py-0.5 rounded border border-cozy-border text-[10px] text-cozy-muted font-mono">
                    {size}px
                  </span>
                </div>
                <input
                  type="range"
                  min={tool === 'stamp' ? '12' : '1'}
                  max={tool === 'stamp' ? '300' : '100'}
                  value={size}
                  onChange={(e) => setSize(Number(e.target.value))}
                  className="w-full h-1 bg-cozy-border rounded-lg appearance-none cursor-pointer accent-cozy-primary"
                />
              </div>

              {/* Opacity Slider */}
              {tool !== 'eraser' && tool !== 'fill' && tool !== 'select' && tool !== 'eyedropper' && (
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center text-xs font-semibold text-cozy-fg">
                    <span>Opacity / Transparency</span>
                    <span className="bg-cozy-card px-1.5 py-0.5 rounded border border-cozy-border text-[10px] text-cozy-muted font-mono">
                      {Math.round(opacity * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="0.1"
                    max="1.0"
                    step="0.05"
                    value={opacity}
                    onChange={(e) => setOpacity(Number(e.target.value))}
                    className="w-full h-1 bg-cozy-border rounded-lg appearance-none cursor-pointer accent-cozy-primary"
                  />
                </div>
              )}

              {/* Shapes Fill Selector Toggle */}
              {(tool === 'rectangle' || tool === 'circle' || tool === 'triangle') && (
                <div className="flex items-center justify-between pt-1 border-t border-cozy-border">
                  <span className="text-xs font-semibold text-cozy-fg">Fill Shape</span>
                  <button
                    onClick={() => {
                      setFillShape(!fillShape);
                      playPop();
                    }}
                    className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-all duration-300 cursor-pointer ${
                      fillShape ? 'bg-cozy-primary' : 'bg-cozy-border'
                    }`}
                  >
                    <div
                      className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${
                        fillShape ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              )}

            </div>
          </div>
        )}

        {/* TAB 2: LAYERS MANAGEMENT */}
        {activeTab === 'layers' && (
          <div className="flex flex-col gap-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">Layers Hierarchy</span>
            <div className="flex flex-col gap-2">
              {/* Render layer settings items starting details on top */}
              {layers
                .slice()
                .reverse()
                .map((layer) => {
                  const isActive = activeLayerId === layer.id;
                  return (
                    <div
                      key={layer.id}
                      className={`flex flex-col gap-1.5 p-2.5 border rounded-xl transition-all ${
                        isActive
                          ? 'border-cozy-primary bg-cozy-primary/5'
                          : 'border-cozy-border bg-cozy-bg'
                      }`}
                    >
                      {/* Top row elements */}
                      <div className="flex items-center justify-between">
                        <button
                          onClick={() => {
                            setActiveLayerId(layer.id);
                            playPop();
                          }}
                          className={`flex items-center gap-2 font-bold text-xs cursor-pointer ${
                            isActive ? 'text-cozy-primary' : 'text-cozy-fg hover:underline'
                          }`}
                        >
                          <Layers size={13} />
                          <span>{layer.name}</span>
                          {isActive && <span className="text-[8px] bg-cozy-primary text-white font-black px-1.5 py-0.5 rounded-full uppercase tracking-wider scale-90">active</span>}
                        </button>

                        {/* Controls */}
                        <div className="flex items-center gap-1.5">
                          {/* Toggle visibility */}
                          <button
                            onClick={() => toggleLayerVisibility(layer.id)}
                            title={layer.visible ? 'Hide Layer' : 'Show Layer'}
                            className="p-1 rounded text-cozy-muted hover:text-cozy-fg hover:bg-cozy-card transition-colors cursor-pointer"
                          >
                            {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                          </button>
                          {/* Toggle lock */}
                          <button
                            onClick={() => toggleLayerLock(layer.id)}
                            title={layer.locked ? 'Unlock Layer' : 'Lock Layer'}
                            className="p-1 rounded text-cozy-muted hover:text-cozy-fg hover:bg-cozy-card transition-colors cursor-pointer"
                          >
                            {layer.locked ? <Lock size={13} className="text-amber-600" /> : <Unlock size={13} />}
                          </button>
                          {/* Clear layer drawings */}
                          <button
                            onClick={() => {
                              playPop();
                              onClearLayer(layer.id);
                            }}
                            title="Clear Layer Drawings"
                            className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 transition-colors cursor-pointer"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>

                      {/* Opacity slider for Layer */}
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-semibold text-cozy-muted w-10 shrink-0">Opacity</span>
                        <input
                          type="range"
                          min="0.0"
                          max="1.0"
                          step="0.1"
                          value={layer.opacity}
                          onChange={(e) => handleLayerOpacityChange(layer.id, Number(e.target.value))}
                          disabled={layer.locked}
                          className="flex-1 h-0.5 bg-cozy-border appearance-none cursor-pointer accent-cozy-primary disabled:opacity-30"
                        />
                        <span className="text-[9px] font-mono text-cozy-muted w-6 text-right">
                          {Math.round(layer.opacity * 100)}%
                        </span>
                      </div>

                    </div>
                  );
                })}
            </div>
          </div>
        )}

        {/* TAB 3: COLORS & MIXER */}
        {activeTab === 'colors' && (
          <div className="flex flex-col gap-4">
            
            {/* Color Palette Grid */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">Cozy Palette</span>
              <div className="grid grid-cols-6 gap-2 bg-cozy-bg p-2.5 border border-cozy-border rounded-xl">
                {COZY_PALETTE.map((c) => (
                  <button
                    key={c}
                    onClick={() => selectColor(c)}
                    className={`w-7 h-7 rounded-full border border-cozy-border shadow-sm cursor-pointer hover:scale-105 active:scale-75 transition-all relative ${
                      color.toLowerCase() === c.toLowerCase() ? 'ring-2 ring-cozy-primary ring-offset-2' : ''
                    }`}
                    style={{ backgroundColor: c }}
                    title={c}
                  />
                ))}
                
                {/* HTML5 color picker */}
                <div className="relative w-7 h-7 rounded-full border border-cozy-border bg-linear-to-tr from-rose-400 via-amber-300 to-indigo-400 shadow-sm cursor-pointer hover:scale-105 transition-all">
                  <input
                    type="color"
                    value={color}
                    onChange={(e) => selectColor(e.target.value)}
                    className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    title="Custom Color"
                  />
                </div>
              </div>
            </div>

            {/* Recents colors list */}
            {recentColors.length > 0 && (
              <div className="flex flex-col gap-1 bg-cozy-bg p-2.5 border border-cozy-border rounded-xl">
                <span className="text-[9px] font-bold uppercase tracking-wider text-cozy-muted">Recent Colors</span>
                <div className="flex flex-wrap gap-1.5">
                  {recentColors.map((c) => (
                    <button
                      key={c}
                      onClick={() => {
                        setColor(c);
                        playPop();
                      }}
                      className={`w-6 h-6 rounded-md border border-cozy-border shadow-2xs hover:scale-105 active:scale-75 transition-all cursor-pointer ${
                        color.toLowerCase() === c.toLowerCase() ? 'ring-1.5 ring-cozy-primary ring-offset-1' : ''
                      }`}
                      style={{ backgroundColor: c }}
                      title={c}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* COLOR BLENDER PANEL */}
            <div className="flex flex-col gap-2 bg-cozy-bg p-3 border border-cozy-border rounded-xl">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">Color Blender</span>
              
              <div className="flex items-center justify-between gap-2">
                {/* Color A Selector */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 rounded-xl border border-cozy-border shadow-xs hover:scale-105 active:scale-75 transition-all relative cursor-pointer"
                    style={{ backgroundColor: colorA }}
                  >
                    <input
                      type="color"
                      value={colorA}
                      onChange={(e) => setColorA(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-[9px] font-bold text-cozy-muted">Color A</span>
                </div>

                {/* Slider */}
                <div className="flex-1 flex flex-col gap-1 items-center px-2">
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={mixRatio}
                    onChange={(e) => setMixRatio(Number(e.target.value))}
                    className="w-full h-1 bg-cozy-border rounded-lg appearance-none cursor-pointer accent-cozy-primary"
                  />
                  <span className="text-[9px] font-mono text-cozy-muted">
                    Mix: {Math.round(mixRatio * 100)}%
                  </span>
                </div>

                {/* Color B Selector */}
                <div className="flex flex-col items-center gap-1">
                  <div
                    className="w-10 h-10 rounded-xl border border-cozy-border shadow-xs hover:scale-105 active:scale-75 transition-all relative cursor-pointer"
                    style={{ backgroundColor: colorB }}
                  >
                    <input
                      type="color"
                      value={colorB}
                      onChange={(e) => setColorB(e.target.value)}
                      className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                    />
                  </div>
                  <span className="text-[9px] font-bold text-cozy-muted">Color B</span>
                </div>
              </div>

              {/* Blended Result preview */}
              <div className="flex items-center gap-3 pt-2 border-t border-cozy-border/50">
                <div
                  className="w-8 h-8 rounded-lg border border-cozy-border shadow-2xs shrink-0"
                  style={{ backgroundColor: previewHex }}
                />
                <div className="flex-1">
                  <div className="text-[10px] font-bold text-cozy-fg">Blended Swatch</div>
                  <div className="text-[9px] text-cozy-muted font-mono">{previewHex.toUpperCase()}</div>
                </div>
                <button
                  onClick={handleMixColors}
                  className="bg-cozy-primary hover:bg-cozy-primary-hover text-white font-bold px-3 py-1.5 rounded-lg text-[10px] active:scale-95 transition-all cursor-pointer"
                >
                  Use Blend
                </button>
              </div>

            </div>

          </div>
        )}

        {/* TAB 4: GUIDES & REFERENCES */}
        {activeTab === 'guides' && (
          <div className="flex flex-col gap-4">
            
            {/* Symmetry selector */}
            <div className="flex flex-col gap-1.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-cozy-muted">Symmetry Mode</span>
              <div className="grid grid-cols-4 gap-1.5">
                {(['none', 'vertical', 'horizontal', 'both'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => {
                      setSymmetryMode(mode);
                      playPop();
                    }}
                    className={`py-2 rounded-xl border text-[10px] font-bold capitalize transition-all active:scale-95 cursor-pointer ${
                      symmetryMode === mode
                        ? 'bg-cozy-primary text-white border-cozy-primary'
                        : 'bg-cozy-bg text-cozy-fg border-cozy-border hover:bg-cozy-border'
                    }`}
                  >
                    {mode === 'both' ? 'both (4-way)' : mode}
                  </button>
                ))}
              </div>
            </div>

            {/* Grid guides settings */}
            <div className="flex flex-col gap-2.5 bg-cozy-bg p-3 border border-cozy-border rounded-xl">
              
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-cozy-fg flex items-center gap-1.5">
                  <Grid size={13} />
                  <span>Grid Overlay Guide</span>
                </span>
                
                {/* Visibility Switch */}
                <button
                  onClick={() => {
                    setGridVisible(!gridVisible);
                    playPop();
                  }}
                  className={`w-9 h-5 flex items-center rounded-full p-0.5 transition-all duration-300 cursor-pointer ${
                    gridVisible ? 'bg-cozy-primary' : 'bg-cozy-border'
                  }`}
                >
                  <div
                    className={`bg-white w-4 h-4 rounded-full shadow-md transform duration-300 ${
                      gridVisible ? 'translate-x-4' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              {/* Grid cell size */}
              {gridVisible && (
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-cozy-muted">Cell Size (px)</span>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="number"
                      min="10"
                      max="150"
                      value={gridSize}
                      onChange={(e) => setGridSize(Math.max(10, Math.min(150, Number(e.target.value))))}
                      className="w-16 bg-cozy-card border border-cozy-border rounded px-1.5 py-0.5 text-center text-xs font-semibold text-cozy-fg outline-none"
                    />
                  </div>
                </div>
              )}

            </div>

            {/* Tracing Reference Underlay settings */}
            <div className="flex flex-col gap-2.5 bg-cozy-bg p-3 border border-cozy-border rounded-xl">
              <span className="text-xs font-semibold text-cozy-fg flex items-center gap-1.5">
                <FileImage size={13} />
                <span>Reference Tracing Image</span>
              </span>

              {/* File selector input */}
              <div className="flex items-center gap-2">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const file = e.target.files?.[0] || null;
                    setRefImage(file);
                    playPop();
                  }}
                  className="hidden"
                  id="ref-img-upload"
                />
                <label
                  htmlFor="ref-img-upload"
                  className="flex-1 bg-cozy-card border border-cozy-border hover:bg-cozy-border px-3 py-2 rounded-xl text-center text-[10px] font-bold text-cozy-fg tracking-wide uppercase cursor-pointer transition-colors"
                >
                  {refImage ? `Change: ${refImage.name.substring(0, 15)}...` : 'Upload Reference'}
                </label>
                {refImage && (
                  <button
                    onClick={() => {
                      setRefImage(null);
                      playPop();
                    }}
                    className="p-2 border border-rose-200 bg-rose-50 text-rose-600 rounded-xl hover:bg-rose-100 transition-colors cursor-pointer"
                    title="Remove Tracing Image"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>

              {/* Reference image positioning attributes */}
              {refImage && (
                <div className="flex flex-col gap-2 pt-2 border-t border-cozy-border/50 text-xs">
                  {/* Opacity */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[10px] text-cozy-muted font-semibold">
                      <span>Image Opacity</span>
                      <span>{Math.round(refOpacity * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.0"
                      max="1.0"
                      step="0.05"
                      value={refOpacity}
                      onChange={(e) => setRefOpacity(Number(e.target.value))}
                      className="w-full h-1 bg-cozy-border rounded accent-cozy-primary appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Scale */}
                  <div className="flex flex-col gap-0.5">
                    <div className="flex justify-between text-[10px] text-cozy-muted font-semibold">
                      <span>Image Scale</span>
                      <span>{Math.round(refScale * 100)}%</span>
                    </div>
                    <input
                      type="range"
                      min="0.1"
                      max="3.0"
                      step="0.05"
                      value={refScale}
                      onChange={(e) => setRefScale(Number(e.target.value))}
                      className="w-full h-1 bg-cozy-border rounded accent-cozy-primary appearance-none cursor-pointer"
                    />
                  </div>

                  {/* Position coordinates offsets */}
                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="flex flex-col gap-0.5">
                      <span className="text-cozy-muted font-semibold">X Offset (px)</span>
                      <input
                        type="number"
                        value={refX}
                        onChange={(e) => setRefX(Number(e.target.value))}
                        className="w-full bg-cozy-card border border-cozy-border rounded p-1 text-center font-mono font-bold text-cozy-fg outline-none"
                      />
                    </div>
                    <div className="flex flex-col gap-0.5">
                      <span className="text-cozy-muted font-semibold">Y Offset (px)</span>
                      <input
                        type="number"
                        value={refY}
                        onChange={(e) => setRefY(Number(e.target.value))}
                        className="w-full bg-cozy-card border border-cozy-border rounded p-1 text-center font-mono font-bold text-cozy-fg outline-none"
                      />
                    </div>
                  </div>

                </div>
              )}

            </div>

          </div>
        )}

      </div>

      {/* 4. Canvas Actions (Undo, Redo, Zoom, Clear, Export) */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-3 border-t border-cozy-border select-none shrink-0">
        
        {/* Undo / Redo */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              onUndo();
              playPop();
            }}
            disabled={!canUndo}
            title="Undo"
            className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg hover:bg-cozy-bg hover:text-cozy-fg disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
          >
            <Undo2 size={14} />
          </button>
          <button
            onClick={() => {
              onRedo();
              playPop();
            }}
            disabled={!canRedo}
            title="Redo"
            className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg hover:bg-cozy-bg hover:text-cozy-fg disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 cursor-pointer"
          >
            <Redo2 size={14} />
          </button>
        </div>

        {/* Zoom Controls */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              onZoomOut();
              playPop();
            }}
            title="Zoom Out"
            className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg hover:bg-cozy-bg hover:text-cozy-fg transition-all active:scale-95 cursor-pointer"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => {
              onResetZoom();
              playPop();
            }}
            title="Reset Zoom"
            className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg hover:bg-cozy-bg hover:text-cozy-fg transition-all active:scale-95 cursor-pointer"
          >
            <Maximize size={14} />
          </button>
          <button
            onClick={() => {
              onZoomIn();
              playPop();
            }}
            title="Zoom In"
            className="p-2.5 rounded-xl border border-cozy-border bg-cozy-card text-cozy-fg hover:bg-cozy-bg hover:text-cozy-fg transition-all active:scale-95 cursor-pointer"
          >
            <ZoomIn size={14} />
          </button>
        </div>

        {/* Clear & Save */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              onClear();
              playPop();
            }}
            title="Clear Canvas"
            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-rose-200 bg-rose-50/50 text-rose-600 hover:bg-rose-100 hover:text-rose-700 transition-all active:scale-95 font-semibold text-xs cursor-pointer"
          >
            <Trash2 size={14} />
            <span className="hidden sm:inline">Clear</span>
          </button>
          <button
            onClick={() => {
              onExport();
              playPop();
            }}
            title="Save PNG"
            className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl border border-emerald-600 bg-emerald-500 text-white hover:bg-emerald-600 shadow-md shadow-emerald-500/10 transition-all active:scale-95 font-semibold text-xs cursor-pointer"
          >
            <Download size={14} />
            <span>Export</span>
          </button>
        </div>

      </div>

    </div>
  );
};
DrawingToolbar.displayName = 'DrawingToolbar';
