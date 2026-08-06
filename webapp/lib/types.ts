/**
 * Type Definitions untuk Shopee Profit Estimation
 */

// ==================== Order Types ====================

export interface Order {
  id?: number;
  no_pesanan: string;
  nama_produk: string;
  nomor_referensi_sku?: string;
  sku_induk?: string;
  variasi_produk?: string;
  jumlah: number;
  harga_asli?: number;
  total_diskon_produk?: number;
  harga_setelah_diskon?: number;
  status_pesanan?: string;
  waktu_pesanan_dibuat?: Date;
  created_at?: Date;
}

// ==================== Income Types ====================

export interface IncomePenghasilan {
  id?: number;
  no_pesanan: string;
  harga_produk: number;
  gratis_ongkir_dari_shopee: number;
  ongkir_ke_jasa_kirim: number;
  biaya_administrasi: number;
  biaya_proses_pesanan: number;
  biaya_gratis_ongkir_xtra: number;
  biaya_layanan_promo_xtra: number;
  biaya_lainnya: number;
  net_payout: number;
  created_at?: Date;
}

// ==================== Balance Types ====================

export interface BalanceTransaction {
  id?: number;
  no_pesanan?: string;
  tipe_transaksi: string;
  waktu_selesai?: Date;
  jumlah: number;
  deskripsi?: string;
  created_at?: Date;
}

// ==================== Master Product Types ====================

export interface MasterProduct {
  id?: number;
  idproduk: string;
  sku1: string;
  sku2?: string;
  harga: number; // HPP (sudah + packaging)
  created_at?: Date;
}

// ==================== Profit Calculation Types ====================

export interface ProfitCalculation {
  no_pesanan: string;
  nama_produk: string;
  jumlah: number;
  net_payout: number;
  hpp: number;
  profit: number;
  margin_pct: number;
  status_pesanan?: string;
  waktu_pesanan_dibuat?: Date;
}

export interface ProfitSummary {
  total_orders: number;
  total_net_payout: number;
  total_hpp: number;
  total_profit: number;
  average_margin_pct: number;
  total_ad_cost?: number;
  profit_after_ads?: number;
}

// ==================== Upload Types ====================

export interface UploadStatus {
  filename: string;
  status: 'pending' | 'processing' | 'success' | 'error';
  message?: string;
  rows_imported?: number;
  errors?: string[];
}

export interface BulkUploadResponse {
  success: boolean;
  uploads: UploadStatus[];
  summary?: {
    total_files: number;
    successful: number;
    failed: number;
  };
}
