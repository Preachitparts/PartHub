
"use client";

import { useState, useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, runTransaction, increment, addDoc, serverTimestamp, orderBy, query, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import type { Part, Invoice, Customer, InvoiceItem } from "@/types";
import { logActivity } from "@/lib/activity-log";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardFooter,
} from "@/components/ui/card";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "@/hooks/use-toast";
import {
  Loader2,
  PlusCircle,
  Save,
  Trash2,
  ArrowLeft,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const invoiceItemSchema = z.object({
  partId: z.string().min(1, "Please select a part."),
  partName: z.string(),
  partNumber: z.string(),
  quantity: z.preprocess((a) => parseInt(z.string().parse(a || "0"), 10), z.number().int().min(1, "Quantity must be at least 1.")),
  unitPrice: z.preprocess((a) => parseFloat(z.string().parse(a || "0")), z.number()),
  total: z.number(),
});

const invoiceSchema = z.object({
  invoiceNumber: z.string(),
  customerId: z.string().min(1, "Please select a customer."),
  invoiceDate: z.string(),
  dueDate: z.string().min(1, "Due date is required."),
  items: z.array(invoiceItemSchema).min(1, "Please add at least one item."),
  total: z.number(),
  paidAmount: z.preprocess((a) => parseFloat(z.string().parse(a || "0")), z.number().min(0, "Paid amount cannot be negative.")),
  balanceDue: z.number(),
});

const customerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  phone: z.string().optional(),
  address: z.string().optional(),
});


type InvoiceFormValues = z.infer<typeof invoiceSchema>;
type CustomerFormValues = z.infer<typeof customerSchema>;


export default function NewInvoicePage() {
  const router = useRouter();
  const [parts, setParts] = useState<Part[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerOptions, setCustomerOptions] = useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false);
  
  const today = new Date();
  const futureDate = new Date(today);
  futureDate.setDate(today.getDate() + 30);


  const invoiceForm = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoiceNumber: `INV-${Date.now().toString().slice(-8)}`,
      invoiceDate: today.toISOString().split("T")[0],
      dueDate: futureDate.toISOString().split("T")[0],
      customerId: "",
      items: [],
      total: 0,
      paidAmount: 0,
      balanceDue: 0,
    },
  });

  const customerForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: "", phone: "", address: "" },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: invoiceForm.control,
    name: "items",
  });

  async function fetchInitialData() {
      try {
        const partsCollection = collection(db, "parts");
        const partsSnapshot = await getDocs(partsCollection);
        const partsList = partsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Part)
        );
        setParts(partsList);
        
        const customersCollection = collection(db, "customers");
        const customersSnapshot = await getDocs(query(customersCollection, orderBy("name")));
        const customersList = customersSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Customer)
        );
        setCustomers(customersList);
        setCustomerOptions(customersList.map(c => ({ value: c.id, label: c.name })));

      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch initial data for parts and customers.",
        });
      } finally {
        setIsLoading(false);
      }
    }

  useEffect(() => {
    fetchInitialData();
  }, []);

  const watchItems = invoiceForm.watch("items");
  const watchPaidAmount = invoiceForm.watch("paidAmount");

  const { total, balanceDue } = useMemo(() => {
    const total = watchItems.reduce(
      (acc, item) => acc + (item.unitPrice || 0) * (item.quantity || 1),
      0
    );
    const balanceDue = total - (watchPaidAmount || 0);
    
    invoiceForm.setValue("total", total);
    invoiceForm.setValue("balanceDue", balanceDue);
    
    return { total, balanceDue };
  }, [watchItems, watchPaidAmount, invoiceForm]);

  const handlePartChange = (index: number, partId: string) => {
    const selectedPart = parts.find((p) => p.id === partId);
    if (selectedPart) {
      const quantity = 1;
      const unitPrice = selectedPart.price;
      const total = unitPrice * quantity;

      update(index, {
        partId: selectedPart.id,
        partName: selectedPart.name,
        partNumber: selectedPart.partNumber,
        quantity: quantity,
        unitPrice,
        total
      });
    }
  };

  const handleItemChange = (index: number, field: 'quantity' | 'unitPrice', value: number) => {
    const item = invoiceForm.getValues(`items.${index}`);
    if (!item) return;

    const currentItem = { ...item, [field]: value };
    
    if (field === 'quantity') {
        const selectedPart = parts.find((p) => p.id === item.partId);
        if(selectedPart && value > selectedPart.stock) {
            toast({
                variant: "destructive",
                title: "Stock limit exceeded",
                description: `Only ${selectedPart.stock} units of ${selectedPart.name} available.`,
            });
            currentItem.quantity = selectedPart.stock;
        }
        if(value < 1) currentItem.quantity = 1;
    }

    const total = (currentItem.unitPrice || 0) * (currentItem.quantity || 1);
    
    update(index, {
      ...currentItem,
      total,
    });
  };

  const addNewItem = () => {
    append({ partId: "", quantity: 1, unitPrice: 0, total: 0, partName: '', partNumber: '' });
  };

  async function onInvoiceSubmit(data: InvoiceFormValues) {
    setIsSaving(true);
    const selectedCustomer = customers.find(c => c.id === data.customerId);
    if (!selectedCustomer) {
        toast({ variant: "destructive", title: "Customer not found."});
        setIsSaving(false);
        return;
    }

    try {
        await runTransaction(db, async (transaction) => {
            const partRefs = data.items.map(item => doc(db, "parts", item.partId));
            const partDocs = await Promise.all(partRefs.map(ref => transaction.get(ref)));

            for (let i = 0; i < data.items.length; i++) {
                const partDoc = partDocs[i];
                const item = data.items[i];
                if (!partDoc.exists()) {
                    throw new Error(`Part ${item.partName} not found.`);
                }
                const currentStock = partDoc.data().stock;
                if (currentStock < item.quantity) {
                    throw new Error(`Not enough stock for ${item.partName}. Available: ${currentStock}, Requested: ${item.quantity}`);
                }
            }

            for (let i = 0; i < data.items.length; i++) {
                const partRef = partRefs[i];
                const item = data.items[i];
                transaction.update(partRef, { stock: increment(-item.quantity) });
            }

            const status = data.balanceDue <= 0 ? 'Paid' : 'Unpaid';
            const invoiceToSave: Omit<Invoice, 'id'> = {
                invoiceNumber: data.invoiceNumber,
                customerId: data.customerId,
                customerName: selectedCustomer.name,
                customerAddress: selectedCustomer.address || '',
                customerPhone: selectedCustomer.phone || '',
                invoiceDate: data.invoiceDate,
                dueDate: data.dueDate,
                status: status,
                items: data.items.map(i => ({
                    partId: i.partId, partName: i.partName, partNumber: i.partNumber,
                    quantity: i.quantity, unitPrice: i.unitPrice,
                    total: (i.unitPrice || 0) * (i.quantity || 1),
                })),
                total: data.total,
                paidAmount: data.paidAmount,
                balanceDue: data.balanceDue,
                createdAt: serverTimestamp()
            };
            
            const invoiceCollectionRef = collection(db, "invoices");
            transaction.set(doc(invoiceCollectionRef, data.invoiceNumber), invoiceToSave);
        });

      await logActivity(`Created sales invoice ${data.invoiceNumber} for ${selectedCustomer.name}.`);

      toast({
        title: "Invoice Saved",
        description: `Invoice ${data.invoiceNumber} has been successfully saved and stock updated.`,
      });
      router.push("/dashboard/invoices");

    } catch (error: any) {
      console.error("Error saving invoice:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: error.message || "Could not save the invoice. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

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
        invoiceForm.setValue('customerId', docRef.id);
        
        setIsCustomerFormOpen(false);
        customerForm.reset();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Operation Failed", description: error.message || "An unexpected error occurred." });
    } finally {
        setIsSaving(false);
    }
  }


  const partOptions = useMemo(() => {
    return parts.map(part => ({
        value: part.id,
        label: `${part.name} (${part.partNumber})`
    }));
  }, [parts]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
      </div>
    );
  }

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
    
      <Form {...invoiceForm}>
        <form onSubmit={invoiceForm.handleSubmit(onInvoiceSubmit)}>
          <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                  <Button asChild variant="outline" size="icon">
                      <Link href="/dashboard/invoices">
                          <ArrowLeft />
                      </Link>
                  </Button>
                  <h1 className="text-2xl font-semibold">New Invoice</h1>
              </div>
            <Button type="submit" disabled={isSaving}>
              {isSaving ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Save className="mr-2 h-4 w-4" />
              )}
              Save Invoice
            </Button>
          </div>

          <Card>
            <CardHeader>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="lg:col-span-2">
                  <CardTitle>Bill To</CardTitle>
                   <FormField
                    control={invoiceForm.control}
                    name="customerId"
                    render={({ field }) => (
                      <FormItem className="mt-4">
                        <FormControl>
                            <div className="flex items-center gap-2">
                                <Combobox
                                    options={customerOptions}
                                    value={field.value}
                                    onChange={field.onChange}
                                    placeholder="Select a customer..."
                                    searchPlaceholder="Search customers..."
                                    emptyPlaceholder="No customers found."
                                    onOpenAutoFocus={(e) => e.preventDefault()}
                                />
                                <Button type="button" variant="outline" size="icon" onClick={() => setIsCustomerFormOpen(true)}>
                                    <UserPlus className="h-4 w-4" />
                                </Button>
                            </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="lg:col-span-2 grid grid-cols-2 gap-4">
                  <div className="grid w-full items-center gap-1.5">
                      <FormLabel>Invoice Number</FormLabel>
                      <Input disabled defaultValue={invoiceForm.getValues("invoiceNumber")} />
                  </div>
                  <div className="grid w-full items-center gap-1.5">
                      <FormLabel>Date</FormLabel>
                      <Input type="date" {...invoiceForm.register("invoiceDate")} />
                  </div>
                  <div className="grid w-full items-center gap-1.5">
                      <FormLabel>Due Date</FormLabel>
                      <Input type="date" {...invoiceForm.register("dueDate")} />
                  </div>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[35%]">Product</TableHead>
                      <TableHead>Qty</TableHead>
                      <TableHead>Unit Price</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[50px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField
                              control={invoiceForm.control}
                              name={`items.${index}.partId`}
                              render={({ field }) => (
                              <FormItem>
                                  <FormControl>
                                      <Combobox
                                          options={partOptions}
                                          value={field.value}
                                          onChange={(value) => {
                                              field.onChange(value);
                                              handlePartChange(index, value);
                                          }}
                                          placeholder="Select a part..."
                                          searchPlaceholder="Search by name or part number..."
                                          emptyPlaceholder="No parts found."
                                          onOpenAutoFocus={(e) => e.preventDefault()}
                                      />
                                  </FormControl>
                                  <FormMessage />
                              </FormItem>
                              )}
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            defaultValue={1}
                            {...invoiceForm.register(`items.${index}.quantity`)}
                            onChange={(e) => handleItemChange(index, 'quantity', parseInt(e.target.value))}
                            className="w-20"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            {...invoiceForm.register(`items.${index}.unitPrice`)}
                            onChange={(e) => handleItemChange(index, 'unitPrice', parseFloat(e.target.value))}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          GHS {watchItems[index]?.total.toFixed(2) || '0.00'}
                        </TableCell>
                        <TableCell>
                          <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-4"
                    onClick={addNewItem}
                  >
                    <PlusCircle className="mr-2 h-4 w-4" />
                    Add Item
                  </Button>
              </div>
              
            </CardContent>
            <CardFooter className="flex justify-end">
              <div className="w-full max-w-sm space-y-2">
                  <div className="flex justify-between font-bold text-lg">
                      <span>Total</span>
                      <span>GHS {total.toFixed(2)}</span>
                  </div>
                  <FormField
                  control={invoiceForm.control}
                  name="paidAmount"
                  render={({ field }) => (
                    <FormItem className="flex justify-between items-center">
                      <FormLabel>Amount Paid</FormLabel>
                      <FormControl>
                          <Input type="number" step="0.01" className="w-32" {...field} />
                      </FormControl>
                    </FormItem>
                  )}
                />
                <div className="flex justify-between font-bold text-lg text-primary">
                      <span>Balance Due</span>
                      <span>GHS {balanceDue.toFixed(2)}</span>
                  </div>
              </div>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </>
  );
}

    