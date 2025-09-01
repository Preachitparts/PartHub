
import type { Timestamp } from "firebase/firestore";

export interface Part {
  id: string;
  name: string;
  partNumber: string;
  partCode: string;
  description: string;
  price: number; // This will be treated as the base price
  tax: number;
  exFactPrice: number;
  taxable: boolean;
  stock: number;
  imageUrl: string;
  brand: string;
  category: string;
  equipmentModel: string;
}

export interface TaxInvoiceItem {
  partId?: string;
  name: string;
  partNumber: string;
  price: number;
  quantity: number;
  isNew: boolean;
}

export interface TaxInvoice {
  id: string; // Document ID from Firestore
  invoiceId: string; // The SUP-XXXXXXXX ID
  supplierName: string;
  supplierInvoiceNumber?: string;
  date: Timestamp;
  totalAmount: number;
  items: TaxInvoiceItem[];
}

    