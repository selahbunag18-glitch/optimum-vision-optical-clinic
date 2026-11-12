
import { Component, OnInit, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AuthUser } from '../core/models/api.models';
import { AuthService } from '../core/services/auth.service';

@Component({
  selector: 'app-dashboard-placeholder',
  template: `
    <main class="ion-padding">
      <h1>{{ title() }}</h1>

      @if (user(); as u) {
        <p>
          Signed in as
          <strong>{{ u.full_name }}</strong>
          ({{ u.email }})
        </p>
        <p>Role: <strong>{{ u.role }}</strong></p>
      }

      <p>
        Temporary page. The real dashboard comes in a later step.
      </p>

      <button type="button" (click)="logout()">Log out</button>
    </main>
  `,
})
export class DashboardPlaceholderPage implements OnInit {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly title = input<string>('Dashboard');
  readonly user = signal<AuthUser | null>(null);

  async ngOnInit(): Promise<void> {
    this.user.set(await this.auth.getCurrentUser());
  }

  async logout(): Promise<void> {
    try {
      await this.auth.logout();
    } catch {
      // Local session is cleared even if the API call fails.
    }

    await this.router.navigateByUrl('/login', {
      replaceUrl: true,
    });
  }
}
