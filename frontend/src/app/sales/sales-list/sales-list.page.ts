import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import {
  IonHeader, IonToolbar, IonTitle, IonContent,
  IonButtons, IonButton, IonIcon, IonSpinner, IonCard,
  IonCardContent, IonChip, NavController
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  addOutline, arrowBackOutline,
  receiptOutline, alertCircleOutline, eyeOutline,
  closeCircleOutline, cashOutline, statsChartOutline
} from 'ionicons/icons';

import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

// Dashboard route (home page para sa owner at staff)
const DASHBOARD_ROUTE = '/home';

interface Sale {
  id: number;
  sale_date: string;
  total_amount: string;
  amount_paid: string;
  balance: string;
  payment_status: string;
  status: string;
  item_count: number;
  notes: string | null;
  patient: { id: number; full_name: string } | null;
  processed_by: { id: number; full_name: string } | null;
}

interface SaleItem {
  id: number;
  product_name: string;
  quantity: number;
  unit_price: string;
  subtotal: string;
}

interface SalePayment {
  id: number;
  amount: string;
  payment_method: string;
  reference_number: string | null;
  payment_date: string;
  notes: string | null;
}

interface SaleDetail extends Sale {
  items: SaleItem[];
  payments: SalePayment[];
}

interface ApiResponse<T> {
  success: boolean;
  message?: string;
  data: T;
}

interface SalesData {
  sales: Sale[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    total_pages: number;
  };
}

@Component({
  selector: 'app-sales-list',
  templateUrl: './sales-list.page.html',
  styleUrls: ['./sales-list.page.scss'],
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonHeader, IonToolbar, IonTitle, IonContent,
    IonButtons, IonButton, IonIcon, IonSpinner, IonCard,
    IonCardContent, IonChip
  ]
})
export class SalesListPage implements OnInit {
  private readonly api = inject(ApiService);
  private readonly auth = inject(AuthService);
  private readonly navCtrl = inject(NavController);

  readonly isOwner = signal(false);

  readonly loading = signal(false);
  readonly errorMessage = signal('');
  readonly sales = signal<Sale[]>([]);
  readonly currentPage = signal(1);
  readonly totalPages = signal(1);
  readonly totalRecords = signal(0);

  readonly detailsLoading = signal(false);
  readonly selectedSale = signal<SaleDetail | null>(null);
  readonly processingSaleId = signal<number | null>(null);

  readonly paymentSale = signal<Sale | null>(null);
  readonly savingPayment = signal(false);
  readonly paymentError = signal('');

  paymentAmount: number | null = null;
  paymentMethod = 'Cash';
  paymentReference = '';
  paymentNotes = '';

  readonly paymentMethods = [
    'Cash',
    'GCash',
    'Maya',
    'Bank Transfer',
    'Other'
  ];

  constructor() {
    addIcons({
      addOutline,
      arrowBackOutline,
      receiptOutline,
      alertCircleOutline,
      eyeOutline,
      closeCircleOutline,
      cashOutline,
      statsChartOutline
    });
  }

  ngOnInit(): void {
    void this.checkOwnerRole();
    void this.loadSales();
  }

  ionViewWillEnter(): void {
    void this.checkOwnerRole();
    void this.loadSales();
  }

  // Alisin ang focus bago umalis para mawala ang aria-hidden warning
  ionViewWillLeave(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  // Diretso sa dashboard (hindi sa browser history)
  goBack(): void {
    void this.navCtrl.navigateBack(DASHBOARD_ROUTE);
  }

  async checkOwnerRole(): Promise<void> {
    this.isOwner.set(false);

    try {
      const user = await this.auth.getCurrentUser();
      this.isOwner.set(user?.role === 'owner');
    } catch (error) {
      console.error('Role check failed:', error);
      this.isOwner.set(false);
    }
  }

  async loadSales(): Promise<void> {
    if (this.loading()) return;

    this.loading.set(true);
    this.errorMessage.set('');

    try {
      const response = await firstValueFrom(
        this.api.get<ApiResponse<SalesData>>('sales', {
          action: 'list',
          page: this.currentPage(),
          limit: 20
        })
      );

      if (!response.success || !response.data) {
        throw new Error('Invalid sales response.');
      }

      this.sales.set(response.data.sales ?? []);

      this.totalPages.set(
        Math.max(1, response.data.pagination?.total_pages ?? 1)
      );

      this.totalRecords.set(
        response.data.pagination?.total ?? 0
      );
    } catch (error: unknown) {
      console.error('Sales loading error:', error);
      this.errorMessage.set(this.getError(error));
      this.sales.set([]);
    } finally {
      this.loading.set(false);
    }
  }

  async viewDetails(sale: Sale): Promise<void> {
    this.detailsLoading.set(true);
    this.selectedSale.set(null);

    try {
      const response = await firstValueFrom(
        this.api.get<ApiResponse<SaleDetail>>('sales', {
          action: 'get',
          id: sale.id
        })
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.message || 'Unable to load sale details.'
        );
      }

      this.selectedSale.set(response.data);
    } catch (error: unknown) {
      window.alert(this.getError(error));
    } finally {
      this.detailsLoading.set(false);
    }
  }

  closeDetails(): void {
    this.selectedSale.set(null);
  }

  printReceipt(): void {
    const sale = this.selectedSale();

    if (!sale) {
      window.alert('Please open a sale first.');
      return;
    }

    const escapeHtml = (value: unknown): string =>
      String(value ?? '').replace(/[&<>"']/g, (character) => {
        const entities: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        };
        return entities[character] ?? character;
      });

    const itemsHtml = (sale.items ?? []).map(item => `
      <tr>
        <td>${escapeHtml(item.product_name)}</td>
        <td class="center">${escapeHtml(item.quantity)}</td>
        <td class="right">${this.money(item.unit_price)}</td>
        <td class="right">${this.money(item.subtotal)}</td>
      </tr>
    `).join('');

    const paymentsHtml = (sale.payments ?? []).map(payment => `
      <tr>
        <td>${escapeHtml(this.formatDate(payment.payment_date))}</td>
        <td>${escapeHtml(payment.payment_method)}</td>
        <td>${escapeHtml(payment.reference_number || '-')}</td>
        <td class="right">${this.money(payment.amount)}</td>
      </tr>
    `).join('');

    const receiptHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Sales Receipt - SALE-${sale.id}</title>
  <style>
    @page {
      size: A4;
      margin: 15mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      font-family: Arial, sans-serif;
      color: #1e293b;
      margin: 0;
      font-size: 13px;
    }

    .receipt {
      max-width: 760px;
      margin: auto;
    }

    .header {
      text-align: center;
      border-bottom: 2px solid #172554;
      padding-bottom: 18px;
    }

    .header h1 {
      margin: 0 0 6px;
      font-size: 23px;
      color: #172554;
    }

    .header p {
      margin: 4px 0;
      color: #64748b;
    }

    h2 {
      text-align: center;
      font-size: 19px;
      margin: 24px 0;
    }

    .info {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 16px;
      margin-bottom: 24px;
    }

    .info p {
      margin: 7px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 12px;
    }

    th {
      background: #172554;
      color: white;
      padding: 10px 8px;
      text-align: left;
    }

    td {
      padding: 10px 8px;
      border-bottom: 1px solid #e2e8f0;
    }

    .center {
      text-align: center;
    }

    .right {
      text-align: right;
    }

    .totals {
      max-width: 330px;
      margin: 24px 0 0 auto;
    }

    .total-row {
      display: flex;
      justify-content: space-between;
      margin: 12px 0;
    }

    .grand-total {
      font-weight: bold;
      font-size: 17px;
      padding-top: 12px;
      border-top: 2px solid #172554;
    }

    h3 {
      font-size: 15px;
      margin-top: 28px;
    }

    .void {
      color: #b91c1c;
      font-size: 18px;
      font-weight: bold;
      text-align: center;
    }

    .footer {
      margin-top: 40px;
      padding-top: 18px;
      border-top: 1px dashed #94a3b8;
      text-align: center;
      color: #64748b;
    }

    .footer p {
      margin: 6px 0;
    }

    @media print {
      .header,
      .footer,
      .totals {
        break-inside: avoid;
      }
    }
  </style>
</head>
<body>
  <div class="receipt">
    <div class="header">
      <h1>OPTIMUM VISION OPTICAL CLINIC</h1>
      <p>Sales Transaction Record</p>
    </div>

    <h2>SALES RECEIPT</h2>

    ${
      sale.status === 'Cancelled'
        ? '<p class="void">VOID - CANCELLED SALE</p>'
        : ''
    }

    <div class="info">
      <div>
        <p><strong>Reference:</strong> SALE-${sale.id}</p>
        <p><strong>Date:</strong> ${escapeHtml(this.formatDate(sale.sale_date))}</p>
        <p><strong>Customer:</strong>
          ${escapeHtml(sale.patient?.full_name || 'Walk-in Customer')}
        </p>
      </div>

      <div>
        <p><strong>Sale Status:</strong> ${escapeHtml(sale.status)}</p>
        <p><strong>Payment Status:</strong> ${escapeHtml(sale.payment_status)}</p>
        <p><strong>Processed By:</strong>
          ${escapeHtml(sale.processed_by?.full_name || 'N/A')}
        </p>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th class="center">Qty</th>
          <th class="right">Unit Price</th>
          <th class="right">Subtotal</th>
        </tr>
      </thead>
      <tbody>${itemsHtml}</tbody>
    </table>

    <div class="totals">
      <div class="total-row grand-total">
        <span>Total</span>
        <span>${this.money(sale.total_amount)}</span>
      </div>

      <div class="total-row">
        <span>Amount Paid</span>
        <span>${this.money(sale.amount_paid)}</span>
      </div>

      <div class="total-row">
        <span>Balance</span>
        <span>${this.money(sale.balance)}</span>
      </div>
    </div>

    <h3>Payment History</h3>

    ${
      sale.payments?.length
        ? `
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Method</th>
                <th>Reference</th>
                <th class="right">Amount</th>
              </tr>
            </thead>
            <tbody>${paymentsHtml}</tbody>
          </table>
        `
        : '<p>No payments recorded.</p>'
    }

    <div class="footer">
      <p>
        <strong>
          Thank you for choosing Optimum Vision Optical Clinic!
        </strong>
      </p>
      <p>
        This is a sales transaction record,
        not an official tax invoice.
      </p>
      <p>Reference: SALE-${sale.id}</p>
    </div>
  </div>
</body>
</html>`;

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      window.alert('Please allow pop-ups to print the receipt.');
      return;
    }

    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  canCancel(sale: Sale): boolean {
    return sale.status === 'Completed'
      && Number(sale.amount_paid) === 0;
  }

  canRecordPayment(sale: Sale): boolean {
    return sale.status === 'Completed'
      && Number(sale.balance) > 0;
  }

  async cancelSale(sale: Sale): Promise<void> {
    if (!this.canCancel(sale)) return;

    const confirmed = window.confirm(
      `Are you sure you want to cancel Sale #${sale.id}?`
    );

    if (!confirmed) return;

    const reason = window.prompt(
      'Enter cancellation reason:',
      'Customer cancelled the order'
    );

    if (reason === null) return;

    if (!reason.trim()) {
      window.alert('Cancellation reason is required.');
      return;
    }

    this.processingSaleId.set(sale.id);

    try {
      const response = await firstValueFrom(
        this.api.put<ApiResponse<SaleDetail>>(
          'sales',
          { reason: reason.trim() },
          { action: 'cancel', id: sale.id }
        )
      );

      if (!response.success) {
        throw new Error(
          response.message || 'Cancellation failed.'
        );
      }

      this.selectedSale.set(null);
      await this.loadSales();

      window.alert('Sale cancelled successfully.');
    } catch (error: unknown) {
      window.alert(this.getError(error));
    } finally {
      this.processingSaleId.set(null);
    }
  }

  openPayment(sale: Sale): void {
    if (!this.canRecordPayment(sale)) return;

    this.paymentSale.set(sale);
    this.paymentAmount = Number(sale.balance);
    this.paymentMethod = 'Cash';
    this.paymentReference = '';
    this.paymentNotes = '';
    this.paymentError.set('');
  }

  closePayment(): void {
    if (this.savingPayment()) return;

    this.paymentSale.set(null);
    this.paymentError.set('');
  }

  async recordPayment(): Promise<void> {
    const sale = this.paymentSale();

    if (!sale || this.savingPayment()) return;

    const amount = Number(this.paymentAmount);
    const balance = Number(sale.balance);

    if (
      !Number.isFinite(amount) ||
      amount <= 0 ||
      Math.abs(amount * 100 - Math.round(amount * 100)) > 0.000001
    ) {
      this.paymentError.set(
        'Enter a valid amount with up to 2 decimal places.'
      );
      return;
    }

    if (Math.round(amount * 100) > Math.round(balance * 100)) {
      this.paymentError.set(
        'Payment cannot exceed the remaining balance.'
      );
      return;
    }

    if (!this.paymentMethods.includes(this.paymentMethod)) {
      this.paymentError.set('Select a valid payment method.');
      return;
    }

    if (
      this.paymentMethod !== 'Cash' &&
      !this.paymentReference.trim()
    ) {
      this.paymentError.set(
        'Enter the transaction reference number.'
      );
      return;
    }

    if (
      this.paymentReference.trim().length > 100 ||
      this.paymentNotes.trim().length > 255
    ) {
      this.paymentError.set(
        'Reference or notes exceed the allowed length.'
      );
      return;
    }

    this.savingPayment.set(true);
    this.paymentError.set('');

    try {
      const response = await firstValueFrom(
        this.api.post<
          ApiResponse<{
            sale: SaleDetail;
            payment: SalePayment;
          }>
        >(
          'sales',
          {
            payment_method: this.paymentMethod,
            amount: amount.toFixed(2),
            reference_number:
              this.paymentReference.trim() || null,
            notes: this.paymentNotes.trim() || null
          },
          {
            action: 'add_payment',
            id: sale.id
          }
        )
      );

      if (!response.success) {
        throw new Error(
          response.message || 'Failed to record payment.'
        );
      }

      const updatedSale = response.data?.sale;

      if (updatedSale) {
        this.sales.update(records =>
          records.map(record =>
            record.id === sale.id
              ? { ...record, ...updatedSale }
              : record
          )
        );

        if (this.selectedSale()?.id === sale.id) {
          this.selectedSale.set(updatedSale);
        }
      }

      this.paymentSale.set(null);
      await this.loadSales();

      window.alert(
        `Payment of ${this.money(amount)} recorded successfully.`
      );
    } catch (error: unknown) {
      this.paymentError.set(this.getError(error));
    } finally {
      this.savingPayment.set(false);
    }
  }

  changePage(page: number): void {
    if (page < 1 || page > this.totalPages()) return;

    this.currentPage.set(page);
    void this.loadSales();
  }

  money(value: string | number | null | undefined): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(Number(value) || 0);
  }

  formatDate(value: string): string {
    if (!value) return 'N/A';

    const parsed = new Date(value.replace(' ', 'T'));

    return Number.isNaN(parsed.getTime())
      ? value
      : parsed.toLocaleString('en-PH', {
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });
  }

  statusColor(status: string): string {
    if (status === 'Cancelled') return 'danger';
    if (status === 'Paid') return 'success';
    if (status === 'Partial') return 'warning';
    if (status === 'Completed') return 'success';
    return 'medium';
  }

  private getError(error: unknown): string {
    const err = error as {
      error?: {
        message?: string;
        errors?: Record<string, string>;
      } | string;
      message?: string;
    };

    if (typeof err?.error === 'string') {
      return err.error;
    }

    if (typeof err?.error === 'object') {
      const fields = err.error.errors;

      if (fields && Object.keys(fields).length) {
        return Object.values(fields).join(' ');
      }

      if (err.error.message) {
        return err.error.message;
      }
    }

    return err?.message || 'Something went wrong.';
  }
}