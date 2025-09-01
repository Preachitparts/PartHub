
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, runTransaction, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Part, Invoice } from "@/types";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Search,
  PlusCircle,
  Trash2,
  Loader2,
  MinusCircle,
  FileText,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { logActivity } from "@/lib/activity-log";
import { Label } from "@/components/ui/label";

interface CartItem extends Part {
  quantity: number;
  // Allow overriding price and tax for the sale
  salePrice: number;
  saleTax: number;
}

export default function POSPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerAddress, setCustomerAddress] = useState("");

  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const fetchParts = async () => {
      setLoading(true);
      try {
        const partsCollection = collection(db, "parts");
        const partsSnapshot = await getDocs(partsCollection);
        const partsList = partsSnapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id } as Part)
        );
        setParts(partsList);
      } catch (error) {
        console.error("Error fetching parts:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch parts data.",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchParts();
  }, [toast]);

  const filteredParts = useMemo(() => {
    if (!searchTerm) return [];
    return parts.filter(
      (part) =>
        part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        part.partNumber.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, parts]);

  const addToCart = (part: Part) => {
    setCart((currentCart) => {
      const existingItem = currentCart.find((item) => item.id === part.id);
      if (existingItem) {
        if (existingItem.quantity < part.stock) {
          return currentCart.map((item) =>
            item.id === part.id
              ? { ...item, quantity: item.quantity + 1 }
              : item
          );
        } else {
            toast({
                variant: "destructive",
                title: "Stock Limit Reached",
                description: `No more ${part.name} in stock.`,
            });
          return currentCart;
        }
      }
      if (part.stock > 0) {
        return [...currentCart, { ...part, quantity: 1, salePrice: part.price, saleTax: part.tax }];
      } else {
         toast({
            variant: "destructive",
            title: "Out of Stock",
            description: `${part.name} is currently out of stock.`,
          });
         return currentCart;
      }
    });
  };

  const updateCartItem = (partId: string, field: 'quantity' | 'salePrice' | 'saleTax', value: number) => {
    setCart((currentCart) => {
      const partInCatalog = parts.find(p => p.id === partId);
      if (!partInCatalog) return currentCart;

      return currentCart.map((item) => {
        if (item.id === partId) {
          const updatedItem = { ...item, [field]: value };

          if (field === 'quantity') {
            if (value <= 0) {
              // This will be filtered out later
              return { ...updatedItem, quantity: 0 };
            }
            if (value > partInCatalog.stock) {
              toast({
                variant: "destructive",
                title: "Stock Limit Reached",
                description: `Only ${partInCatalog.stock} items available.`,
              });
              return { ...item, quantity: partInCatalog.stock };
            }
          }
          return updatedItem;
        }
        return item;
      }).filter(item => item.quantity > 0); // Remove items with quantity 0
    });
  };

  const removeFromCart = (partId: string) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== partId));
  };
  
  const {subtotal, taxAmount, total} = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + item.salePrice * item.quantity, 0);
    const taxAmount = cart.reduce((acc, item) => acc + item.saleTax * item.quantity, 0);
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [cart]);

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
        toast({ variant: "destructive", title: "Cart is empty", description: "Add items to the cart to complete a sale." });
        return;
    }
    if (!customerName) {
        toast({ variant: "destructive", title: "Customer Name Required", description: "Please enter a customer name." });
        return;
    }

    setIsSaving(true);
    const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

    try {
        await runTransaction(db, async (transaction) => {
            // 1. Check stock for all items
            for (const item of cart) {
                const partRef = doc(db, "parts", item.id);
                const partDoc = await transaction.get(partRef);
                if (!partDoc.exists()) {
                    throw new Error(`Part ${item.name} not found.`);
                }
                const currentStock = partDoc.data().stock;
                if (currentStock < item.quantity) {
                    throw new Error(`Not enough stock for ${item.name}. Available: ${currentStock}, Requested: ${item.quantity}`);
                }
            }

            // 2. Decrement stock for all items
            for (const item of cart) {
                const partRef = doc(db, "parts", item.id);
                transaction.update(partRef, { stock: increment(-item.quantity) });
            }

            // 3. Create and save the invoice
            const invoiceRef = doc(db, "invoices", invoiceNumber);
            const invoiceToSave: Omit<Invoice, 'id'> = {
                invoiceNumber: invoiceNumber,
                customerName: customerName,
                customerAddress: customerAddress || '',
                customerPhone: customerPhone || '',
                invoiceDate: new Date().toISOString().split("T")[0],
                items: cart.map(i => ({
                    partId: i.id,
                    partName: i.name,
                    partNumber: i.partNumber,
                    quantity: i.quantity,
                    unitPrice: i.salePrice,
                    tax: i.saleTax,
                    exFactPrice: i.salePrice + i.saleTax,
                    total: (i.salePrice + i.saleTax) * i.quantity,
                })),
                subtotal: subtotal,
                tax: taxAmount,
                total: total,
            };
            transaction.set(invoiceRef, invoiceToSave);
        });

        await logActivity(`Completed sale for invoice ${invoiceNumber} to ${customerName}.`);

        toast({
            title: "Sale Complete!",
            description: `Invoice ${invoiceNumber} created and stock updated.`,
        });

        // Reset state
        setCart([]);
        setCustomerName("");
        setCustomerPhone("");
        setCustomerAddress("");
        setSearchTerm("");
        
        // Redirect to invoices page
        router.push('/dashboard/invoices');

    } catch (error: any) {
        console.error("Error completing sale:", error);
        toast({
            variant: "destructive",
            title: "Sale Failed",
            description: error.message || "An unexpected error occurred. Stock has not been updated.",
        });
    } finally {
        setIsSaving(false);
    }
  };


  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Side: Product Selection */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Point of Sale</CardTitle>
            <CardDescription>
              Search for products and add them to the sale.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products by name or part number..."
                className="pl-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="mt-4 border rounded-lg h-96 overflow-auto">
              {loading ? (
                <div className="flex justify-center items-center h-full">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                </div>
              ) : searchTerm && filteredParts.length === 0 ? (
                <p className="p-4 text-center text-muted-foreground">
                  No products found.
                </p>
              ) : filteredParts.length > 0 ? (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Product</TableHead>
                      <TableHead>Stock</TableHead>
                      <TableHead className="text-right">Price</TableHead>
                      <TableHead className="w-[80px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredParts.map((part) => (
                      <TableRow key={part.id}>
                        <TableCell className="flex items-center gap-4">
                           <Image src={part.imageUrl} alt={part.name} width={40} height={40} className="rounded-md object-cover" data-ai-hint="equipment part" />
                           <div>
                                <p className="font-medium">{part.name}</p>
                                <p className="text-xs text-muted-foreground">{part.partNumber}</p>
                           </div>
                        </TableCell>
                        <TableCell>{part.stock}</TableCell>
                        <TableCell className="text-right">GHS {part.exFactPrice.toFixed(2)}</TableCell>
                        <TableCell className="text-right">
                          <Button size="sm" onClick={() => addToCart(part)} disabled={part.stock === 0}>
                            <PlusCircle className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              ) : (
                <p className="p-4 text-center text-muted-foreground">
                  Start typing to search for products.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Side: Cart and Checkout */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Current Sale</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
                <Label htmlFor="customerName">Customer Name</Label>
                <Input id="customerName" placeholder="John Doe" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
            </div>
             <div className="space-y-2">
                <Label htmlFor="customerPhone">Customer Phone</Label>
                <Input id="customerPhone" placeholder="024 123 4567" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>
             <div className="space-y-2">
                <Label htmlFor="customerAddress">Customer Address (Optional)</Label>
                <Input id="customerAddress" placeholder="123 Main St, Accra" value={customerAddress} onChange={(e) => setCustomerAddress(e.target.value)} />
            </div>

            <div className="h-60 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>Tax</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={5}
                        className="text-center text-muted-foreground py-4"
                      >
                        Cart is empty
                      </TableCell>
                    </TableRow>
                  ) : (
                    cart.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium line-clamp-2 pr-1">{item.name}</TableCell>
                        <TableCell>
                          <Input 
                            type="number" 
                            className="w-16" 
                            value={item.quantity}
                            onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value))}
                          />
                        </TableCell>
                         <TableCell>
                          <Input 
                            type="number" 
                            step="0.01"
                            className="w-20" 
                            value={item.salePrice}
                            onChange={(e) => updateCartItem(item.id, 'salePrice', parseFloat(e.target.value))}
                          />
                        </TableCell>
                         <TableCell>
                          <Input 
                            type="number" 
                            step="0.01"
                            className="w-20" 
                            value={item.saleTax}
                            onChange={(e) => updateCartItem(item.id, 'saleTax', parseFloat(e.target.value))}
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="text-destructive hover:text-destructive h-8 w-8"
                            onClick={() => removeFromCart(item.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-2 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>GHS {subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>GHS {taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>GHS {total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg" disabled={isSaving || cart.length === 0} onClick={handleCompleteSale}>
              {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
              {isSaving ? "Processing..." : "Complete Sale & Create Invoice"}
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}

    