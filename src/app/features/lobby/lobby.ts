import { Component, OnInit, inject, signal, computed } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';
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
export class Lobby implements OnInit {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private router = inject(Router);
  private snackbar = inject(MatSnackBar);

  classrooms = signal<Classroom[]>([]);
  currentUserId = signal<string | null>(null);
  isLoading = signal(false);
  isCreating = signal(false);
  newName = signal('');

  isAuthenticated = computed(() => !!this.currentUserId());

  async ngOnInit() {
    const user = this.auth.currentUser();
    this.currentUserId.set(user?.id ?? null);
    await this.loadClassrooms();
  }

  isOwner(classroom: Classroom): boolean {
    return classroom.teacherId === this.currentUserId();
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
    const isTeacher = this.auth.isTeacher();
    const name = this.newName().trim();
    const teacherId = this.currentUserId();
    if (!isTeacher || !name || !teacherId) return;
    try {
      const classroom = await this.supabase.createClassroom(name,teacherId);
      this.classrooms.update(list => [classroom, ...list]);
      this.newName.set('');
      this.isCreating.set(false);
    } catch {
      this.snackbar.open('Failed to create classroom', '', { duration: 3000 });
    }
  }

  async deleteClassroom(id: string) {
    if (!confirm('Delete this classroom?')) return;
    try {
      await this.supabase.deleteClassroom(id);
      this.classrooms.update(list => list.filter(c => c.id !== id));
    } catch {
      this.snackbar.open('Failed to delete classroom', '', { duration: 3000 });
    }
  }

  openClassroom(id: string) {
    this.router.navigate(['/classroom', id]);
  }

  joinClassroom(id: string) {
    this.router.navigate(['/join', id]);
  }
}