import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { RealtimeService } from '../../../core/services/realtime.service';

@Component({
  selector: 'app-join-screen',
  imports: [FormsModule, MatInputModule, MatButtonModule, MatCardModule],
  templateUrl: './join-screen.html',
  styleUrl: './join-screen.scss',
})
export class JoinScreen {
  private router = inject(Router);
  private realtimeService = inject(RealtimeService);

  name = signal('');
  error = signal('');

  join(): void {
    const trimmed = this.name().trim();
    if (!trimmed) {
      this.error.set('Please enter your name.');
      return;
    }
    this.realtimeService.joinAsStudent(trimmed, () => this.router.navigate(['/student']));
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.join();
  }
}
