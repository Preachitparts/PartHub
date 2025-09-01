
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Part } from "@/types";
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
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

interface CartItem extends Part {
  quantity: number;
}

export default function POSPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const { toast } = useToast();

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
        return [...currentCart, { ...part, quantity: 1 }];
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

  const updateQuantity = (partId: string, newQuantity: number) => {
    setCart((currentCart) => {
      const partInCatalog = parts.find(p => p.id === partId);
      if (!partInCatalog) return currentCart;

      if (newQuantity <= 0) {
        return currentCart.filter((item) => item.id !== partId);
      }
      if (newQuantity > partInCatalog.stock) {
         toast({
            variant: "destructive",
            title: "Stock Limit Reached",
            description: `Only ${partInCatalog.stock} items available.`,
          });
        return currentCart;
      }
      return currentCart.map((item) =>
        item.id === partId ? { ...item, quantity: newQuantity } : item
      );
    });
  };

  const removeFromCart = (partId: string) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== partId));
  };
  
  const {subtotal, taxAmount, total} = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + item.price * item.quantity, 0);
    const taxAmount = cart.reduce((acc, item) => acc + item.tax * item.quantity, 0);
    const total = subtotal + taxAmount;
    return { subtotal, taxAmount, total };
  }, [cart])


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
                        <TableCell className="text-right">GH₵{part.exFactPrice.toFixed(2)}</TableCell>
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
          <CardContent>
            <div className="h-80 overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Price</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.length === 0 ? (
                    <TableRow>
                      <TableCell
                        colSpan={4}
                        className="text-center text-muted-foreground"
                      >
                        Cart is empty
                      </TableCell>
                    </TableRow>
                  ) : (
                    cart.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium line-clamp-2">{item.name}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                             <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity - 1)}>
                                <MinusCircle className="h-4 w-4"/>
                             </Button>
                             <span>{item.quantity}</span>
                              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => updateQuantity(item.id, item.quantity + 1)}>
                                <PlusCircle className="h-4 w-4"/>
                             </Button>
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          GH₵{(item.exFactPrice * item.quantity).toFixed(2)}
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
            <div className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span>Subtotal</span>
                <span>GH₵{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span>Tax</span>
                <span>GH₵{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>Total</span>
                <span>GH₵{total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg" disabled={cart.length === 0}>
              Complete Sale
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
