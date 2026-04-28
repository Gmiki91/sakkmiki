import { Injectable, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { User } from '@supabase/supabase-js';
import { environment } from '../../environments/environment';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';

export type UserRole = 'teacher' | 'admin';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);
  private exerciseService = inject(ExerciseService);
  private router = inject(Router);
  readonly currentUser = signal<User | null>(null);
  readonly userRole = signal<UserRole | null>(null);
  readonly displayName = signal<string | null>(null);
  readonly isLoading = signal(true);

  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly isTeacher = computed(() => this.userRole() === 'teacher' || this.userRole() === 'admin');
  readonly isAdmin = computed(() => this.userRole() === 'admin');

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  //https://github.com/supabase/supabase-js/issues/936
  signOut(): void {
    const projectRef = environment.supabaseUrl.split('//')[1].split('.')[0];
    localStorage.removeItem(`sb-${projectRef}-auth-token`);
    this.supabase.client.auth.signOut().catch(() => {}); // best-effort server invalidation
    this.currentUser.set(null);
    this.userRole.set(null);
    this.displayName.set(null);
    this.exerciseService.exerciseLists.set([]);
    this.router.navigate(['/']);
  }

  async initialize(): Promise<void> {
    const { data: { session } } = await this.supabase.client.auth.getSession();
    if (session?.user) {
      this.currentUser.set(session.user);
      await this.loadProfile(session.user.id);
    }
    this.isLoading.set(false);

    // Handle subsequent auth changes (sign in, sign out, token refresh)
    // Guard against double-call: onAuthStateChange fires INITIAL_SESSION
    // shortly after getSession(), skip loadProfile if it's the same user
    this.supabase.client.auth.onAuthStateChange(async (_event, session) => {
      const newUser = session?.user ?? null;
      const previousUser = this.currentUser();
      this.currentUser.set(newUser);

      if (newUser && newUser.id !== previousUser?.id) {
        await this.loadProfile(newUser.id);
      } else if (!newUser) {
        this.userRole.set(null);
        this.displayName.set(null);
        this.exerciseService.exerciseLists.set([]);
      }
    });
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('profiles')
      .select('role, display_name')
      .eq('id', userId)
      .maybeSingle();
    this.userRole.set(data?.role ?? null);
    this.displayName.set(data?.display_name ?? null);
    if (data?.role) this.exerciseService.loadExerciseLists();
  }
}