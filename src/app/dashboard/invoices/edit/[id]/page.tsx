"use client";

import { useState, useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, runTransaction, increment, addDoc, serverTimestamp, orderBy, query, getDoc, updateDoc } from "firebase/firestore";
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
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";

const invoiceItemSchema = z.object({
  partId: z.string().min(1, "Please select a part."),
  partName: z.string(),
  partNumber: z.string(),
  quantity: z.preprocess((a) => parseInt(z.string().parse(a || "0"), 10), z.number().int().min(1, "Quantity must be at least 1.")),
  unitPrice: z.preprocess((a) => parseFloat(z.string().parse(a || "0")), z.number()),
  tax: z.preprocess((a) => parseFloat(z.string().parse(a || "0")), z.number()),
  exFactPrice: z.number(),
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
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  
  const [originalInvoice, setOriginalInvoice] = useState<Invoice | null>(null);

  const invoiceForm = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
  });

  const { fields, append, remove, update } = useFieldArray({
    control: invoiceForm.control,
    name: "items",
    keyName: "key",
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
                const invoiceData = invoiceDoc.data() as Invoice;
                setOriginalInvoice(invoiceData);
                invoiceForm.reset({
                    invoiceNumber: invoiceData.invoiceNumber,
                    customerId: invoiceData.customerId,
                    invoiceDate: invoiceData.invoiceDate,
                    dueDate: invoiceData.dueDate,
                    paidAmount: invoiceData.paidAmount,
                    items: invoiceData.items.map(i => ({...i, total: i.total || ((i.unitPrice + i.tax) * i.quantity)})) // Ensure total is calculated
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

  const { subtotal, taxAmount, total, balanceDue } = useMemo(() => {
    const subtotal = (watchItems || []).reduce(
      (acc, item) => acc + (item.unitPrice || 0) * (item.quantity || 1),
      0
    );
    const taxAmount = (watchItems || []).reduce(
      (acc, item) => acc + (item.tax || 0) * (item.quantity || 1),
      0
    );
    const total = subtotal + taxAmount;
    const balanceDue = total - (watchPaidAmount || 0);
    
    return { subtotal, taxAmount, total, balanceDue };
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
        tax: selectedPart.tax,
        exFactPrice: selectedPart.exFactPrice,
        total: selectedPart.exFactPrice * quantity,
      });
    }
  };

  const handleItemChange = (index: number, field: 'quantity' | 'unitPrice' | 'tax', value: number) => {
    const item = invoiceForm.getValues(`items.${index}`);
    if (!item) return;

    const currentItem = { ...item, [field]: value };
    
    if (field === 'quantity') {
        if (value < 1) currentItem.quantity = 1;
    }

    const exFactPrice = (currentItem.unitPrice || 0) + (currentItem.tax || 0);
    const total = exFactPrice * (currentItem.quantity || 1);
    
    update(index, { ...currentItem, exFactPrice, total });
  };

  const addNewItem = () => {
    append({ partId: "", quantity: 1, unitPrice: 0, total: 0, tax: 0, exFactPrice: 0, partName: '', partNumber: '' });
  };

  const handleSaveItem = async (index: number) => {
      const itemToSave = invoiceForm.getValues(`items.${index}`);
      if (!itemToSave.partId) {
          toast({ variant: "destructive", title: "Cannot Save", description: "Please select a part first."});
          return;
      }
      setSavingItemId(itemToSave.partId);

      try {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, "invoices", invoiceId);
            const freshInvoiceDoc = await transaction.get(invoiceRef);
            if (!freshInvoiceDoc.exists()) throw new Error("Invoice not found.");

            const currentInvoiceData = freshInvoiceDoc.data() as Invoice;
            const originalItem = currentInvoiceData.items.find(i => i.partId === itemToSave.partId);
            const isNewItem = !originalItem;

            // Revert stock if it's an existing item
            if (originalItem) {
                const partToRevertRef = doc(db, "parts", originalItem.partId);
                transaction.update(partToRevertRef, { stock: increment(originalItem.quantity) });
            }

            // Check stock for the item being saved
            const partRef = doc(db, "parts", itemToSave.partId);
            const partDoc = await transaction.get(partRef);
            if (!partDoc.exists()) throw new Error(`Part ${itemToSave.partName} not found.`);
            const currentStock = partDoc.data().stock;

            if (currentStock < itemToSave.quantity) {
                // If stock is not enough, we must not commit the transaction.
                // We need to roll back the reverted stock if we reverted it.
                // The easiest way is to just throw an error, which Firestore transactions handle automatically.
                throw new Error(`Not enough stock for ${itemToSave.partName}. Available: ${currentStock}, Requested: ${itemToSave.quantity}`);
            }

            // Decrement new stock
            transaction.update(partRef, { stock: increment(-itemToSave.quantity) });

            // Update items array in invoice
            let updatedItems: InvoiceItem[];
            if (isNewItem) {
                updatedItems = [...currentInvoiceData.items, itemToSave];
            } else {
                updatedItems = currentInvoiceData.items.map(item =>
                    item.partId === itemToSave.partId ? itemToSave : item
                );
            }
            
            // Recalculate totals and update invoice
            const newSubtotal = updatedItems.reduce((acc, item) => acc + item.unitPrice * item.quantity, 0);
            const newTax = updatedItems.reduce((acc, item) => acc + item.tax * item.quantity, 0);
            const newTotal = newSubtotal + newTax;
            const newBalanceDue = newTotal - currentInvoiceData.paidAmount;
            const newStatus = newBalanceDue <= 0 ? 'Paid' : 'Unpaid';
            
            transaction.update(invoiceRef, {
                items: updatedItems,
                subtotal: newSubtotal,
                tax: newTax,
                total: newTotal,
                balanceDue: newBalanceDue,
                status: newStatus,
                updatedAt: serverTimestamp()
            });
        });

        toast({ title: "Item Saved", description: `${itemToSave.partName} has been saved.` });
        await logActivity(`Updated item ${itemToSave.partName} on invoice ${originalInvoice?.invoiceNumber}.`);
        await fetchInitialData(); // Refresh all data

      } catch (error: any) {
          console.error("Error saving item:", error);
          toast({ variant: "destructive", title: "Save Failed", description: error.message });
      } finally {
          setSavingItemId(null);
      }
  };

  async function onInvoiceDetailsSubmit(data: InvoiceFormValues) {
    setIsSaving(true);
    const selectedCustomer = customers.find(c => c.id === data.customerId);
    if (!selectedCustomer) {
        toast({ variant: "destructive", title: "Customer not found."});
        setIsSaving(false);
        return;
    }

    try {
        const invoiceRef = doc(db, "invoices", invoiceId);
        
        // Recalculate totals just in case
        const currentItems = invoiceForm.getValues("items");
        const subtotal = currentItems.reduce((acc, item) => acc + (item.unitPrice || 0) * (item.quantity || 1), 0);
        const tax = currentItems.reduce((acc, item) => acc + (item.tax || 0) * (item.quantity || 1), 0);
        const total = subtotal + tax;
        const balanceDue = total - (data.paidAmount || 0);
        const status = balanceDue <= 0 ? 'Paid' : 'Unpaid';

        const detailsToUpdate = {
            customerId: data.customerId,
            customerName: selectedCustomer.name,
            customerAddress: selectedCustomer.address || '',
            customerPhone: selectedCustomer.phone || '',
            invoiceDate: data.invoiceDate,
            dueDate: data.dueDate,
            paidAmount: data.paidAmount,
            balanceDue,
            status,
            subtotal,
            tax,
            total,
            updatedAt: serverTimestamp(),
        };

        await updateDoc(invoiceRef, detailsToUpdate);

      await logActivity(`Updated details for invoice ${data.invoiceNumber} for ${selectedCustomer.name}.`);

      toast({
        title: "Invoice Details Updated",
        description: `Invoice ${data.invoiceNumber} details have been successfully updated.`,
      });
      fetchInitialData(); // Refresh data

    } catch (error: any) {
      console.error("Error updating invoice details:", error);
      toast({
        variant: "destructive",
        title: "Update Failed",
        description: error.message || "Could not update the invoice details. Please try again.",
      });
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
        <form onSubmit={invoiceForm.handleSubmit(onInvoiceDetailsSubmit)}>
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
                      <TableHead>Tax</TableHead>
                      <TableHead className="text-right">Total</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {fields.map((field, index) => {
                      const item = watchItems[index];
                      const isItemSaving = savingItemId === item?.partId;
                      return (
                      <TableRow key={field.key}>
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
                        <TableCell>
                          <Input
                            type="number"
                            step="0.01"
                            {...invoiceForm.register(`items.${index}.tax`)}
                            onChange={(e) => handleItemChange(index, 'tax', parseFloat(e.target.value))}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          GHS {item?.total.toFixed(2) || '0.00'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button type="button" variant="ghost" size="icon" onClick={() => handleSaveItem(index)} disabled={isItemSaving}>
                                {isItemSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-primary" />}
                            </Button>
                            <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </div>
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
            <CardFooter className="flex justify-end">
              <div className="w-full max-w-sm space-y-2">
                  <div className="flex justify-between">
                      <span>Subtotal</span>
                      <span>GHS {subtotal.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between">
                      <span>Tax</span>
                      <span>GHS {taxAmount.toFixed(2)}</span>
                  </div>
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
          
           <div className="flex justify-end items-center mt-6 gap-2">
                <Button asChild variant="outline">
                    <Link href="/dashboard/invoices">
                        Cancel
                    </Link>
                </Button>
                <Button type="submit" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    Save Invoice Details
                </Button>
            </div>
        </form>
      </Form>
    </>
  );
}
