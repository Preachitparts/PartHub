
"use client";

import { useState, useEffect, useMemo } from "react";
import { collection, getDocs, doc, runTransaction, increment, addDoc, serverTimestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import type { Part, Invoice, Customer } from "@/types";
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
  FileText,
  UserPlus
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { logActivity } from "@/lib/activity-log";
import { Label } from "@/components/ui/label";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";


interface CartItem extends Part {
  quantity: number;
  salePrice: number;
}

const customerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  phone: z.string().optional(),
  address: z.string().optional(),
});
type CustomerFormValues = z.infer<typeof customerSchema>;


export default function POSPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerOptions, setCustomerOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [cart, setCart] = useState<CartItem[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState("");
  const [paidAmount, setPaidAmount] = useState(0);
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false);
  
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 30);
  const [dueDate, setDueDate] = useState(futureDate.toISOString().split("T")[0]);

  const { toast } = useToast();
  const router = useRouter();

  const customerForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: "", phone: "", address: "" },
  });


  const fetchInitialData = async () => {
    setLoading(true);
    try {
        const partsCollection = collection(db, "parts");
        const partsSnapshot = await getDocs(partsCollection);
        const partsList = partsSnapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id } as Part)
        );
        setParts(partsList);

        const customersCollection = query(collection(db, "customers"), orderBy("name"));
        const customersSnapshot = await getDocs(customersCollection);
        const customersList = customersSnapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id } as Customer)
        );
        setCustomers(customersList);
        setCustomerOptions(customersList.map(c => ({value: c.id, label: c.name})))

    } catch (error) {
        console.error("Error fetching data:", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch initial data.",
        });
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
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
        return [...currentCart, { ...part, quantity: 1, salePrice: part.price }];
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

  const updateCartItem = (partId: string, field: 'quantity' | 'salePrice', value: number) => {
    setCart((currentCart) => {
      const partInCatalog = parts.find(p => p.id === partId);
      if (!partInCatalog) return currentCart;

      return currentCart.map((item) => {
        if (item.id === partId) {
          const updatedItem = { ...item, [field]: value };

          if (field === 'quantity') {
            if (value <= 0) {
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
      }).filter(item => item.quantity > 0);
    });
  };

  const removeFromCart = (partId: string) => {
    setCart((currentCart) => currentCart.filter((item) => item.id !== partId));
  };
  
  const {subtotal, total, balanceDue} = useMemo(() => {
    const subtotal = cart.reduce((acc, item) => acc + item.salePrice * item.quantity, 0);
    const total = subtotal; // No tax
    const balanceDue = subtotal - paidAmount;
    return { subtotal, total, balanceDue };
  }, [cart, paidAmount]);


  useEffect(() => {
    setPaidAmount(total);
  }, [total]);

  async function onCustomerSubmit(data: CustomerFormValues) {
    setIsSaving(true);
    try {
        const newCustomerRef = collection(db, "customers");
        const docRef = await addDoc(newCustomerRef, {
            ...data,
            createdAt: serverTimestamp(),
        });
        
        toast({ title: "Customer Created", description: `Successfully created customer: ${data.name}.` });
        await logActivity(`Created new customer: ${data.name}`);
        
        await fetchInitialData();
        setSelectedCustomerId(docRef.id);
        
        setIsCustomerFormOpen(false);
        customerForm.reset();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Operation Failed", description: error.message || "An unexpected error occurred." });
    } finally {
        setIsSaving(false);
    }
  }


  const handleCompleteSale = async () => {
    if (cart.length === 0) {
        toast({ variant: "destructive", title: "Cart is empty", description: "Add items to the cart to complete a sale." });
        return;
    }
    if (!selectedCustomerId) {
        toast({ variant: "destructive", title: "Customer Not Selected", description: "Please select a customer for the sale." });
        return;
    }

    const selectedCustomer = customers.find(c => c.id === selectedCustomerId);
    if (!selectedCustomer) {
        toast({ variant: "destructive", title: "Customer Error", description: "Selected customer could not be found." });
        return;
    }


    setIsSaving(true);
    const invoiceNumber = `INV-${Date.now().toString().slice(-8)}`;

    try {
      await runTransaction(db, async (transaction) => {
        // 1. READ all part documents first.
        const partRefs = cart.map(item => doc(db, "parts", item.id));
        const partDocs = await Promise.all(partRefs.map(ref => transaction.get(ref)));

        // 2. VALIDATE stock for all items.
        for (let i = 0; i < cart.length; i++) {
          const partDoc = partDocs[i];
          const cartItem = cart[i];
          if (!partDoc.exists()) {
            throw new Error(`Part ${cartItem.name} not found.`);
          }
          const currentStock = partDoc.data().stock;
          if (currentStock < cartItem.quantity) {
            throw new Error(`Not enough stock for ${cartItem.name}. Available: ${currentStock}, Requested: ${cartItem.quantity}`);
          }
        }
        
        // 3. WRITE all updates last.
        for (let i = 0; i < cart.length; i++) {
          const partRef = partRefs[i];
          const cartItem = cart[i];
          transaction.update(partRef, { stock: increment(-cartItem.quantity) });
        }

        const invoiceRef = doc(db, "invoices", invoiceNumber);
        const finalBalanceDue = subtotal - paidAmount;
        const status = finalBalanceDue <= 0 ? 'Paid' : 'Unpaid';
        const invoiceToSave: Omit<Invoice, 'id'> = {
            invoiceNumber: invoiceNumber,
            customerId: selectedCustomer.id,
            customerName: selectedCustomer.name,
            customerAddress: selectedCustomer.address || '',
            customerPhone: selectedCustomer.phone || '',
            invoiceDate: new Date().toISOString().split("T")[0],
            dueDate,
            status,
            items: cart.map(i => ({
                partId: i.id, partName: i.name, partNumber: i.partNumber,
                quantity: i.quantity, unitPrice: i.salePrice,
                total: i.salePrice * i.quantity,
            })),
            subtotal,
            total,
            paidAmount: paidAmount,
            balanceDue: finalBalanceDue,
        };
        transaction.set(invoiceRef, invoiceToSave);
      });

      await logActivity(`Completed sale for invoice ${invoiceNumber} to ${selectedCustomer.name}.`);
      toast({ title: "Sale Complete!", description: `Invoice ${invoiceNumber} created and stock updated.` });
      
      setCart([]);
      setSelectedCustomerId("");
      setSearchTerm("");
      setPaidAmount(0);
      
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
    <>
    <Dialog open={isCustomerFormOpen} onOpenChange={setIsCustomerFormOpen}>
        <DialogContent>
            <DialogHeader>
                <DialogTitle>Add New Customer</DialogTitle>
                <DialogDescription>Enter the details for the new customer. They will be automatically selected after creation.</DialogDescription>
            </DialogHeader>
            <form onSubmit={customerForm.handleSubmit(onCustomerSubmit)} id="customer-form" className="space-y-4 py-4">
                  <div>
                      <Label htmlFor="name">Customer Name</Label>
                      <Input id="name" {...customerForm.register("name")} />
                      {customerForm.formState.errors.name && <p className="text-destructive text-xs">{customerForm.formState.errors.name.message}</p>}
                  </div>
                    <div>
                      <Label htmlFor="phone">Phone Number (Optional)</Label>
                      <Input id="phone" {...customerForm.register("phone")} />
                  </div>
                    <div>
                      <Label htmlFor="address">Address (Optional)</Label>
                      <Input id="address" {...customerForm.register("address")} />
                  </div>
            </form>
            <DialogFooter>
                <Button variant="outline" onClick={() => { setIsCustomerFormOpen(false); customerForm.reset(); }}>Cancel</Button>
                <Button type="submit" form="customer-form" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Customer
                </Button>
            </DialogFooter>
        </DialogContent>
    </Dialog>

    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
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
                        <TableCell className="text-right">GHS {part.price.toFixed(2)}</TableCell>
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

      <div>
        <Card>
          <CardHeader>
            <CardTitle>Current Sale</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <div className="space-y-2">
                <Label>Customer</Label>
                 <div className="flex items-center gap-2">
                    <Combobox
                        options={customerOptions}
                        value={selectedCustomerId}
                        onChange={setSelectedCustomerId}
                        placeholder="Select a customer..."
                        searchPlaceholder="Search customers..."
                        emptyPlaceholder="No customers found."
                        onOpenAutoFocus={(e) => e.preventDefault()}
                    />
                    <Button type="button" variant="outline" size="icon" onClick={() => setIsCustomerFormOpen(true)}>
                        <UserPlus className="h-4 w-4" />
                    </Button>
                </div>
            </div>
            
             <div className="space-y-2">
                <Label htmlFor="dueDate">Due Date</Label>
                <Input id="dueDate" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </div>


            <div className="h-60 overflow-auto border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead className="w-[40px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cart.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-muted-foreground py-4">Cart is empty</TableCell>
                    </TableRow>
                  ) : (
                    cart.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="font-medium line-clamp-2 pr-1">{item.name}</TableCell>
                        <TableCell><Input type="number" className="w-16" value={item.quantity} onChange={(e) => updateCartItem(item.id, 'quantity', parseInt(e.target.value))}/></TableCell>
                         <TableCell><Input type="number" step="0.01" className="w-20" value={item.salePrice} onChange={(e) => updateCartItem(item.id, 'salePrice', parseFloat(e.target.value))}/></TableCell>
                        <TableCell className="text-right">
                          <Button variant="ghost" size="icon" className="text-destructive hover:text-destructive h-8 w-8" onClick={() => removeFromCart(item.id)}><Trash2 className="h-4 w-4" /></Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
            <div className="mt-2 space-y-2 text-sm">
                <div className="flex justify-between font-bold text-base"><span>Subtotal</span><span>GHS {subtotal.toFixed(2)}</span></div>
                <div className="flex justify-between items-center">
                    <Label htmlFor="paidAmount">Amount Paid</Label>
                    <Input id="paidAmount" type="number" step="0.01" className="w-32" value={paidAmount} onChange={(e) => setPaidAmount(parseFloat(e.target.value) || 0)} />
                </div>
                 <div className="flex justify-between font-bold text-base text-primary"><span>Balance Due</span><span>GHS {balanceDue.toFixed(2)}</span></div>
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
    </>
  );
}
