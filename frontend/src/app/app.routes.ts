import { Routes } from '@angular/router';

import { roleGuard } from './core/guards/role.guard';
import { guestGuard } from './core/guards/guest.guard';

export const routes: Routes = [
  // =====================================
  // HOME PAGE - ALL ROLES
  // =====================================
  {
    path: 'home',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    canActivate: [roleGuard],
    data: {
      title: 'Clinic Dashboard',
      role: ['owner', 'staff', 'patient'],
    },
  },

  // =====================================
  // AUTHENTICATION
  // =====================================
  {
    path: 'login',
    loadComponent: () => import('./login/login.page').then((m) => m.LoginPage),
    canActivate: [guestGuard],
  },

  {
    path: 'register',
    loadComponent: () => import('./register/register.page').then((m) => m.RegisterPage),
    canActivate: [guestGuard],
  },

  // =====================================
  // NEW PATIENT PROFILE PAGE
  // =====================================
  {
    path: 'patient/profile',
    loadComponent: () => import('./patient-profile/patient-profile.page').then((m) => m.PatientProfilePage),
    canActivate: [roleGuard],
    data: {
      title: 'My Profile',
      role: 'patient',
    },
  },

  // =====================================
  // PATIENT DASHBOARD
  // =====================================
  {
    path: 'patient',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    canActivate: [roleGuard],
    data: {
      title: 'Patient Dashboard',
      role: 'patient',
    },
  },

  // =====================================
  // PATIENT PRODUCT CATALOG
  // =====================================
  {
    path: 'product-catalog',
    loadComponent: () => import('./product-catalog/product-catalog.page').then((m) => m.ProductCatalogPage),
    canActivate: [roleGuard],
    data: {
      title: 'Product Catalog',
      role: 'patient',
    },
  },

  // =====================================
  // CLINIC STAFF DASHBOARD
  // =====================================
  {
    path: 'staff',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    canActivate: [roleGuard],
    data: {
      title: 'Clinic Staff Dashboard',
      role: 'staff',
    },
  },

  // =====================================
  // CLINIC OWNER DASHBOARD
  // =====================================
  {
    path: 'owner',
    loadComponent: () => import('./home/home.page').then((m) => m.HomePage),
    canActivate: [roleGuard],
    data: {
      title: 'Clinic Owner Dashboard',
      role: 'owner',
    },
  },

  // =====================================
  // PATIENT MANAGEMENT
  // =====================================
  {
    path: 'patients',
    loadComponent: () => import('./patients/patient-list/patient-list.page').then((m) => m.PatientListPage),
    canActivate: [roleGuard],
    data: {
      title: 'Patient Management',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'patients/new',
    loadComponent: () => import('./patients/patient-create/patient-create.page').then((m) => m.PatientCreatePage),
    canActivate: [roleGuard],
    data: {
      title: 'Add New Patient',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'patients/:id/history',
    loadComponent: () => import('./patients/patient-history/patient-history.page').then((m) => m.PatientHistoryPage),
    canActivate: [roleGuard],
    data: {
      title: 'Patient History',
      role: ['owner', 'staff'],
    },
  },

  // =====================================
  // EYE EXAMINATION & PRESCRIPTION
  // =====================================
  {
    path: 'patients/:patientId/examinations',
    loadComponent: () => import('./eye-examinations/eye-examinations.page').then((m) => m.EyeExaminationsPage),
    canActivate: [roleGuard],
    data: {
      title: 'Eye Examination & Prescription',
      role: ['owner', 'staff'],
    },
  },

  // =====================================
  // PATIENT DETAILS
  // =====================================
  {
    path: 'patients/:id',
    loadComponent: () => import('./patients/patient-details/patient-details.page').then((m) => m.PatientDetailsPage),
    canActivate: [roleGuard],
    data: {
      title: 'Patient Details',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'patients/:id/edit',
    loadComponent: () => import('./patients/patient-edit/patient-edit.page').then((m) => m.PatientEditPage),
    canActivate: [roleGuard],
    data: {
      title: 'Edit Patient',
      role: ['owner', 'staff'],
    },
  },

  // =====================================
  // PATIENT APPOINTMENT BOOKING
  // =====================================
  {
    path: 'appointments/book',
    loadComponent: () =>
      import('./appointments/appointment-booking/appointment-booking.page').then((m) => m.AppointmentBookingPage),
    canActivate: [roleGuard],
    data: {
      title: 'Book Appointment',
      role: 'patient',
    },
  },

  // =====================================
  // APPOINTMENT MANAGEMENT
  // =====================================
  {
    path: 'appointments',
    loadComponent: () =>
      import('./appointments/appointment-list/appointment-list.page').then((m) => m.AppointmentListPage),
    canActivate: [roleGuard],
    data: {
      title: 'Appointment Management',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'appointments/slots',
    loadComponent: () =>
      import('./appointments/slot-management/slot-management.page').then((m) => m.SlotManagementPage),
    canActivate: [roleGuard],
    data: {
      title: 'Appointment Slot Management',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'appointments/:id',
    loadComponent: () =>
      import('./appointments/appointment-details/appointment-details.page').then((m) => m.AppointmentDetailsPage),
    canActivate: [roleGuard],
    data: {
      title: 'Appointment Details',
      role: ['owner', 'staff'],
    },
  },

  // =====================================
  // INVENTORY MANAGEMENT
  // =====================================
  {
    path: 'inventory/new',
    loadComponent: () =>
      import('./inventory/inventory-create/inventory-create.page').then((m) => m.InventoryCreatePage),
    canActivate: [roleGuard],
    data: {
      title: 'Add New Product',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'inventory/stock-in',
    loadComponent: () =>
      import('./inventory/inventory-stock-in/inventory-stock-in.page').then((m) => m.InventoryStockInPage),
    canActivate: [roleGuard],
    data: {
      title: 'Stock In',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'inventory/batches',
    loadComponent: () =>
      import('./inventory/inventory-batches/inventory-batches.page').then((m) => m.InventoryBatchesPage),
    canActivate: [roleGuard],
    data: {
      title: 'Inventory Batch Monitoring',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'inventory/:id/edit',
    loadComponent: () => import('./inventory/inventory-edit/inventory-edit.page').then((m) => m.InventoryEditPage),
    canActivate: [roleGuard],
    data: {
      title: 'Edit Product',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'inventory',
    loadComponent: () => import('./inventory/inventory-list/inventory-list.page').then((m) => m.InventoryListPage),
    canActivate: [roleGuard],
    data: {
      title: 'Inventory Management',
      role: ['owner', 'staff'],
    },
  },

  // =====================================
  // SALES REPORTS - OWNER ONLY
  // =====================================
  {
    path: 'sales/reports',
    loadComponent: () => import('./sales/sales-reports/sales-reports.page').then((m) => m.SalesReportsPage),
    canActivate: [roleGuard],
    data: {
      title: 'Sales Reports Dashboard',
      role: 'owner',
    },
  },

  // =====================================
  // SALES MANAGEMENT
  // =====================================
  {
    path: 'sales',
    loadComponent: () => import('./sales/sales-list/sales-list.page').then((m) => m.SalesListPage),
    canActivate: [roleGuard],
    data: {
      title: 'Sales Management',
      role: ['owner', 'staff'],
    },
  },

  {
    path: 'sales/create',
    loadComponent: () => import('./sales/sales-create/sales-create.page').then((m) => m.SalesCreatePage),
    canActivate: [roleGuard],
    data: {
      title: 'Create New Sale',
      role: ['owner', 'staff'],
    },
  },

  // =====================================
  // LEGACY SALES REDIRECTS
  // =====================================
  {
    path: 'sales-list',
    redirectTo: 'sales',
    pathMatch: 'full',
  },

  {
    path: 'sales-create',
    redirectTo: 'sales/create',
    pathMatch: 'full',
  },

  {
    path: 'sales-reports',
    redirectTo: 'sales/reports',
    pathMatch: 'full',
  },

  // =====================================
  // LEGACY INVENTORY REDIRECTS
  // =====================================
  {
    path: 'inventory-batches',
    redirectTo: 'inventory/batches',
    pathMatch: 'full',
  },

  {
    path: 'inventory-stock-in',
    redirectTo: 'inventory/stock-in',
    pathMatch: 'full',
  },

  {
    path: 'inventory-edit',
    redirectTo: 'inventory',
    pathMatch: 'full',
  },

  {
    path: 'inventory-create',
    redirectTo: 'inventory/new',
    pathMatch: 'full',
  },

  {
    path: 'inventory-list',
    redirectTo: 'inventory',
    pathMatch: 'full',
  },

  // =====================================
  // LEGACY APPOINTMENT REDIRECT
  // =====================================
  {
    path: 'appointment-booking',
    redirectTo: 'appointments/book',
    pathMatch: 'full',
  },

  // =====================================
  // LEGACY EYE EXAMINATION PAGE
  // =====================================
  {
    path: 'eye-examinations',
    loadComponent: () => import('./eye-examinations/eye-examinations.page').then((m) => m.EyeExaminationsPage),
    canActivate: [roleGuard],
    data: {
      title: 'Eye Examination & Prescription',
      role: ['owner', 'staff'],
    },
  },

  // =====================================
  // DEFAULT ROUTE
  // =====================================
  {
    path: '',
    redirectTo: 'login',
    pathMatch: 'full',
  },
  {
    path: 'clinic-location',
    loadComponent: () => import('./clinic-location/clinic-location.page').then((m) => m.ClinicLocationPage),
  },
];
