import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { validListGuard } from './valid-list.guard';
import { ExerciseService } from '../services/exercise.service';

describe('validListGuard', () => {
  let router: { navigate: ReturnType<typeof vi.fn> };
  let exerciseService: {getListById:ReturnType<typeof vi.fn>};

  beforeEach(() => {
   router = { navigate: vi.fn() };

    exerciseService = {getListById:vi.fn()};
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: ExerciseService, useValue: exerciseService },
      ]
    });
  });

  it('allows access when list exists', () => {
    exerciseService.getListById.mockReturnValue(true);
    const route = { params: { listId: 'list-1' } } as any;
    const result = TestBed.runInInjectionContext(() => validListGuard(route, {} as any));
    expect(result).toBe(true);
  });

  it('redirects to /exercises when list does not exist', () => {
    exerciseService.getListById.mockReturnValue(false);
    const route = { params: { listId: 'bad-id' } } as any;
    const result = TestBed.runInInjectionContext(() => validListGuard(route, {} as any));
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/exercises']);
  });
});