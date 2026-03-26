import { Component, input, output, ViewChild, ElementRef, computed } from '@angular/core';
import { DrawingStroke, Point, StampAnnotation } from '../../models/drawing.model';
import getStroke from 'perfect-freehand';

@Component({
  selector: 'app-drawing-canvas',
  templateUrl: './drawing-canvas.html',
  styleUrl: './drawing-canvas.scss',
})
export class DrawingCanvas {
  @ViewChild('svg') svgElement!: ElementRef<SVGSVGElement>;

  strokes = input<DrawingStroke[]>([]);
  active = input<boolean>(false);

  pointAdded = output<{ strokeId: string; point: Point }>();
  strokeCommitted = output<string>(); // emits strokeId

  annotations = input<StampAnnotation[]>([]);
  stampClicked = output<{ x: number; y: number }>();

  private currentStrokeId: string | null = null;

  // Derived SVG paths — recomputed when strokes signal changes
  renderedStrokes = computed(() =>
    this.strokes().map(stroke => ({
      id: stroke.id,
      color: stroke.color,
      path: this.toSvgPath(stroke.points),
    }))
  );

  renderedAnnotations = computed(() => this.annotations());

  onPointerDown(event: PointerEvent): void {
    if (!this.active()) return;
    event.preventDefault();
    // Capture ensures pointermove/pointerup fire on this element
    // even if pointer leaves it mid-stroke
    (event.target as Element).setPointerCapture(event.pointerId);
    this.currentStrokeId = crypto.randomUUID();
    this.pointAdded.emit({ strokeId: this.currentStrokeId, point: this.extractPoint(event) });
  }

  onPointerMove(event: PointerEvent): void {
    if (!this.active() || !this.currentStrokeId) return;
    event.preventDefault();
    this.pointAdded.emit({ strokeId: this.currentStrokeId, point: this.extractPoint(event) });
  }

  onPointerUp(): void {
    if (!this.currentStrokeId) return;
    this.strokeCommitted.emit(this.currentStrokeId);
    this.currentStrokeId = null;
  }

  // ----------------------------------------------------------------
  // Private
  // ----------------------------------------------------------------

  private extractPoint(event: PointerEvent): Point {
    const rect = this.svgElement.nativeElement.getBoundingClientRect();
    return {
      x: event.clientX - rect.left,
      y: event.clientY - rect.top,
      // pressure is 0 on mouse (neutral default 0.5), natural on stylus
      pressure: event.pressure || 0.5,
    };
  }

  private toSvgPath(points: Point[]): string {
    if (points.length === 0) return '';
    const outline = getStroke(
      points.map(p => [p.x, p.y, p.pressure]),
      {
        size: 6,
        thinning: 0.5,
        smoothing: 0.5,
        streamline: 0.5,
      }
    );
    return this.outlineToSvgPath(outline);
  }

  // Standard perfect-freehand SVG conversion from their docs
  private outlineToSvgPath(stroke: number[][]): string {
    if (!stroke.length) return '';
    const d = stroke.reduce(
      (acc, [x0, y0], i, arr) => {
        const [x1, y1] = arr[(i + 1) % arr.length];
        acc.push(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
        return acc;
      },
      ['M', ...stroke[0], 'Q'] as (string | number)[],
    );
    d.push('Z');
    return d.join(' ');
  }
}