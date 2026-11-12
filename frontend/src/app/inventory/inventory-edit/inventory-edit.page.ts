
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButtons,
  IonButton,
  IonIcon,
  IonInput,
  IonTextarea,
  IonSelect,
  IonSelectOption,
  IonCard,
  IonCardContent,
  IonSpinner,
  IonNote
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  saveOutline,
  createOutline
} from 'ionicons/icons';

import {
  InventoryService,
  ProductCategory,
  UpdateInventoryProduct
} from '../../core/services/inventory.service';

@Component({
  selector: 'app-inventory-edit',
  templateUrl: './inventory-edit.page.html',
  styleUrls: ['./inventory-edit.page.scss'],
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
export class InventoryEditPage implements OnInit {

  private readonly inventoryService = inject(InventoryService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);

  readonly loading = signal(true);
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

  productId = 0;

  productName = '';
  category: ProductCategory | '' = '';
  brand = '';
  description = '';
  sku = '';
  price: number | null = null;

  constructor() {
    addIcons({
      arrowBackOutline,
      saveOutline,
      createOutline
    });
  }

  ngOnInit(): void {

    const id = Number(
      this.route.snapshot.paramMap.get('id')
    );

    if (!Number.isInteger(id) || id <= 0) {
      this.errorMessage.set('Invalid product ID.');
      this.loading.set(false);
      return;
    }

    this.productId = id;

    void this.loadProduct();
  }

  private getErrorMessage(error: unknown): string {

    let message = 'Something went wrong. Please try again.';

    if (error instanceof Error) {
      message = error.message;
    }

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

    return message;
  }

  async loadProduct(): Promise<void> {

    this.loading.set(true);
    this.errorMessage.set('');

    try {

      const product = await this.inventoryService.get(
        this.productId
      );

      this.productName = product.product_name;
      this.category = product.category;
      this.brand = product.brand ?? '';
      this.description = product.description ?? '';
      this.sku = product.sku ?? '';
      this.price = Number(product.price);

    } catch (error: unknown) {

      console.error('Load product error:', error);

      this.errorMessage.set(
        this.getErrorMessage(error)
      );

    } finally {
      this.loading.set(false);
    }
  }

  async saveChanges(): Promise<void> {

    if (this.saving() || this.loading()) {
      return;
    }

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
      this.errorMessage.set('Enter a valid price.');
      return;
    }

    const payload: UpdateInventoryProduct = {
      product_name: name,
      category: this.category,
      brand,
      description,
      sku,
      price: Number(this.price)
    };

    this.saving.set(true);

    try {

      await this.inventoryService.update(
        this.productId,
        payload
      );

      this.successMessage.set(
        'Product updated successfully!'
      );

      await this.router.navigate(['/inventory']);

    } catch (error: unknown) {

      console.error('Update product error:', error);

      this.errorMessage.set(
        this.getErrorMessage(error)
      );

    } finally {
      this.saving.set(false);
    }
  }

  async goBack(): Promise<void> {
    await this.router.navigate(['/inventory']);
  }
}
