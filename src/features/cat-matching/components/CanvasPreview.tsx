import { useEffect, useRef } from 'react';
import type { Point } from '../types';
import './CanvasPreview.css';

interface CanvasPreviewProps {
  image: HTMLCanvasElement | HTMLImageElement | null;
  catContour?: Point[];
  prefContour?: Point[];
  segmentationMask?: { mask: Uint8Array; width: number; height: number } | null;
  opacity?: number;
  displayMode?: 'overlay' | 'cutout';
}

/**
 * 画像、猫の輪郭、都道府県の輪郭、セグメンテーションマスクを描画するコンポーネント。
 * HTML5 Canvasを使用して、画像処理結果を可視化する。
 */
export default function CanvasPreview({
  image,
  catContour,
  prefContour,
  segmentationMask,
  opacity = 0.7,
  displayMode = 'overlay'
}: CanvasPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !image) return;

    // Hint for frequent readbacks to quiet the console warning
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // Set canvas size to image size
    canvas.width = image.width;
    canvas.height = image.height;

    if (segmentationMask) {
      const { mask, width, height } = segmentationMask;

      if (displayMode === 'cutout') {
        // Cutout mode: make background gray
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);

        for (let i = 0; i < mask.length; i++) {
          if (mask[i] === 0) {
            // Make background pixels gray with opacity control
            const idx = i * 4;
            const gray =
              imageData.data[idx] * 0.299 +
              imageData.data[idx + 1] * 0.587 +
              imageData.data[idx + 2] * 0.114;
            imageData.data[idx] = gray;
            imageData.data[idx + 1] = gray;
            imageData.data[idx + 2] = gray;
            imageData.data[idx + 3] = Math.floor(255 * (1 - opacity));
          }
        }

        ctx.putImageData(imageData, 0, 0);
      } else {
        // Overlay mode: make background transparent based on opacity
        ctx.drawImage(image, 0, 0);
        const imageData = ctx.getImageData(0, 0, width, height);

        for (let i = 0; i < mask.length; i++) {
          const idx = i * 4;
          if (mask[i] === 0) {
            // Make background transparent based on opacity slider
            imageData.data[idx + 3] = Math.floor(255 * (1 - opacity));
          }
          // Keep cat pixels fully opaque (no change needed)
        }

        ctx.putImageData(imageData, 0, 0);
      }
    } else {
      // No mask: just draw image
      ctx.drawImage(image, 0, 0);
    }

    // Draw cat contour
    if (catContour && catContour.length > 0) {
      ctx.strokeStyle = '#00ff00';
      ctx.lineWidth = 4;
      ctx.globalAlpha = opacity;
      drawPolyline(ctx, catContour);

      ctx.globalAlpha = 1;
    }

    // Draw prefecture contour
    if (prefContour && prefContour.length > 0) {
      ctx.strokeStyle = '#ff00ff';
      ctx.lineWidth = 3;
      ctx.globalAlpha = opacity * 0.8;

      // Scale and position prefecture contour to match cat
      if (catContour && catContour.length > 0) {
        // Calculate bounding boxes
        const catBounds = getBounds(catContour);
        const prefBounds = getBounds(prefContour);

        // Scale prefecture to match cat
        const scale = Math.min(
          catBounds.width / prefBounds.width,
          catBounds.height / prefBounds.height
        );

        ctx.save();
        ctx.translate(catBounds.centerX, catBounds.centerY);
        ctx.scale(scale, scale);
        ctx.translate(-prefBounds.centerX, -prefBounds.centerY);

        drawPolyline(ctx, prefContour);

        ctx.restore();
      }

      ctx.globalAlpha = 1;
    }
  }, [image, catContour, prefContour, segmentationMask, opacity, displayMode]);

  if (!image) {
    return (
      <div className="canvas-preview-empty">
        <p>画像をアップロードしてください</p>
      </div>
    );
  }

  return (
    <div className="canvas-preview">
      <canvas ref={canvasRef} />
    </div>
  );
}

/**
 * 点群のバウンディングボックスを計算するヘルパー関数。
 * @param points 点のリスト
 * @returns バウンディングボックス情報
 */
function getBounds(points: Point[]) {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }

  return {
    minX,
    minY,
    maxX,
    maxY,
    width: maxX - minX,
    height: maxY - minY,
    centerX: (minX + maxX) / 2,
    centerY: (minY + maxY) / 2
  };
}

function drawPolyline(ctx: CanvasRenderingContext2D, points: Point[]): void {
  const sanitized = points.filter(p => Number.isFinite(p.x) && Number.isFinite(p.y));
  if (sanitized.length === 0) return;

  ctx.beginPath();
  ctx.moveTo(sanitized[0].x, sanitized[0].y);
  for (let i = 1; i < sanitized.length; i++) {
    ctx.lineTo(sanitized[i].x, sanitized[i].y);
  }

  if (shouldClosePath(sanitized)) {
    ctx.closePath();
  }
  ctx.stroke();
}

function shouldClosePath(points: Point[]): boolean {
  if (points.length < 3) return false;
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const dx = points[i].x - points[i - 1].x;
    const dy = points[i].y - points[i - 1].y;
    total += Math.sqrt(dx * dx + dy * dy);
  }
  const avg = total / Math.max(1, points.length - 1);
  const closeThreshold = Math.max(1, avg * 3);
  const dxEnd = points[0].x - points[points.length - 1].x;
  const dyEnd = points[0].y - points[points.length - 1].y;
  const endDist = Math.sqrt(dxEnd * dxEnd + dyEnd * dyEnd);
  return endDist <= closeThreshold;
}
