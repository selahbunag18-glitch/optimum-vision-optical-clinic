
import { Component, OnInit, inject, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';

import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonSpinner,
  IonTitle,
  IonToolbar,
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  arrowBackOutline,
  personOutline,
  mailOutline,
  callOutline,
  calendarOutline,
  locationOutline,
  createOutline,
  refreshOutline,
  alertCircleOutline,
  checkmarkCircleOutline,
  timeOutline,
  eyeOutline,
} from 'ionicons/icons';

import { Patient } from '../../core/models/patient.models';
import { PatientService } from '../../core/services/patient.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-patient-details',
  templateUrl: './patient-details.page.html',
  styleUrls: ['./patient-details.page.scss'],
  imports: [
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonSpinner,
    IonTitle,
    IonToolbar,
  ],
})
export class PatientDetailsPage implements OnInit {

  private readonly route = inject(ActivatedRoute);
  private readonly patientService = inject(PatientService);

  readonly patient = signal<Patient | null>(null);
  readonly loading = signal(true);
  readonly error = signal<string | null>(null);

  readonly patientId = signal<number | null>(null);

  constructor() {
    addIcons({
      arrowBackOutline,
      personOutline,
      mailOutline,
      callOutline,
      calendarOutline,
      locationOutline,
      createOutline,
      refreshOutline,
      alertCircleOutline,
      checkmarkCircleOutline,
      timeOutline,
      eyeOutline,
    });
  }

  ngOnInit(): void {
    const id = Number(this.route.snapshot.paramMap.get('id'));

    if (!Number.isSafeInteger(id) || id <= 0) {
      this.loading.set(false);
      this.error.set('Invalid patient ID.');
      return;
    }

    this.patientId.set(id);
    void this.loadPatient();
  }

  async loadPatient(): Promise<void> {
    const id = this.patientId();

    if (id === null) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    try {
      const result = await this.patientService.get(id);
      this.patient.set(result);

    } catch (err) {
      this.patient.set(null);

      const apiError = ApiService.toApiError(err);

      if (apiError.status === 404) {
        this.error.set('Patient not found.');
      } else if (apiError.status === 403) {
        this.error.set(
          'You do not have permission to view this patient.'
        );
      } else {
        this.error.set(apiError.message);
      }

    } finally {
      this.loading.set(false);
    }
  }

  formatDate(value: string | null): string {
    if (!value) {
      return 'Not provided';
    }

    const datePart = value.substring(0, 10);
    const date = new Date(`${datePart}T00:00:00+08:00`);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleDateString('en-PH', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      timeZone: 'Asia/Manila',
    });
  }
}
