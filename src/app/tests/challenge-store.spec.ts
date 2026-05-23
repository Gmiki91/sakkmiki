import { TestBed } from '@angular/core/testing';
import { ClassroomStore } from '../core/services/classroom-store.service';
import { RealtimeTransport } from '../core/services/realtime-transport.service';
import { SupabaseService } from '../core/services/supabase.service';
import { FakeRealtimeTransport } from './fake-transport';
import { Exercise } from '../shared/models/exercise.model';
import { Move } from 'chess.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

const fakeSupabase = {
  touchClassroom: () => Promise.resolve(),
  createLobbyChannel: () => ({ subscribe: () => {}, track: () => Promise.resolve() }),
  realtimeClient: { removeChannel: () => Promise.resolve() },
};

/** Create a ClassroomStore wired to the given fake transport. */
function makeStore(transport: FakeRealtimeTransport): ClassroomStore {
  TestBed.configureTestingModule({
    providers: [
      ClassroomStore,
      { provide: RealtimeTransport, useValue: transport },
      { provide: SupabaseService, useValue: fakeSupabase },
    ],
  });
  return TestBed.inject(ClassroomStore);
}

const dummyExercise: Exercise = {
  id: 'ex-1',
  title: 'Test exercise',
  fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
  exerciseType: 'puzzle',
  instruction: '',
  solutions: [['e4', 'e5']],
  position: 1,
  listId: 'list-1',
};

const ab: any = { white: 'Alice', black: 'Bob' };
const cd: any = { white: 'Carol', black: 'Dave' };
const ba: any = { white: 'Bob', black: 'Alice' };

const newExercise: Exercise = {
  ...dummyExercise,
  id: 'ex-2',
  title: 'New exercise',
  fen: '8/8/8/8/8/8/8/4K3 w - - 0 1',
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('Challenge store — dropped_exercise', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('sets droppedExercise for the named student', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Alice');

    t.events$.next({ type: 'dropped_exercise', studentName: 'Alice', exercise: dummyExercise });

    expect(store.droppedExercise()).toEqual(dummyExercise);
  });

  it('ignores dropped_exercise addressed to a different student', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Alice');

    t.events$.next({ type: 'dropped_exercise', studentName: 'Bob', exercise: dummyExercise });

    expect(store.droppedExercise()).toBeNull();
  });

  it('clears challengeMove so the previous game cannot override the new exercise FEN', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Alice');

    // A game was in progress — challengeMove holds the last position.
    t.events$.next({
      type: 'challenge_move',
      white: 'Alice', black: 'Bob',
      fen: 'mid-game-fen', move:{}as Move,
    });
    expect(store.challengeMove()).not.toBeNull();

    // Teacher drops a new exercise on the pair.
    t.events$.next({ type: 'dropped_exercise', studentName: 'Alice', exercise: newExercise });

    expect(store.droppedExercise()?.fen).toBe(newExercise.fen);
    expect(store.challengeMove()).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Challenge store — challenge_remove', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('removes the pair when the student is white', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Alice');

    t.events$.next({ type: 'sync_challenge_pair', pair: ab });
    expect(store.challengePairs().length).toBe(1);

    t.events$.next({ type: 'challenge_remove', pair: ab });
    expect(store.challengePairs().length).toBe(0);
  });

  it('removes the pair when the student is black', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Bob');

    t.events$.next({ type: 'sync_challenge_pair', pair: ab });
    expect(store.challengePairs().length).toBe(1);

    t.events$.next({ type: 'challenge_remove', pair: ab });
    expect(store.challengePairs().length).toBe(0);
  });

  it('does not affect unrelated pairs', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Carol');

    t.events$.next({ type: 'sync_challenge_pair', pair: cd });
    t.events$.next({ type: 'challenge_remove', pair: ab });

    expect(store.challengePairs().length).toBe(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Challenge store — sync_all_challenge_pairs (reconnect resync)', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('restores the correct pair for a student who is white', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Alice');

    t.events$.next({
      type: 'sync_all_challenge_pairs',
      pairs: [
        ab,
        cd,
      ],
    });

    expect(store.challengePairs()).toEqual([ab]);
  });

  it('restores the correct pair for a student who is black', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Dave');

    t.events$.next({
      type: 'sync_all_challenge_pairs',
      pairs: [
        ab,
        cd,
      ],
    });

    expect(store.challengePairs()).toEqual([cd]);
  });

  it('gives an empty list when the student is not in any pair', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Eve');

    t.events$.next({
      type: 'sync_all_challenge_pairs',
      pairs: [ab],
    });

    expect(store.challengePairs().length).toBe(0);
  });

  it('overwrites stale local pair state on reconnect', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Alice');

    // Alice thinks she's paired with Bob (stale in-memory state from before disconnect)
    t.events$.next({ type: 'sync_challenge_pair', pair: ab });
    expect(store.challengePairs().length).toBe(1);

    // Teacher sends authoritative list — Alice's pair was removed server-side
    t.events$.next({ type: 'sync_all_challenge_pairs', pairs: [] });

    expect(store.challengePairs().length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('Challenge store — FEN tracking on teacher side', () => {
  afterEach(() => TestBed.resetTestingModule());

  it('challenge_move updates challengeMove signal', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);

    t.events$.next({
      type: 'challenge_move',
      white: 'Alice', black: 'Bob',
      fen: 'position-after-move', move:{}as Move,
    });

    expect(store.challengeMove()?.fen).toBe('position-after-move');
    expect(store.challengeMove()?.white).toBe('Alice');
  });

  it('student_fen event updates the correct student entry', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.students.set([{
      name: 'Alice', online: true, lastSeen: Date.now(),
      exIndex: 0, locked: false,autoProgress:true,autoRedo:true, awaitingRedo: false, awaitingStamp: false,
    }]);

    t.events$.next({ type: 'student_fen', studentName: 'Alice', fen: 'challenge-board-fen' });

    expect(store.students().find(s => s.name === 'Alice')?.fen).toBe('challenge-board-fen');
  });

  it('challenge_move is cleared after a new exercise is dropped', () => {
    const t = new FakeRealtimeTransport();
    const store = makeStore(t);
    store.studentName.set('Bob');

    t.events$.next({
      type: 'challenge_move',
      white: 'Alice', black: 'Bob',
      fen: 'old-game',move:{}as Move
    });
    expect(store.challengeMove()).not.toBeNull();

    t.events$.next({ type: 'dropped_exercise', studentName: 'Bob', exercise: newExercise });
    expect(store.challengeMove()).toBeNull();
  });
});
