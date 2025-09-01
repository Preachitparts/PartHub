
"use client";

import { useState, useEffect, useMemo } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { collection, getDocs, doc, runTransaction, increment } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { useRouter } from "next/navigation";
import type { Part, Invoice, InvoiceItem } from "@/types";
import { logActivity } from "@/lib/activity-log";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
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
import { Textarea } from "@/components/ui/textarea";
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
import { Combobox } from "@/components/ui/combobox";

const invoiceItemSchema = z.object({
  partId: z.string().min(1, "Please select a part."),
  partName: z.string(),
  partNumber: z.string(),
  quantity: z.number().min(1, "Quantity must be at least 1."),
  unitPrice: z.number(), // The price before tax
  tax: z.number(),
  total: z.number(), // The price after tax (exFactPrice * quantity)
});

const invoiceSchema = z.object({
  invoiceNumber: z.string(),
  customerName: z.string().min(1, "Customer name is required."),
  customerAddress: z.string().optional(),
  customerPhone: z.string().optional(),
  invoiceDate: z.string(),
  items: z.array(invoiceItemSchema).min(1, "Please add at least one item."),
  subtotal: z.number(),
  tax: z.number(),
  total: z.number(),
});

type InvoiceFormValues = z.infer<typeof invoiceSchema>;

export default function NewInvoicePage() {
  const router = useRouter();
  const [parts, setParts] = useState<Part[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);

  const form = useForm<InvoiceFormValues>({
    resolver: zodResolver(invoiceSchema),
    defaultValues: {
      invoiceNumber: `INV-${Date.now().toString().slice(-8)}`,
      invoiceDate: new Date().toISOString().split("T")[0],
      customerName: "",
      customerAddress: "",
      customerPhone: "",
      items: [],
      subtotal: 0,
      tax: 0,
      total: 0,
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  useEffect(() => {
    async function fetchParts() {
      try {
        const partsCollection = collection(db, "parts");
        const partsSnapshot = await getDocs(partsCollection);
        const partsList = partsSnapshot.docs.map(
          (doc) => ({ id: doc.id, ...doc.data() } as Part)
        );
        setParts(partsList);
      } catch (error) {
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch parts data.",
        });
      } finally {
        setIsLoading(false);
      }
    }
    fetchParts();
  }, []);

  const watchItems = form.watch("items");

  const { subtotal, taxAmount, total } = useMemo(() => {
    const subtotal = watchItems.reduce(
      (acc, item) => acc + (item.unitPrice || 0) * (item.quantity || 0),
      0
    );
    const taxAmount = watchItems.reduce(
      (acc, item) => acc + (item.tax || 0) * (item.quantity || 0),
      0
    );
    const total = subtotal + taxAmount;
    
    // Set form values for submission
    form.setValue("subtotal", subtotal);
    form.setValue("tax", taxAmount);
    form.setValue("total", total);
    
    return { subtotal, taxAmount, total };
  }, [watchItems, form]);

  const handlePartChange = (index: number, partId: string) => {
    const selectedPart = parts.find((p) => p.id === partId);
    if (selectedPart) {
      update(index, {
        partId: selectedPart.id,
        partName: selectedPart.name,
        partNumber: selectedPart.partNumber,
        quantity: 1,
        unitPrice: selectedPart.price,
        tax: selectedPart.tax,
        total: selectedPart.exFactPrice,
      });
    }
  };

  const handleQuantityChange = (index: number, quantity: number) => {
     const item = form.getValues(`items.${index}`);
     const selectedPart = parts.find((p) => p.id === item.partId);
     if(selectedPart && quantity > selectedPart.stock) {
        toast({
            variant: "destructive",
            title: "Stock limit exceeded",
            description: `Only ${selectedPart.stock} units of ${selectedPart.name} available.`,
        });
        quantity = selectedPart.stock;
     }

     if(quantity < 1) quantity = 1;
     
     const partPrice = selectedPart?.exFactPrice || 0;
     const total = partPrice * quantity;
     update(index, { ...item, quantity, total });
  };

  const addNewItem = () => {
    append({ partId: "", quantity: 1, unitPrice: 0, total: 0, tax: 0, partName: '', partNumber: '' });
  };

  async function onSubmit(data: InvoiceFormValues) {
    setIsSaving(true);
    try {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, "invoices", data.invoiceNumber);

            // 1. Check stock for all items
            for (const item of data.items) {
                const partRef = doc(db, "parts", item.partId);
                const partDoc = await transaction.get(partRef);
                if (!partDoc.exists()) {
                    throw new Error(`Part ${item.partName} not found.`);
                }
                const currentStock = partDoc.data().stock;
                if (currentStock < item.quantity) {
                    throw new Error(`Not enough stock for ${item.partName}. Available: ${currentStock}, Requested: ${item.quantity}`);
                }
            }

            // 2. Decrement stock for all items
            for (const item of data.items) {
                const partRef = doc(db, "parts", item.partId);
                transaction.update(partRef, { stock: increment(-item.quantity) });
            }

            // 3. Save the invoice
            const invoiceToSave: Omit<Invoice, 'id'> & {date?: any} = {
                invoiceNumber: data.invoiceNumber,
                customerName: data.customerName,
                customerAddress: data.customerAddress || '',
                customerPhone: data.customerPhone || '',
                invoiceDate: data.invoiceDate,
                items: data.items.map(i => ({
                    partId: i.partId,
                    partName: i.partName,
                    partNumber: i.partNumber,
                    quantity: i.quantity,
                    unitPrice: i.unitPrice,
                    tax: i.tax,
                    total: i.total,
                })),
                subtotal: data.subtotal,
                tax: data.tax,
                total: data.total,
            };
            transaction.set(invoiceRef, invoiceToSave);
        });

      await logActivity(`Created sales invoice ${data.invoiceNumber} for ${data.customerName}.`);

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
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
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
            <div className="grid grid-cols-2 gap-6">
              <div>
                <CardTitle>Bill To</CardTitle>
                <CardDescription>
                  Enter the customer's details.
                </CardDescription>
              </div>
              <div className="flex justify-end items-start gap-4">
                 <div className="grid w-full max-w-sm items-center gap-1.5">
                    <FormLabel>Invoice Number</FormLabel>
                    <Input disabled defaultValue={form.getValues("invoiceNumber")} />
                 </div>
                 <div className="grid w-full max-w-sm items-center gap-1.5">
                    <FormLabel>Date</FormLabel>
                    <Input type="date" {...form.register("invoiceDate")} />
                 </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid md:grid-cols-3 gap-4">
              <FormField
                control={form.control}
                name="customerName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Customer Name</FormLabel>
                    <FormControl>
                      <Input placeholder="John Doe" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerPhone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Phone Number</FormLabel>
                    <FormControl>
                      <Input placeholder="+233 12 345 6789" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="customerAddress"
                render={({ field }) => (
                  <FormItem className="md:col-span-3">
                    <FormLabel>Address</FormLabel>
                    <FormControl>
                      <Textarea placeholder="123 Main St, Accra" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[40%]">Product</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead className="text-right">Unit Price</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {fields.map((field, index) => (
                    <TableRow key={field.id}>
                      <TableCell>
                        <FormField
                            control={form.control}
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
                          {...form.register(`items.${index}.quantity`, { valueAsNumber: true })}
                          onChange={(e) => handleQuantityChange(index, parseInt(e.target.value))}
                          className="w-20"
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        GH₵{form.getValues(`items.${index}.unitPrice`).toFixed(2)}
                      </TableCell>
                       <TableCell className="text-right">
                        GH₵{form.getValues(`items.${index}.total`).toFixed(2)}
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
                <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>GH₵{subtotal.toFixed(2)}</span>
                </div>
                 <div className="flex justify-between">
                    <span>Tax</span>
                    <span>GH₵{taxAmount.toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg">
                    <span>Total</span>
                    <span>GH₵{total.toFixed(2)}</span>
                </div>
            </div>
          </CardFooter>
        </Card>
      </form>
    </Form>
  );
}
