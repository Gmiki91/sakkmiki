import { Component, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { SupabaseService } from '../../../core/services/supabase.service';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  selector: 'app-set-password',
  imports: [FormsModule, MatInputModule, MatButtonModule, MatCardModule, MatProgressSpinnerModule],
  templateUrl: './set-password.html',
  styleUrl: './set-password.scss',
})
export class SetPassword {
  private supabase = inject(SupabaseService);
  private auth = inject(AuthService);
  private router = inject(Router);

  password = signal('');
  confirm = signal('');
  error = signal<string | null>(null);
  isLoading = signal(false);

  async save(): Promise<void> {
    if (this.password().length < 8) {
      this.error.set('Password must be at least 8 characters.');
      return;
    }
    if (this.password() !== this.confirm()) {
      this.error.set('Passwords do not match.');
      return;
    }

    this.isLoading.set(true);
    this.error.set(null);

    const { data, error } = await this.supabase.client.auth.updateUser({
      password: this.password(),
    });

    if (error) {
      this.error.set(error.message);
      this.isLoading.set(false);
      return;
    }

    // Insert teacher profile row — safe to ignore if already exists
    if (data.user) {
      await this.supabase.client
        .from('profiles')
        .upsert({ id: data.user.id, role: 'teacher' });
      await this.auth.refreshProfile(data.user.id);
    }

    this.isLoading.set(false);
    this.router.navigate(['/exercises']);
  }

  onKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter') this.save();
  }
}
