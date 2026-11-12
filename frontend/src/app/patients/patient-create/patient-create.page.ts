
import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import {
  FormBuilder,
  ReactiveFormsModule,
  Validators
} from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonInput,
  IonSpinner,
  IonTextarea,
  IonTitle,
  IonToolbar
} from '@ionic/angular';

import { addIcons } from 'ionicons';
import {
  arrowBackOutline,
  personAddOutline,
  saveOutline,
  checkmarkCircleOutline,
  alertCircleOutline,
  eyeOutline
} from 'ionicons/icons';

import {
  PatientService,
  CreateWalkInPatientData,
  PatientCheckData,
  PatientPhoneMatch,
  CreateWalkInResult
} from '../../core/services/patient.service';

import { ApiService } from '../../core/services/api.service';

interface DuplicatePatient {
  id: number;
  full_name: string;
  email: string;
  phone: string | null;
}

interface DuplicateApiResponse {
  data?: {
    existing_patient_id?: number;
    matches?: DuplicatePatient[];
  };
}

@Component({
  selector: 'app-patient-create',
  standalone: true,
  templateUrl: './patient-create.page.html',
  styleUrls: ['./patient-create.page.scss'],
  imports: [
    CommonModule,
    ReactiveFormsModule,
    RouterLink,
    IonButton,
    IonButtons,
    IonContent,
    IonHeader,
    IonIcon,
    IonInput,
    IonSpinner,
    IonTextarea,
    IonTitle,
    IonToolbar
  ]
})
export class PatientCreatePage {

  private readonly fb = inject(FormBuilder);
  private readonly patientService = inject(PatientService);
  private readonly router = inject(Router);

  readonly saving = signal(false);
  readonly error = signal<string | null>(null);
  readonly fieldErrors =
    signal<Record<string, string>>({});
  readonly success = signal(false);

  readonly duplicatePatient =
    signal<DuplicatePatient | null>(null);

  readonly registrationResult =
    signal<CreateWalkInResult | null>(null);

  readonly form = this.fb.nonNullable.group({
    full_name: ['', [
      Validators.required,
      Validators.minLength(2),
      Validators.maxLength(100)
    ]],

    email: ['', [
      Validators.required,
      Validators.email
    ]],

    phone: ['', [
      Validators.required,
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
      personAddOutline,
      saveOutline,
      checkmarkCircleOutline,
      alertCircleOutline,
      eyeOutline
    });
  }

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
    this.clearDuplicate();
  }

  clearDuplicate(): void {
    this.duplicatePatient.set(null);
    this.error.set(null);
    this.fieldErrors.set({});
  }

  private toDuplicatePatient(
    match: PatientPhoneMatch
  ): DuplicatePatient {
    return {
      id: match.id,
      full_name: match.full_name,
      email: match.email,
      phone: match.phone
    };
  }

  private async checkForDuplicate(
    email: string,
    phone: string
  ): Promise<'new' | 'existing' | 'link'> {

    const result: PatientCheckData =
      await this.patientService.checkExisting(
        email,
        phone
      );

    const emailMatch = result.email_match;

    // Existing patient account with a patient record
    if (
      emailMatch?.has_patient_profile &&
      emailMatch.patient_id !== null
    ) {
      const patient = await this.patientService.get(
        emailMatch.patient_id
      );

      this.duplicatePatient.set({
        id: patient.id,
        full_name: patient.full_name,
        email: patient.email,
        phone: patient.phone
      });

      this.error.set(
        'Patient Already Registered. An existing patient record was found for this email.'
      );

      return 'existing';
    }

    // Existing phone number
    if (result.phone_matches.length > 0) {
      this.duplicatePatient.set(
        this.toDuplicatePatient(
          result.phone_matches[0]
        )
      );

      this.error.set(
        'Patient Already Registered. This phone number is already associated with another patient.'
      );

      return 'existing';
    }

    // Existing account without patient profile
    if (emailMatch) {
      if (result.can_create) {
        return 'link';
      }

      this.error.set(
        'This email is already registered but cannot be used to create a new patient record.'
      );

      return 'existing';
    }

    return 'new';
  }

  async savePatient(): Promise<void> {
    if (this.saving() || this.success()) {
      return;
    }

    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    const values = this.form.getRawValue();

    const fullName = values.full_name.trim();
    const email = values.email.trim().toLowerCase();
    const phone = values.phone.trim();

    if (!/^09[0-9]{9}$/.test(phone)) {
      this.form.controls.phone.setErrors({
        invalidPhone: true
      });

      return;
    }

    this.saving.set(true);
    this.error.set(null);
    this.fieldErrors.set({});
    this.duplicatePatient.set(null);

    try {
      // Step 1: Automatically check existing records
      const status = await this.checkForDuplicate(
        email,
        phone
      );

      if (status === 'existing') {
        return;
      }

      // Step 2: Link existing patient account
      if (status === 'link') {
        const patient =
          await this.patientService.createProfile({
            email,
            phone,
            birth_date: values.birth_date || null,
            address: values.address.trim() || null
          });

        this.registrationResult.set({
          patient,
          temporary_password: ''
        });

        this.success.set(true);
        this.form.reset();
        return;
      }

      // Step 3: Register a completely new patient
      const data: CreateWalkInPatientData = {
        full_name: fullName,
        email,
        phone,
        birth_date: values.birth_date || null,
        address: values.address.trim() || null
      };

      const result =
        await this.patientService.createWalkIn(data);

      this.registrationResult.set(result);
      this.success.set(true);
      this.form.reset();

    } catch (err: unknown) {
      const apiError = ApiService.toApiError(err);

      const httpError = err as {
        status?: number;
        error?: DuplicateApiResponse;
      };

      if (httpError.status === 409) {
        const response = httpError.error;

        const matches =
          response?.data?.matches ?? [];

        const existingId =
          response?.data?.existing_patient_id;

        if (matches.length > 0) {
          this.duplicatePatient.set(matches[0]);
        } else if (existingId) {
          try {
            const patient =
              await this.patientService.get(existingId);

            this.duplicatePatient.set({
              id: patient.id,
              full_name: patient.full_name,
              email: patient.email,
              phone: patient.phone
            });
          } catch {
            // Keep the duplicate warning.
          }
        }

        this.error.set(
          apiError.message ||
          'An existing patient record was found.'
        );
      } else {
        this.error.set(
          apiError.message ||
          'Unable to register patient.'
        );
      }

      this.fieldErrors.set(
        apiError.fieldErrors ?? {}
      );

    } finally {
      this.saving.set(false);
    }
  }

  async viewPatientDetails(): Promise<void> {
    const patient = this.duplicatePatient();

    if (!patient) {
      return;
    }

    await this.router.navigate([
      '/patients',
      patient.id
    ]);
  }

  async goToPatientList(): Promise<void> {
    await this.router.navigate(['/patients']);
  }

  createAnother(): void {
    this.success.set(false);
    this.registrationResult.set(null);
    this.duplicatePatient.set(null);
    this.error.set(null);
    this.fieldErrors.set({});
    this.form.reset();
  }
}
