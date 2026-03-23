import { Injectable, inject, signal, effect } from '@angular/core';
import { ClassroomStore } from './classroom-store.service';
import { DrawingStroke, Point } from '../../shared/models/drawing.model';

const THROTTLE_MS = 50;

@Injectable({ providedIn: 'root' })
export class DrawingService {
  private classroomStore = inject(ClassroomStore);

  // Teacher sees all students' strokes
  allStrokes = signal<DrawingStroke[]>([]);

  // Student sees only their own strokes
  localStrokes = signal<DrawingStroke[]>([]);

  // studentName → chosen color, for teacher's side panel
  studentColors = signal<Record<string, string>>({});

  // Only one stroke active at a time per student
  private throttleTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPoints: Point[] = [];
  private activeStrokeId: string | null = null;
  private activeStrokeColor: string | null = null;

  constructor() {
    this.setupIncomingEvents();
  }

  // ----------------------------------------------------------------
  // Student-side: outgoing
  // ----------------------------------------------------------------

  addLocalPoint(strokeId: string, point: Point, color: string): void {
    const studentName = this.classroomStore.studentName();

    // Update local strokes immediately for instant visual feedback
    this.localStrokes.update(strokes => {
      const existing = strokes.find(s => s.id === strokeId);
      if (existing) {
        return strokes.map(s =>
          s.id === strokeId ? { ...s, points: [...s.points, point] } : s
        );
      }
      return [...strokes, { id: strokeId, studentName, color, points: [point], committed: false }];
    });

    // Track active stroke for flushing
    this.activeStrokeId = strokeId;
    this.activeStrokeColor = color;
    this.pendingPoints.push(point);

    // Start throttle timer if not already running
    if (!this.throttleTimer) {
      this.throttleTimer = setTimeout(() => this.flushPoints(), THROTTLE_MS);
    }
  }

  commitLocalStroke(strokeId: string): void {
    // Flush any remaining pending points before committing
    this.flushPoints();

    this.localStrokes.update(strokes =>
      strokes.map(s => s.id === strokeId ? { ...s, committed: true } : s)
    );

    this.classroomStore.sendDrawingCommit(strokeId);
  }

  broadcastColor(color: string): void {
    this.classroomStore.sendDrawingColor(color);
  }

  // ----------------------------------------------------------------
  // Teacher-side: outgoing
  // ----------------------------------------------------------------

  clearStudent(studentName: string): void {
    this.allStrokes.update(strokes =>
      strokes.filter(s => s.studentName !== studentName)
    );
    this.classroomStore.sendDrawingClear(studentName);
  }

  clearAll(): void {
    this.allStrokes.set([]);
    this.classroomStore.sendDrawingClearAll();
  }

  // Named explicitly so call sites are self-documenting
  clearAllOnFenChange(): void {
    this.clearAll();
  }

  // ----------------------------------------------------------------
  // Student-side: incoming clear from teacher
  // ----------------------------------------------------------------

  clearLocal(): void {
    this.localStrokes.set([]);
    this.cancelPending();
  }

  // ----------------------------------------------------------------
  // Private
  // ----------------------------------------------------------------

  private setupIncomingEvents(): void {
    // Incoming points from a student → append to allStrokes (teacher side)
    effect(() => {
      const event = this.classroomStore.incomingDrawingPoints();
      if (!event) return;
      const { studentName, strokeId, color, points } = event;
      this.allStrokes.update(strokes => {
        const existing = strokes.find(s => s.id === strokeId);
        if (existing) {
          return strokes.map(s =>
            s.id === strokeId ? { ...s, points: [...s.points, ...points] } : s
          );
        }
        return [...strokes, { id: strokeId, studentName, color, points, committed: false }];
      });
    });

    // Incoming commit from a student
    effect(() => {
      const event = this.classroomStore.incomingDrawingCommit();
      if (!event) return;
      this.allStrokes.update(strokes =>
        strokes.map(s => s.id === event.strokeId ? { ...s, committed: true } : s)
      );
    });

    // Incoming color selection from a student
    effect(() => {
      const event = this.classroomStore.incomingDrawingColor();
      if (!event) return;
      this.studentColors.update(colors => ({
        ...colors,
        [event.studentName]: event.color,
      }));
    });

    // Incoming clear from teacher
    effect(() => {
      const event = this.classroomStore.incomingDrawingClear();
      if (!event) return;
      const myName = this.classroomStore.studentName();
      if (event.studentName === myName || event.studentName === 'all') {
        this.clearLocal();
      }
    });
  }

  private flushPoints(): void {
    if (!this.pendingPoints.length || !this.activeStrokeId || !this.activeStrokeColor) return;

    this.classroomStore.sendDrawingPoints(
      this.activeStrokeId,
      [...this.pendingPoints],
      this.activeStrokeColor,
    );

    this.pendingPoints = [];
    this.throttleTimer = null;
  }

  private cancelPending(): void {
    if (this.throttleTimer) {
      clearTimeout(this.throttleTimer);
      this.throttleTimer = null;
    }
    this.pendingPoints = [];
    this.activeStrokeId = null;
    this.activeStrokeColor = null;
  }
}