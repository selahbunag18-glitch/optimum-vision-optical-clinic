import {
  Component,
  OnInit,
  inject,
  signal
} from '@angular/core';

import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';

import {
  IonContent,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonIcon,
  IonCard,
  IonCardContent,
  IonChip,
  IonLabel,
  IonSpinner,
  IonSelect,
  IonSelectOption,
  IonInput
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  addOutline,
  refreshOutline,
  searchOutline,
  cubeOutline,
  warningOutline,
  checkmarkCircleOutline,
  createOutline, arrowBackOutline } from 'ionicons/icons';

import {
  InventoryService,
  InventoryProduct,
  ProductCategory,
  ProductStatus
} from '../../core/services/inventory.service';

import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-inventory-list',
  templateUrl: './inventory-list.page.html',
  styleUrls: ['./inventory-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonContent,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonButtons,
    IonButton,
    IonIcon,
    IonCard,
    IonCardContent,
    IonChip,
    IonLabel,
    IonSpinner,
    IonSelect,
    IonSelectOption,
    IonInput
  ]
})
export class InventoryListPage implements OnInit {

  private readonly inventoryService = inject(InventoryService);
  private readonly auth = inject(AuthService);

  // PRODUCT DATA
  readonly products = signal<InventoryProduct[]>([]);

  // LOADING AND ERROR
  readonly loading = signal(false);
  readonly errorMessage = signal('');

  // PAGINATION
  readonly totalProducts = signal(0);
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);

  // FILTERS
  readonly searchTerm = signal('');
  readonly selectedCategory = signal<ProductCategory | ''>('');
  readonly selectedStatus = signal<ProductStatus | ''>('Active');

  // DASHBOARD ROUTE (role-based)
  readonly dashboardRoute = signal('/owner');

  // PRODUCT CATEGORIES
  readonly categories: ProductCategory[] = [
    'Eyeglass Frames',
    'Contact Lenses',
    'Eyedrops',
    'Lenses',
    'Accessories',
    'Others'
  ];

  readonly pageLimit = 20;

  constructor() {
    addIcons({arrowBackOutline,addOutline,cubeOutline,checkmarkCircleOutline,warningOutline,createOutline,refreshOutline,searchOutline});
  }

  ngOnInit(): void {
    void this.loadDashboardRoute();
    void this.loadProducts();
  }

  // RESOLVE ROLE-BASED DASHBOARD ROUTE
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
  // retained focus" console warnings when
  // this page is hidden mid-transition.
  // Uses activeElement because ion-button's
  // real focusable element lives inside its
  // shadow DOM (button-native), not on the
  // click event's retargeted target.
  // =====================================

  blurActiveElement(): void {
    const active = document.activeElement as HTMLElement | null;
    active?.blur();
  }

  // LOAD INVENTORY PRODUCTS
  async loadProducts(page = 1): Promise<void> {

    this.loading.set(true);
    this.errorMessage.set('');

    try {

      const result = await this.inventoryService.list({
        search: this.searchTerm().trim(),
        category: this.selectedCategory(),
        status: this.selectedStatus(),
        page,
        limit: this.pageLimit
      });

      this.products.set(result.products);

      this.totalProducts.set(
        result.pagination.total
      );

      this.currentPage.set(
        result.pagination.page
      );

      this.totalPages.set(
        result.pagination.total_pages
      );

    } catch (error: unknown) {

      console.error(
        'Inventory loading error:',
        error
      );

      let message = 'Failed to load inventory.';

      // STANDARD JAVASCRIPT ERROR
      if (error instanceof Error) {
        message = error.message;
      }

      // PHP API / HTTP ERROR
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

          message = response.error;

        } else if (
          response.error &&
          typeof response.error === 'object'
        ) {

          message =
            response.error.message ||
            response.error.error ||
            message;
        }
      }

      this.products.set([]);
      this.totalProducts.set(0);
      this.totalPages.set(1);

      this.errorMessage.set(message);

    } finally {

      this.loading.set(false);

    }
  }

  // SEARCH PRODUCTS
  onSearchChange(event: CustomEvent): void {

    const value = event.detail?.value ?? '';

    this.searchTerm.set(value);

    void this.loadProducts(1);
  }

  // FILTER BY CATEGORY
  onCategoryChange(event: CustomEvent): void {

    const value = event.detail?.value ?? '';

    this.selectedCategory.set(
      value as ProductCategory | ''
    );

    void this.loadProducts(1);
  }

  // FILTER BY STATUS
  onStatusChange(event: CustomEvent): void {

    const value = event.detail?.value ?? '';

    this.selectedStatus.set(
      value as ProductStatus | ''
    );

    void this.loadProducts(1);
  }

  // REFRESH INVENTORY
  refresh(): void {

    void this.loadProducts(
      this.currentPage()
    );
  }

  // NEXT PAGE
  nextPage(): void {

    if (
      this.loading() ||
      this.currentPage() >= this.totalPages()
    ) {
      return;
    }

    void this.loadProducts(
      this.currentPage() + 1
    );
  }

  // PREVIOUS PAGE
  previousPage(): void {

    if (
      this.loading() ||
      this.currentPage() <= 1
    ) {
      return;
    }

    void this.loadProducts(
      this.currentPage() - 1
    );
  }

  // GET PRODUCT STOCK QUANTITY
  getStockQuantity(
    product: InventoryProduct
  ): number {

    return product.stock_quantity ?? 0;
  }

  // GET STOCK STATUS COLOR
  getStockColor(
    product: InventoryProduct
  ): string {

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

  // FORMAT PRODUCT PRICE
  formatPrice(price: string): string {

    const value = Number(price);

    if (!Number.isFinite(value)) {
      return '₱0.00';
    }

    return new Intl.NumberFormat(
      'en-PH',
      {
        style: 'currency',
        currency: 'PHP',
        minimumFractionDigits: 2
      }
    ).format(value);
  }
}