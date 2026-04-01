import { Component, inject } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { AuthService } from '../services/auth.service';

@Component({
  selector: 'app-navigation',
  imports: [RouterLink, RouterLinkActive],
  templateUrl: './navigation.html',
  styleUrl: './navigation.scss',
})
export class Navigation {
  auth = inject(AuthService);
  private router = inject(Router);

  onLoginLogout(): void {
    if (this.auth.isAuthenticated()) {
      this.auth.signOut();
    } else {
      this.router.navigate(['/login']);
    }
  }
}
