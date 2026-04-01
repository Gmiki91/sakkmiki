import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, MatInputModule, MatButtonModule, MatCardModule, MatProgressSpinnerModule],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private auth = inject(AuthService);
  private router = inject(Router);

  email = signal('');
  password = signal('');
  error = signal<string | null>(null);
  isLoading = signal(false);

  async login(): Promise<void> {
    if (!this.email() || !this.password()) return;
    this.isLoading.set(true);
    this.error.set(null);
    const err = await this.auth.signIn(this.email(), this.password());
    this.isLoading.set(false);
    if (err) {
      this.error.set(err);
    } else {
      this.router.navigate(['/']);
    }
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.login();
  }
}