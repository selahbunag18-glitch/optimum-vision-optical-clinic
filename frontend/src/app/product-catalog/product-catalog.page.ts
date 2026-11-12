import { Component, OnInit, inject, signal } from '@angular/core';
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
  IonChip,
  IonLabel,
  IonInput,
  IonSelect,
  IonSelectOption
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  cubeOutline,
  warningOutline,
  glassesOutline
} from 'ionicons/icons';

import { ApiService } from '../core/services/api.service';
import { ApiSuccess } from '../core/models/api.models';
import {
  InventoryListData,
  InventoryProduct,
  ProductCategory
} from '../core/services/inventory.service';

@Component({
  selector: 'app-product-catalog',
  standalone: true,
  templateUrl: './product-catalog.page.html',
  styleUrls: ['./product-catalog.page.scss'],
  imports: [
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner,
    IonChip,
    IonLabel,
    IonInput,
    IonSelect,
    IonSelectOption
  ]
})
export class ProductCatalogPage implements OnInit {

  private readonly api = inject(ApiService);

  readonly products = signal<InventoryProduct[]>([]);
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly totalProducts = signal(0);

  readonly searchTerm = signal('');
  readonly selectedCategory = signal<ProductCategory | ''>('');

  readonly categories: ProductCategory[] = [
    'Eyeglass Frames',
    'Contact Lenses',
    'Eyedrops',
    'Lenses',
    'Accessories',
    'Others'
  ];

  readonly pageLimit = 12;

  private searchTimer: ReturnType<typeof setTimeout> | null = null;

  constructor() {
    addIcons({
      arrowBackOutline,
      cubeOutline,
      warningOutline,
      glassesOutline
    });
  }

  ngOnInit(): void {
    void this.loadProducts();
  }

  // Remove focus before navigating away (avoids aria-hidden warning)
  blurActiveElement(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  async loadProducts(page = 1): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      // Uses the read-only "catalog" action (allowed for patients).
      const params: Record<string, string | number> = {
        action: 'catalog',
        page,
        limit: this.pageLimit
      };

      const search = this.searchTerm().trim();

      if (search) {
        params['search'] = search;
      }

      if (this.selectedCategory()) {
        params['category'] = this.selectedCategory();
      }

      const response = await firstValueFrom(
        this.api.get<ApiSuccess<InventoryListData>>(
          'inventory',
          params
        )
      );

      const data = response.data;

      if (!data || !Array.isArray(data.products)) {
        throw new Error('Invalid catalog response.');
      }

      this.products.set(data.products);
      this.totalProducts.set(data.pagination.total);
      this.currentPage.set(data.pagination.page);
      this.totalPages.set(
        Math.max(1, data.pagination.total_pages)
      );

    } catch (error: unknown) {
      this.products.set([]);
      this.totalProducts.set(0);
      this.totalPages.set(1);
      this.errorMessage.set(this.getErrorMessage(error));

    } finally {
      this.loading.set(false);
    }
  }

  onSearchChange(event: CustomEvent): void {
    this.searchTerm.set(event.detail?.value ?? '');

    // Wait a moment after typing so we don't call the API on every key.
    if (this.searchTimer) {
      clearTimeout(this.searchTimer);
    }

    this.searchTimer = setTimeout(() => {
      void this.loadProducts(1);
    }, 350);
  }

  onCategoryChange(event: CustomEvent): void {
    this.selectedCategory.set(
      (event.detail?.value ?? '') as ProductCategory | ''
    );
    void this.loadProducts(1);
  }

  nextPage(): void {
    if (this.loading() || this.currentPage() >= this.totalPages()) {
      return;
    }
    void this.loadProducts(this.currentPage() + 1);
  }

  previousPage(): void {
    if (this.loading() || this.currentPage() <= 1) {
      return;
    }
    void this.loadProducts(this.currentPage() - 1);
  }

  getStockColor(product: InventoryProduct): string {
    switch (product.availability) {
      case 'Out of Stock':
        return 'danger';
      case 'Low Stock':
        return 'warning';
      case 'In Stock':
        return 'success';
      default:
        return 'medium';
    }
  }

  formatPrice(price: string): string {
    const value = Number(price);

    if (!Number.isFinite(value)) {
      return '₱0.00';
    }

    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP',
      minimumFractionDigits: 2
    }).format(value);
  }

  private getErrorMessage(error: unknown): string {
    if (
      error !== null &&
      typeof error === 'object' &&
      'error' in error
    ) {
      const response = error as {
        error?: { message?: string; error?: string } | string;
      };

      if (typeof response.error === 'string') {
        return response.error;
      }

      if (response.error && typeof response.error === 'object') {
        return (
          response.error.message ||
          response.error.error ||
          'Failed to load products.'
        );
      }
    }

    return error instanceof Error
      ? error.message
      : 'Failed to load products.';
  }
}