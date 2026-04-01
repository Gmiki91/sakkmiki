import { Injectable, inject, signal, computed } from '@angular/core';
import { User } from '@supabase/supabase-js';
import { SupabaseService } from './supabase.service';
import { ExerciseService } from './exercise.service';

export type UserRole = 'teacher' | 'admin';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private supabase = inject(SupabaseService);
  private exerciseService = inject(ExerciseService);
  readonly currentUser = signal<User | null>(null);
  readonly userRole = signal<UserRole | null>(null);
  readonly isLoading = signal(true);

  readonly isAuthenticated = computed(() => !!this.currentUser());
  readonly isTeacher = computed(() => this.userRole() === 'teacher' || this.userRole() === 'admin');
  readonly isAdmin = computed(() => this.userRole() === 'admin');

  // Guards await this before making routing decisions,
  // preventing redirect-to-login on page refresh before session is restored.
  readonly initPromise: Promise<void>;

  constructor() {
    this.initPromise = this.init();
  }

  async signIn(email: string, password: string): Promise<string | null> {
    const { error } = await this.supabase.client.auth.signInWithPassword({ email, password });
    return error?.message ?? null;
  }

  async signOut(): Promise<void> {
    await this.supabase.client.auth.signOut();
    this.currentUser.set(null)
  }

  private async init(): Promise<void> {
    const { data: { session } } = await this.supabase.client.auth.getSession();
    if (session?.user) {
      this.currentUser.set(session.user);
      await this.loadProfile(session.user.id);
    }
    this.isLoading.set(false);

    this.supabase.client.auth.onAuthStateChange(async (_event, session) => {
      this.currentUser.set(session?.user ?? null);
      if (session?.user) {
        await this.loadProfile(session.user.id);
      } else {
        this.userRole.set(null);
      }
    });
  }

  private async loadProfile(userId: string): Promise<void> {
    const { data } = await this.supabase.client
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .single();
    this.userRole.set(data?.role ?? null);
    if (data?.role) this.exerciseService.loadExerciseLists();
  }
}