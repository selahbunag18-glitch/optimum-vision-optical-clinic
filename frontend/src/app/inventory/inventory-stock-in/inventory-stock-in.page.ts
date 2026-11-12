
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonInput,
  IonSelect,
  IonSelectOption,
  IonSpinner,
  IonNote
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  saveOutline,
  cubeOutline
} from 'ionicons/icons';

import {
  InventoryService,
  InventoryProduct,
  ProductCategory
} from '../../core/services/inventory.service';

import { ApiService } from '../../core/services/api.service';
import { ApiSuccess } from '../../core/models/api.models';

interface StockInData {
  batch_id: number;
  inventory_id: number;
  stock_before: number;
  stock_after: number;
}

@Component({
  selector: 'app-inventory-stock-in',
  templateUrl: './inventory-stock-in.page.html',
  styleUrls: ['./inventory-stock-in.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButtons,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonInput,
    IonSelect,
    IonSelectOption,
    IonSpinner,
    IonNote
  ]
})
export class InventoryStockInPage implements OnInit {

  private readonly inventoryService = inject(InventoryService);
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');
  readonly products = signal<InventoryProduct[]>([]);

  productId: number | null = null;
  batchNumber = '';
  quantity: number | null = null;
  dateReceived = '';
  expirationDate = '';

  constructor() {
    addIcons({
      arrowBackOutline,
      saveOutline,
      cubeOutline
    });

    this.dateReceived = this.localToday();
  }

  ngOnInit(): void {
    void this.loadProducts();
  }

  private localToday(): string {
    const now = new Date();

    const local = new Date(
      now.getTime() -
      now.getTimezoneOffset() * 60000
    );

    return local.toISOString().slice(0, 10);
  }

  get selectedProduct(): InventoryProduct | undefined {
    return this.products().find(
      product => Number(product.id) === Number(this.productId)
    );
  }

  get selectedCategory(): ProductCategory | null {
    return this.selectedProduct?.category ?? null;
  }

  get requiresExpiration(): boolean {
    return (
      this.selectedCategory === 'Contact Lenses' ||
      this.selectedCategory === 'Eyedrops'
    );
  }

  get disallowsExpiration(): boolean {
    return (
      this.selectedCategory === 'Eyeglass Frames' ||
      this.selectedCategory === 'Lenses'
    );
  }

  onProductChange(): void {
    if (this.disallowsExpiration) {
      this.expirationDate = '';
    }
  }

  async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const allProducts: InventoryProduct[] = [];

      let page = 1;
      let totalPages = 1;

      do {
        const result = await this.inventoryService.list({
          status: 'Active',
          page,
          limit: 100
        });

        console.log('Stock In inventory data:', result);

        if (!result || !Array.isArray(result.products)) {
          throw new Error(
            'Invalid inventory response. Check the browser console.'
          );
        }

        allProducts.push(...result.products);

        const pages = Number(result.pagination?.total_pages);

        totalPages = Number.isFinite(pages)
          ? Math.max(1, pages)
          : 1;

        page++;

      } while (page <= totalPages);

      this.products.set(allProducts);

    } catch (error: unknown) {
      console.error('Stock In loading error:', error);
      this.products.set([]);
      this.errorMessage.set(this.getErrorMessage(error));
    } finally {
      this.loading.set(false);
    }
  }

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

  async saveStockIn(): Promise<void> {
    if (this.saving() || this.loading()) {
      return;
    }

    this.errorMessage.set('');
    this.successMessage.set('');

    if (!this.selectedProduct) {
      this.errorMessage.set('Please select a product.');
      return;
    }

    if (
      !this.batchNumber.trim() ||
      this.batchNumber.trim().length > 100
    ) {
      this.errorMessage.set('Enter a valid batch number.');
      return;
    }

    const quantity = Number(this.quantity);

    if (
      this.quantity === null ||
      !Number.isInteger(quantity) ||
      quantity < 1 ||
      quantity > 1000000
    ) {
      this.errorMessage.set(
        'Quantity must be a whole number from 1 to 1000000.'
      );
      return;
    }

    const today = this.localToday();

    if (
      !this.dateReceived ||
      !/^\d{4}-\d{2}-\d{2}$/.test(this.dateReceived) ||
      this.dateReceived > today
    ) {
      this.errorMessage.set('Enter a valid date received.');
      return;
    }

    if (this.requiresExpiration && !this.expirationDate) {
      this.errorMessage.set(
        'Expiration date is required for Contact Lenses and Eyedrops.'
      );
      return;
    }

    if (
      this.expirationDate &&
      (
        this.expirationDate < this.dateReceived ||
        this.expirationDate < today
      )
    ) {
      this.errorMessage.set(
        'Expiration date cannot be in the past or before the received date.'
      );
      return;
    }

    const payload = {
      inventory_id: Number(this.productId),
      batch_number: this.batchNumber.trim(),
      quantity,
      date_received: this.dateReceived,
      expiration_date: this.disallowsExpiration
        ? null
        : this.expirationDate || null
    };

    this.saving.set(true);

    try {
      const response = await firstValueFrom(
        this.api.post<ApiSuccess<StockInData>>(
          'inventory-batches',
          payload,
          { action: 'stock_in' }
        )
      );

      if (!response.success) {
        throw new Error(
          response.message || 'Stock In failed.'
        );
      }

      this.successMessage.set('Stock received successfully.');

      await this.router.navigate(['/inventory']);

    } catch (error: unknown) {
      this.errorMessage.set(this.getErrorMessage(error));
    } finally {
      this.saving.set(false);
    }
  }

  async goBack(): Promise<void> {
    await this.router.navigate(['/inventory']);
  }
}
