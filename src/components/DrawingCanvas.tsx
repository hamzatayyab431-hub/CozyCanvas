"use client";

import React, {
  useRef,
  useState,
  useEffect,
  useCallback,
  useImperativeHandle,
} from 'react';
import {
  DrawingElement,
  ToolType,
  BrushType,
  FreehandElement,
  ShapeElement,
  TextElement,
  FillElement,
  StampElement,
  drawElementWithSymmetry,
  getElementBoundingBox,
  isPointNearElement,
} from '../lib/drawing-utils';
import { PlayerPresence } from '../hooks/useRoomRealtime';

export interface LayerConfig {
  id: 'background' | 'sketch' | 'details';
  name: string;
  visible: boolean;
  opacity: number;
  locked: boolean;
}

export interface DrawingCanvasRef {
  undo: () => void;
  redo: () => void;
  clear: () => void;
  exportPNG: (background?: string) => string;
  zoomIn: () => void;
  zoomOut: () => void;
  resetZoomPan: () => void;
  clearLayer: (layerId: 'background' | 'sketch' | 'details') => void;
  addExternalElement: (element: DrawingElement, playerId: string) => void;
  updateExternalStroke: (playerId: string, element: DrawingElement | null) => void;
  updateExternalCursor: (playerId: string, x: number, y: number) => void;
}

export interface DrawingCanvasProps {
  tool: ToolType;
  color: string;
  size: number;
  opacity: number;
  fillShape?: boolean;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onStrokeComplete?: (element: DrawingElement) => void;
  onStrokeUpdate?: (element: DrawingElement) => void;
  onCursorMove?: (x: number, y: number) => void;
  ref?: React.Ref<DrawingCanvasRef | null>;
  
  // Advanced parameters
  brushType?: BrushType;
  activeLayerId?: 'background' | 'sketch' | 'details';
  layers?: LayerConfig[];
  symmetryMode?: 'none' | 'vertical' | 'horizontal' | 'both';
  gridVisible?: boolean;
  gridSize?: number;
  refImage?: File | null;
  refScale?: number;
  refX?: number;
  refY?: number;
  refOpacity?: number;
  activeStamp?: string;
  onColorSelect?: (color: string) => void;
  onRefImageChange?: (x: number, y: number) => void;

  // Cursors rendering metadata
  players?: PlayerPresence[];
}

const VIRTUAL_WIDTH = 1920;
const VIRTUAL_HEIGHT = 1080;

// Helper to translate coordinates/points of an element
function translateElement(element: DrawingElement, dx: number, dy: number): DrawingElement {
  const clone = JSON.parse(JSON.stringify(element)) as DrawingElement;
  switch (clone.type) {
    case 'pen':
    case 'eraser':
      clone.points = clone.points.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy }));
      break;
    case 'line':
    case 'circle':
    case 'rectangle':
    case 'triangle':
      clone.startX += dx;
      clone.startY += dy;
      clone.endX += dx;
      clone.endY += dy;
      break;
    case 'text':
    case 'stamp':
    case 'fill':
      clone.x += dx;
      clone.y += dy;
      break;
  }
  return clone;
}

// Draw a player's cursor and name badge directly on the canvas context
function drawCursor(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  name: string,
  color: string,
  zoom: number,
  pan: { x: number; y: number },
  scaleX: number,
  scaleY: number,
  canvasWidth: number,
  canvasHeight: number
) {
  // Convert normalized coordinates to screen pixel space
  const screenX = (x * VIRTUAL_WIDTH) * scaleX * zoom + pan.x;
  const screenY = (y * VIRTUAL_HEIGHT) * scaleY * zoom + pan.y;

  // Clip cursors outside the screen
  if (screenX < 0 || screenX > canvasWidth || screenY < 0 || screenY > canvasHeight) return;

  ctx.save();
  ctx.translate(screenX, screenY);

  // Draw cursor pointer arrow
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(0, 15);
  ctx.lineTo(4.5, 11.5);
  ctx.lineTo(9.5, 16.5);
  ctx.lineTo(11.5, 14.5);
  ctx.lineTo(6.5, 9.5);
  ctx.lineTo(11, 9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Draw nickname tag
  ctx.font = 'bold 10px sans-serif';
  const nameWidth = ctx.measureText(name).width;
  const badgeWidth = nameWidth + 8;
  const badgeHeight = 16;
  const badgeX = 12;
  const badgeY = 10;

  ctx.fillStyle = color;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(badgeX, badgeY, badgeWidth, badgeHeight, 4);
  } else {
    ctx.rect(badgeX, badgeY, badgeWidth, badgeHeight);
  }
  ctx.fill();

  ctx.fillStyle = '#ffffff';
  ctx.textBaseline = 'middle';
  ctx.fillText(name, badgeX + 4, badgeY + badgeHeight / 2);

  ctx.restore();
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  tool,
  color,
  size,
  opacity,
  fillShape = false,
  onHistoryChange,
  onStrokeComplete,
  onStrokeUpdate,
  onCursorMove,
  ref,
  
  brushType = 'solid' as BrushType,
  activeLayerId = 'sketch',
  layers = [
    { id: 'background', name: 'Background Layer', visible: true, opacity: 1.0, locked: false },
    { id: 'sketch', name: 'Sketch Layer', visible: true, opacity: 1.0, locked: false },
    { id: 'details', name: 'Details Layer', visible: true, opacity: 1.0, locked: false },
  ],
  symmetryMode = 'none',
  gridVisible = false,
  gridSize = 40,
  refImage = null,
  refScale = 1.0,
  refX = 0,
  refY = 0,
  refOpacity = 0.3,
  activeStamp = '❤️',
  onColorSelect,
  onRefImageChange,

  players = [],
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transformation
  const [zoom, setZoom] = useState<number>(0.95);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 20, y: 20 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Refs for tracking zoom and pan inside listeners
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // History states
  const [history, setHistory] = useState<DrawingElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Ref-based drawing parameters to eliminate React render lag
  const activeElementRef = useRef<DrawingElement | null>(null);
  const cursorCoordsRef = useRef<{ x: number; y: number } | null>(null);
  const externalActiveElementsRef = useRef<Map<string, DrawingElement>>(new Map());
  const externalCommittedElementsRef = useRef<DrawingElement[]>([]);
  const externalCursorsRef = useRef<Map<string, { x: number; y: number }>>(new Map());
  
  const lastStrokeBroadcastTimeRef = useRef<number>(0);

  // Selection states
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const clipboard = useRef<DrawingElement | null>(null);
  const dragStartElements = useRef<DrawingElement[] | null>(null);
  const dragDidMove = useRef(false);

  // Reference Image Loading
  const [refImageElement, setRefImageElement] = useState<HTMLImageElement | null>(null);

  // Text input state
  const [textInput, setTextInput] = useState<{
    x: number;
    y: number;
    virtualX: number;
    virtualY: number;
    value: string;
  } | null>(null);
  const textInputRef = useRef<HTMLTextAreaElement>(null);

  // Tracking flags
  const isDrawing = useRef(false);
  const [isPanning, setIsPanning] = useState(false);
  const startPan = useRef({ x: 0, y: 0 });
  const [isSpacePressed, setIsSpacePressed] = useState(false);

  const isDraggingSelection = useRef(false);
  const selectionDragStart = useRef({ x: 0, y: 0 });

  const isDraggingRefImage = useRef(false);
  const refDragStart = useRef({ x: 0, y: 0 });
  const refImageStartPos = useRef({ x: 0, y: 0 });

  // Touch tracking for pinch-to-zoom
  const activeTouches = useRef<{ [id: number]: { x: number; y: number } }>({});
  const pinchStartDist = useRef<number>(1);
  const pinchStartZoom = useRef<number>(1);
  const pinchStartCenter = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  // Load Reference Image file
  useEffect(() => {
    if (!refImage) {
      Promise.resolve().then(() => {
        setRefImageElement(null);
      });
      return;
    }
    const url = URL.createObjectURL(refImage);
    const img = new Image();
    img.src = url;
    img.onload = () => {
      setRefImageElement(img);
    };
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [refImage]);

  // Initialize offscreen canvas once
  useEffect(() => {
    const canvas = document.createElement('canvas');
    canvas.width = VIRTUAL_WIDTH;
    canvas.height = VIRTUAL_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    }
    offscreenCanvasRef.current = canvas;
  }, []);

  // Resize observer
  useEffect(() => {
    if (!containerRef.current) return;
    const observer = new ResizeObserver((entries) => {
      if (!entries || entries.length === 0) return;
      const { width, height } = entries[0].contentRect;
      setCanvasSize({ width, height });
    });
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  // Fit canvas to parent container
  const fitToScreen = useCallback(() => {
    if (!containerRef.current) return;
    const { width, height } = containerRef.current.getBoundingClientRect();
    // Center it with a 2.5% padding margin on all sides
    setZoom(0.95);
    setPan({
      x: width * 0.025,
      y: height * 0.025,
    });
  }, []);

  // Auto-fit screen once sizes are resolved
  const didInitFit = useRef(false);
  useEffect(() => {
    if (canvasSize.width > 100 && canvasSize.height > 100 && !didInitFit.current) {
      fitToScreen();
      didInitFit.current = true;
    }
  }, [canvasSize, fitToScreen]);

  // Redraw elements on the offscreen canvas sorted by layers
  const redrawOffscreen = useCallback(() => {
    const canvas = offscreenCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    ctx.restore();

    // Combine local history elements with external committed elements
    const localElements = history[historyIndex] || [];
    const externalElements = externalCommittedElementsRef.current;
    const allElements = [...localElements, ...externalElements];
    const layerOrder: ('background' | 'sketch' | 'details')[] = ['background', 'sketch', 'details'];
    
    for (const layerId of layerOrder) {
      const layerConf = layers.find((l) => l.id === layerId);
      if (!layerConf || !layerConf.visible) continue;

      const layerElements = allElements.filter(
        (el) => (el.layerId || 'sketch') === layerId
      );

      for (const element of layerElements) {
        const clonedElement = {
          ...element,
          opacity: element.opacity * layerConf.opacity,
        };
        ctx.save();
        drawElementWithSymmetry(ctx, clonedElement, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        ctx.restore();
      }
    }
  }, [history, historyIndex, layers]);

  // Render everything to the visible canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Workspace backdrop color
    ctx.fillStyle = '#fafaf9'; // stone-50
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Calculate projection scales to match virtual bounds perfectly
    const scaleX = canvasSize.width / VIRTUAL_WIDTH;
    const scaleY = canvasSize.height / VIRTUAL_HEIGHT;

    // 1. Draw canvas shadow sheet
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.scale(scaleX, scaleY);
    ctx.shadowColor = 'rgba(120, 113, 108, 0.12)';
    ctx.shadowBlur = 24;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 8;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    ctx.restore();

    // 2. Render underlay reference tracing image
    if (refImageElement) {
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.scale(scaleX, scaleY);
      ctx.globalAlpha = refOpacity;
      const imgWidth = refImageElement.width * refScale;
      const imgHeight = refImageElement.height * refScale;
      ctx.drawImage(refImageElement, refX, refY, imgWidth, imgHeight);
      ctx.restore();
    }

    // 3. Draw offscreen committed layers contents
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.scale(scaleX, scaleY);
    if (offscreenCanvasRef.current) {
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    }
    ctx.restore();

    // 4. Draw active stroke / shape (local user drawing in-progress)
    const currentActiveElement = activeElementRef.current;
    if (currentActiveElement) {
      const layerConf = layers.find((l) => l.id === activeLayerId);
      if (layerConf && layerConf.visible) {
        const clonedActive = {
          ...currentActiveElement,
          opacity: currentActiveElement.opacity * layerConf.opacity,
        };
        ctx.save();
        ctx.translate(pan.x, pan.y);
        ctx.scale(zoom, zoom);
        ctx.scale(scaleX, scaleY);
        drawElementWithSymmetry(ctx, clonedActive, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        ctx.restore();
      }
    }

    // 5. Draw active strokes of other collaborative users
    externalActiveElementsRef.current.forEach((el) => {
      const layerConf = layers.find((l) => l.id === (el.layerId || 'sketch'));
      if (!layerConf || !layerConf.visible) return;
      const clonedActive = {
        ...el,
        opacity: el.opacity * layerConf.opacity,
      };
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.scale(scaleX, scaleY);
      drawElementWithSymmetry(ctx, clonedActive, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
      ctx.restore();
    });

    // 6. Draw grid guides
    if (gridVisible && gridSize > 5) {
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.scale(scaleX, scaleY);
      ctx.strokeStyle = 'rgba(120, 113, 108, 0.08)'; // stone-500 line
      ctx.lineWidth = 1 / (zoom * Math.min(scaleX, scaleY));

      // Vertical grid lines
      for (let x = gridSize; x < VIRTUAL_WIDTH; x += gridSize) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, VIRTUAL_HEIGHT);
        ctx.stroke();
      }
      // Horizontal grid lines
      for (let y = gridSize; y < VIRTUAL_HEIGHT; y += gridSize) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(VIRTUAL_WIDTH, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 7. Draw dashed bounding box for selected element
    const currentElements = history[historyIndex] || [];
    const selectedElement = currentElements.find((el) => el.id === selectedElementId);
    if (selectedElement && tool === 'select') {
      const box = getElementBoundingBox(selectedElement);
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.scale(scaleX, scaleY);
      ctx.strokeStyle = '#3b82f6'; // blue-500 selection line
      ctx.lineWidth = 1.5 / (zoom * Math.min(scaleX, scaleY));
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(box.minX - 4, box.minY - 4, (box.maxX - box.minX) + 8, (box.maxY - box.minY) + 8);
      ctx.restore();
    }

    // 8. Draw brush size circle preview (local user hover)
    const localCursorCoords = cursorCoordsRef.current;
    if (
      localCursorCoords &&
      !isDrawing.current &&
      !isPanning &&
      tool !== 'text' &&
      tool !== 'fill' &&
      tool !== 'select' &&
      tool !== 'eyedropper'
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(localCursorCoords.x, localCursorCoords.y, (size * zoom * Math.min(scaleX, scaleY)) / 2, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(68, 64, 60, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(localCursorCoords.x, localCursorCoords.y, (size * zoom * Math.min(scaleX, scaleY)) / 2 - 1, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }

    // 9. Draw other users' cursors directly onto the canvas (no DOM re-renders)
    externalCursorsRef.current.forEach((pos, pid) => {
      const player = players.find((p) => p.playerId === pid);
      if (player) {
        const name = player.nickname || 'Painter';
        const color = player.color || '#E05A47';
        drawCursor(ctx, pos.x, pos.y, name, color, zoom, pan, scaleX, scaleY, canvas.width, canvas.height);
      }
    });

  }, [
    zoom,
    pan,
    canvasSize,
    tool,
    size,
    isPanning,
    refImageElement,
    refScale,
    refX,
    refY,
    refOpacity,
    gridVisible,
    gridSize,
    selectedElementId,
    history,
    historyIndex,
    layers,
    activeLayerId,
    players,
  ]);

  // Request high performance draw scheduling via rAF
  const drawRequestedRef = useRef(false);
  const requestDraw = useCallback(() => {
    if (drawRequestedRef.current) return;
    drawRequestedRef.current = true;
    requestAnimationFrame(() => {
      drawRequestedRef.current = false;
      draw();
    });
  }, [draw]);

  // Keep drawing up-to-date
  useEffect(() => {
    requestDraw();
  }, [canvasSize, zoom, pan, requestDraw]);

  // Redraw offscreen canvas when history/index/layers shift
  useEffect(() => {
    redrawOffscreen();
    requestDraw();
  }, [history, historyIndex, layers, redrawOffscreen, requestDraw]);

  // Notify parent component about history changes safely using a ref
  const onHistoryChangeRef = useRef(onHistoryChange);
  useEffect(() => {
    onHistoryChangeRef.current = onHistoryChange;
  }, [onHistoryChange]);

  useEffect(() => {
    if (onHistoryChangeRef.current) {
      const canUndo = historyIndex > 0;
      const canRedo = historyIndex < history.length - 1;
      onHistoryChangeRef.current(canUndo, canRedo);
    }
  }, [history, historyIndex]);

  // Keyboard shortcut refs to prevent event listener churn
  const toolRef = useRef(tool);
  const selectedElementIdRef = useRef(selectedElementId);
  useEffect(() => { toolRef.current = tool; }, [tool]);
  useEffect(() => { selectedElementIdRef.current = selectedElementId; }, [selectedElementId]);

  // Selection Action Methods
  const handleDeleteSelection = useCallback(() => {
    if (!selectedElementIdRef.current) return;
    const currentElements = history[historyIndex] || [];
    const nextElements = currentElements.filter((el) => el.id !== selectedElementIdRef.current);
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, nextElements]);
    setHistoryIndex(nextHistory.length);
    setSelectedElementId(null);
  }, [history, historyIndex]);

  const handleCopySelection = useCallback(() => {
    if (!selectedElementIdRef.current) return;
    const currentElements = history[historyIndex] || [];
    const selected = currentElements.find((el) => el.id === selectedElementIdRef.current);
    if (selected) {
      clipboard.current = selected;
    }
  }, [history, historyIndex]);

  const handleCutSelection = useCallback(() => {
    if (!selectedElementIdRef.current) return;
    handleCopySelection();
    handleDeleteSelection();
  }, [handleCopySelection, handleDeleteSelection]);

  const handlePasteSelection = useCallback(() => {
    if (!clipboard.current) return;
    const clone = JSON.parse(JSON.stringify(clipboard.current)) as DrawingElement;
    clone.id = Math.random().toString(36).substring(7);
    clone.layerId = activeLayerId; // Paste on the active layer
    const offset = 40;
    const pasted = translateElement(clone, offset, offset);

    const currentElements = history[historyIndex] || [];
    const nextElements = [...currentElements, pasted];
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, nextElements]);
    setHistoryIndex(nextHistory.length);
    setSelectedElementId(pasted.id);
  }, [history, historyIndex, activeLayerId]);

  // Spacebar grab panning & Selection Hotkeys registered ONCE
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        setIsSpacePressed(true);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = 'grab';
        }
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementIdRef.current && toolRef.current === 'select') {
          e.preventDefault();
          handleDeleteSelection();
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'c') {
          if (selectedElementIdRef.current && toolRef.current === 'select') {
            e.preventDefault();
            handleCopySelection();
          }
        } else if (e.key.toLowerCase() === 'x') {
          if (selectedElementIdRef.current && toolRef.current === 'select') {
            e.preventDefault();
            handleCutSelection();
          }
        } else if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          handlePasteSelection();
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = toolRef.current === 'text' ? 'text' : 'crosshair';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [handleDeleteSelection, handleCopySelection, handleCutSelection, handlePasteSelection]);

  // Scroll wheel zoom registered ONCE on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheelEvent = (e: WheelEvent) => {
      e.preventDefault();
      const zoomFactor = 1.08;
      const nextZoom = e.deltaY < 0 ? zoomRef.current * zoomFactor : zoomRef.current / zoomFactor;
      const clampedZoom = Math.max(0.15, Math.min(nextZoom, 8));

      const rect = canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;

      const dx = mouseX - panRef.current.x;
      const dy = mouseY - panRef.current.y;

      const newPanX = mouseX - dx * (clampedZoom / zoomRef.current);
      const newPanY = mouseY - dy * (clampedZoom / zoomRef.current);

      setZoom(clampedZoom);
      setPan({ x: newPanX, y: newPanY });
    };

    canvas.addEventListener('wheel', handleWheelEvent, { passive: false });
    return () => {
      canvas.removeEventListener('wheel', handleWheelEvent);
    };
  }, []);

  // Committing drawing elements
  const commitElement = useCallback((newElement: DrawingElement) => {
    const currentElements = history[historyIndex] || [];
    const nextElements = [...currentElements, newElement];
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, nextElements]);
    setHistoryIndex(nextHistory.length);
    if (onStrokeComplete) {
      onStrokeComplete(newElement);
    }
  }, [history, historyIndex, onStrokeComplete]);

  const exportPNG = useCallback((background: string = '#ffffff') => {
    const canvas = document.createElement('canvas');
    canvas.width = VIRTUAL_WIDTH;
    canvas.height = VIRTUAL_HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) return '';

    if (background && background !== 'transparent') {
      ctx.fillStyle = background;
      ctx.fillRect(0, 0, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
    }

    const localElements = history[historyIndex] || [];
    const externalElements = externalCommittedElementsRef.current;
    const allElements = [...localElements, ...externalElements];
    const layerOrder: ('background' | 'sketch' | 'details')[] = ['background', 'sketch', 'details'];
    
    for (const layerId of layerOrder) {
      const layerConf = layers.find((l) => l.id === layerId);
      if (!layerConf || !layerConf.visible) continue;

      const layerElements = allElements.filter(
        (el) => (el.layerId || 'sketch') === layerId
      );

      for (const element of layerElements) {
        const clonedElement = {
          ...element,
          opacity: element.opacity * layerConf.opacity,
        };
        ctx.save();
        drawElementWithSymmetry(ctx, clonedElement, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        ctx.restore();
      }
    }

    return canvas.toDataURL('image/png');
  }, [history, historyIndex, layers]);

  // Expose Imperative APIs to GameController
  useImperativeHandle(ref, () => ({
    undo: () => {
      if (historyIndex > 0) {
        setHistoryIndex(historyIndex - 1);
      }
    },
    redo: () => {
      if (historyIndex < history.length - 1) {
        setHistoryIndex(historyIndex + 1);
      }
    },
    clear: () => {
      const nextHistory = history.slice(0, historyIndex + 1);
      setHistory([...nextHistory, []]);
      setHistoryIndex(nextHistory.length);
      externalCommittedElementsRef.current = [];
    },
    exportPNG,
    zoomIn: () => {
      const nextZoom = Math.min(zoom * 1.25, 8);
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const dx = cx - pan.x;
        const dy = cy - pan.y;
        setZoom(nextZoom);
        setPan({
          x: cx - dx * (nextZoom / zoom),
          y: cy - dy * (nextZoom / zoom),
        });
      }
    },
    zoomOut: () => {
      const nextZoom = Math.max(zoom / 1.25, 0.15);
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        const cx = rect.width / 2;
        const cy = rect.height / 2;
        const dx = cx - pan.x;
        const dy = cy - pan.y;
        setZoom(nextZoom);
        setPan({
          x: cx - dx * (nextZoom / zoom),
          y: cy - dy * (nextZoom / zoom),
        });
      }
    },
    resetZoomPan: () => {
      fitToScreen();
    },
    clearLayer: (layerId: 'background' | 'sketch' | 'details') => {
      const currentElements = history[historyIndex] || [];
      const nextElements = currentElements.filter(
        (el) => (el.layerId || 'sketch') !== layerId
      );
      const nextHistory = history.slice(0, historyIndex + 1);
      setHistory([...nextHistory, nextElements]);
      setHistoryIndex(nextHistory.length);
    },
    // Append completed collaborative stroke to the external ref (no stale closure risk)
    addExternalElement: (element: DrawingElement, _playerId: string) => {
      externalActiveElementsRef.current.delete(_playerId);
      externalCommittedElementsRef.current = [...externalCommittedElementsRef.current, element];
      redrawOffscreen();
      requestDraw();
    },
    // Draw real-time temporary stroke coordinates
    updateExternalStroke: (playerId: string, element: DrawingElement | null) => {
      if (!element) {
        externalActiveElementsRef.current.delete(playerId);
      } else {
        externalActiveElementsRef.current.set(playerId, element);
      }
      requestDraw();
    },
    // Track cursor movements of partners
    updateExternalCursor: (playerId: string, x: number, y: number) => {
      externalCursorsRef.current.set(playerId, { x, y });
      requestDraw();
    }
  }), [zoom, pan, history, historyIndex, fitToScreen, exportPNG, redrawOffscreen, requestDraw]);

  // Eyedropper Color sampling helper
  const sampleColorAt = (virtualX: number, virtualY: number) => {
    const canvas = offscreenCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const x = Math.round(virtualX);
    const y = Math.round(virtualY);
    if (x < 0 || x >= VIRTUAL_WIDTH || y < 0 || y >= VIRTUAL_HEIGHT) return;

    const pixel = ctx.getImageData(x, y, 1, 1).data;
    if (pixel[3] === 0) {
      if (onColorSelect) onColorSelect('#ffffff');
      return;
    }

    const hexColor =
      '#' +
      [pixel[0], pixel[1], pixel[2]]
        .map((val) => {
          const s = val.toString(16);
          return s.length === 1 ? '0' + s : s;
        })
        .join('');

    if (onColorSelect) {
      onColorSelect(hexColor);
    }
  };

  // Pointer Down Trigger
  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.setPointerCapture(e.pointerId);

    const isMiddleButton = e.button === 1;
    const isSpace = isSpacePressed;

    if (isSpace || isMiddleButton) {
      setIsPanning(true);
      startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      canvas.style.cursor = 'grabbing';
      return;
    }

    if (e.shiftKey && refImage) {
      isDraggingRefImage.current = true;
      refDragStart.current = { x: e.clientX, y: e.clientY };
      refImageStartPos.current = { x: refX, y: refY };
      canvas.style.cursor = 'move';
      return;
    }

    activeTouches.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const touchIds = Object.keys(activeTouches.current).map(Number);

    if (touchIds.length >= 2) {
      isDrawing.current = false;
      activeElementRef.current = null;

      const p1 = activeTouches.current[touchIds[0]];
      const p2 = activeTouches.current[touchIds[1]];
      pinchStartDist.current = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      pinchStartZoom.current = zoom;
      pinchStartCenter.current = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
      return;
    }

    if (touchIds.length === 1 && tool !== 'text') {
      const rect = canvas.getBoundingClientRect();
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      const scaleX = canvasSize.width / VIRTUAL_WIDTH;
      const scaleY = canvasSize.height / VIRTUAL_HEIGHT;
      const virtualX = (screenX - pan.x) / (zoom * scaleX);
      const virtualY = (screenY - pan.y) / (zoom * scaleY);

      if (
        virtualX < 0 ||
        virtualX > VIRTUAL_WIDTH ||
        virtualY < 0 ||
        virtualY > VIRTUAL_HEIGHT
      ) {
        return;
      }

      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (activeLayer?.locked && tool !== 'select' && tool !== 'eyedropper') {
        return;
      }

      if (tool === 'eyedropper') {
        sampleColorAt(virtualX, virtualY);
        isDrawing.current = true;
        return;
      }

      if (tool === 'select') {
        const currentElements = history[historyIndex] || [];
        if (selectedElementId) {
          const selected = currentElements.find((el) => el.id === selectedElementId);
          if (selected && isPointNearElement(virtualX, virtualY, selected)) {
            const layerConf = layers.find((l) => l.id === (selected.layerId || 'sketch'));
            if (layerConf?.locked) return;
            isDraggingSelection.current = true;
            selectionDragStart.current = { x: virtualX, y: virtualY };
            dragStartElements.current = JSON.parse(JSON.stringify(currentElements));
            dragDidMove.current = false;
            return;
          }
        }

        let found = false;
        const searchLayers: ('background' | 'sketch' | 'details')[] = ['details', 'sketch', 'background'];
        for (const layerId of searchLayers) {
          const layerElements = currentElements.filter((el) => (el.layerId || 'sketch') === layerId);
          for (let i = layerElements.length - 1; i >= 0; i--) {
            const el = layerElements[i];
            if (isPointNearElement(virtualX, virtualY, el)) {
              setSelectedElementId(el.id);
              const layerConf = layers.find((l) => l.id === (el.layerId || 'sketch'));
              if (layerConf?.locked) {
                found = true;
                break;
              }
              isDraggingSelection.current = true;
              selectionDragStart.current = { x: virtualX, y: virtualY };
              dragStartElements.current = JSON.parse(JSON.stringify(currentElements));
              dragDidMove.current = false;
              found = true;
              break;
            }
          }
          if (found) break;
        }

        if (!found) {
          setSelectedElementId(null);
        }
        return;
      }

      if (tool === 'fill') {
        const newElement: FillElement = {
          id: Math.random().toString(36).substring(7),
          type: 'fill',
          color,
          size,
          opacity,
          x: virtualX,
          y: virtualY,
          layerId: activeLayerId,
          symmetryMode,
        };
        commitElement(newElement);
        return;
      }

      isDrawing.current = true;

      if (tool === 'pen' || tool === 'eraser') {
        const newElement: FreehandElement = {
          id: Math.random().toString(36).substring(7),
          type: tool,
          color: tool === 'eraser' ? '#ffffff' : color,
          size,
          opacity: tool === 'eraser' ? 1.0 : opacity,
          points: [{ x: virtualX, y: virtualY, pressure: e.pressure || 0.5 }],
          layerId: activeLayerId,
          brushType: brushType,
          symmetryMode,
        };
        activeElementRef.current = newElement;
      } else if (
        tool === 'line' ||
        tool === 'circle' ||
        tool === 'rectangle' ||
        tool === 'triangle'
      ) {
        const newElement: ShapeElement = {
          id: Math.random().toString(36).substring(7),
          type: tool,
          color,
          size,
          opacity,
          startX: virtualX,
          startY: virtualY,
          endX: virtualX,
          endY: virtualY,
          fill: fillShape,
          layerId: activeLayerId,
          symmetryMode,
        };
        activeElementRef.current = newElement;
      } else if (tool === 'stamp') {
        const newElement: StampElement = {
          id: Math.random().toString(36).substring(7),
          type: 'stamp',
          emoji: activeStamp || '❤️',
          x: virtualX,
          y: virtualY,
          size: 24,
          opacity,
          color,
          layerId: activeLayerId,
          symmetryMode,
        };
        activeElementRef.current = newElement;
      }
      
      requestDraw();
    }
  };

  // Pointer Move Handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    cursorCoordsRef.current = { x: screenX, y: screenY };

    if (activeTouches.current[e.pointerId]) {
      activeTouches.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    }

    if (isPanning) {
      setPan({
        x: e.clientX - startPan.current.x,
        y: e.clientY - startPan.current.y,
      });
      requestDraw();
      return;
    }

    const touchIds = Object.keys(activeTouches.current).map(Number);
    if (touchIds.length >= 2) {
      const p1 = activeTouches.current[touchIds[0]];
      const p2 = activeTouches.current[touchIds[1]];
      const currentDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      const scale = currentDist / pinchStartDist.current;
      const nextZoom = Math.max(0.15, Math.min(pinchStartZoom.current * scale, 8));

      const currentCenter = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };

      const dx = currentCenter.x - pinchStartCenter.current.x;
      const dy = currentCenter.y - pinchStartCenter.current.y;

      const newPanX =
        currentCenter.x - (currentCenter.x - pan.x) * (nextZoom / zoom) + dx;
      const newPanY =
        currentCenter.y - (currentCenter.y - pan.y) * (nextZoom / zoom) + dy;

      setZoom(nextZoom);
      setPan({ x: newPanX, y: newPanY });

      pinchStartDist.current = currentDist;
      pinchStartZoom.current = nextZoom;
      pinchStartCenter.current = currentCenter;
      requestDraw();
      return;
    }

    // Convert screen pointer coordinates to standardized virtual board dimensions
    const scaleX = canvasSize.width / VIRTUAL_WIDTH;
    const scaleY = canvasSize.height / VIRTUAL_HEIGHT;
    const virtualX = (screenX - pan.x) / (zoom * scaleX);
    const virtualY = (screenY - pan.y) / (zoom * scaleY);

    if (onCursorMove) {
      onCursorMove(virtualX / VIRTUAL_WIDTH, virtualY / VIRTUAL_HEIGHT);
    }

    if (isDraggingRefImage.current && refImage) {
      const dx = (e.clientX - refDragStart.current.x) / zoom;
      const dy = (e.clientY - refDragStart.current.y) / zoom;
      const nextX = Math.round(refImageStartPos.current.x + dx);
      const nextY = Math.round(refImageStartPos.current.y + dy);
      if (onRefImageChange) {
        onRefImageChange(nextX, nextY);
      }
      requestDraw();
      return;
    }

    if (tool === 'eyedropper' && isDrawing.current) {
      sampleColorAt(virtualX, virtualY);
      requestDraw();
      return;
    }

    if (isDraggingSelection.current && selectedElementId) {
      const dx = virtualX - selectionDragStart.current.x;
      const dy = virtualY - selectionDragStart.current.y;

      if (Math.abs(dx) > 0.02 || Math.abs(dy) > 0.02) {
        dragDidMove.current = true;
        const currentElements = history[historyIndex] || [];
        const updatedElements = currentElements.map((el) => {
          if (el.id === selectedElementId) {
            return translateElement(el, dx, dy);
          }
          return el;
        });

        const nextHistory = [...history];
        nextHistory[historyIndex] = updatedElements;
        setHistory(nextHistory);

        selectionDragStart.current = { x: virtualX, y: virtualY };
      }
      requestDraw();
      return;
    }

    if (isDrawing.current && activeElementRef.current) {
      const currentActive = activeElementRef.current;
      if (currentActive.type === 'pen' || currentActive.type === 'eraser') {
        const currentPoints = (currentActive as FreehandElement).points;
        const lastPoint = currentPoints[currentPoints.length - 1];
        const dist = Math.hypot(virtualX - lastPoint.x, virtualY - lastPoint.y);

        // Density coordinate filter: limit point additions to 2 virtual pixels separation
        if (dist >= 2) {
          const newPoints = [
            ...currentPoints,
            { x: virtualX, y: virtualY, pressure: e.pressure || 0.5 },
          ];
          const updatedElement = {
            ...currentActive,
            points: newPoints,
          } as FreehandElement;
          activeElementRef.current = updatedElement;

          // Throttled real-time stroke coordinates broadcasting
          if (onStrokeUpdate) {
            const now = Date.now();
            if (now - lastStrokeBroadcastTimeRef.current > 40) {
              onStrokeUpdate(updatedElement);
              lastStrokeBroadcastTimeRef.current = now;
            }
          }
        }
      } else if (
        currentActive.type === 'line' ||
        currentActive.type === 'circle' ||
        currentActive.type === 'rectangle' ||
        currentActive.type === 'triangle'
      ) {
        const updatedElement = {
          ...currentActive,
          endX: virtualX,
          endY: virtualY,
        } as ShapeElement;
        activeElementRef.current = updatedElement;

        if (onStrokeUpdate) {
          const now = Date.now();
          if (now - lastStrokeBroadcastTimeRef.current > 40) {
            onStrokeUpdate(updatedElement);
            lastStrokeBroadcastTimeRef.current = now;
          }
        }
      } else if (currentActive.type === 'stamp') {
        const dx = virtualX - currentActive.x;
        const dy = virtualY - currentActive.y;
        const dragDist = Math.hypot(dx, dy);
        const nextSize = Math.max(12, dragDist * 2);
        const updatedElement = {
          ...currentActive,
          size: nextSize,
        } as StampElement;
        activeElementRef.current = updatedElement;

        if (onStrokeUpdate) {
          const now = Date.now();
          if (now - lastStrokeBroadcastTimeRef.current > 40) {
            onStrokeUpdate(updatedElement);
            lastStrokeBroadcastTimeRef.current = now;
          }
        }
      }
    }

    requestDraw();
  };

  // Pointer Up Handler
  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.releasePointerCapture(e.pointerId);
    }

    delete activeTouches.current[e.pointerId];

    if (isDraggingRefImage.current) {
      isDraggingRefImage.current = false;
      if (canvas) {
        canvas.style.cursor = 'default';
      }
      return;
    }

    if (isPanning) {
      setIsPanning(false);
      if (canvas) {
        canvas.style.cursor = isSpacePressed ? 'grab' : 'crosshair';
      }
      return;
    }

    if (tool === 'eyedropper') {
      isDrawing.current = false;
      return;
    }

    if (isDraggingSelection.current) {
      isDraggingSelection.current = false;
      if (dragDidMove.current && dragStartElements.current) {
        const finalMoved = history[historyIndex];
        const restoredHistory = history.slice(0, historyIndex);
        setHistory([...restoredHistory, dragStartElements.current, finalMoved]);
        setHistoryIndex(restoredHistory.length + 1);
      }
      dragStartElements.current = null;
      dragDidMove.current = false;
      return;
    }

    if (isDrawing.current && activeElementRef.current) {
      isDrawing.current = false;
      const finalElement = activeElementRef.current;
      activeElementRef.current = null;
      commitElement(finalElement);
    }

    if (tool === 'text') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      
      const scaleX = canvasSize.width / VIRTUAL_WIDTH;
      const scaleY = canvasSize.height / VIRTUAL_HEIGHT;
      const virtualX = (screenX - pan.x) / (zoom * scaleX);
      const virtualY = (screenY - pan.y) / (zoom * scaleY);

      if (
        virtualX < 0 ||
        virtualX > VIRTUAL_WIDTH ||
        virtualY < 0 ||
        virtualY > VIRTUAL_HEIGHT
      ) {
        return;
      }

      setTextInput({
        x: screenX,
        y: screenY,
        virtualX,
        virtualY,
        value: '',
      });
    }
    requestDraw();
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    delete activeTouches.current[e.pointerId];
    if (isDrawing.current) {
      isDrawing.current = false;
      activeElementRef.current = null;
    }
    if (isPanning) {
      setIsPanning(false);
    }
    if (isDraggingSelection.current) {
      isDraggingSelection.current = false;
    }
    requestDraw();
  };

  const handlePointerLeave = () => {
    cursorCoordsRef.current = null;
    requestDraw();
  };

  const handleTextSubmit = () => {
    if (!textInput) return;
    if (textInput.value.trim() !== '') {
      const newElement: TextElement = {
        id: Math.random().toString(36).substring(7),
        type: 'text',
        color,
        size,
        opacity,
        x: textInput.virtualX,
        y: textInput.virtualY,
        text: textInput.value,
        layerId: activeLayerId,
        symmetryMode,
      };
      commitElement(newElement);
    }
    setTextInput(null);
  };

  const getCursorStyle = () => {
    if (isPanning) return 'grabbing';
    if (isSpacePressed) return 'grab';
    if (tool === 'text') return 'text';
    if (tool === 'select') return 'default';
    if (tool === 'eyedropper') return 'copy';
    return 'crosshair';
  };

  const currentElementsList = history[historyIndex] || [];
  const selectedElement = currentElementsList.find((el) => el.id === selectedElementId);
  
  let selectionToolbarStyle: React.CSSProperties | null = null;
  if (selectedElement && tool === 'select') {
    const box = getElementBoundingBox(selectedElement);
    const scaleX = canvasSize.width / VIRTUAL_WIDTH;
    const scaleY = canvasSize.height / VIRTUAL_HEIGHT;

    const topCenterX = ((box.minX + box.maxX) / 2) * scaleX * zoom + pan.x;
    const topY = box.minY * scaleY * zoom + pan.y;
    selectionToolbarStyle = {
      left: `${topCenterX}px`,
      top: `${topY - 45}px`,
      transform: 'translateX(-50%)',
    };
  }

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full flex items-center justify-center bg-stone-100 overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        className="touch-none block"
        style={{ cursor: getCursorStyle() }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onPointerLeave={handlePointerLeave}
      />

      {/* Floating Selection Action Panel */}
      {selectedElement && tool === 'select' && selectionToolbarStyle && (
        <div
          className="absolute z-40 bg-white/95 border border-stone-200/80 shadow-lg rounded-xl p-1 flex gap-1 items-center"
          style={selectionToolbarStyle}
        >
          <button
            onClick={handleCutSelection}
            className="px-2.5 py-1 text-[11px] font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
          >
            Cut
          </button>
          <button
            onClick={handleCopySelection}
            className="px-2.5 py-1 text-[11px] font-bold text-stone-600 hover:text-stone-900 hover:bg-stone-100 rounded-md transition-colors"
          >
            Copy
          </button>
          <button
            onClick={handleDeleteSelection}
            className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:text-rose-750 hover:bg-rose-50 rounded-md transition-colors"
          >
            Delete
          </button>
        </div>
      )}

      {/* Text Input Overlay */}
      {textInput && (
        <textarea
          ref={textInputRef}
          className="absolute z-50 p-1.5 border border-dashed border-stone-400 bg-white/95 rounded shadow-lg outline-none resize-none font-sans font-medium transition-all"
          style={{
            left: textInput.x,
            top: textInput.y,
            fontSize: `${Math.max(12, size * zoom)}px`,
            color: color,
            lineHeight: 1.2,
            minWidth: '150px',
            minHeight: '40px',
          }}
          value={textInput.value}
          onChange={(e) => setTextInput({ ...textInput, value: e.target.value })}
          onBlur={handleTextSubmit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              handleTextSubmit();
            } else if (e.key === 'Escape') {
              setTextInput(null);
            }
          }}
          autoFocus
        />
      )}

      {/* HUD Info */}
      <div className="absolute bottom-4 left-4 pointer-events-none select-none text-xs font-semibold text-stone-500/80 bg-white/70 backdrop-blur-xs px-3 py-1.5 rounded-full border border-stone-200/50 shadow-xs flex items-center gap-2">
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span className="w-1 h-1 bg-stone-300 rounded-full" />
        <span>Space + Drag to Pan</span>
      </div>
    </div>
  );
};
DrawingCanvas.displayName = 'DrawingCanvas';
