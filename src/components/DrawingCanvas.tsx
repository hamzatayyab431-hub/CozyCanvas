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
  addExternalElement: (element: DrawingElement) => void;
}

export interface DrawingCanvasProps {
  tool: ToolType;
  color: string;
  size: number;
  opacity: number;
  fillShape?: boolean;
  onHistoryChange?: (canUndo: boolean, canRedo: boolean) => void;
  onStrokeComplete?: (element: DrawingElement) => void;
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
}

const VIRTUAL_WIDTH = 1600;
const VIRTUAL_HEIGHT = 1200;

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

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  tool,
  color,
  size,
  opacity,
  fillShape = false,
  onHistoryChange,
  onStrokeComplete,
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
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenCanvasRef = useRef<HTMLCanvasElement | null>(null);

  // Viewport transformation
  const [zoom, setZoom] = useState<number>(1);
  const [pan, setPan] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Refs for tracking zoom and pan inside wheel scroll listeners
  const zoomRef = useRef(zoom);
  const panRef = useRef(pan);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);

  // History states
  const [history, setHistory] = useState<DrawingElement[][]>([[]]);
  const [historyIndex, setHistoryIndex] = useState<number>(0);

  // Active element currently being drawn
  const [activeElement, setActiveElement] = useState<DrawingElement | null>(null);

  // Selection states
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const clipboard = useRef<DrawingElement | null>(null);
  const dragStartElements = useRef<DrawingElement[] | null>(null);
  const dragDidMove = useRef(false);

  // Cursor coordinates in screen space for brush preview
  const [cursorCoords, setCursorCoords] = useState<{ x: number; y: number } | null>(null);

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
    const margin = 40;
    const zoomX = (width - margin) / VIRTUAL_WIDTH;
    const zoomY = (height - margin) / VIRTUAL_HEIGHT;
    const nextZoom = Math.max(0.1, Math.min(zoomX, zoomY, 1.2));

    const nextPanX = (width - VIRTUAL_WIDTH * nextZoom) / 2;
    const nextPanY = (height - VIRTUAL_HEIGHT * nextZoom) / 2;

    setZoom(nextZoom);
    setPan({ x: nextPanX, y: nextPanY });
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

    const activeElements = history[historyIndex] || [];
    
    // Sort and draw by layer configuration hierarchy: background -> sketch -> details
    const layerOrder: ('background' | 'sketch' | 'details')[] = ['background', 'sketch', 'details'];
    
    for (const layerId of layerOrder) {
      const layerConf = layers.find((l) => l.id === layerId);
      if (!layerConf || !layerConf.visible) continue;

      const layerElements = activeElements.filter(
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

    // Warm gray workspace background
    ctx.fillStyle = '#fafaf9'; // stone-50
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 1. Draw canvas shadow
    ctx.save();
    ctx.translate(pan.x, pan.y);
    ctx.scale(zoom, zoom);
    ctx.shadowColor = 'rgba(120, 113, 108, 0.15)';
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
    if (offscreenCanvasRef.current) {
      ctx.drawImage(offscreenCanvasRef.current, 0, 0);
    }

    // 4. Draw active stroke / shape
    if (activeElement) {
      const layerConf = layers.find((l) => l.id === activeLayerId);
      if (layerConf && layerConf.visible) {
        const clonedActive = {
          ...activeElement,
          opacity: activeElement.opacity * layerConf.opacity,
        };
        ctx.save();
        drawElementWithSymmetry(ctx, clonedActive, VIRTUAL_WIDTH, VIRTUAL_HEIGHT);
        ctx.restore();
      }
    }

    // 5. Draw grid guides
    if (gridVisible && gridSize > 5) {
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = 'rgba(120, 113, 108, 0.08)'; // stone-500 line
      ctx.lineWidth = 1 / zoom;

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

    // 6. Draw dashed bounding box for selected element
    const currentElements = history[historyIndex] || [];
    const selectedElement = currentElements.find((el) => el.id === selectedElementId);
    if (selectedElement && tool === 'select') {
      const box = getElementBoundingBox(selectedElement);
      ctx.save();
      ctx.translate(pan.x, pan.y);
      ctx.scale(zoom, zoom);
      ctx.strokeStyle = '#3b82f6'; // blue-500 selection line
      ctx.lineWidth = 1.5 / zoom;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(box.minX - 4, box.minY - 4, (box.maxX - box.minX) + 8, (box.maxY - box.minY) + 8);
      ctx.restore();
    }

    ctx.restore();

    // 7. Draw brush size preview
    if (
      cursorCoords &&
      !isDrawing.current &&
      !isPanning &&
      tool !== 'text' &&
      tool !== 'fill' &&
      tool !== 'select' &&
      tool !== 'eyedropper'
    ) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(cursorCoords.x, cursorCoords.y, (size * zoom) / 2, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(68, 64, 60, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cursorCoords.x, cursorCoords.y, (size * zoom) / 2 - 1, 0, 2 * Math.PI);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.8)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.restore();
    }
  }, [
    zoom,
    pan,
    activeElement,
    cursorCoords,
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
  ]);

  // Keep drawing up-to-date
  useEffect(() => {
    draw();
  }, [canvasSize, zoom, pan, activeElement, cursorCoords, draw]);

  // Redraw offscreen canvas when history/index/layers shift
  useEffect(() => {
    redrawOffscreen();
    draw();
  }, [history, historyIndex, layers, redrawOffscreen, draw]);

  // Notify parent component about history change safely using a ref to avoid infinite render loops
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

  // Monitor Space key down / up for grabbing
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        if (
          document.activeElement?.tagName !== 'INPUT' &&
          document.activeElement?.tagName !== 'TEXTAREA'
        ) {
          e.preventDefault();
          setIsSpacePressed(true);
          if (canvasRef.current) {
            canvasRef.current.style.cursor = 'grab';
          }
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        setIsSpacePressed(false);
        if (canvasRef.current) {
          canvasRef.current.style.cursor = tool === 'text' ? 'text' : 'crosshair';
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [tool]);

  // Scroll wheel zoom
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

  // Selection Action Methods
  const handleDeleteSelection = useCallback(() => {
    if (!selectedElementId) return;
    const currentElements = history[historyIndex] || [];
    const nextElements = currentElements.filter((el) => el.id !== selectedElementId);
    const nextHistory = history.slice(0, historyIndex + 1);
    setHistory([...nextHistory, nextElements]);
    setHistoryIndex(nextHistory.length);
    setSelectedElementId(null);
  }, [selectedElementId, history, historyIndex]);

  const handleCopySelection = useCallback(() => {
    if (!selectedElementId) return;
    const currentElements = history[historyIndex] || [];
    const selected = currentElements.find((el) => el.id === selectedElementId);
    if (selected) {
      clipboard.current = selected;
    }
  }, [selectedElementId, history, historyIndex]);

  const handleCutSelection = useCallback(() => {
    if (!selectedElementId) return;
    handleCopySelection();
    handleDeleteSelection();
  }, [selectedElementId, handleCopySelection, handleDeleteSelection]);

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

  // Keyboard Shortcuts for Selection Clipboard
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === 'INPUT' ||
        document.activeElement?.tagName === 'TEXTAREA'
      ) {
        return;
      }

      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedElementId && tool === 'select') {
          e.preventDefault();
          handleDeleteSelection();
        }
      }

      if (e.ctrlKey || e.metaKey) {
        if (e.key.toLowerCase() === 'c') {
          if (selectedElementId && tool === 'select') {
            e.preventDefault();
            handleCopySelection();
          }
        } else if (e.key.toLowerCase() === 'x') {
          if (selectedElementId && tool === 'select') {
            e.preventDefault();
            handleCutSelection();
          }
        } else if (e.key.toLowerCase() === 'v') {
          e.preventDefault();
          handlePasteSelection();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    selectedElementId,
    tool,
    handleDeleteSelection,
    handleCopySelection,
    handleCutSelection,
    handlePasteSelection,
  ]);

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

    const activeElements = history[historyIndex] || [];
    
    // Draw sorted layers
    const layerOrder: ('background' | 'sketch' | 'details')[] = ['background', 'sketch', 'details'];
    for (const layerId of layerOrder) {
      const layerConf = layers.find((l) => l.id === layerId);
      if (!layerConf || !layerConf.visible) continue;

      const layerElements = activeElements.filter(
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

  // Expose Imperative APIs
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
    addExternalElement: (element: DrawingElement) => {
      setHistory((prevHistory) => {
        const currentElements = prevHistory[historyIndex] || [];
        // Append the incoming external element to the current history frame
        const nextElements = [...currentElements, element];
        
        // Replace the current frame rather than creating a new undo state
        // so that collaborative strokes don't clutter the local undo stack individually.
        const nextHistory = [...prevHistory];
        nextHistory[historyIndex] = nextElements;
        return nextHistory;
      });
    },
  }), [zoom, pan, history, historyIndex, fitToScreen, exportPNG]);

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
    // transparent fallback to white
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

    // Handle spacebar/middle click pan
    if (isSpace || isMiddleButton) {
      setIsPanning(true);
      startPan.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
      canvas.style.cursor = 'grabbing';
      return;
    }

    // Handle Shift + drag to reposition reference image
    if (e.shiftKey && refImage) {
      isDraggingRefImage.current = true;
      refDragStart.current = { x: e.clientX, y: e.clientY };
      refImageStartPos.current = { x: refX, y: refY };
      canvas.style.cursor = 'move';
      return;
    }

    // Touch pinch trackers
    activeTouches.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    const touchIds = Object.keys(activeTouches.current).map(Number);

    if (touchIds.length >= 2) {
      isDrawing.current = false;
      setActiveElement(null);

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
      const virtualX = (screenX - pan.x) / zoom;
      const virtualY = (screenY - pan.y) / zoom;

      // Lock bounds boundary checks
      if (
        virtualX < 0 ||
        virtualX > VIRTUAL_WIDTH ||
        virtualY < 0 ||
        virtualY > VIRTUAL_HEIGHT
      ) {
        return;
      }

      // Check if current layer is locked
      const activeLayer = layers.find((l) => l.id === activeLayerId);
      if (activeLayer?.locked && tool !== 'select' && tool !== 'eyedropper') {
        return;
      }

      // 1. Eyedropper tool selection
      if (tool === 'eyedropper') {
        sampleColorAt(virtualX, virtualY);
        isDrawing.current = true; // allow dragging color eyedropper
        return;
      }

      // 2. Selection tool logic
      if (tool === 'select') {
        const currentElements = history[historyIndex] || [];
        
        // Check if hitting active selection
        if (selectedElementId) {
          const selected = currentElements.find((el) => el.id === selectedElementId);
          if (selected && isPointNearElement(virtualX, virtualY, selected)) {
            const layerConf = layers.find((l) => l.id === (selected.layerId || 'sketch'));
            if (layerConf?.locked) return; // cannot move locked elements
            isDraggingSelection.current = true;
            selectionDragStart.current = { x: virtualX, y: virtualY };
            dragStartElements.current = JSON.parse(JSON.stringify(currentElements));
            dragDidMove.current = false;
            return;
          }
        }

        // Search for hit element
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
                // If layer locked, select it but do not drag
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

      // 3. Flood Fill bucket trigger
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

      // 4. Drawing trigger
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
        setActiveElement(newElement);
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
        setActiveElement(newElement);
      } else if (tool === 'stamp') {
        const newElement: StampElement = {
          id: Math.random().toString(36).substring(7),
          type: 'stamp',
          emoji: activeStamp || '❤️',
          x: virtualX,
          y: virtualY,
          size: 24, // Initial starting stamp size
          opacity,
          color,
          layerId: activeLayerId,
          symmetryMode,
        };
        setActiveElement(newElement);
      }
    }
  };

  // Pointer Move Handler
  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;

    setCursorCoords({ x: screenX, y: screenY });

    if (activeTouches.current[e.pointerId]) {
      activeTouches.current[e.pointerId] = { x: e.clientX, y: e.clientY };
    }

    if (isPanning) {
      setPan({
        x: e.clientX - startPan.current.x,
        y: e.clientY - startPan.current.y,
      });
      return;
    }

    const touchIds = Object.keys(activeTouches.current).map(Number);
    if (touchIds.length >= 2) {
      // Zoom pinch calculations
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
      return;
    }

    const virtualX = (screenX - pan.x) / zoom;
    const virtualY = (screenY - pan.y) / zoom;

    if (onCursorMove) {
      onCursorMove(virtualX / VIRTUAL_WIDTH, virtualY / VIRTUAL_HEIGHT);
    }

    // Reference image drag repositioning
    if (isDraggingRefImage.current && refImage) {
      const dx = (e.clientX - refDragStart.current.x) / zoom;
      const dy = (e.clientY - refDragStart.current.y) / zoom;
      const nextX = Math.round(refImageStartPos.current.x + dx);
      const nextY = Math.round(refImageStartPos.current.y + dy);
      if (onRefImageChange) {
        onRefImageChange(nextX, nextY);
      }
      return;
    }

    // Eyedropper drag sampling
    if (tool === 'eyedropper' && isDrawing.current) {
      sampleColorAt(virtualX, virtualY);
      return;
    }

    // Selection move dragging
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

        // Inline modify current frame for fast drag rendering
        const nextHistory = [...history];
        nextHistory[historyIndex] = updatedElements;
        setHistory(nextHistory);

        selectionDragStart.current = { x: virtualX, y: virtualY };
      }
      return;
    }

    // Draw drag lines / stamps
    if (isDrawing.current && activeElement) {
      if (activeElement.type === 'pen' || activeElement.type === 'eraser') {
        const currentPoints = (activeElement as FreehandElement).points;
        const newPoints = [
          ...currentPoints,
          { x: virtualX, y: virtualY, pressure: e.pressure || 0.5 },
        ];
        setActiveElement({
          ...activeElement,
          points: newPoints,
        } as FreehandElement);
      } else if (
        activeElement.type === 'line' ||
        activeElement.type === 'circle' ||
        activeElement.type === 'rectangle' ||
        activeElement.type === 'triangle'
      ) {
        setActiveElement({
          ...activeElement,
          endX: virtualX,
          endY: virtualY,
        } as ShapeElement);
      } else if (activeElement.type === 'stamp') {
        // Size stamp dynamically with drag length distance
        const dx = virtualX - activeElement.x;
        const dy = virtualY - activeElement.y;
        const dragDist = Math.hypot(dx, dy);
        const nextSize = Math.max(12, dragDist * 2);
        setActiveElement({
          ...activeElement,
          size: nextSize,
        } as StampElement);
      }
    }
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

    // Commits selection translations cleanly
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

    if (isDrawing.current && activeElement) {
      isDrawing.current = false;
      commitElement(activeElement);
      setActiveElement(null);
    }

    // Text placing editor click
    if (tool === 'text') {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;
      const screenX = e.clientX - rect.left;
      const screenY = e.clientY - rect.top;
      const virtualX = (screenX - pan.x) / zoom;
      const virtualY = (screenY - pan.y) / zoom;

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
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLCanvasElement>) => {
    delete activeTouches.current[e.pointerId];
    if (isDrawing.current) {
      isDrawing.current = false;
      setActiveElement(null);
    }
    if (isPanning) {
      setIsPanning(false);
    }
    if (isDraggingSelection.current) {
      isDraggingSelection.current = false;
    }
  };

  const handlePointerLeave = () => {
    setCursorCoords(null);
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

  // Adjust cursor based on current active tool
  const getCursorStyle = () => {
    if (isPanning) return 'grabbing';
    if (isSpacePressed) return 'grab';
    if (tool === 'text') return 'text';
    if (tool === 'select') return 'default';
    if (tool === 'eyedropper') return 'copy';
    return 'crosshair';
  };

  // Bounding box floating action overlay details
  const currentElementsList = history[historyIndex] || [];
  const selectedElement = currentElementsList.find((el) => el.id === selectedElementId);
  
  let selectionToolbarStyle: React.CSSProperties | null = null;
  if (selectedElement && tool === 'select') {
    const box = getElementBoundingBox(selectedElement);
    const topCenterX = ((box.minX + box.maxX) / 2) * zoom + pan.x;
    const topY = box.minY * zoom + pan.y;
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

      {/* Floating Selection Action Panel overlay */}
      {selectedElement && tool === 'select' && selectionToolbarStyle && (
        <div
          className="absolute z-40 bg-white/95 border border-stone-200/80 shadow-lg rounded-xl p-1 flex gap-1 items-center animate-fade-in"
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

      {/* Helpful HUD Info */}
      <div className="absolute bottom-4 left-4 pointer-events-none select-none text-xs font-semibold text-stone-500/80 bg-white/70 backdrop-blur-xs px-3 py-1.5 rounded-full border border-stone-200/50 shadow-xs flex items-center gap-2">
        <span>Zoom: {Math.round(zoom * 100)}%</span>
        <span className="w-1 h-1 bg-stone-300 rounded-full" />
        <span>Space + Drag to Pan</span>
      </div>
    </div>
  );
};
DrawingCanvas.displayName = 'DrawingCanvas';
