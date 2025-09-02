
"use client";

import { useState, useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, runTransaction, increment, serverTimestamp, orderBy, query, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter, useParams } from "next/navigation";
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
} from "lucide-react";
import Link from "next/link";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";

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
  paidAmount: z.preprocess((a) => parseFloat(z.string().parse(a || "0")), z.number().min(0, "Paid amount cannot be negative.")),
});


type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function EditInvoicePage() {
  const router = useRouter();
  const params = useParams();
  const invoiceId = params.id as string;
  
  const [parts, setParts] = useState<Part[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerOptions, setCustomerOptions] = useState<ComboboxOption[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);

  const invoiceForm = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      paidAmount: 0,
      items: [],
    }
  });

  const { fields, append, remove, update } = useFieldArray({
    control: invoiceForm.control,
    name: "items",
  });

  async function fetchInitialData() {
      setIsLoading(true);
      try {
        const partsSnapshot = await getDocs(collection(db, "parts"));
        const partsList = partsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Part));
        setParts(partsList);
        
        const customersSnapshot = await getDocs(query(collection(db, "customers"), orderBy("name")));
        const customersList = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
        setCustomers(customersList);
        setCustomerOptions(customersList.map(c => ({ value: c.id, label: c.name })));

        if (invoiceId) {
            const invoiceRef = doc(db, "invoices", invoiceId);
            const invoiceDoc = await getDoc(invoiceRef);
            if (invoiceDoc.exists()) {
                const invoiceData = {id: invoiceDoc.id, ...invoiceDoc.data()} as Invoice;
                setOriginalInvoice(invoiceData);
                
                invoiceForm.reset({
                    invoiceNumber: invoiceData.invoiceNumber,
                    customerId: invoiceData.customerId,
                    invoiceDate: invoiceData.invoiceDate,
                    dueDate: invoiceData.dueDate,
                    paidAmount: invoiceData.paidAmount || 0,
                    items: invoiceData.items.map(i => ({
                      ...i, 
                      total: i.total || (i.unitPrice * i.quantity)
                    }))
                });
            } else {
                 toast({ variant: "destructive", title: "Not Found", description: "Invoice not found." });
                 router.push('/dashboard/invoices');
            }
        }
      } catch (error) {
        toast({ variant: "destructive", title: "Error", description: "Could not fetch initial data." });
      } finally {
        setIsLoading(false);
      }
    }

  useEffect(() => {
    fetchInitialData();
  }, [invoiceId]);

  const watchItems = invoiceForm.watch("items");
  const watchPaidAmount = invoiceForm.watch("paidAmount");

  const { total, balanceDue } = useMemo(() => {
    const currentTotal = watchItems.reduce(
      (acc, item) => acc + (item.unitPrice || 0) * (item.quantity || 1),
      0
    );
    const balanceDueValue = currentTotal - (watchPaidAmount || 0);
    
    return { total: currentTotal, balanceDue: balanceDueValue };
  }, [watchItems, watchPaidAmount]);

  const handlePartChange = (index: number, partId: string) => {
    const selectedPart = parts.find((p) => p.id === partId);
    if (selectedPart) {
      const quantity = 1;
      update(index, {
        partId: selectedPart.id,
        partName: selectedPart.name,
        partNumber: selectedPart.partNumber,
        quantity,
        unitPrice: selectedPart.price,
        total: selectedPart.price * quantity,
      });
    }
  };

  const handleItemChange = (index: number, field: 'quantity' | 'unitPrice', value: string) => {
    const currentItems = invoiceForm.getValues('items');
    const item = { ...currentItems[index] };

    let numericValue = 0;
    if (value !== '') {
        numericValue = field === 'quantity' ? parseInt(value, 10) : parseFloat(value);
        if (isNaN(numericValue)) {
            numericValue = 0;
        }
    }
    
    item[field] = numericValue;
    item.total = item.quantity * item.unitPrice;
    
    update(index, item);
  };


  const addNewItem = () => {
    append({ partId: "", quantity: 1, unitPrice: 0, total: 0, partName: '', partNumber: '' });
  };
  
  async function onSubmit(data: InvoiceFormValues) {
    setIsSaving(true);
    if (!originalInvoice) {
        toast({ variant: "destructive", title: "Save Failed", description: "Original invoice data not found." });
        setIsSaving(false);
        return;
    }

    const selectedCustomer = customers.find(c => c.id === data.customerId);
    if (!selectedCustomer) {
        toast({ variant: "destructive", title: "Save Failed", description: "Customer not found." });
        setIsSaving(false);
        return;
    }
    
    try {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, "invoices", invoiceId);

            // 1. REVERT stock from original invoice items
            for (const item of originalInvoice.items) {
                const partRef = doc(db, "parts", item.partId);
                transaction.update(partRef, { stock: increment(item.quantity) });
            }

            // 2. READ current stock for new items and VALIDATE
            const newPartRefs = data.items.map(item => doc(db, "parts", item.partId));
            const newPartDocs = await Promise.all(newPartRefs.map(ref => transaction.get(ref)));

            for(let i = 0; i < data.items.length; i++) {
                const partDoc = newPartDocs[i];
                const item = data.items[i];
                if (!partDoc.exists()) {
                    throw new Error(`Part ${item.partName} not found.`);
                }
                const currentStock = partDoc.data().stock;
                if (currentStock < item.quantity) {
                    throw new Error(`Not enough stock for ${item.partName}. Available: ${currentStock}, Requested: ${item.quantity}.`);
                }
            }

            // 3. DEDUCT stock for new items
            for (let i = 0; i < data.items.length; i++) {
                const partRef = newPartRefs[i];
                const item = data.items[i];
                transaction.update(partRef, { stock: increment(-item.quantity) });
            }
            
            // 4. UPDATE the invoice document
            const newTotal = data.items.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
            const newBalanceDue = newTotal - data.paidAmount;
            const newStatus = newBalanceDue <= 0 ? 'Paid' : (originalInvoice.status === 'Overdue' ? 'Overdue' : 'Unpaid');

            const finalInvoiceData: Partial<Invoice> = {
                customerId: data.customerId,
                invoiceDate: data.invoiceDate,
                dueDate: data.dueDate,
                paidAmount: data.paidAmount,
                items: data.items,
                customerName: selectedCustomer.name || '',
                customerAddress: selectedCustomer.address || '',
                customerPhone: selectedCustomer.phone || '',
                total: newTotal,
                balanceDue: newBalanceDue,
                status: newStatus,
                updatedAt: serverTimestamp(),
            };
            transaction.update(invoiceRef, finalInvoiceData);
        });

        toast({ title: "Invoice Updated", description: "All changes have been saved successfully." });
        await logActivity(`Updated invoice ${invoiceId}.`);
        router.push("/dashboard/invoices");

    } catch (error: any) {
        console.error("Error saving invoice:", error);
        toast({ variant: "destructive", title: "Save Failed", description: error.message });
        
        // Re-fetch data to revert optimistic UI changes on failure
        fetchInitialData();
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
      <Form {...invoiceForm}>
        <form onSubmit={invoiceForm.handleSubmit(onSubmit)}>
          <div className="flex justify-between items-center mb-6">
              <div className="flex items-center gap-4">
                  <Button asChild variant="outline" size="icon">
                      <Link href="/dashboard/invoices">
                          <ArrowLeft />
                      </Link>
                  </Button>
                  <h1 className="text-2xl font-semibold">Edit Invoice</h1>
              </div>
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
                                />
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
                      <Input disabled {...invoiceForm.register("invoiceNumber")} />
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
                    {fields.map((field, index) => {
                      const item = watchItems[index];
                      return (
                      <TableRow key={field.id}>
                        <TableCell>
                          <FormField
                              control={invoiceForm.control}
                              name={`items.${index}.partId`}
                              render={({ field: formField }) => (
                              <FormItem>
                                  <FormControl>
                                      <Combobox
                                          options={partOptions}
                                          value={formField.value}
                                          onChange={(value) => {
                                              formField.onChange(value);
                                              handlePartChange(index, value);
                                          }}
                                          placeholder="Select a part..."
                                          searchPlaceholder="Search by name or part number..."
                                          emptyPlaceholder="No parts found."
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
                              value={item.quantity}
                              onChange={(e) => handleItemChange(index, 'quantity', e.target.value)}
                              className="w-20"
                            />
                        </TableCell>
                        <TableCell>
                           <Input
                              type="number"
                              step="0.01"
                              value={item.unitPrice}
                              onChange={(e) => handleItemChange(index, 'unitPrice', e.target.value)}
                              className="w-24"
                            />
                        </TableCell>
                        <TableCell className="text-right">
                          GHS {item?.total?.toFixed(2) || '0.00'}
                        </TableCell>
                        <TableCell className="text-center">
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                        </TableCell>
                      </TableRow>
                    )})}
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
            <CardFooter className="flex-col items-end space-y-4">
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
               <div className="flex w-full justify-end gap-2">
                    <Button asChild variant="outline" type="button">
                        <Link href="/dashboard/invoices">Cancel</Link>
                    </Button>
                    <Button type="submit" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                        Save All Changes
                    </Button>
                </div>
            </CardFooter>
          </Card>
        </form>
      </Form>
    </>
  );
}

    