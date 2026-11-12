import { Component, OnInit, inject, signal } from '@angular/core';
import { Router, RouterLink } from '@angular/router';

import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonRefresher,
  IonRefresherContent,
  IonSearchbar,
  IonSpinner,
  IonTitle,
  IonToolbar,
  RefresherCustomEvent,
  SearchbarCustomEvent,
  ViewWillLeave,
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  alertCircleOutline,
  arrowBackOutline,
  callOutline,
  calendarOutline,
  createOutline,
  eyeOutline,
  mailOutline,
  peopleOutline,
  refreshOutline,
} from 'ionicons/icons';

import { ApiError } from '../../core/models/api.models';
import {
  Patient,
  Pagination,
} from '../../core/models/patient.models';

import { roleHome } from '../../core/role-routes';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { PatientService } from '../../core/services/patient.service';

const PAGE_SIZE = 20;

@Component({
  selector: 'app-patient-list',
  templateUrl: './patient-list.page.html',
  styleUrls: ['./patient-list.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonContent,
    IonIcon,
    IonSearchbar,
    IonSpinner,
    IonRefresher,
    IonRefresherContent,
  ],
})
export class PatientListPage implements OnInit, ViewWillLeave {
  private readonly patientsApi = inject(PatientService);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly patients = signal<Patient[]>([]);
  readonly pagination = signal<Pagination | null>(null);
  readonly search = signal('');
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly homeHref = signal('/login');

  private requestId = 0;

  constructor() {
    addIcons({
      alertCircleOutline,
      arrowBackOutline,
      callOutline,
      calendarOutline,
      createOutline,
      eyeOutline,
      mailOutline,
      peopleOutline,
      refreshOutline,
    });
  }

  async ngOnInit(): Promise<void> {
    const user = await this.auth.getCurrentUser();

    if (user) {
      this.homeHref.set(roleHome(user.role));
    }

    await this.fetch(1);
  }

  // Alisin ang focus bago umalis para mawala ang aria-hidden warning
  ionViewWillLeave(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  hasMore(): boolean {
    const p = this.pagination();

    return p !== null && p.page < p.total_pages;
  }

  onSearch(event: SearchbarCustomEvent): void {
    const value = (event.detail.value ?? '').trim();

    if (value === this.search()) {
      return;
    }

    this.search.set(value);
    void this.fetch(1);
  }

  async refresh(event: RefresherCustomEvent): Promise<void> {
    try {
      await this.fetch(1, { silent: true });
    } finally {
      await event.target.complete();
    }
  }

  retry(): void {
    void this.fetch(1);
  }

  loadMore(): void {
    const p = this.pagination();

    if (p && !this.loadingMore() && this.hasMore()) {
      void this.fetch(p.page + 1);
    }
  }

  formatDate(value: string): string {
    const date = new Date(
      value.replace(' ', 'T') + '+08:00'
    );

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      timeZone: 'Asia/Manila',
    });
  }

  private async fetch(
    page: number,
    options: { silent?: boolean } = {}
  ): Promise<void> {
    const id = ++this.requestId;
    const append = page > 1;

    if (append) {
      this.loadingMore.set(true);
    } else if (!options.silent) {
      this.loading.set(true);
    }

    this.error.set(null);

    try {
      const data = await this.patientsApi.list(
        this.search(),
        page,
        PAGE_SIZE
      );

      if (id !== this.requestId) {
        return;
      }

      this.patients.update((current) =>
        append
          ? [...current, ...data.patients]
          : data.patients
      );

      this.pagination.set(data.pagination);

    } catch (err) {
      if (id !== this.requestId) {
        return;
      }

      await this.handleError(
        ApiService.toApiError(err)
      );

    } finally {
      if (id === this.requestId) {
        this.loading.set(false);
        this.loadingMore.set(false);
      }
    }
  }

  private async handleError(
    error: ApiError
  ): Promise<void> {

    if (error.status === 401) {
      try {
        await this.auth.logout();
      } catch {
        // Session cleanup is handled by AuthService.
      }

      await this.router.navigateByUrl(
        '/login',
        { replaceUrl: true }
      );

      return;
    }

    if (error.status === 403) {
      this.error.set(
        'You do not have permission to view patient records.'
      );
      return;
    }

    this.error.set(error.message);
  }
}