
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  AlertController,
  ToastController,
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar,
  ViewWillEnter
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  calendarOutline,
  timeOutline,
  personOutline,
  mailOutline,
  callOutline,
  documentTextOutline,
  saveOutline,
  refreshOutline,
  alertCircleOutline,
  checkmarkCircleOutline
} from 'ionicons/icons';

import {
  AppointmentService,
  Appointment,
  AppointmentStatus
} from '../../core/services/appointment.service';

import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-appointment-details',
  standalone: true,
  templateUrl: './appointment-details.page.html',
  styleUrls: ['./appointment-details.page.scss'],
  imports: [
    CommonModule,
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar
  ]
})
export class AppointmentDetailsPage implements ViewWillEnter {

  private readonly route = inject(ActivatedRoute);
  private readonly appointmentService = inject(AppointmentService);
  private readonly alertController = inject(AlertController);
  private readonly toastController = inject(ToastController);

  // Same limit as PHP and MySQL
  readonly notesMaxLength = 255;

  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  readonly appointment = signal<Appointment | null>(null);
  readonly staffNotes = signal('');

  readonly appointmentId = signal<number | null>(null);

  constructor() {
    addIcons({
      arrowBackOutline,
      calendarOutline,
      timeOutline,
      personOutline,
      mailOutline,
      callOutline,
      documentTextOutline,
      saveOutline,
      refreshOutline,
      alertCircleOutline,
      checkmarkCircleOutline
    });
  }

  ionViewWillEnter(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    if (!Number.isInteger(id) || id <= 0) {
      this.error.set('Invalid appointment ID.');
      this.loading.set(false);
      return;
    }

    this.appointmentId.set(id);
    void this.loadAppointment();
  }

  async loadAppointment(): Promise<void> {
    const id = this.appointmentId();

    if (id === null) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await this.appointmentService.get(id);

      this.appointment.set(result);
      this.staffNotes.set(result.staff_notes ?? '');

    } catch (err: unknown) {
      const apiError = ApiService.toApiError(err);

      this.error.set(apiError.message);
      this.appointment.set(null);

    } finally {
      this.loading.set(false);
    }
  }

  onNotesChange(value: string | null | undefined): void {
    this.staffNotes.set(String(value ?? ''));
  }

  get hasChanges(): boolean {
    const current = this.appointment();

    if (!current) {
      return false;
    }

    return this.staffNotes() !== (current.staff_notes ?? '');
  }

  async saveNotes(): Promise<void> {
    const current = this.appointment();

    if (!current || this.saving() || !this.hasChanges) {
      return;
    }

    const alert = await this.alertController.create({
      header: 'Save Staff Notes',
      message: 'Are you sure you want to save these notes?',
      buttons: [
        {
          text: 'Go Back',
          role: 'cancel'
        },
        {
          text: 'Yes, Save',
          role: 'confirm',
          handler: () => {
            void this.submitNotes(current.id);
          }
        }
      ]
    });

    await alert.present();
  }

  private async submitNotes(id: number): Promise<void> {
    if (this.saving()) {
      return;
    }

    this.saving.set(true);
    this.error.set(null);

    try {
      const updated = await this.appointmentService.updateNotes(
        id,
        this.staffNotes()
      );

      // Use saved data returned by the server
      this.appointment.set(updated);
      this.staffNotes.set(updated.staff_notes ?? '');

      const toast = await this.toastController.create({
        message: 'Staff notes saved successfully.',
        duration: 2500,
        color: 'success',
        position: 'bottom'
      });

      await toast.present();

    } catch (err: unknown) {
      const apiError = ApiService.toApiError(err);

      // Display the specific validation error when available
      const message =
        apiError.fieldErrors?.['staff_notes'] ??
        apiError.message;

      this.error.set(message);

      const toast = await this.toastController.create({
        message,
        duration: 3500,
        color: 'danger',
        position: 'bottom'
      });

      await toast.present();

    } finally {
      this.saving.set(false);
    }
  }

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
      month: 'long',
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
