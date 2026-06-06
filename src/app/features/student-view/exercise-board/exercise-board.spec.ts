import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { NO_ERRORS_SCHEMA } from '@angular/core';
import { Chess } from 'chess.js';
import { ExerciseBoard } from './exercise-board';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { SoundService } from '../../../core/services/sound.service';
import { RealtimeTransport } from '../../../core/services/realtime-transport.service';
import { SupabaseService } from '../../../core/services/supabase.service';
import { FakeRealtimeTransport } from '../../../tests/fake-transport';
import { Exercise } from '../../../shared/models/exercise.model';

const PUZZLE_EXERCISE: Exercise = {
  id: 'e1', title: 'Test puzzle', instruction: '',
  fen: 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq - 0 1',
  exerciseType: 'puzzle', listId: 'l1', position: 1,
  solutions: [['e5', 'Nf3', 'Nc6']],  // e5 = player, Nf3 = computer, Nc6 = player
};

const MUSHROOM_EXERCISE: Exercise = {
  id: 'e2', title: 'Mushroom', instruction: '',
  fen: '8/8/8/4p3/5p2/8/8/8 w - - 0 1',
  exerciseType: 'mushroom', listId: 'l1', position: 1,
  mushroomType: '🍄', numberOfMushrooms: 1,
};

describe('ExerciseBoard', () => {
  let component: ExerciseBoard;
  let fixture: ComponentFixture<ExerciseBoard>;
  let store: ClassroomStore;
  let soundSpy: { play: ReturnType<typeof vi.fn>; playRandomCheering: ReturnType<typeof vi.fn>,isMute: ReturnType<typeof vi.fn> };
  let transport: FakeRealtimeTransport;

  beforeEach(async () => {
    TestBed.resetTestingModule();
    transport = new FakeRealtimeTransport();
    soundSpy = { play: vi.fn(), playRandomCheering: vi.fn(), isMute:vi.fn() };
    await TestBed.configureTestingModule({
        
      imports: [ExerciseBoard],
      providers: [
        { provide: RealtimeTransport, useValue: transport },
        { provide: SoundService, useValue: soundSpy },
        { provide: SupabaseService, useValue: {
          touchClassroom: () => Promise.resolve(),
          createLobbyChannel: () => ({ subscribe: () => {}, track: () => Promise.resolve() }),
          realtimeClient: { removeChannel: () => Promise.resolve() }
        }},
      ],
      schemas: [NO_ERRORS_SCHEMA],
    }).compileComponents();

    fixture = TestBed.createComponent(ExerciseBoard);
    component = fixture.componentInstance;
    store = TestBed.inject(ClassroomStore);
    store.joinAsStudent('Alice', 'room-1', () => {},() => {});
    fixture.detectChanges();
  });

  function loadExercise(ex: Exercise) {
    store.loadedExercises.set([ex]);
    TestBed.tick();
    // Manually sync chess position to match what the effect would do
    (component as any).exerciseChess.load(ex.fen, { skipValidation: true });
  }

  describe('analyze — puzzle', () => {
    beforeEach(() => {
      loadExercise(PUZZLE_EXERCISE);
      store.autoRedo.set(true);
      store.autoProgress.set(false);
      vi.useFakeTimers()
    });
    afterEach(() => vi.useRealTimers());

    it('correct move advances moveHistory and does not lock',  async () => {
      component.handleMove('e7', 'e5'); // correct first move

      vi.advanceTimersByTime(2100);

      expect((component as any).moveHistory()).toContain('e5');
      expect(component.isLocked()).toBe(false);
    });

    it('wrong move with autoRedo sets feedback and locks', async() => {
      component.handleMove('d7', 'd5'); // wrong move
      expect(component.isLocked()).toBe(true);
      expect(component.feedback()).toBeTruthy();
   
      vi.advanceTimersByTime(3000); // auto-redo timer

      expect(component.isLocked()).toBe(false);
    });

    it('wrong move with autoRedo off sets isWaitingForRedo', async() => {
      store.autoRedo.set(false);
      component.handleMove('d7', 'd5');
      expect((component as any).isWaitingForRedo()).toBe(true);
      expect(component.isLocked()).toBe(true);
    });


    it('completing solution sets isWaitingForStamp when autoProgress is off', async() => {
      // Play through the full solution: e5 (player), Nf3 (computer), Nc6 (player)
      component.handleMove('e7', 'e5');

      vi.advanceTimersByTime(2100);

       // computer plays Nf3
      component.handleMove('b8', 'c6'); // final player move
      expect((component as any).isWaitingForStamp()).toBe(true);
      expect(component.isLocked()).toBe(true);
    });

    it('completing solution with autoProgress auto-advances after delay', async() => {
      store.autoProgress.set(true);
      store.loadedExercises.set([PUZZLE_EXERCISE, { ...PUZZLE_EXERCISE, id: 'e2' }]);

      (component as any).exerciseChess.load(PUZZLE_EXERCISE.fen, { skipValidation: true });

      component.handleMove('e7', 'e5');
      vi.advanceTimersByTime(2100);

      component.handleMove('b8', 'c6');
      vi.advanceTimersByTime(2100);

      expect((component as any).exIndex()).toBe(1);
    });
  });

  describe('analyzeMushroom', () => {
    beforeEach(() => {
      loadExercise(MUSHROOM_EXERCISE);
      store.autoRedo.set(false);
      // Put a white bishop on d4 
       (component as any).exerciseChess.load(
        '8/8/8/4p3/3B1p2/8/8/8 w - - 0 1',
        { skipValidation: true }
      );
    });

    it('capturing a piece increments the mushroom collection', async() => {
      component.handleMove('d4', 'e5'); // white captures
      expect(component.mushroomCollection()['🍄']).toBe(1);
    });

    it('non-capturing move triggers badMove (locks board)', async() => {
      component.handleMove('d4', 'c3'); // valid move but no capture
      expect(component.isLocked()).toBe(true);
    });
  });

  describe('reset', () => {
    it('resets chess, clears history and feedback', async() => {
      loadExercise(PUZZLE_EXERCISE);
      component.handleMove('d7', 'd5'); // wrong move
      vi.useFakeTimers();
      vi.advanceTimersByTime(300);
      TestBed.tick();
      component.reset();
      expect(component.feedback()).toBe('');
      expect((component as any).moveHistory()).toEqual([]);
      expect(component.isLocked()).toBe(false);
    });
  });
});