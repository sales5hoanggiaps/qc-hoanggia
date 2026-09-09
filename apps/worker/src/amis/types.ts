export interface AmisProduct {
  id: number;
  product_code: string | null;
  product_name: string | null;
  description: string | null;
  inactive: boolean | null;
}

export interface AmisProductMapping {
  product_code: string | null;
  description: string | null;
  custom_field3: string | null;
}

export interface AmisSaleOrder {
  id: number;
  sale_order_no: string;
  account_name: string | null;
  sale_order_date: string | null;
  modified_date: string;
  organization_unit_name: string | null;
  sale_order_product_mappings: AmisProductMapping[] | null;
}

export interface AmisCustomer {
  id: number;
  account_name: string | null;
}

export interface AmisListResponse<T> {
  success: boolean;
  code: number;
  data: T[] | null;
  error_message?: string | null;
}
