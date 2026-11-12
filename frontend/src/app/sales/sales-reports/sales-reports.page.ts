
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom } from 'rxjs';

import {
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonButton,
  IonIcon,
  IonSpinner
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  refreshOutline,
  statsChartOutline,
  cashOutline,
  walletOutline,
  alertCircleOutline,
  receiptOutline,
  trophyOutline,
  printOutline,
  downloadOutline
} from 'ionicons/icons';

import { ApiService } from '../../core/services/api.service';

interface ReportSummary {
  total_sales: number;
  total_transactions: number;
  total_collections: number;
  payment_count: number;
  outstanding_balance: number;
  unpaid_sales: number;
  partial_sales: number;
  paid_sales: number;
}

interface DailySale {
  report_date: string;
  transactions: number;
  sales: number;
}

interface MonthlySale {
  report_month: string;
  transactions: number;
  sales: number;
}

interface TopProduct {
  inventory_id: number;
  product_name: string;
  category: string;
  quantity_sold: number;
  total_revenue: number;
}

interface PaymentMethod {
  payment_method: string;
  payment_count: number;
  total_amount: number;
}

interface ReportData {
  period: string;
  start_date: string;
  end_date: string;
  summary: ReportSummary;
  daily_sales: DailySale[];
  monthly_sales: MonthlySale[];
  top_products: TopProduct[];
  payment_methods: PaymentMethod[];
}

interface ReportResponse {
  success: boolean;
  message?: string;
  data: ReportData;
}

@Component({
  selector: 'app-sales-reports',
  standalone: true,
  templateUrl: './sales-reports.page.html',
  styleUrls: ['./sales-reports.page.scss'],
  imports: [
    CommonModule,
    FormsModule,
    RouterLink,
    IonHeader,
    IonToolbar,
    IonTitle,
    IonContent,
    IonButton,
    IonIcon,
    IonSpinner
  ]
})
export class SalesReportsPage implements OnInit {

  private readonly api = inject(ApiService);

  readonly loading = signal(false);
  readonly error = signal('');
  readonly report = signal<ReportData | null>(null);

  period = 'month';
  startDate = '';
  endDate = '';

  readonly periods = [
    { value: 'day', label: 'Today' },
    { value: 'month', label: 'This Month' },
    { value: 'year', label: 'This Year' },
    { value: 'custom', label: 'Custom Dates' }
  ];

  constructor() {
    addIcons({
      arrowBackOutline,
      refreshOutline,
      statsChartOutline,
      cashOutline,
      walletOutline,
      alertCircleOutline,
      receiptOutline,
      trophyOutline,
      printOutline,
      downloadOutline
    });
  }

  ngOnInit(): void {
    void this.loadReports();
  }

  ionViewWillEnter(): void {
    void this.loadReports();
  }

  async loadReports(): Promise<void> {

    if (this.loading()) return;

    this.error.set('');

    const params: Record<string, string> = {
      period: this.period
    };

    if (this.period === 'custom') {

      if (!this.startDate || !this.endDate) {
        this.error.set('Select a start date and end date.');
        return;
      }

      if (this.startDate > this.endDate) {
        this.error.set('Start date must be before end date.');
        return;
      }

      params['start_date'] = this.startDate;
      params['end_date'] = this.endDate;
    }

    this.loading.set(true);

    // Prevent printing/exporting an outdated report.
    this.report.set(null);

    try {

      const response = await firstValueFrom(
        this.api.get<ReportResponse>(
          'sales-reports',
          params
        )
      );

      if (!response.success || !response.data) {
        throw new Error(
          response.message || 'Unable to load reports.'
        );
      }

      this.report.set(response.data);

    } catch (error: unknown) {

      console.error('Sales reports error:', error);

      const err = error as {
        error?: { message?: string };
        message?: string;
      };

      this.error.set(
        err.error?.message ||
        err.message ||
        'Failed to load sales reports.'
      );

    } finally {
      this.loading.set(false);
    }
  }

  changePeriod(): void {
    this.report.set(null);

    if (this.period !== 'custom') {
      void this.loadReports();
    }
  }

  money(value: string | number): string {
    return new Intl.NumberFormat('en-PH', {
      style: 'currency',
      currency: 'PHP'
    }).format(Number(value) || 0);
  }

  number(value: string | number): string {
    return new Intl.NumberFormat('en-PH')
      .format(Number(value) || 0);
  }

  get chartRows(): {
    label: string;
    sales: number;
    transactions: number;
  }[] {

    const data = this.report();

    if (!data) return [];

    if (data.period === 'year') {
      return data.monthly_sales.map(item => ({
        label: item.report_month,
        sales: Number(item.sales),
        transactions: Number(item.transactions)
      }));
    }

    return data.daily_sales.map(item => ({
      label: item.report_date,
      sales: Number(item.sales),
      transactions: Number(item.transactions)
    }));
  }

  get maxChartValue(): number {
    return Math.max(
      1,
      ...this.chartRows.map(item => item.sales)
    );
  }

  barHeight(value: number): number {
    return Math.max(
      value > 0 ? 4 : 0,
      (value / this.maxChartValue) * 100
    );
  }

  get totalProductQuantity(): number {
    return (this.report()?.top_products ?? [])
      .reduce(
        (sum, product) =>
          sum + Number(product.quantity_sold),
        0
      );
  }

  get maxProductQuantity(): number {
    return Math.max(
      1,
      ...(this.report()?.top_products ?? [])
        .map(product => Number(product.quantity_sold))
    );
  }

  productWidth(value: number): number {
    return (Number(value) / this.maxProductQuantity) * 100;
  }

  // =====================================
  // HTML ESCAPING FOR PRINT REPORT
  // =====================================

  private escapeHtml(value: unknown): string {
    return String(value ?? '').replace(
      /[&<>"']/g,
      character => {
        const entities: Record<string, string> = {
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        };

        return entities[character] ?? character;
      }
    );
  }

  // =====================================
  // PRINT SALES REPORT
  // =====================================

  printReport(): void {

    const data = this.report();

    if (!data || this.loading()) {
      window.alert('Generate a report first.');
      return;
    }

    const escape = (value: unknown) =>
      this.escapeHtml(value);

    const money = (value: string | number) =>
      escape(this.money(value));

    const dailyRows = data.daily_sales.map(item => `
      <tr>
        <td>${escape(item.report_date)}</td>
        <td class="right">${escape(item.transactions)}</td>
        <td class="right">${money(item.sales)}</td>
      </tr>
    `).join('');

    const monthlyRows = data.monthly_sales.map(item => `
      <tr>
        <td>${escape(item.report_month)}</td>
        <td class="right">${escape(item.transactions)}</td>
        <td class="right">${money(item.sales)}</td>
      </tr>
    `).join('');

    const paymentRows = data.payment_methods.map(item => `
      <tr>
        <td>${escape(item.payment_method)}</td>
        <td class="right">${escape(item.payment_count)}</td>
        <td class="right">${money(item.total_amount)}</td>
      </tr>
    `).join('');

    const productRows = data.top_products.map(
      (item, index) => `
        <tr>
          <td>${index + 1}</td>
          <td>${escape(item.product_name)}</td>
          <td>${escape(item.category)}</td>
          <td class="right">${escape(item.quantity_sold)}</td>
          <td class="right">${money(item.total_revenue)}</td>
        </tr>
      `
    ).join('');

    const html = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">

        <title>Sales Report</title>

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
            font-size: 12px;
            margin: 0;
          }

          h1 {
            text-align: center;
            color: #172554;
            font-size: 22px;
            margin-bottom: 6px;
          }

          .subtitle {
            text-align: center;
            color: #64748b;
            margin: 5px 0;
          }

          .line {
            border-bottom: 2px solid #172554;
            margin: 18px 0;
          }

          h2 {
            color: #172554;
            font-size: 16px;
            margin-top: 25px;
          }

          .summary {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 12px;
            margin-top: 22px;
          }

          .summary-item {
            padding: 14px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
          }

          .summary-item strong {
            display: block;
            font-size: 19px;
            color: #172554;
            margin-top: 8px;
          }

          .status-row {
            display: flex;
            gap: 30px;
            padding: 12px 0;
          }

          table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 12px;
          }

          th, td {
            padding: 10px;
            border-bottom: 1px solid #e2e8f0;
            text-align: left;
          }

          th {
            background: #eff6ff;
            color: #172554;
          }

          .right {
            text-align: right;
          }

          tr {
            break-inside: avoid;
          }

          .footer {
            margin-top: 35px;
            border-top: 1px solid #cbd5e1;
            padding-top: 15px;
            text-align: center;
            color: #64748b;
            font-size: 11px;
          }
        </style>
      </head>

      <body>

        <h1>OPTIMUM VISION OPTICAL CLINIC</h1>

        <p class="subtitle">SALES PERFORMANCE REPORT</p>

        <p class="subtitle">
          ${escape(data.start_date)}
          to
          ${escape(data.end_date)}
        </p>

        <div class="line"></div>

        <div class="summary">

          <div class="summary-item">
            Total Sales
            <strong>${money(data.summary.total_sales)}</strong>
          </div>

          <div class="summary-item">
            Total Collections
            <strong>${money(data.summary.total_collections)}</strong>
          </div>

          <div class="summary-item">
            Outstanding Balance
            <strong>${money(data.summary.outstanding_balance)}</strong>
          </div>

          <div class="summary-item">
            Completed Transactions
            <strong>${escape(data.summary.total_transactions)}</strong>
          </div>

        </div>

        <h2>Payment Status</h2>

        <div class="status-row">
          <span>Paid: ${escape(data.summary.paid_sales)}</span>
          <span>Partial: ${escape(data.summary.partial_sales)}</span>
          <span>Unpaid: ${escape(data.summary.unpaid_sales)}</span>
        </div>

        <h2>Daily Sales</h2>

        <table>
          <thead>
            <tr>
              <th>Date</th>
              <th class="right">Transactions</th>
              <th class="right">Sales</th>
            </tr>
          </thead>

          <tbody>
            ${dailyRows || '<tr><td colspan="3">No sales recorded.</td></tr>'}
          </tbody>
        </table>

        <h2>Monthly Sales</h2>

        <table>
          <thead>
            <tr>
              <th>Month</th>
              <th class="right">Transactions</th>
              <th class="right">Sales</th>
            </tr>
          </thead>

          <tbody>
            ${monthlyRows || '<tr><td colspan="3">No sales recorded.</td></tr>'}
          </tbody>
        </table>

        <h2>Payment Methods</h2>

        <table>
          <thead>
            <tr>
              <th>Method</th>
              <th class="right">Payments</th>
              <th class="right">Amount</th>
            </tr>
          </thead>

          <tbody>
            ${paymentRows || '<tr><td colspan="3">No payments recorded.</td></tr>'}
          </tbody>
        </table>

        <h2>Best-Selling Products</h2>

        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Product</th>
              <th>Category</th>
              <th class="right">Qty</th>
              <th class="right">Revenue</th>
            </tr>
          </thead>

          <tbody>
            ${productRows || '<tr><td colspan="5">No products sold.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          Optimum Vision Optical Clinic
          — Internal Sales Report
        </div>

      </body>
      </html>
    `;

    const printWindow = window.open('', '_blank');

    if (!printWindow) {
      window.alert(
        'Pop-up blocked. Please allow pop-ups to print.'
      );
      return;
    }

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();

    printWindow.focus();
    printWindow.print();
  }

  // =====================================
  // EXPORT CSV FOR EXCEL
  // =====================================

  exportCSV(): void {

    const data = this.report();

    if (!data || this.loading()) {
      window.alert('Generate a report first.');
      return;
    }

    const rows: Array<Array<string | number>> = [];

    rows.push(['OPTIMUM VISION OPTICAL CLINIC']);
    rows.push(['SALES PERFORMANCE REPORT']);
    rows.push(['Start Date', data.start_date]);
    rows.push(['End Date', data.end_date]);
    rows.push([]);

    rows.push(['SUMMARY']);
    rows.push(['Metric', 'Value']);
    rows.push(['Total Sales', data.summary.total_sales]);
    rows.push(['Total Collections', data.summary.total_collections]);
    rows.push(['Outstanding Balance', data.summary.outstanding_balance]);
    rows.push([
      'Completed Transactions',
      data.summary.total_transactions
    ]);
    rows.push(['Paid Sales', data.summary.paid_sales]);
    rows.push(['Partial Sales', data.summary.partial_sales]);
    rows.push(['Unpaid Sales', data.summary.unpaid_sales]);
    rows.push([]);

    rows.push(['DAILY SALES']);
    rows.push(['Date', 'Transactions', 'Sales']);

    for (const item of data.daily_sales) {
      rows.push([
        item.report_date,
        item.transactions,
        item.sales
      ]);
    }

    rows.push([]);

    rows.push(['MONTHLY SALES']);
    rows.push(['Month', 'Transactions', 'Sales']);

    for (const item of data.monthly_sales) {
      rows.push([
        item.report_month,
        item.transactions,
        item.sales
      ]);
    }

    rows.push([]);

    rows.push(['PAYMENT METHODS']);
    rows.push(['Method', 'Payments', 'Amount']);

    for (const item of data.payment_methods) {
      rows.push([
        item.payment_method,
        item.payment_count,
        item.total_amount
      ]);
    }

    rows.push([]);

    rows.push(['BEST-SELLING PRODUCTS']);
    rows.push([
      'Rank',
      'Product',
      'Category',
      'Quantity Sold',
      'Revenue'
    ]);

    data.top_products.forEach((item, index) => {
      rows.push([
        index + 1,
        item.product_name,
        item.category,
        item.quantity_sold,
        item.total_revenue
      ]);
    });

    // Escape formulas and quotes for spreadsheet safety.
    const csvCell = (value: string | number): string => {
      let text = String(value ?? '');

      if (typeof value === 'string' && /^[\s]*[=+\-@]/.test(text)) {
        text = "'" + text;
      }

      return '"' + text.replace(/"/g, '""') + '"';
    };

    const csv = rows
      .map(row => row.map(csvCell).join(','))
      .join('\r\n');

    const blob = new Blob(
      ['\uFEFF', csv],
      { type: 'text/csv;charset=utf-8;' }
    );

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download =
      `Optimum-Vision-Sales-Report-${data.start_date}-to-${data.end_date}.csv`;

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    URL.revokeObjectURL(url);
  }
}
