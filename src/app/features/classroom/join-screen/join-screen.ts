import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { ClassroomStore } from '../../../core/services/classroom-store.service';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar } from '@angular/material/snack-bar';

@Component({
  selector: 'app-join-screen',
  imports: [FormsModule, MatInputModule, MatButtonModule, MatCardModule, MatProgressSpinnerModule],
  templateUrl: './join-screen.html',
  styleUrl: './join-screen.scss',
})
export class JoinScreen implements OnInit {
  private router = inject(Router);
  private store = inject(ClassroomStore);
  private snackbar = inject(MatSnackBar);
  private route = inject(ActivatedRoute);

  isLoading = signal(false);
  name = signal('');
  private classroomId = '';

  ngOnInit(): void {
    this.classroomId = this.route.snapshot.paramMap.get('classroomId') ?? '';
    const nameParam = this.route.snapshot.paramMap.get('name');
    if (nameParam) {
      this.name.set(decodeURIComponent(nameParam));
      this.join();
    }
  }

  join(): void {
    const trimmed = this.name().trim();
    if (!trimmed) {
      this.snackbar.open('Please enter your name', '', { duration: 2500 });
      return;
    }
    if (!this.classroomId) {
      this.snackbar.open('Invalid classroom link', '', { duration: 2500 });
      return;
    }
    this.isLoading.set(true);
    this.store.joinAsStudent(
      trimmed,
      this.classroomId,
      () => this.router.navigate(['/student', this.classroomId]),
      () => {
        this.isLoading.set(false);
        // this.snackbar.open('Nem sikerült a csatlakozás', '', { duration: 2500 });
      },
    );
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.join();
  }
}