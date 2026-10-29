import {  TestBed } from '@angular/core/testing';
import { ClassroomStore } from './classroom-store.service';
import { DrawingService } from './drawing.service';
import { RealtimeTransport } from './realtime-transport.service';
import { SupabaseService } from './supabase.service';
import {FakeRealtimeTransport, fakeSupabase} from '../../tests/fake-transport'
describe('DrawingService clear logic', () => {
  let transport: FakeRealtimeTransport;
  let store: ClassroomStore;
  let service: DrawingService;

  beforeEach(() => {
    transport = new FakeRealtimeTransport();
    TestBed.configureTestingModule({
      providers: [
        DrawingService,
        { provide: RealtimeTransport, useValue: transport },
        { provide: SupabaseService, useValue: fakeSupabase() },
      ]
    });
    store = TestBed.inject(ClassroomStore);
    service = TestBed.inject(DrawingService);
    store.joinAsStudent('Alice', 'room-1', () => {},() => {});
  });

  function addLocalStroke() {
    service.addLocalPoint('stroke-1', { x: 0, y: 0, pressure: 0.5 }, '#ff0000');
  }
it('drawing_clear for this student clears local strokes', (() => {
  addLocalStroke();
  service.addLocalAnnotation('star', 10, 20, '#ff0000');
  expect(service.localStrokes().length).toBe(1);

  transport.events$.next({ type: 'drawing_clear', studentName: 'Alice' });
  TestBed.tick();

  expect(service.localStrokes().length).toBe(0);
  expect(service.localAnnotations()).toEqual([]);
  expect(transport.sentOfType('drawing_clear_by_student')).toEqual([]);
}));

it('drawing_clear for different student does NOT clear local strokes', (() => {
  addLocalStroke();
  transport.events$.next({ type: 'drawing_clear', studentName: 'Bob' });
  TestBed.tick();
  expect(service.localStrokes().length).toBe(1);
}));

it('drawing_clear_all clears regardless of student name', (() => {
  addLocalStroke();
  transport.events$.next({ type: 'drawing_clear_all' });
  TestBed.tick();
  expect(service.localStrokes().length).toBe(0);
}));

it('student clear removes local drawings and broadcasts the student name', () => {
  addLocalStroke();
  service.addLocalAnnotation('star', 10, 20, '#ff0000');

  service.clearLocalByStudent();

  expect(service.localStrokes()).toEqual([]);
  expect(service.localAnnotations()).toEqual([]);
  expect(transport.sentOfType('drawing_clear_by_student')).toEqual([
    { type: 'drawing_clear_by_student', studentName: 'Alice' },
  ]);
});

it('drawing_clear_by_student removes only that student drawings and annotations', () => {
  service.allStrokes.set([
    { id: 'alice-stroke', studentName: 'Alice', color: '#ff0000', points: [], committed: true },
    { id: 'bob-stroke', studentName: 'Bob', color: '#0000ff', points: [], committed: true },
  ]);
  service.allAnnotations.set([
    { id: 'alice-stamp', studentName: 'Alice', color: '#ff0000', type: 'star', x: 10, y: 20 },
    { id: 'bob-stamp', studentName: 'Bob', color: '#0000ff', type: 'check', x: 30, y: 40 },
  ]);

  transport.events$.next({ type: 'drawing_clear_by_student', studentName: 'Alice' });
  TestBed.tick();

  expect(service.allStrokes().map(stroke => stroke.id)).toEqual(['bob-stroke']);
  expect(service.allAnnotations().map(annotation => annotation.id)).toEqual(['bob-stamp']);
});

  it('drawing_clear_all maps to studentName all in the signal', () => {
    transport.events$.next({ type: 'drawing_clear_all' });
    expect(store.incomingDrawingClear()?.studentName).toBe('all');
  });
});