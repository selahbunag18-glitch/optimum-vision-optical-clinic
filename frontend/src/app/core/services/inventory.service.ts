
import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';

import { ApiService } from './api.service';
import { ApiSuccess } from '../models/api.models';

// =====================================
// PRODUCT TYPES
// =====================================

export type ProductCategory =
  | 'Eyeglass Frames'
  | 'Contact Lenses'
  | 'Eyedrops'
  | 'Lenses'
  | 'Accessories'
  | 'Others';

export type ProductStatus =
  | 'Active'
  | 'Inactive';

export type StockAvailability =
  | 'In Stock'
  | 'Low Stock'
  | 'Out of Stock';

export type StockMovementType =
  | 'Stock In'
  | 'Stock Out'
  | 'Adjustment'
  | 'Sale'
  | 'Return';

// =====================================
// INVENTORY PRODUCT
// =====================================

export interface InventoryProduct {
  id: number;
  product_name: string;
  category: ProductCategory;
  brand: string | null;
  description: string | null;
  price: string;
  availability: StockAvailability;

  sku?: string | null;
  stock_quantity?: number;
  low_stock_threshold?: number;
  status?: ProductStatus;
  created_at?: string;
  updated_at?: string;
}

// =====================================
// PAGINATION
// =====================================

export interface InventoryPagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

// =====================================
// INVENTORY LIST
// =====================================

export interface InventoryListData {
  products: InventoryProduct[];
  pagination: InventoryPagination;
}

// =====================================
// FILTERS
// =====================================

export interface InventoryFilters {
  search?: string;
  category?: ProductCategory | '';
  status?: ProductStatus | '';
  page?: number;
  limit?: number;
}

// =====================================
// CREATE PRODUCT
// =====================================

export interface CreateInventoryProduct {
  product_name: string;
  category: ProductCategory;
  price: number | string;

  brand?: string | null;
  description?: string | null;
  sku?: string | null;

  low_stock_threshold?: number;
  initial_stock?: number;
}

// =====================================
// UPDATE PRODUCT
// =====================================

export interface UpdateInventoryProduct {
  product_name?: string;
  category?: ProductCategory;
  price?: number | string;

  brand?: string | null;
  description?: string | null;
  sku?: string | null;

  low_stock_threshold?: number;
}

// =====================================
// STOCK ADJUSTMENT
// =====================================

export interface StockAdjustment {
  type: 'add' | 'deduct';
  quantity: number;
  remarks?: string;
}

// =====================================
// STOCK MOVEMENT
// =====================================

export interface InventoryStockMovement {
  id: number;
  movement_type: StockMovementType;
  quantity_change: number;
  stock_before: number;
  stock_after: number;
  reference_id: number | null;
  remarks: string | null;
  created_at: string;

  product: {
    id: number;
    product_name: string;
    sku: string | null;
  };

  performed_by: {
    id: number;
    full_name: string | null;
  } | null;
}

// =====================================
// STOCK MOVEMENT LIST
// =====================================

export interface InventoryMovementsData {
  movements: InventoryStockMovement[];
  pagination: InventoryPagination;
}

// =====================================
// STOCK ADJUSTMENT RESULT
// =====================================

export interface StockAdjustmentResult {
  product: InventoryProduct;
  movement: InventoryStockMovement;
}

// =====================================
// INVENTORY SERVICE
// =====================================

@Injectable({
  providedIn: 'root'
})
export class InventoryService {

  private readonly api = inject(ApiService);

  // =====================================
  // VALIDATE INVENTORY API RESPONSE
  // =====================================

  private parseInventoryList(
    response: unknown
  ): InventoryListData {

    console.log(
      'ACTUAL INVENTORY RESPONSE:',
      response
    );

    let current: unknown = response;

    // Handle standard and nested data wrappers.
    for (let depth = 0; depth < 5; depth++) {

      if (
        current !== null &&
        typeof current === 'object' &&
        'products' in current &&
        Array.isArray(current.products)
      ) {

        const result = current as {
          products: InventoryProduct[];
          pagination?: InventoryPagination;
        };

        if (
          !result.pagination ||
          typeof result.pagination !== 'object'
        ) {
          console.error(
            'Inventory pagination missing:',
            current
          );

          throw new Error(
            'Inventory API response is missing pagination.'
          );
        }

        return {
          products: result.products,
          pagination: result.pagination
        };
      }

      if (
        current !== null &&
        typeof current === 'object' &&
        'data' in current
      ) {
        current = (
          current as { data: unknown }
        ).data;
      } else {
        break;
      }
    }

    console.error(
      'INVALID INVENTORY RESPONSE:',
      response
    );

    throw new Error(
      'Invalid inventory response. Products array was not found.'
    );
  }

  // =====================================
  // GET ALL PRODUCTS
  // =====================================

  async list(
    filters: InventoryFilters = {}
  ): Promise<InventoryListData> {

    const params: Record<string, string | number> = {
      action: 'list',
      page: filters.page ?? 1,
      limit: filters.limit ?? 20
    };

    if (filters.search) {
      params['search'] = filters.search;
    }

    if (filters.category) {
      params['category'] = filters.category;
    }

    if (filters.status) {
      params['status'] = filters.status;
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<InventoryListData>>(
        'inventory',
        params
      )
    );

    return this.parseInventoryList(response);
  }

  // =====================================
  // GET PRODUCT DETAILS
  // =====================================

  async get(
    id: number
  ): Promise<InventoryProduct> {

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<InventoryProduct>>(
        'inventory',
        {
          action: 'get',
          id
        }
      )
    );

    return response.data;
  }

  // =====================================
  // CREATE PRODUCT
  // =====================================

  async create(
    product: CreateInventoryProduct
  ): Promise<InventoryProduct> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<InventoryProduct>>(
        'inventory',
        product,
        {
          action: 'create'
        }
      )
    );

    return response.data;
  }

  // =====================================
  // UPDATE PRODUCT
  // =====================================

  async update(
    id: number,
    product: UpdateInventoryProduct
  ): Promise<InventoryProduct> {

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<InventoryProduct>>(
        'inventory',
        product,
        {
          action: 'update',
          id
        }
      )
    );

    return response.data;
  }

  // =====================================
  // DEACTIVATE PRODUCT
  // =====================================

  async deactivate(
    id: number
  ): Promise<InventoryProduct> {

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<InventoryProduct>>(
        'inventory',
        {},
        {
          action: 'deactivate',
          id
        }
      )
    );

    return response.data;
  }

  // =====================================
  // ACTIVATE PRODUCT
  // =====================================

  async activate(
    id: number
  ): Promise<InventoryProduct> {

    const response = await firstValueFrom(
      this.api.put<ApiSuccess<InventoryProduct>>(
        'inventory',
        {},
        {
          action: 'activate',
          id
        }
      )
    );

    return response.data;
  }

  // =====================================
  // STOCK ADJUSTMENT
  // =====================================

  async adjustStock(
    id: number,
    adjustment: StockAdjustment
  ): Promise<StockAdjustmentResult> {

    const response = await firstValueFrom(
      this.api.post<ApiSuccess<StockAdjustmentResult>>(
        'inventory',
        adjustment,
        {
          action: 'stock',
          id
        }
      )
    );

    return response.data;
  }

  // =====================================
  // LOW STOCK PRODUCTS
  // =====================================

  async lowStock(
    filters: Pick<
      InventoryFilters,
      'category' | 'page' | 'limit'
    > = {}
  ): Promise<InventoryListData> {

    const params: Record<string, string | number> = {
      action: 'low_stock',
      page: filters.page ?? 1,
      limit: filters.limit ?? 20
    };

    if (filters.category) {
      params['category'] = filters.category;
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<InventoryListData>>(
        'inventory',
        params
      )
    );

    return this.parseInventoryList(response);
  }

  // =====================================
  // STOCK MOVEMENT HISTORY
  // =====================================

  async movements(
    filters: {
      inventory_id?: number;
      movement_type?: StockMovementType | '';
      page?: number;
      limit?: number;
    } = {}
  ): Promise<InventoryMovementsData> {

    const params: Record<string, string | number> = {
      action: 'movements',
      page: filters.page ?? 1,
      limit: filters.limit ?? 20
    };

    if (filters.inventory_id !== undefined) {
      params['inventory_id'] = filters.inventory_id;
    }

    if (filters.movement_type) {
      params['movement_type'] = filters.movement_type;
    }

    const response = await firstValueFrom(
      this.api.get<ApiSuccess<InventoryMovementsData>>(
        'inventory',
        params
      )
    );

    return response.data;
  }
}
