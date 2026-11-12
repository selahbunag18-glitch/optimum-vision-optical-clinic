import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner,
  IonCard,
  IonCardContent,
  IonChip,
  IonLabel
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  refreshOutline,
  addOutline,
  cubeOutline,
  calendarOutline,
  alertCircleOutline,
  shieldCheckmarkOutline
} from 'ionicons/icons';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

type BatchFilter =
  | 'new_arrivals'
  | 'expiring_soon'
  | 'expired'
  | 'list';

interface InventoryBatch {
  id: number;
  inventory_id: number;
  batch_number: string;
  quantity_received: number;
  quantity_remaining: number;
  date_received: string;
  expiration_date: string | null;
  received_by: number | null;
  received_by_name: string | null;
  created_at: string;
  product_name: string;
  category: string;
  brand: string | null;
  sku: string | null;
  expiration_status: string;
}

interface BatchResponse {
  success: boolean;
  message?: string;
  data: {
    batches: InventoryBatch[];
    total: number;
  };
}

interface ExpiredBatchResult {
  batch_id: number;
  inventory_id: number;
  product_name: string;
  batch_number: string;
  expired_quantity: number;
}

interface ExpirationResponse {
  success: boolean;
  message: string;
  data: {
    processed_batches: number;
    total_expired_quantity: number;
    batches: ExpiredBatchResult[];
  };
}

@Component({
  selector: 'app-inventory-batches',
  templateUrl: './inventory-batches.page.html',
  styleUrls: ['./inventory-batches.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    IonCard,
    IonCardContent,
    IonChip,
    IonLabel
  ]
})
export class InventoryBatchesPage implements OnInit {

  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);

  // =====================================
  // PAGE STATE
  // =====================================

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly batches = signal<InventoryBatch[]>([]);

  readonly selectedFilter =
    signal<BatchFilter>('new_arrivals');

  // =====================================
  // DASHBOARD ROUTE (role-based)
  // =====================================

  readonly dashboardRoute = signal('/owner');

  // =====================================
  // EXPIRATION PROCESSING STATE
  // =====================================

  readonly processingExpiration = signal(false);
  readonly expirationMessage = signal('');
  readonly expirationResult =
    signal<ExpirationResponse['data'] | null>(null);

  // =====================================
  // FILTER TABS
  // =====================================

  readonly filters: {
    label: string;
    value: BatchFilter;
  }[] = [
    {
      label: 'New Arrivals',
      value: 'new_arrivals'
    },
    {
      label: 'Expiring Soon',
      value: 'expiring_soon'
    },
    {
      label: 'Expired Products',
      value: 'expired'
    },
    {
      label: 'Batch History',
      value: 'list'
    }
  ];

  constructor() {
    addIcons({
      arrowBackOutline,
      refreshOutline,
      addOutline,
      cubeOutline,
      calendarOutline,
      alertCircleOutline,
      shieldCheckmarkOutline
    });
  }

  // =====================================
  // INITIAL LOAD
  // =====================================

  ngOnInit(): void {
    void this.loadDashboardRoute();
    void this.loadBatches();
  }

  // =====================================
  // RESOLVE ROLE-BASED DASHBOARD ROUTE
  // =====================================

  private async loadDashboardRoute(): Promise<void> {
    try {
      const currentUser = await this.auth.getCurrentUser();

      if (currentUser?.role === 'staff') {
        this.dashboardRoute.set('/staff');
      } else if (currentUser?.role === 'patient') {
        this.dashboardRoute.set('/patient');
      } else {
        this.dashboardRoute.set('/owner');
      }

    } catch {
      this.dashboardRoute.set('/owner');
    }
  }

  // =====================================
  // REMOVE FOCUS BEFORE NAVIGATING AWAY
  // Prevents "Blocked aria-hidden on an
  // element because its descendant
  // retained focus" console warnings.
  // Uses activeElement because ion-button's
  // real focusable element lives inside its
  // shadow DOM (button-native).
  // =====================================

  blurActiveElement(): void {
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
  }

  // =====================================
  // CHANGE FILTER
  // =====================================

  selectFilter(filter: BatchFilter): void {
    if (this.processingExpiration()) {
      return;
    }

    this.selectedFilter.set(filter);
    void this.loadBatches();
  }

  // =====================================
  // LOAD INVENTORY BATCHES
  // =====================================

  async loadBatches(): Promise<void> {
    if (this.processingExpiration()) {
      return;
    }

    this.loading.set(true);
    this.errorMessage.set('');

    const requestedFilter = this.selectedFilter();

    try {
      const response = await firstValueFrom(
        this.api.get<BatchResponse>(
          'inventory-batches',
          {
            action: requestedFilter
          }
        )
      );

      if (
        !response.success ||
        !response.data ||
        !Array.isArray(response.data.batches)
      ) {
        throw new Error(
          'Invalid batch API response.'
        );
      }

      if (this.selectedFilter() === requestedFilter) {
        this.batches.set(response.data.batches);
      }

    } catch (error: unknown) {
      console.error(
        'Batch loading error:',
        error
      );

      if (this.selectedFilter() === requestedFilter) {
        this.batches.set([]);
        this.errorMessage.set(
          this.getErrorMessage(error)
        );
      }

    } finally {
      this.loading.set(false);
    }
  }

  // =====================================
  // PROCESS EXPIRED STOCK
  // =====================================

  async processExpiredStock(): Promise<void> {

    if (
      this.processingExpiration() ||
      this.loading()
    ) {
      return;
    }

    const confirmed = window.confirm(
      'Check and process expired inventory batches?\n\n' +
      'Expired quantities will be deducted from ' +
      'available inventory stock.\n\n' +
      'This action cannot be undone automatically.'
    );

    if (!confirmed) {
      return;
    }

    this.processingExpiration.set(true);
    this.expirationMessage.set('');
    this.expirationResult.set(null);
    this.errorMessage.set('');

    try {
      const response = await firstValueFrom(
        this.api.post<ExpirationResponse>(
          'inventory-expiration',
          {},
          {
            action: 'process'
          }
        )
      );

      if (
        !response.success ||
        !response.data
      ) {
        throw new Error(
          response.message ||
          'Expiration processing failed.'
        );
      }

      const result = response.data;

      this.expirationResult.set(result);

      if (result.processed_batches === 0) {
        this.expirationMessage.set(
          'Expiration check completed. ' +
          'No expired batches need processing.'
        );
      } else {
        this.expirationMessage.set(
          'Expiration processing completed! ' +
          result.processed_batches +
          ' batch(es) processed. ' +
          result.total_expired_quantity +
          ' expired unit(s) deducted.'
        );
      }

      // Switch to expired products after processing.
      if (result.processed_batches > 0) {
        this.selectedFilter.set('expired');
      }

    } catch (error: unknown) {
      console.error(
        'Expiration processing error:',
        error
      );

      this.errorMessage.set(
        this.getErrorMessage(error)
      );

    } finally {
      this.processingExpiration.set(false);
    }

    // Refresh monitoring after processing finishes.
    if (!this.errorMessage()) {
      await this.loadBatches();
    }
  }

  // =====================================
  // API ERROR HANDLING
  // =====================================

  private getErrorMessage(error: unknown): string {

    if (
      error !== null &&
      typeof error === 'object' &&
      'error' in error
    ) {
      const response = error as {
        error?: {
          message?: string;
          error?: string;
        } | string;
      };

      if (typeof response.error === 'string') {
        return response.error;
      }

      if (
        response.error &&
        typeof response.error === 'object'
      ) {
        return (
          response.error.message ||
          response.error.error ||
          'Request failed.'
        );
      }
    }

    return error instanceof Error
      ? error.message
      : 'Something went wrong.';
  }

  // =====================================
  // BATCH EXPIRATION STATUS
  // =====================================

  getStatus(batch: InventoryBatch): string {

    if (!batch.expiration_date) {
      return 'No Expiration';
    }

    return batch.expiration_status;
  }

  // =====================================
  // STATUS COLOR
  // =====================================

  getStatusColor(batch: InventoryBatch): string {

    const status = this.getStatus(batch);

    if (status === 'Expired') {
      return 'danger';
    }

    if (status === 'Expiring Soon') {
      return 'warning';
    }

    return 'success';
  }

  // =====================================
  // FORMAT DATE
  // =====================================

  formatDate(date: string | null): string {

    if (!date) {
      return 'N/A';
    }

    const dateOnly = date.substring(0, 10);

    const parsed = new Date(
      `${dateOnly}T00:00:00`
    );

    if (Number.isNaN(parsed.getTime())) {
      return date;
    }

    return parsed.toLocaleDateString(
      'en-PH',
      {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      }
    );
  }
}