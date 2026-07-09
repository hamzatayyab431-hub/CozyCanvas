import { getStroke } from 'perfect-freehand';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
}

export type ToolType =
  | 'pen'
  | 'eraser'
  | 'fill'
  | 'line'
  | 'circle'
  | 'rectangle'
  | 'text'
  | 'select'
  | 'eyedropper'
  | 'stamp'
  | 'triangle';

export type BrushType = 'pen' | 'marker' | 'airbrush' | 'pencil';

export interface BaseElement {
  id: string;
  type: ToolType;
  color: string;
  size: number;
  opacity: number;
  layerId?: 'background' | 'sketch' | 'details';
  symmetryMode?: 'none' | 'vertical' | 'horizontal' | 'both';
}

export interface FreehandElement extends BaseElement {
  type: 'pen' | 'eraser';
  points: Point[];
  brushType?: BrushType;
}

export interface ShapeElement extends BaseElement {
  type: 'line' | 'circle' | 'rectangle' | 'triangle';
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  fill?: boolean;
}

export interface TextElement extends BaseElement {
  type: 'text';
  x: number;
  y: number;
  text: string;
}

export interface FillElement extends BaseElement {
  type: 'fill';
  x: number;
  y: number;
}

export interface StampElement extends BaseElement {
  type: 'stamp';
  emoji: string;
  x: number;
  y: number;
}

export type DrawingElement =
  | FreehandElement
  | ShapeElement
  | TextElement
  | FillElement
  | StampElement;

/**
 * Converts stroke outline points from perfect-freehand to an SVG path string.
 */
export function getSvgPathFromStroke(stroke: number[][]): string {
  if (!stroke.length) return '';
  const d = stroke.reduce(
    (acc, [x0, y0], i, arr) => {
      const [x1, y1] = arr[(i + 1) % arr.length];
      acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
      return acc;
    },
    ['M', ...stroke[0], 'Q']
  );
  d.push('Z');
  return d.join(' ');
}

/**
 * Utility helper to convert HEX to RGB.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
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

/**
 * Scanline-based flood fill algorithm for the canvas.
 * Highly performant and avoids stack overflow errors on large canvases.
 */
export function floodFill(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  fillColorHex: string
) {
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;
  const targetX = Math.round(startX);
  const targetY = Math.round(startY);

  if (targetX < 0 || targetX >= width || targetY < 0 || targetY >= height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const getPixelIndex = (x: number, y: number) => (y * width + x) * 4;

  const startIdx = getPixelIndex(targetX, targetY);
  const startR = data[startIdx];
  const startG = data[startIdx + 1];
  const startB = data[startIdx + 2];
  const startA = data[startIdx + 3];

  // Parse target hex color
  let hex = fillColorHex.replace('#', '');
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }
  const fillR = parseInt(hex.substring(0, 2), 16);
  const fillG = parseInt(hex.substring(2, 4), 16);
  const fillB = parseInt(hex.substring(4, 6), 16);
  const fillA = 255; // opaque fill

  // If start pixel color matches fill color within a very tight tolerance, return
  if (
    Math.abs(startR - fillR) < 3 &&
    Math.abs(startG - fillG) < 3 &&
    Math.abs(startB - fillB) < 3 &&
    Math.abs(startA - fillA) < 3
  ) {
    return;
  }

  const stack: [number, number][] = [[targetX, targetY]];
  const tolerance = 20; // Tolerance to bridge anti-aliased edge colors

  const colorMatch = (idx: number) => {
    return (
      Math.abs(data[idx] - startR) <= tolerance &&
      Math.abs(data[idx + 1] - startG) <= tolerance &&
      Math.abs(data[idx + 2] - startB) <= tolerance &&
      Math.abs(data[idx + 3] - startA) <= tolerance
    );
  };

  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const point = stack.pop();
    if (!point) continue;
    const [px, py] = point;

    let x = px;
    const y = py;

    const index = y * width + x;
    if (visited[index]) continue;

    // Move left as far as possible
    while (x >= 0 && colorMatch(getPixelIndex(x, y))) {
      x--;
    }
    x++; // Step back to last matching pixel

    let reachUp = false;
    let reachDown = false;

    while (x < width && colorMatch(getPixelIndex(x, y))) {
      const idx = getPixelIndex(x, y);
      data[idx] = fillR;
      data[idx + 1] = fillG;
      data[idx + 2] = fillB;
      data[idx + 3] = fillA;

      visited[y * width + x] = 1;

      // Check above row
      if (y > 0) {
        const upIdx = getPixelIndex(x, y - 1);
        if (colorMatch(upIdx) && !visited[(y - 1) * width + x]) {
          if (!reachUp) {
            stack.push([x, y - 1]);
            reachUp = true;
          }
        } else {
          reachUp = false;
        }
      }

      // Check below row
      if (y < height - 1) {
        const downIdx = getPixelIndex(x, y + 1);
        if (colorMatch(downIdx) && !visited[(y + 1) * width + x]) {
          if (!reachDown) {
            stack.push([x, y + 1]);
            reachDown = true;
          }
        } else {
          reachDown = false;
        }
      }

      x++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

/**
 * Draws a single element onto the provided canvas 2D rendering context.
 */
export function drawElement(ctx: CanvasRenderingContext2D, element: DrawingElement) {
  switch (element.type) {
    case 'pen': {
      if (element.points.length === 0) return;
      const brush = element.brushType || 'pen';

      // 1. Airbrush rendering
      if (brush === 'airbrush') {
        ctx.save();
        ctx.globalAlpha = element.opacity;
        const rgb = hexToRgb(element.color) || { r: 0, g: 0, b: 0 };
        for (const p of element.points) {
          const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, element.size / 2);
          grad.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.15)`);
          grad.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(p.x, p.y, element.size / 2, 0, 2 * Math.PI);
          ctx.fill();
        }
        ctx.restore();
        return;
      }

      // 2. Marker rendering
      if (brush === 'marker') {
        ctx.save();
        ctx.globalAlpha = element.opacity * 0.45; // semi-transparent overlap
        ctx.fillStyle = element.color;
        for (const p of element.points) {
          // Draw rect-cap spacing
          ctx.fillRect(p.x - element.size / 2, p.y - element.size / 2, element.size, element.size);
        }
        ctx.restore();
        return;
      }

      // 3. Pencil rendering
      if (brush === 'pencil') {
        ctx.save();
        ctx.globalAlpha = element.opacity * 0.75;
        ctx.strokeStyle = element.color;
        ctx.lineWidth = Math.max(1, element.size * 0.2); // pencil lines are thin
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // Draw primary jittered line
        ctx.beginPath();
        const jitter = () => (Math.random() - 0.5) * (element.size * 0.15);
        ctx.moveTo(element.points[0].x + jitter(), element.points[0].y + jitter());
        for (let i = 1; i < element.points.length; i++) {
          ctx.lineTo(element.points[i].x + jitter(), element.points[i].y + jitter());
        }
        ctx.stroke();

        // Draw secondary overlay line for graphite texture
        if (element.points.length > 1) {
          ctx.beginPath();
          const jitter2 = () => (Math.random() - 0.5) * (element.size * 0.25);
          ctx.moveTo(element.points[0].x + jitter2(), element.points[0].y + jitter2());
          for (let i = 1; i < element.points.length; i++) {
            ctx.lineTo(element.points[i].x + jitter2(), element.points[i].y + jitter2());
          }
          ctx.stroke();
        }
        ctx.restore();
        return;
      }

      // 4. Default Ink Pen
      if (element.points.length === 1) {
        ctx.save();
        ctx.globalAlpha = element.opacity;
        ctx.fillStyle = element.color;
        ctx.beginPath();
        ctx.arc(element.points[0].x, element.points[0].y, element.size / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
        return;
      }

      const strokePoints = getStroke(element.points, {
        size: element.size,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: true,
      });

      if (strokePoints.length === 0) return;

      ctx.save();
      ctx.globalAlpha = element.opacity;
      ctx.fillStyle = element.color;
      ctx.beginPath();
      ctx.moveTo(strokePoints[0][0], strokePoints[0][1]);
      for (let i = 1; i < strokePoints.length; i++) {
        ctx.lineTo(strokePoints[i][0], strokePoints[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'eraser': {
      if (element.points.length === 0) return;

      if (element.points.length === 1) {
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = 'rgba(0,0,0,1)';
        ctx.beginPath();
        ctx.arc(element.points[0].x, element.points[0].y, element.size / 2, 0, 2 * Math.PI);
        ctx.fill();
        ctx.restore();
        return;
      }

      const strokePoints = getStroke(element.points, {
        size: element.size,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
        simulatePressure: true,
      });

      if (strokePoints.length === 0) return;

      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.beginPath();
      ctx.moveTo(strokePoints[0][0], strokePoints[0][1]);
      for (let i = 1; i < strokePoints.length; i++) {
        ctx.lineTo(strokePoints[i][0], strokePoints[i][1]);
      }
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      break;
    }

    case 'line': {
      ctx.save();
      ctx.globalAlpha = element.opacity;
      ctx.strokeStyle = element.color;
      ctx.lineWidth = element.size;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(element.startX, element.startY);
      ctx.lineTo(element.endX, element.endY);
      ctx.stroke();
      ctx.restore();
      break;
    }

    case 'rectangle': {
      ctx.save();
      ctx.globalAlpha = element.opacity;
      const x = Math.min(element.startX, element.endX);
      const y = Math.min(element.startY, element.endY);
      const w = Math.abs(element.endX - element.startX);
      const h = Math.abs(element.endY - element.startY);

      if (element.fill) {
        ctx.fillStyle = element.color;
        ctx.fillRect(x, y, w, h);
      } else {
        ctx.strokeStyle = element.color;
        ctx.lineWidth = element.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();
      break;
    }

    case 'circle': {
      ctx.save();
      ctx.globalAlpha = element.opacity;
      ctx.beginPath();
      const rx = Math.abs(element.endX - element.startX) / 2;
      const ry = Math.abs(element.endY - element.startY) / 2;
      const cx = Math.min(element.startX, element.endX) + rx;
      const cy = Math.min(element.startY, element.endY) + ry;
      ctx.ellipse(cx, cy, rx, ry, 0, 0, 2 * Math.PI);
      if (element.fill) {
        ctx.fillStyle = element.color;
        ctx.fill();
      } else {
        ctx.strokeStyle = element.color;
        ctx.lineWidth = element.size;
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'triangle': {
      ctx.save();
      ctx.globalAlpha = element.opacity;
      ctx.beginPath();
      // Draw upright triangle inside bounding box
      const topX = (element.startX + element.endX) / 2;
      const topY = element.startY;
      ctx.moveTo(topX, topY);
      ctx.lineTo(element.startX, element.endY);
      ctx.lineTo(element.endX, element.endY);
      ctx.closePath();
      if (element.fill) {
        ctx.fillStyle = element.color;
        ctx.fill();
      } else {
        ctx.strokeStyle = element.color;
        ctx.lineWidth = element.size;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();
      }
      ctx.restore();
      break;
    }

    case 'text': {
      ctx.save();
      ctx.globalAlpha = element.opacity;
      ctx.fillStyle = element.color;
      ctx.font = `${element.size}px sans-serif`;
      ctx.textBaseline = 'top';
      ctx.fillText(element.text, element.x, element.y);
      ctx.restore();
      break;
    }

    case 'fill': {
      floodFill(ctx, element.x, element.y, element.color);
      break;
    }

    case 'stamp': {
      ctx.save();
      ctx.globalAlpha = element.opacity;
      ctx.font = `${element.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(element.emoji, element.x, element.y);
      ctx.restore();
      break;
    }
  }
}

/**
 * Calculates distance from a point to a line segment.
 */
export function distanceToSegment(
  x: number,
  y: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx = 0;
  let yy = 0;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.hypot(dx, dy);
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Computes bounding box coordinates for any element.
 */
export function getElementBoundingBox(element: DrawingElement): BoundingBox {
  switch (element.type) {
    case 'pen':
    case 'eraser': {
      if (element.points.length === 0) {
        return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      }
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const p of element.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      const pad = element.size / 2;
      return {
        minX: minX - pad,
        minY: minY - pad,
        maxX: maxX + pad,
        maxY: maxY + pad,
      };
    }

    case 'line':
    case 'rectangle':
    case 'circle':
    case 'triangle': {
      const pad = element.size / 2;
      return {
        minX: Math.min(element.startX, element.endX) - pad,
        minY: Math.min(element.startY, element.endY) - pad,
        maxX: Math.max(element.startX, element.endX) + pad,
        maxY: Math.max(element.startY, element.endY) + pad,
      };
    }

    case 'text': {
      const w = element.text.length * element.size * 0.6;
      const h = element.size * 1.2;
      return {
        minX: element.x,
        minY: element.y,
        maxX: element.x + w,
        maxY: element.y + h,
      };
    }

    case 'stamp': {
      const pad = element.size / 2;
      return {
        minX: element.x - pad,
        minY: element.y - pad,
        maxX: element.x + pad,
        maxY: element.y + pad,
      };
    }

    case 'fill': {
      return {
        minX: element.x - 10,
        minY: element.y - 10,
        maxX: element.x + 10,
        maxY: element.y + 10,
      };
    }
  }
}

/**
 * Returns true if client coordinate is near/inside drawing element.
 */
export function isPointNearElement(
  px: number,
  py: number,
  element: DrawingElement
): boolean {
  const box = getElementBoundingBox(element);
  if (
    px < box.minX - 10 ||
    px > box.maxX + 10 ||
    py < box.minY - 10 ||
    py > box.maxY + 10
  ) {
    return false;
  }

  switch (element.type) {
    case 'line': {
      const dist = distanceToSegment(
        px,
        py,
        element.startX,
        element.startY,
        element.endX,
        element.endY
      );
      return dist <= Math.max(8, element.size / 2 + 5);
    }
    case 'pen':
    case 'eraser': {
      const threshold = Math.max(10, element.size / 2 + 5);
      for (let i = 0; i < element.points.length - 1; i++) {
        const dist = distanceToSegment(
          px,
          py,
          element.points[i].x,
          element.points[i].y,
          element.points[i + 1].x,
          element.points[i + 1].y
        );
        if (dist <= threshold) return true;
      }
      if (element.points.length === 1) {
        const dist = Math.hypot(px - element.points[0].x, py - element.points[0].y);
        if (dist <= threshold) return true;
      }
      return false;
    }
    default:
      // text, stamp, fill, circle, rect, triangle
      return true;
  }
}

/**
 * Draws an element, applying symmetry transformations if specified.
 */
export function drawElementWithSymmetry(
  ctx: CanvasRenderingContext2D,
  element: DrawingElement,
  virtualWidth: number = 1600,
  virtualHeight: number = 1200
) {
  drawElement(ctx, element);

  const sym = element.symmetryMode || 'none';
  if (sym === 'vertical' || sym === 'both') {
    ctx.save();
    ctx.translate(virtualWidth / 2, 0);
    ctx.scale(-1, 1);
    ctx.translate(-virtualWidth / 2, 0);
    drawElement(ctx, element);
    ctx.restore();
  }
  if (sym === 'horizontal' || sym === 'both') {
    ctx.save();
    ctx.translate(0, virtualHeight / 2);
    ctx.scale(1, -1);
    ctx.translate(0, -virtualHeight / 2);
    drawElement(ctx, element);
    ctx.restore();
  }
  if (sym === 'both') {
    ctx.save();
    ctx.translate(virtualWidth / 2, virtualHeight / 2);
    ctx.scale(-1, -1);
    ctx.translate(-virtualWidth / 2, -virtualHeight / 2);
    drawElement(ctx, element);
    ctx.restore();
  }
}

