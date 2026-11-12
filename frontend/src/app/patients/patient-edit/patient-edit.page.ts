
import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';

import {
  IonButton,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSpinner,
  IonTitle,
  IonToolbar,
  IonButtons,
  IonTextarea
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  saveOutline,
  personOutline,
  refreshOutline,
  alertCircleOutline
} from 'ionicons/icons';

import { PatientService } from '../../core/services/patient.service';
import { ApiService } from '../../core/services/api.service';

@Component({
  selector: 'app-patient-edit',
  standalone: true,
  templateUrl: './patient-edit.page.html',
  styleUrls: ['./patient-edit.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    IonButton,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonSpinner,
    IonTitle,
    IonToolbar,
    IonButtons,
    IonTextarea
  ]
})
export class PatientEditPage implements OnInit {

  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly patientService = inject(PatientService);
  private readonly fb = inject(FormBuilder);

  readonly patientId = signal<number | null>(null);
  readonly loading = signal(true);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors = signal<Record<string, string>>({});
  readonly needsPhoneConfirmation = signal(false);

  readonly form = this.fb.nonNullable.group({
    full_name: ['', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(100)
    ]],

    // Required: exactly 11 digits starting with 09
    phone: ['', [
      Validators.required,
      Validators.minLength(11),
      Validators.maxLength(11),
      Validators.pattern(/^09[0-9]{9}$/)
    ]],

    birth_date: [''],

    address: ['', [
      Validators.maxLength(255)
    ]]
  });

  constructor() {
    addIcons({
      arrowBackOutline,
      saveOutline,
      personOutline,
      refreshOutline,
      alertCircleOutline
    });

    // Hide duplicate phone confirmation if form changes
    this.form.valueChanges.subscribe(() => {
      this.needsPhoneConfirmation.set(false);
    });
  }

  // Digits only, maximum 11
  onPhoneInput(event: CustomEvent): void {
    const detail = event.detail as {
      value?: string | null;
    };

    const original = String(detail?.value ?? '');

    const cleaned = original
      .replace(/[^0-9]/g, '')
      .slice(0, 11);

    if (original !== cleaned) {
      this.form.controls.phone.setValue(cleaned);
    }

    this.form.controls.phone.markAsTouched();
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

    if (id === null) return;

    this.loading.set(true);
    this.error.set(null);

    try {
      const patient = await this.patientService.get(id);

      this.form.setValue({
        full_name: patient.full_name,
        phone: patient.phone ?? '',
        birth_date: patient.birth_date ?? '',
        address: patient.address ?? ''
      });

      this.form.markAsPristine();

    } catch (err) {
      this.error.set(ApiService.toApiError(err).message);
    } finally {
      this.loading.set(false);
    }
  }

  async savePatient(confirmSharedPhone = false): Promise<void> {
    if (this.saving()) return;

    this.form.markAllAsTouched();

    if (this.form.invalid) return;

    const id = this.patientId();
    if (id === null) return;

    const values = this.form.getRawValue();
    const phone = values.phone.trim();

    // Final validation before API request
    if (!/^09[0-9]{9}$/.test(phone)) {
      this.form.controls.phone.setErrors({
        invalidPhone: true
      });

      this.error.set(
        'Phone number must be exactly 11 digits and start with 09.'
      );

      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    this.needsPhoneConfirmation.set(false);

    try {
      await this.patientService.update(id, {
        full_name: values.full_name.trim(),
        phone,
        birth_date: values.birth_date || null,
        address: values.address.trim() || null,
        confirm_shared_phone: confirmSharedPhone
      });

      await this.router.navigate(['/patients', id]);

    } catch (err) {
      const apiError = ApiService.toApiError(err);

      this.error.set(apiError.message);
      this.fieldErrors.set(apiError.fieldErrors);

      const body = err instanceof Object && 'error' in err
        ? (err as {
            error?: {
              requires_confirmation?: boolean;
            };
          }).error
        : undefined;

      if (
        apiError.status === 409 &&
        body?.requires_confirmation === true
      ) {
        this.needsPhoneConfirmation.set(true);
      }

    } finally {
      this.saving.set(false);
    }
  }
}
