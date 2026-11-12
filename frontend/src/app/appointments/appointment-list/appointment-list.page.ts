import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';

import {
  AlertController,
  ToastController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonSelect,
  IonSelectOption,
  IonInput,
  IonRefresher,
  IonRefresherContent,
  ViewWillEnter,
  ViewWillLeave
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  calendarOutline,
  refreshOutline,
  alertCircleOutline,
  timeOutline,
  personOutline,
  chevronBackOutline,
  chevronForwardOutline,
  filterOutline,
  checkmarkCircleOutline,
  closeCircleOutline,
  closeOutline,
  checkmarkOutline,
  banOutline,
  warningOutline,
  documentTextOutline,
  arrowBackOutline
} from 'ionicons/icons';

import {
  AppointmentService,
  Appointment,
  AppointmentStatus,
  AppointmentFilters,
  StaffAppointmentStatus
} from '../../core/services/appointment.service';

import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-appointment-list',
  standalone: true,
  templateUrl: './appointment-list.page.html',
  styleUrls: ['./appointment-list.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
    IonSelect,
    IonSelectOption,
    IonInput,
    IonRefresher,
    IonRefresherContent
  ]
})
export class AppointmentListPage implements ViewWillEnter, ViewWillLeave {

  private readonly appointmentService = inject(AppointmentService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly appointments = signal<Appointment[]>([]);

  readonly selectedStatus = signal<AppointmentStatus | ''>('');
  readonly selectedDate = signal('');

  readonly currentPage = signal(1);
  readonly totalPages = signal(0);
  readonly totalRecords = signal(0);

  readonly updatingAppointmentId = signal<number | null>(null);

  readonly pageSize = 20;

  readonly statuses: AppointmentStatus[] = [
    'Pending',
    'Confirmed',
    'Completed',
    'Cancelled',
    'Rejected',
    'No-Show'
  ];

  constructor() {
    addIcons({
      calendarOutline,
      refreshOutline,
      alertCircleOutline,
      timeOutline,
      personOutline,
      chevronBackOutline,
      chevronForwardOutline,
      filterOutline,
      checkmarkCircleOutline,
      closeCircleOutline,
      closeOutline,
      checkmarkOutline,
      banOutline,
      warningOutline,
      documentTextOutline,
      arrowBackOutline
    });
  }

  ionViewWillEnter(): void {
    void this.loadAppointments();
  }

  // Alisin ang focus bago umalis para mawala ang aria-hidden warning
  ionViewWillLeave(): void {
    (document.activeElement as HTMLElement | null)?.blur();
  }

  async loadAppointments(): Promise<void> {
    this.loading.set(true);
    this.error.set(null);

    const filters: AppointmentFilters = {
      page: this.currentPage(),
      limit: this.pageSize
    };

    if (this.selectedStatus()) {
      filters.status = this.selectedStatus();
    }

    if (this.selectedDate()) {
      filters.date = this.selectedDate();
    }

    try {
      const result = await this.appointmentService.list(filters);

      this.appointments.set(result.appointments);
      this.currentPage.set(result.pagination.page);
      this.totalPages.set(result.pagination.total_pages);
      this.totalRecords.set(result.pagination.total);

    } catch (err: unknown) {
      const apiError = ApiService.toApiError(err);

      this.error.set(apiError.message);
      this.appointments.set([]);

    } finally {
      this.loading.set(false);
    }
  }

  onStatusChange(value: string | number | null | undefined): void {
    const status = String(value ?? '') as AppointmentStatus | '';

    this.selectedStatus.set(status);
    this.currentPage.set(1);

    void this.loadAppointments();
  }

  onDateChange(value: string | number | null | undefined): void {
    this.selectedDate.set(String(value ?? '').slice(0, 10));
    this.currentPage.set(1);

    void this.loadAppointments();
  }

  clearFilters(): void {
    this.selectedStatus.set('');
    this.selectedDate.set('');
    this.currentPage.set(1);

    void this.loadAppointments();
  }

  async nextPage(): Promise<void> {
    if (
      this.loading() ||
      this.updatingAppointmentId() !== null ||
      this.currentPage() >= this.totalPages()
    ) {
      return;
    }

    this.currentPage.update(page => page + 1);
    await this.loadAppointments();
  }

  async previousPage(): Promise<void> {
    if (
      this.loading() ||
      this.updatingAppointmentId() !== null ||
      this.currentPage() <= 1
    ) {
      return;
    }

    this.currentPage.update(page => page - 1);
    await this.loadAppointments();
  }

  async refreshAppointments(event: CustomEvent): Promise<void> {
    try {
      await this.loadAppointments();
    } finally {
      const refresher = event.target as HTMLIonRefresherElement;
      await refresher.complete();
    }
  }

  // -----------------------------------------
  // APPOINTMENT STATUS MANAGEMENT
  // -----------------------------------------

  canUpdateStatus(appointment: Appointment): boolean {
    return (
      appointment.status === 'Pending' ||
      appointment.status === 'Confirmed'
    );
  }

  getAvailableActions(
    appointment: Appointment
  ): StaffAppointmentStatus[] {

    switch (appointment.status) {
      case 'Pending':
        return ['Confirmed', 'Rejected', 'Cancelled'];

      case 'Confirmed':
        return ['Completed', 'No-Show', 'Cancelled'];

      default:
        return [];
    }
  }

  async confirmStatusChange(
    appointment: Appointment,
    newStatus: StaffAppointmentStatus
  ): Promise<void> {

    if (
      this.loading() ||
      this.updatingAppointmentId() !== null
    ) {
      return;
    }

    if (!this.getAvailableActions(appointment).includes(newStatus)) {
      return;
    }

    const actionLabels: Record<StaffAppointmentStatus, string> = {
      Confirmed: 'Confirm',
      Rejected: 'Reject',
      Completed: 'Complete',
      'No-Show': 'Mark as No-Show',
      Cancelled: 'Cancel'
    };

    const actionLabel = actionLabels[newStatus];

    const alert = await this.alertController.create({
      header: `${actionLabel} Appointment`,
      message: `Are you sure you want to ${actionLabel.toLowerCase()} this appointment?`,
      buttons: [
        {
          text: 'Go Back',
          role: 'cancel'
        },
        {
          text: 'Yes, Continue',
          role: 'confirm',
          handler: () => {
            void this.updateAppointmentStatus(
              appointment.id,
              newStatus
            );
          }
        }
      ]
    });

    await alert.present();
  }

  private async updateAppointmentStatus(
    appointmentId: number,
    newStatus: StaffAppointmentStatus
  ): Promise<void> {

    if (this.updatingAppointmentId() !== null) {
      return;
    }

    this.updatingAppointmentId.set(appointmentId);
    this.error.set(null);

    try {
      await this.appointmentService.updateStatus(
        appointmentId,
        newStatus
      );

      const toast = await this.toastController.create({
        message: `Appointment successfully updated to ${newStatus}.`,
        duration: 2500,
        color: 'success',
        position: 'bottom'
      });

      await toast.present();

      await this.loadAppointments();

    } catch (err: unknown) {
      const apiError = ApiService.toApiError(err);

      this.error.set(apiError.message);

      const toast = await this.toastController.create({
        message: apiError.message,
        duration: 3500,
        color: 'danger',
        position: 'bottom'
      });

      await toast.present();

    } finally {
      this.updatingAppointmentId.set(null);
    }
  }

  isUpdating(appointmentId: number): boolean {
    return this.updatingAppointmentId() === appointmentId;
  }

  // -----------------------------------------
  // FORMATTING HELPERS
  // -----------------------------------------

  formatDate(value: string): string {
    if (!value) {
      return 'N/A';
    }

    const date = new Date(`${value.slice(0, 10)}T00:00:00`);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  }

  statusClass(status: AppointmentStatus): string {
    switch (status) {
      case 'Confirmed':
      case 'Completed':
        return 'status-success';

      case 'Cancelled':
      case 'Rejected':
      case 'No-Show':
        return 'status-danger';

      default:
        return 'status-pending';
    }
  }
}