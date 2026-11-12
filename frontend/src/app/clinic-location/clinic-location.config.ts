/**
 * CLINIC LOCATION SETTINGS
 * ------------------------------------------------------------
 * Single source of truth for the Clinic Location page.
 * The map, the marker, the popup, the info card and the
 * Get Directions link all read from this file.
 */

export interface ClinicLocationSettings {
  name: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
}

export const CLINIC_LOCATION: ClinicLocationSettings = {
  name: 'Optimum Vision Optical Clinic',

  address:
    'Unit #5 J&G Building, Purok Centro, Brgy. Bangad, ' +
    'Cabanatuan City, 3100 Nueva Ecija, Philippines',

  latitude: 15.500169802161663,
  longitude: 121.02178240185034
};