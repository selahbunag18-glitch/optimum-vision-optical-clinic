
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButton, IonButtons, IonIcon, IonInput,
  IonTextarea, IonSelect, IonSelectOption,
  IonCard, IonCardContent, IonSpinner,
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
  ProductCategory,
  CreateInventoryProduct
} from '../../core/services/inventory.service';

@Component({
  selector: 'app-inventory-create',
  templateUrl: './inventory-create.page.html',
  styleUrls: ['./inventory-create.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonButtons,
    IonIcon,
    IonInput,
    IonTextarea,
    IonSelect,
    IonSelectOption,
    IonCard,
    IonCardContent,
    IonSpinner,
    IonNote
  ]
})
export class InventoryCreatePage {

  private readonly inventoryService = inject(InventoryService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly errorMessage = signal('');
  readonly successMessage = signal('');

  readonly categories: ProductCategory[] = [
    'Eyeglass Frames',
    'Contact Lenses',
    'Eyedrops',
    'Lenses',
    'Accessories',
    'Others'
  ];

  productName = '';
  category: ProductCategory | '' = '';
  brand = '';
  description = '';
  sku = '';
  price: number | null = null;
  initialStock: number | null = 0;
  lowStockThreshold: number | null = 5;

  constructor() {
    addIcons({
      arrowBackOutline,
      saveOutline,
      cubeOutline
    });
  }

  async goBack(): Promise<void> {
    await this.router.navigate(['/inventory']);
  }

  async saveProduct(): Promise<void> {

    if (this.saving()) return;

    this.errorMessage.set('');
    this.successMessage.set('');

    const name = this.productName.trim();
    const brand = this.brand.trim();
    const description = this.description.trim();
    const sku = this.sku.trim();

    if (!name) {
      this.errorMessage.set('Product name is required.');
      return;
    }

    if (!this.category) {
      this.errorMessage.set('Please select a category.');
      return;
    }

    if (
      this.price === null ||
      !Number.isFinite(Number(this.price)) ||
      Number(this.price) < 0
    ) {
      this.errorMessage.set('Enter a valid product price.');
      return;
    }

    if (
      this.initialStock === null ||
      !Number.isInteger(Number(this.initialStock)) ||
      Number(this.initialStock) < 0
    ) {
      this.errorMessage.set('Initial stock must be a whole number of 0 or more.');
      return;
    }

    if (
      this.lowStockThreshold === null ||
      !Number.isInteger(Number(this.lowStockThreshold)) ||
      Number(this.lowStockThreshold) < 0
    ) {
      this.errorMessage.set('Low stock threshold must be a whole number of 0 or more.');
      return;
    }

    const payload: CreateInventoryProduct = {
      product_name: name,
      category: this.category,
      brand,
      description,
      sku,
      price: Number(this.price),
      initial_stock: Number(this.initialStock),
      low_stock_threshold: Number(this.lowStockThreshold)
    };

    this.saving.set(true);

    try {
      await this.inventoryService.create(payload);

      this.successMessage.set('Product added successfully!');

      await this.router.navigate(['/inventory']);

    } catch (error: unknown) {

      console.error('Create product error:', error);

      let message = 'Failed to add product. Please try again.';

      if (error instanceof Error) {
        message = error.message;
      }

      if (
        error !== null &&
        typeof error === 'object' &&
        'error' in error
      ) {
        const response = error as {
          error?: { message?: string; error?: string } | string;
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

      this.errorMessage.set(message);

    } finally {
      this.saving.set(false);
    }
  }
}
