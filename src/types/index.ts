
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

export interface InvoiceItem {
  partId: string;
  partName: string;
  partNumber: string;
  quantity: number;
  unitPrice: number; // Price before tax
  tax: number;
  total: number; // Total for this line (exFactPrice * quantity)
}

export interface Invoice {
  id: string; // Document ID from Firestore (e.g. INV-12345678)
  invoiceNumber: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  invoiceDate: string; // Stored as 'YYYY-MM-DD' string
  items: InvoiceItem[];
  subtotal: number;
  tax: number;
  total: number;
}
