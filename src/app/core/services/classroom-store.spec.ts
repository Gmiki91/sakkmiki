import { TestBed } from '@angular/core/testing';
import { ClassroomStore } from './classroom-store.service';
import {FakeRealtimeTransport,fakeSupabase, makeStore, wireTransports} from '../../tests/fake-transport'
import { RealtimeTransport } from './realtime-transport.service';
import { SupabaseService } from './supabase.service';
import { ExerciseList } from '../../shared/models/exercise-list.model';
describe('resyncStudentGameState', () => {
  let teacherTransport: FakeRealtimeTransport;
  let teacherStore: ClassroomStore;

  beforeEach(() => {
    teacherTransport = new FakeRealtimeTransport();
    teacherStore = makeStore(teacherTransport);
    teacherStore.joinAsTeacher('room-1');
    teacherTransport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
  });

  it('student_ready emits the student name on resync$', (done) => {
    teacherStore.resync$.subscribe(name => {
      expect(name).toBe('Alice');
      done;
    });
    teacherTransport.events$.next({ type: 'student_ready', name: 'Alice' });
  });

  it('student_ready also triggers ephemeral resync (sends curtain state)', () => {
    teacherStore.sendCurtain(false);
    teacherTransport.clear();
    teacherTransport.events$.next({ type: 'student_ready', name: 'Alice' });
    expect(teacherTransport.sentOfType('curtain').length).toBeGreaterThan(0);
  });
});
describe('presence sync', () => {
  let store: ClassroomStore;
  let transport: FakeRealtimeTransport;

  beforeEach(() => {
    transport = new FakeRealtimeTransport();
    store = makeStore(transport);
    store.joinAsTeacher('room-1');
  });

  it('adds a student when they join', () => {
    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    expect(store.students().length).toBe(1);
    expect(store.students()[0].online).toBe(true);
  });

  it('marks student offline but does NOT remove them on disconnect', () => {
    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    transport.presenceSync$.next([]);
    expect(store.students().length).toBe(1);
    expect(store.students()[0].online).toBe(false);
  });

  it('preserves exIndex and locked state when student reconnects', () => {
    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    // Simulate state update from student
    transport.events$.next({ type: 'student_state', studentState: {
      name: 'Alice', online: true, lastSeen: 0,
      exIndex: 3, locked: true, awaitingRedo: false, awaitingStamp: false
    }});
    // Alice drops and reconnects
    transport.presenceSync$.next([]);
    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);

    const alice = store.students().find(s => s.name === 'Alice')!;
    expect(alice.exIndex).toBe(3);
    expect(alice.locked).toBe(true);
  });

  it('triggers resync when a NEW student joins (not on reconnect of known student)', () => {
    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    transport.clear();
    // Alice reconnects — no new joiner, should not resync
    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    expect(transport.sentOfType('request_student_states').length).toBe(0);

    // Bob joins — new joiner, should resync
    transport.presenceSync$.next([
      { role: 'student', name: 'Alice' },
      { role: 'student', name: 'Bob' }
    ]);
    expect(transport.sentOfType('request_student_states').length).toBe(1);
  });
});

describe('resyncEphemeralState', () => {
  it('sends gather event to new joiner when in gathered mode', () => {
    const transport = new FakeRealtimeTransport();
    const store = makeStore(transport);
    store.joinAsTeacher('room-1');
    store.gather();
    transport.clear();

    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    expect(transport.sentOfType('gather').length).toBe(1);
  });

  it('sends simul_start to new joiner when in simul mode', () => {
    const transport = new FakeRealtimeTransport();
    const store = makeStore(transport);
    store.joinAsTeacher('room-1');
    store.startSimul();
    transport.clear();

    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    expect(transport.sentOfType('simul_start').length).toBe(1);
  });

  it('sends current curtain state to new joiner', () => {
    const transport = new FakeRealtimeTransport();
    const store = makeStore(transport);
    store.joinAsTeacher('room-1');
    store.sendCurtain(false); // open the curtain
    transport.clear();

    transport.presenceSync$.next([{ role: 'student', name: 'Alice' }]);
    const curtainEvent = transport.sentOfType('curtain').at(-1) as any;
    expect(curtainEvent?.closed).toBe(false);
  });
});
describe('challenge pair logic', () => {
  let transport: FakeRealtimeTransport;
  let store: ClassroomStore;

  beforeEach(() => {
    transport = new FakeRealtimeTransport();
    store = makeStore(transport);
    store.joinAsStudent('Alice', 'room-1', () => {},() => {});
  });

  it('challenge_rematch swaps colors', () => {
    store.challengePairs.set([{ white: 'Alice', black: 'Bob' }]);
    const swapped = { white: 'Bob', black: 'Alice' };
    transport.events$.next({ type: 'challenge_rematch', pair: swapped });

    expect(store.challengePairs()[0]).toEqual(swapped);
  });

  it('challenge_rematch clears challengeMove', () => {
    store.challengeMove.set({ white: 'Alice', black: 'Bob', fen: 'x', from: 'e2', to: 'e4' });
    store.challengePairs.set([{ white: 'Alice', black: 'Bob' }]);
    transport.events$.next({ type: 'challenge_rematch', pair: { white: 'Bob', black: 'Alice' } });

    expect(store.challengeMove()).toBeNull();
  });

  it('challenge_remove deletes the pair', () => {
    store.challengePairs.set([{ white: 'Alice', black: 'Bob' }]);
    transport.events$.next({ type: 'challenge_remove', pair: { white: 'Alice', black: 'Bob' } });
    expect(store.challengePairs()).toEqual([]);
  });

  it('challenge_rematch also matches on swapped original', () => {
    // Pair was created as Alice=white, Bob=black
    // Rematch arrives as Bob=white, Alice=black
    store.challengePairs.set([{ white: 'Alice', black: 'Bob' }]);
    const rematch = { white: 'Bob', black: 'Alice' };
    transport.events$.next({ type: 'challenge_rematch', pair: rematch });

    expect(store.challengePairs()[0]).toEqual(rematch);
  });
});

describe('autoRedo / autoProgress overrides', () => {
  let transport: FakeRealtimeTransport;
  let store: ClassroomStore;

  beforeEach(() => {
    transport = new FakeRealtimeTransport();
    store = makeStore(transport);
    store.joinAsStudent('Alice', 'room-1', () => {},() => {});
  });

  it('global autoRedo false applies when no studentName', () => {
    transport.events$.next({ type: 'set_auto_redo', value: false });
    expect(store.autoRedo()).toBe(false);
  });

  it('per-student autoRedo does not affect global', () => {
    transport.events$.next({ type: 'set_auto_redo', value: false, studentName: 'Bob' });
    expect(store.autoRedo()).toBe(true);
  });

  it('per-student autoRedo for this student overrides global', () => {
    transport.events$.next({ type: 'set_auto_redo', value: false, studentName: 'Alice' });
    expect(store.autoRedo()).toBe(false);
  });

});

describe('autoRedo / autoProgress overrides — teacher side', () => {
  let teacherTransport: FakeRealtimeTransport;
  let teacherStore: ClassroomStore;

  beforeEach(() => {
    teacherTransport = new FakeRealtimeTransport();
    teacherStore = makeStore(teacherTransport);
    teacherStore.joinAsTeacher('room-1');
  });

  it('sendAutoRedo globally clears all overrides', () => {
    teacherStore.sendAutoRedo(false, 'Alice');
    expect(teacherStore.autoRedoOverrides()['Alice']).toBe(false);
    teacherStore.sendAutoRedo(true);
    expect(teacherStore.autoRedoOverrides()).toEqual({});
  });

  it('sendAutoProgress per-student sets override without touching global', () => {
    teacherStore.sendAutoProgress(false, 'Bob');
    expect(teacherStore.autoProgress()).toBe(true);
    expect(teacherStore.autoProgressOverrides()['Bob']).toBe(false);
  });
});
describe('student name filtering', () => {
  let teacherTransport: FakeRealtimeTransport;
  let aliceTransport: FakeRealtimeTransport;
  let aliceStore: ClassroomStore;

  beforeEach(() => {
    teacherTransport = new FakeRealtimeTransport();
    aliceTransport = new FakeRealtimeTransport();
    wireTransports(teacherTransport, aliceTransport);
    aliceStore = makeStore(aliceTransport);
    aliceStore.joinAsStudent('Alice', 'room-1', () => {},()=>{});
  });

  it('list_assigned only applies to the named student', () => {
    const exercises = [{ id: '1', title: 'Test' } as any];
    aliceTransport.events$.next({ type: 'list_assigned', studentName: 'Bob', exercises });
    expect(aliceStore.assignedExercises()).toEqual([]);

    aliceTransport.events$.next({ type: 'list_assigned', studentName: 'Alice', exercises });
    expect(aliceStore.assignedExercises()).toEqual(exercises);
  });

  it('dropped_exercise only applies to the named student', () => {
    const exercise = { id: '1' } as any;
    aliceTransport.events$.next({ type: 'dropped_exercise', studentName: 'Bob', exercise });
    expect(aliceStore.droppedExercise()).toBeNull();

    aliceTransport.events$.next({ type: 'dropped_exercise', studentName: 'Alice', exercise });
    expect(aliceStore.droppedExercise()).toEqual(exercise);
  });

  it('lock fires only for the named student', (done) => {
    aliceStore.lock$.subscribe(() => done);
    aliceTransport.events$.next({ type: 'lock', studentName: 'Bob' }); // should not fire
    aliceTransport.events$.next({ type: 'lock', studentName: 'Alice' }); // should fire
  });

  it('set_auto_redo with no studentName applies globally', () => {
    aliceTransport.events$.next({ type: 'set_auto_redo', value: false });
    expect(aliceStore.autoRedo()).toBe(false);
  });

  it('set_auto_redo with a different studentName does NOT apply', () => {
    aliceTransport.events$.next({ type: 'set_auto_redo', value: false, studentName: 'Bob' });
    expect(aliceStore.autoRedo()).toBe(true); // unchanged
  });

  it('challenge pair only added when student is involved', () => {
    const pair = { white: 'Bob', black: 'Charlie' };
    aliceTransport.events$.next({ type: 'sync_challenge_pair', pair });
    expect(aliceStore.challengePairs()).toEqual([]);

    const alicePair = { white: 'Alice', black: 'Bob' };
    aliceTransport.events$.next({ type: 'sync_challenge_pair', pair: alicePair });
    expect(aliceStore.challengePairs().length).toBe(1);
  });
});
describe('mode transitions', () => {
  it('gather clears sharedArrows and sets mode', () => {
    const transport = new FakeRealtimeTransport();
    const store = makeStore(transport);
    store.joinAsTeacher('room-1');
    store.sharedArrows.set({ name: 'all', arrows: [] });

    transport.events$.next({ type: 'gather' });
    expect(store.mode()).toBe('gathered');
    expect(store.sharedArrows()).toBeNull();
  });

  it('disperse clears sharedArrows and sets mode', () => {
    const transport = new FakeRealtimeTransport();
    const store = makeStore(transport);
    store.joinAsTeacher('room-1');
    store['mode'].set('gathered');

    transport.events$.next({ type: 'disperse' });
    expect(store.mode()).toBe('normal');
    expect(store.sharedArrows()).toBeNull();
  });

  it('list_loaded clears assignedExercises and droppedExercise', () => {
    const transport = new FakeRealtimeTransport();
    const store = makeStore(transport);
    store.joinAsStudent('Alice', 'room-1', () => {}, () => {});
    store.assignedExercises.set([{ id: '1' } as any]);
    store.droppedExercise.set({ id: '2' } as any);

    transport.events$.next({ type: 'list_loaded', exercises: [] });
    expect(store.assignedExercises()).toEqual([]);
    expect(store.droppedExercise()).toBeNull();
  });
});
describe('wired teacher-student scenarios', () => {
  let teacherTransport: FakeRealtimeTransport;
  let aliceTransport: FakeRealtimeTransport;
  let teacherStore: ClassroomStore;
  let aliceStore: ClassroomStore;

  beforeEach(() => {
    teacherTransport = new FakeRealtimeTransport();
    aliceTransport = new FakeRealtimeTransport();
    wireTransports(teacherTransport, aliceTransport);

    TestBed.configureTestingModule({
      providers: [
        { provide: RealtimeTransport, useValue: teacherTransport },
        { provide: SupabaseService, useValue: fakeSupabase() },
      ]
    });
    teacherStore = TestBed.inject(ClassroomStore);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [
        { provide: RealtimeTransport, useValue: aliceTransport },
        { provide: SupabaseService, useValue: fakeSupabase() },
      ]
    });
    aliceStore = TestBed.inject(ClassroomStore);

    teacherStore.joinAsTeacher('room-1');
    aliceStore.joinAsStudent('Alice', 'room-1', () => {},() => {});
  });

  it('teacher gather → student mode becomes gathered', () => {
    teacherStore.gather();
    expect(aliceStore.mode()).toBe('gathered');
  });

  it('teacher disperse → student mode becomes normal', () => {
    teacherStore.gather();
    teacherStore.disperse();
    expect(aliceStore.mode()).toBe('normal');
  });

  it('teacher sendLock → student lock$ fires', (done) => {
    aliceStore.lock$.subscribe(() => done);
    teacherStore.sendLock('Alice');
  });

  it('teacher sendLock for Bob → Alice lock$ does NOT fire', (done) => {
    let fired = false;
    aliceStore.lock$.subscribe(() => fired = true);
    teacherStore.sendLock('Bob');
    setTimeout(() => { expect(fired).toBe(false); done; }, 50);
  });

  it('teacher sendStamp → student stamp$ fires', (done) => {
    aliceStore.stamp$.subscribe(() => done);
    teacherStore.sendStamp('Alice');
  });

  it('teacher sendReset → student reset$ fires', (done) => {
    aliceStore.reset$.subscribe(() => done);
    teacherStore.sendReset('Alice');
  });

  it('teacher loadListToAll → student receives exercises', () => {
    const list:ExerciseList = { id: 'l1', title: 'Test', type: 'puzzle', teacherId: 't1', exercises: [{ id: 'e1' } as any] };
    teacherStore.loadListToAll(list);
    expect(aliceStore.loadedExercises().length).toBe(1);
  });

  it('teacher sendCurtain(false) → student curtainClosed becomes false', () => {
    expect(aliceStore.curtainClosed()).toBe(true);
    teacherStore.sendCurtain(false);
    expect(aliceStore.curtainClosed()).toBe(false);
  });

  it('teacher startSimul → student mode becomes simul', () => {
    teacherStore.startSimul();
    expect(aliceStore.mode()).toBe('simul');
  });

  it('teacher stopSimul → student mode returns to normal', () => {
    teacherStore.startSimul();
    teacherStore.stopSimul();
    expect(aliceStore.mode()).toBe('normal');
  });

  it('teacher kick → student kick$ fires', (done) => {
    aliceStore.kick$.subscribe(() => done);
    teacherStore.kickStudent('Alice');
  });
});