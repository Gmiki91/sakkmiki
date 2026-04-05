import { Component, OnInit, OnDestroy, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
import { RealtimeChannel } from '@supabase/supabase-js';
import { SupabaseService } from '../../core/services/supabase.service';
import { Classroom } from '../../shared/models/classroom.model';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-lobby',
  imports: [
    FormsModule,
    MatCardModule,
    MatButtonModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './lobby.html',
  styleUrl: './lobby.scss',
})
export class Lobby implements OnInit, OnDestroy {
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);
  private lobbyChannel!: RealtimeChannel;
  auth = inject(AuthService);

  classrooms = signal<Classroom[]>([]);
  isLoading = signal(false);
  isCreating = signal(false);
  newName = signal('');

  // classroomId → participant count, derived from lobby presence
  participantCounts = signal<Record<string, number>>({});

  async ngOnInit() {
    await this.loadClassrooms();
    this.subscribeLobbyPresence();
  }

  ngOnDestroy(): void {
    if (this.lobbyChannel) {
      this.supabase.realtimeClient.removeChannel(this.lobbyChannel).catch(() => {});
    }
  }

  isOwner(classroom: Classroom): boolean {
    return classroom.teacherId === this.auth.currentUser()?.id;
  }

  participantCount(classroomId: string): number {
    return this.participantCounts()[classroomId] ?? 0;
  }

  onCardClick(classroom: Classroom): void {
    if (this.auth.isAuthenticated()) {
      this.router.navigate(['/classroom', classroom.id]);
    } else {
      this.router.navigate(['/join', classroom.id]);
    }
  }

  async loadClassrooms() {
    this.isLoading.set(true);
    try {
      this.classrooms.set(await this.supabase.getClassrooms());
    } catch {
      this.snackbar.open('Failed to load classrooms', '', { duration: 3000 });
    } finally {
      this.isLoading.set(false);
    }
  }

  async createClassroom() {
    const name = this.newName().trim();
    const teacherId = this.auth.currentUser()?.id;
    if (!this.auth.isTeacher() || !name || !teacherId) return;
    try {
      const classroom = await this.supabase.createClassroom(name, teacherId);
      this.classrooms.update(list => [classroom, ...list]);
      this.newName.set('');
      this.isCreating.set(false);
    } catch {
      this.snackbar.open('Failed to create classroom', '', { duration: 3000 });
    }
  }

  async deleteClassroom(classroom: Classroom, event: MouseEvent) {
    event.stopPropagation(); // prevent card click
    if (!confirm('Delete this classroom?')) return;
    try {
      await this.supabase.deleteClassroom(classroom.id);
      this.classrooms.update(list => list.filter(c => c.id !== classroom.id));
    } catch {
      this.snackbar.open('Failed to delete classroom', '', { duration: 3000 });
    }
  }

  // ----------------------------------------------------------------
  // Lobby presence — tracks who is in which classroom
  // ----------------------------------------------------------------

  private subscribeLobbyPresence(): void {
    this.lobbyChannel = this.supabase.createLobbyChannel()
      .on('presence', { event: 'sync' }, () => {
        const state = this.lobbyChannel.presenceState<{ classroomId: string }>();
        const counts: Record<string, number> = {};
        for (const presences of Object.values(state)) {
          for (const p of presences as any[]) {
            if (p.classroomId) {
              counts[p.classroomId] = (counts[p.classroomId] ?? 0) + 1;
            }
          }
        }
        this.participantCounts.set(counts);
      })
      .subscribe();
    // Lobby itself doesn't track — it's just an observer
  }
}