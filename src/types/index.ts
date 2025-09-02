
import type { Timestamp } from "firebase/firestore";

export interface Part {
  id: string;
  name: string;
  partNumber: string;
  partCode: string;
  description: string;
  price: number;
  previousPrice?: number;
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
  unitPrice: number;
  total: number;
}

export interface Invoice {
  id: string; // Document ID from Firestore (e.g. INV-12345678)
  invoiceNumber: string;
  customerId: string;
  customerName: string;
  customerAddress: string;
  customerPhone: string;
  invoiceDate: string; // Stored as 'YYYY-MM-DD'
  dueDate: string; // Stored as 'YYYY-MM-DD'
  status: 'Paid' | 'Unpaid' | 'Overdue';
  invoiceDateObject?: Date; // Added on the client for date calculations
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
  items: InvoiceItem[];
  total: number;
  paidAmount: number;
  balanceDue: number;
}

export interface Customer {
    id: string;
    name: string;
    phone: string;
    address: string;
    createdAt: Timestamp;
    balance: number; // This is a client-side calculated field
}


export interface ActivityLog {
    id: string;
    description: string;
    date: Timestamp;
}
