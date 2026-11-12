
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonIcon, IonSpinner, IonCard,
  IonCardContent, IonInput, IonTextarea,
  IonSelect, IonSelectOption
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline, addOutline, trashOutline,
  saveOutline, alertCircleOutline
} from 'ionicons/icons';

import { ApiService } from '../../core/services/api.service';

interface Product {
  id: number;
  product_name: string;
  sku: string | null;
  price: string | number;
  stock_quantity: number;
  status: string;
}

interface InventoryResponse {
  success: boolean;
  data: {
    products?: Product[];
    inventory?: Product[];
    items?: Product[];
  } | Product[];
}

interface SaleItem {
  inventory_id: number | null;
  quantity: number;
}

interface CreateSaleResponse {
  success: boolean;
  message?: string;
  data?: { id: number };
}

@Component({
  selector: 'app-sales-create',
  templateUrl: './sales-create.page.html',
  styleUrls: ['./sales-create.page.scss'],
  standalone: true,
  imports: [
    CommonModule, FormsModule, RouterLink,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButton, IonIcon, IonSpinner, IonCard,
    IonCardContent, IonInput, IonTextarea,
    IonSelect, IonSelectOption
  ]
})
export class SalesCreatePage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly products = signal<Product[]>([]);

  items: SaleItem[] = [
    { inventory_id: null, quantity: 1 }
  ];

  notes = '';

  constructor() {
    addIcons({
      arrowBackOutline, addOutline, trashOutline,
      saveOutline, alertCircleOutline
    });
  }

  ngOnInit(): void {
    void this.loadProducts();
  }

  async loadProducts(): Promise<void> {
    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await firstValueFrom(
        this.api.get<InventoryResponse>(
          'inventory',
          { action: 'list' }
        )
      );

      if (!response.success) {
        throw new Error('Failed to load inventory.');
      }

      const data = response.data;

      const products = Array.isArray(data)
        ? data
        : data.products ?? data.inventory ?? data.items ?? [];

      if (!Array.isArray(products)) {
        throw new Error('Unexpected inventory response.');
      }

      this.products.set(
        products.filter(p => p.status === 'Active')
      );

    } catch (error: unknown) {
      this.errorMessage.set(this.getError(error));
    } finally {
      this.loading.set(false);
    }
  }

  addItem(): void {
    this.items.push({
      inventory_id: null,
      quantity: 1
    });
  }

  removeItem(index: number): void {
    if (this.items.length > 1) {
      this.items.splice(index, 1);
    }
  }

  getProduct(id: number | null): Product | undefined {
    return this.products().find(p => p.id === Number(id));
  }

  availableProducts(index: number): Product[] {
    const selectedIds = this.items
      .filter((_, i) => i !== index)
      .map(item => Number(item.inventory_id))
      .filter(id => id > 0);

    return this.products().filter(
      product => !selectedIds.includes(Number(product.id))
    );
  }

  lineTotal(item: SaleItem): number {
    const product = this.getProduct(item.inventory_id);

    if (!product) return 0;

    return Number(product.price) *
      (Number(item.quantity) || 0);
  }

  get total(): number {
    return this.items.reduce(
      (sum, item) => sum + this.lineTotal(item),
      0
    );
  }

  money(value: number): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(value);
  }

  async saveSale(): Promise<void> {
    if (this.saving()) return;

    this.errorMessage.set('');

    const selected = this.items.map(item => ({
      inventory_id: Number(item.inventory_id),
      quantity: Number(item.quantity)
    }));

    if (
      selected.some(item =>
        !Number.isInteger(item.inventory_id) ||
        item.inventory_id <= 0 ||
        !Number.isInteger(item.quantity) ||
        item.quantity <= 0
      )
    ) {
      this.errorMessage.set(
        'Select a product and enter a valid quantity for every item.'
      );
      return;
    }

    const ids = selected.map(item => item.inventory_id);

    if (new Set(ids).size !== ids.length) {
      this.errorMessage.set(
        'Each product can only appear once in a sale.'
      );
      return;
    }

    for (const item of selected) {
      const product = this.getProduct(item.inventory_id);

      if (!product) {
        this.errorMessage.set('Selected product was not found.');
        return;
      }

      if (item.quantity > Number(product.stock_quantity)) {
        this.errorMessage.set(
          `Not enough stock for ${product.product_name}.`
        );
        return;
      }
    }

    const confirmed = window.confirm(
      `Create sale worth ${this.money(this.total)}?\n\n` +
      'Inventory stock will be deducted immediately. ' +
      'Payment status will be Unpaid.'
    );

    if (!confirmed) return;

    this.saving.set(true);

    try {
      const response = await firstValueFrom(
        this.api.post<CreateSaleResponse>(
          'sales',
          {
            items: selected,
            notes: this.notes.trim() || null
          },
          { action: 'create' }
        )
      );

      if (!response.success) {
        throw new Error(
          response.message || 'Failed to create sale.'
        );
      }

      window.alert(
        `Sale #${response.data?.id ?? ''} created successfully!`
      );

      await this.router.navigateByUrl('/sales');

    } catch (error: unknown) {
      console.error('Create sale error:', error);
      this.errorMessage.set(this.getError(error));
    } finally {
      this.saving.set(false);
    }
  }

  private getError(error: unknown): string {
    const err = error as {
      error?: {
        message?: string;
        errors?: Record<string, string>;
      } | string;
      message?: string;
    };

    if (typeof err?.error === 'string') return err.error;

    if (err?.error && typeof err.error === 'object') {
      const details = err.error.errors
        ? Object.values(err.error.errors).join(' ')
        : '';

      return [err.error.message, details]
        .filter(Boolean)
        .join(' — ') || 'Request failed.';
    }

    return err?.message || 'Unable to create sale.';
  }
}
