import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { signal } from '@angular/core';
import { authGuard, redirectIfAuthenticatedGuard } from './auth.guard';
import { AuthService } from '../services/auth.service';

function makeAuthService(isTeacher: boolean, isAuthenticated: boolean) {
  return {
    isTeacher: signal(isTeacher),
    isAuthenticated: signal(isAuthenticated),
  };
}

describe('authGuard', () => {
  let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: makeAuthService(true, true) },
      ]
    });
  });

  it('allows access for a teacher', async () => {
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any)
    );
    expect(result).toBe(true);
  });

  it('redirects to login and blocks access for non-teacher', async () => {
    TestBed.overrideProvider(AuthService, { useValue: makeAuthService(false, false) });
    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as any, {} as any)
    );
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});

describe('redirectIfAuthenticatedGuard', () => {
 let router: { navigate: ReturnType<typeof vi.fn> };

  beforeEach(() => {
    router = { navigate: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        { provide: Router, useValue: router },
        { provide: AuthService, useValue: makeAuthService(false, false) },
      ]
    });
  });

  it('allows access for unauthenticated user', async () => {
    const result = await TestBed.runInInjectionContext(() =>
      redirectIfAuthenticatedGuard({} as any, {} as any)
    );
    expect(result).toBe(true);
  });

  it('redirects to / for already authenticated teacher', async () => {
    TestBed.overrideProvider(AuthService, { useValue: makeAuthService(true, true) });
    const result = await TestBed.runInInjectionContext(() =>
      redirectIfAuthenticatedGuard({} as any, {} as any)
    );
    expect(result).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/']);
  });
});