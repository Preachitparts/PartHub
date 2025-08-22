export interface Part {
  id: string;
  name: string;
  partNumber: string;
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
