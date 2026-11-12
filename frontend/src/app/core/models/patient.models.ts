
export interface Patient {
  id: number;
  user_id: number;
  full_name: string;
  email: string;
  phone: string | null;
  birth_date: string | null;
  address: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
}

export interface PatientListData {
  patients: Patient[];
  pagination: Pagination;
}
