import { Component, inject, OnInit, signal } from '@angular/core';
import { Router, ActivatedRoute } from '@angular/router';
import { SupabaseService } from '../../../core/services/supabase.service';

@Component({
  selector: 'app-auth-confirm',
  template: `
    <div class="page-center">
      @if (error()) {
        <p class="error">{{ error() }}</p>
      } @else {
        <p>Verifying invite...</p>
      }
    </div>
  `,
  styles: [`.error { color: var(--mat-sys-error); }`]
})
export class AuthConfirm implements OnInit {
  private supabase = inject(SupabaseService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);

  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    const tokenHash = this.route.snapshot.queryParamMap.get('token_hash');
    const type = this.route.snapshot.queryParamMap.get('type');

    if (!tokenHash || type !== 'invite') {
      this.error.set('Invalid invite link.');
      return;
    }

    const { error } = await this.supabase.client.auth.verifyOtp({
      token_hash: tokenHash,
      type: 'invite',
    });

    if (error) {
      this.error.set(error.message);
      return;
    }

    this.router.navigate(['/auth/set-password']);
  }
}
