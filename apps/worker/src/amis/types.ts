export interface AmisProduct {
  id: number;
  product_code: string | null;
  product_name: string | null;
  description: string | null;
  inactive: boolean | null;
}

export interface AmisProductMapping {
  product_code: string | null;
  // Tên/mô tả NGẮN, thường lặp lại giữa nhiều mã hàng khác nhau (vd theo kích thước chung) —
  // dùng làm tên mã hàng khi tạo mới, KHÔNG dùng cho "Mô tả" chi tiết ở tab TCSP.
  description: string | null;
  // "Số PO/Mã hàng KH" (mã hàng theo cách gọi của khách hàng, không phải mô tả) — xác nhận thực
  // tế qua project chị em hoanggia-crm (amis.ts) vốn đã dùng field này cho đúng mục đích đó.
  custom_field3: string | null;
  // Mô tả CHI TIẾT thật của dòng hàng trong đơn (chất liệu, kích thước, quy cách in ấn, mã vạch...)
  // — xác nhận bằng cách gọi thử API thật (2026-09-15): field này chứa nội dung chi tiết, khác hẳn
  // `description` (thường là nhãn ngắn dùng chung cho nhiều mã). Đây là nguồn đúng cho TCSPData.description.
  custom_field5: string | null;
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
