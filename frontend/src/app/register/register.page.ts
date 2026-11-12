
import {
  Component,
  DestroyRef,
  inject,
  signal
} from '@angular/core';

import {
  takeUntilDestroyed
} from '@angular/core/rxjs-interop';

import {
  FormBuilder,
  ReactiveFormsModule,
  ValidatorFn,
  Validators
} from '@angular/forms';

import {
  Router,
  RouterLink
} from '@angular/router';

import {
  IonButton,
  IonContent,
  IonIcon,
  IonInput,
  IonSpinner
} from '@ionic/angular';

import { addIcons } from 'ionicons';

import {
  alertCircleOutline,
  callOutline,
  checkmarkCircle,
  checkmarkCircleOutline,
  ellipseOutline,
  eyeOffOutline,
  eyeOutline,
  lockClosedOutline,
  mailOutline,
  personOutline
} from 'ionicons/icons';

import { ApiService } from '../core/services/api.service';
import { AuthService } from '../core/services/auth.service';

type FieldName =
  | 'full_name'
  | 'email'
  | 'phone'
  | 'password'
  | 'confirm';

const PHONE_PATTERN = /^[0-9+\-() ]{7,20}$/;

function trimmedLength(
  min: number,
  max: number
): ValidatorFn {
  return (control) => {
    const len = String(control.value ?? '').trim().length;

    return len < min || len > max
      ? { trimmedLength: true }
      : null;
  };
}

function passwordRules(value: string) {
  const bytes = new TextEncoder().encode(value).length;

  return {
    length: bytes >= 8 && bytes <= 72,
    letter: /[A-Za-z]/.test(value),
    number: /[0-9]/.test(value)
  };
}

const passwordValidator: ValidatorFn = (control) => {
  const value = String(control.value ?? '');

  if (value === '') {
    return null;
  }

  const rules = passwordRules(value);

  return rules.length && rules.letter && rules.number
    ? null
    : { password: true };
};

const matchPasswords: ValidatorFn = (group) =>
  group.get('password')?.value === group.get('confirm')?.value
    ? null
    : { mismatch: true };

@Component({
  selector: 'app-register',
  standalone: true,
  templateUrl: './register.page.html',
  styleUrls: ['./register.page.scss'],
  imports: [
    ReactiveFormsModule,
    RouterLink,
    IonContent,
    IonInput,
    IonButton,
    IonIcon,
    IonSpinner
  ]
})
export class RegisterPage {
  private readonly fb = inject(FormBuilder);
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly destroyRef = inject(DestroyRef);

  readonly form = this.fb.nonNullable.group(
    {
      full_name: [
        '',
        [
          Validators.required,
          trimmedLength(2, 100)
        ]
      ],
      email: [
        '',
        [
          Validators.required,
          Validators.email,
          Validators.maxLength(150)
        ]
      ],
      phone: [
        '',
        [
          Validators.pattern(PHONE_PATTERN)
        ]
      ],
      password: [
        '',
        [
          Validators.required,
          passwordValidator
        ]
      ],
      confirm: [
        '',
        [
          Validators.required
        ]
      ]
    },
    {
      validators: [matchPasswords]
    }
  );

  readonly loading = signal(false);
  readonly submitted = signal(false);
  readonly showPassword = signal(false);

  readonly errorMessage = signal<string | null>(null);

  readonly serverErrors =
    signal<Partial<Record<FieldName, string>>>({});

  readonly registeredName = signal<string | null>(null);

  private readonly tick = signal(0);

  constructor() {
    addIcons({
      alertCircleOutline,
      callOutline,
      checkmarkCircle,
      checkmarkCircleOutline,
      ellipseOutline,
      eyeOffOutline,
      eyeOutline,
      lockClosedOutline,
      mailOutline,
      personOutline
    });

    this.form.events
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        this.tick.update((n) => n + 1);
      });

    (Object.keys(this.form.controls) as FieldName[])
      .forEach((name) => {
        this.form.controls[name].valueChanges
          .pipe(takeUntilDestroyed(this.destroyRef))
          .subscribe(() => {
            this.clearServerError(name);
          });
      });
  }

  togglePassword(): void {
    this.showPassword.update((value) => !value);
  }

  passwordChecklist(): {
    label: string;
    ok: boolean;
  }[] {
    this.tick();

    const rules = passwordRules(
      this.form.controls.password.value
    );

    return [
      {
        label: '8 to 72 characters',
        ok: rules.length
      },
      {
        label: 'At least one letter',
        ok: rules.letter
      },
      {
        label: 'At least one number',
        ok: rules.number
      }
    ];
  }

  fieldError(name: FieldName): string | null {
    this.tick();

    const control = this.form.controls[name];
    const show = control.touched || this.submitted();

    if (show) {
      if (control.hasError('required')) {
        return {
          full_name: 'Full name is required.',
          email: 'Email is required.',
          phone: '',
          password: 'Password is required.',
          confirm: 'Please confirm your password.'
        }[name];
      }

      if (
        name === 'full_name' &&
        control.hasError('trimmedLength')
      ) {
        return 'Full name must be 2 to 100 characters.';
      }

      if (
        name === 'email' &&
        (
          control.hasError('email') ||
          control.hasError('maxlength')
        )
      ) {
        return 'Enter a valid email address.';
      }

      if (
        name === 'phone' &&
        control.hasError('pattern')
      ) {
        return 'Use 7 to 20 characters: digits, + - ( ) and spaces.';
      }

      if (
        name === 'password' &&
        control.hasError('password')
      ) {
        return 'Password must be 8 to 72 characters with a letter and a number.';
      }

      if (
        name === 'confirm' &&
        control.value &&
        this.form.hasError('mismatch')
      ) {
        return 'Passwords do not match.';
      }
    }

    return this.serverErrors()[name] ?? null;
  }

  async submit(): Promise<void> {
    if (this.loading()) {
      return;
    }

    this.submitted.set(true);
    this.form.markAllAsTouched();

    if (this.form.invalid) {
      return;
    }

    this.errorMessage.set(null);
    this.serverErrors.set({});
    this.loading.set(true);

    try {
      const values = this.form.getRawValue();
      const phone = values.phone.trim();

      const user = await this.auth.registerAndLogin({
        full_name: values.full_name.trim(),
        email: values.email.trim(),
        password: values.password,
        ...(phone !== '' ? { phone } : {})
      });

      this.registeredName.set(user.full_name);

      this.form.reset();
      this.submitted.set(false);

      await this.router.navigateByUrl('/patient', {
        replaceUrl: true
      });

    } catch (err) {
      const error = ApiService.toApiError(err);

      if (error.status === 409) {
        this.serverErrors.set({
          email: error.message
        });
      } else if (
        error.status === 422 &&
        Object.keys(error.fieldErrors).length > 0
      ) {
        this.serverErrors.set(
          error.fieldErrors as Partial<
            Record<FieldName, string>
          >
        );
      } else {
        this.errorMessage.set(
          error.message ||
          'Registration or automatic sign-in failed.'
        );
      }

    } finally {
      this.loading.set(false);
    }
  }

  async goToLogin(): Promise<void> {
    await this.router.navigateByUrl('/login', {
      replaceUrl: true
    });
  }

  private clearServerError(name: FieldName): void {
    if (this.serverErrors()[name]) {
      this.serverErrors.update((errors) => {
        const { [name]: _removed, ...rest } = errors;
        return rest;
      });
    }
  }
}
