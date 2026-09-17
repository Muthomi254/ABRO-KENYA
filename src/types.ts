export interface Product {
  id: string;
  sku: string;
  name: string;
  category: string;
  price: number;
  specs: string;
  usageInstructions: string;
  imageUrl?: string;
  unitSize?: string;
  parentUrl?: string;
  origin?: string;
  description?: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "model";
  text: string;
  image?: string;
  images?: string[];
  timestamp?: string;
  groundingChunks?: any[];
}

export interface AppState {
  products: Product[];
  contextDocument: string;
}
