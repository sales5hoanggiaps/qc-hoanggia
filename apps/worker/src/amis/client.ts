import { AmisListResponse } from "./types";

const BASE_URL = process.env.AMIS_BASE_URL || "https://crmconnect.misa.vn";

let cachedToken: string | null = null;

export function __resetTokenCache() {
  cachedToken = null;
}

export async function getAmisToken(): Promise<string> {
  if (cachedToken) return cachedToken;

  const appId = process.env.AMIS_APP_ID;
  const clientSecret = process.env.AMIS_CLIENT_SECRET;
  if (!appId || !clientSecret) {
    throw new Error("Thiếu AMIS_APP_ID/AMIS_CLIENT_SECRET trong biến môi trường của worker");
  }

  const res = await fetch(`${BASE_URL}/api/v2/Account`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: appId, client_secret: clientSecret }),
  });
  const json = (await res.json()) as { success: boolean; data?: string; user_msg?: string };
  if (!res.ok || !json.success || !json.data) {
    throw new Error(json.user_msg || "Không lấy được token AMIS — kiểm tra lại AppID/mã bảo mật");
  }
  cachedToken = json.data;
  return cachedToken;
}

/** Gọi lại 1 lần với token mới nếu gặp 401 (token hết hạn/bị thu hồi). */
async function authedFetch(path: string): Promise<Response> {
  const appId = process.env.AMIS_APP_ID!;
  const token = await getAmisToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Clientid: appId },
  });
  if (res.status === 401) {
    __resetTokenCache();
    const freshToken = await getAmisToken();
    return fetch(`${BASE_URL}${path}`, {
      headers: { Authorization: `Bearer ${freshToken}`, Clientid: appId },
    });
  }
  return res;
}

/** Phân trang tới khi 1 trang trả về ít hơn pageSize hoặc rỗng. Giới hạn an toàn 500 trang. */
export async function fetchAllPages<T>(basePath: string, pageSize = 100): Promise<T[]> {
  const rows: T[] = [];
  const separator = basePath.includes("?") ? "&" : "?";
  for (let page = 0; page < 500; page++) {
    const res = await authedFetch(`${basePath}${separator}page=${page}&pageSize=${pageSize}`);
    const json = (await res.json()) as AmisListResponse<T>;
    if (!res.ok || !json.success) {
      throw new Error(json.error_message || `Gọi AMIS thất bại tại ${basePath} (HTTP ${res.status})`);
    }
    const data = json.data ?? [];
    rows.push(...data);
    if (data.length < pageSize) break;
  }
  return rows;
}
