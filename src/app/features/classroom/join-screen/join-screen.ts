import { Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RealtimeService } from '../../../core/services/realtime.service';
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
  private realtimeService = inject(RealtimeService);
  private snackbar = inject(MatSnackBar);
  private route = inject(ActivatedRoute)
  isLoading = signal(false);
  name = signal('');

  ngOnInit(): void {
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
    this.isLoading.set(true);
    this.realtimeService.joinAsStudent(
      trimmed,
      () => this.router.navigate(['/student']), // onJoined
      () => {
        // onError
        this.isLoading.set(false);
        this.snackbar.open('Nem sikerült a csatlakozás');
      },
    );
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.join();
  }
}
