
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { collection, getDocs, setDoc, doc, writeBatch, increment, Timestamp, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Loader2, Upload, Download, Trash2, Eye } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import type { Part, TaxInvoice } from "@/types";
import Papa from "papaparse";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";


const TAX_RATE = 0.219; // 21.9%

const taxInvoiceItemSchema = z.object({
    partId: z.string().optional(),
    name: z.string().min(1, "Part name is required."),
    partNumber: z.string().min(1, "Part number is required."),
    price: z.preprocess((a) => parseFloat(z.string().parse(a)), z.number().min(0, "Price must be a positive number.")),
    quantity: z.preprocess((a) => parseInt(z.string().parse(a), 10), z.number().int().min(1, "Quantity must be at least 1.")),
    isNew: z.boolean().default(false),
});

const taxInvoiceSchema = z.object({
    supplierName: z.string().min(1, "Supplier name is required."),
    invoiceNumber: z.string().optional(),
    items: z.array(taxInvoiceItemSchema).min(1, "Please add at least one item."),
});

type TaxInvoiceFormValues = z.infer<typeof taxInvoiceSchema>;

export default function InventoryPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [taxInvoices, setTaxInvoices] = useState<TaxInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [partOptions, setPartOptions] = useState<ComboboxOption[]>([]);

  const form = useForm<TaxInvoiceFormValues>({
    resolver: zodResolver(taxInvoiceSchema),
    defaultValues: {
      supplierName: "",
      invoiceNumber: "",
      items: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
  });

  const watchItems = form.watch("items");

  const totalAmount = useMemo(() => {
    return watchItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  }, [watchItems]);

  const fetchData = async () => {
    setLoading(true);
    try {
      // Fetch parts for the combobox
      const partsCollection = collection(db, "parts");
      const partsSnapshot = await getDocs(partsCollection);
      const partsList = partsSnapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id } as Part)
      );
      setParts(partsList.sort((a,b) => a.name.localeCompare(b.name)));
      
      const options = partsList.map(part => ({
        value: part.id,
        label: `${part.name} (${part.partNumber})`
      }));
      options.unshift({ value: "new-part", label: "Create a new part..." });
      setPartOptions(options);

      // Fetch tax invoices for the main table
      const taxInvoicesQuery = query(collection(db, "taxInvoices"), orderBy("date", "desc"));
      const invoicesSnapshot = await getDocs(taxInvoicesQuery);
      const invoicesList = invoicesSnapshot.docs.map(doc => ({...doc.data(), id: doc.id} as TaxInvoice));
      setTaxInvoices(invoicesList);

    } catch (error) {
       toast({
          variant: "destructive",
          title: "Error Fetching Data",
          description: "Could not fetch data from Firestore. Check console for details.",
        });
        console.error("Error fetching data:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handlePartSelection = (index: number, value: string) => {
    if (value === "new-part") {
        update(index, {
            ...fields[index],
            partId: '',
            name: '',
            partNumber: '',
            price: 0,
            isNew: true,
        });
    } else {
        const selectedPart = parts.find(p => p.id === value);
        if (selectedPart) {
            update(index, {
                partId: selectedPart.id,
                name: selectedPart.name,
                partNumber: selectedPart.partNumber,
                price: selectedPart.price,
                quantity: 1,
                isNew: false,
            });
            form.setValue(`items.${index}.price`, selectedPart.price); // Ensure price is updated in the form state
        }
    }
  };

  async function onSubmit(data: TaxInvoiceFormValues) {
    setIsSaving(true);
    const partsBatch = writeBatch(db);
    try {
        const newPartsData: Omit<Part, 'id'>[] = [];
        
        for (const item of data.items) {
            if (item.isNew) {
                // Prepare to add a brand new part to the inventory
                const tax = item.price * TAX_RATE;
                const exFactPrice = item.price + tax;

                const newPartData: Omit<Part, 'id'> = {
                    name: item.name,
                    partNumber: item.partNumber,
                    partCode: item.partNumber, 
                    description: '', 
                    price: item.price,
                    stock: item.quantity,
                    taxable: true,
                    tax,
                    exFactPrice,
                    brand: '',
                    category: '',
                    equipmentModel: '',
                    imageUrl: "https://placehold.co/600x400",
                };

                const partId = doc(collection(db, "parts")).id;
                const partRef = doc(db, "parts", partId);
                partsBatch.set(partRef, newPartData);
            } else if (item.partId) {
                // Update stock for an existing part
                const partRef = doc(db, "parts", item.partId);
                partsBatch.update(partRef, {
                    stock: increment(item.quantity)
                });
            }
        }
      
        await partsBatch.commit();
        
        // Now create the Tax Invoice document
        const invoiceId = `SUP-${Date.now().toString().slice(-8)}`;
        const newTaxInvoice: Omit<TaxInvoice, 'id'> = {
            invoiceId,
            supplierName: data.supplierName,
            supplierInvoiceNumber: data.invoiceNumber || '',
            date: Timestamp.now(),
            totalAmount,
            items: data.items.map(i => ({...i})), // ensure plain objects
        };

        await setDoc(doc(db, "taxInvoices", invoiceId), newTaxInvoice);
      
        toast({
            title: "Inventory Updated",
            description: `Successfully created Tax Invoice ${invoiceId} and updated stock.`,
        });
      
        form.reset();
        setIsDialogOpen(false);
        fetchData(); // Refresh both parts and invoices list
    } catch (error) {
      console.error("Error saving invoice:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Could not update inventory. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }
  
  const addNewItem = () => {
    append({ partId: "", name: "", partNumber: "", price: 0, quantity: 1, isNew: false });
  };


  const handleExport = () => {
    const csvData = Papa.unparse(taxInvoices.map(inv => ({
        InvoiceID: inv.invoiceId,
        Supplier: inv.supplierName,
        Date: inv.date.toDate().toLocaleDateString(),
        TotalAmount: inv.totalAmount.toFixed(2),
        ItemCount: inv.items.length,
    })));

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'tax_invoices.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: "Export Successful", description: "Tax invoice data has been downloaded." });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // This is now more complex as we import parts, not invoices.
    // Keeping part import functionality as requested earlier.
    const file = event.target.files?.[0];
    if (file) {
      parseCsv(file);
    }
  };

  const parseCsv = (file: File) => {
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        setIsSaving(true);
        try {
          const importedParts = results.data as any[];
          if(importedParts.length === 0) {
            toast({ variant: "destructive", title: "Import Error", description: "CSV file is empty or invalid." });
            return;
          }

          const batch = writeBatch(db);
          let importedCount = 0;
          
          importedParts.forEach((row, index) => {
             const partNumber = row['Part Number'] || row['PartNumber'] || row['partNumber'];
             const name = row['Description'] || row['Name'] || row['name'];
             const stock = parseInt(row['Quantity'] || row['Stock'] || row['stock'] || '0', 10);
             
             if(partNumber && name) {
                const price = parseFloat(row['Price'] || row['price'] || '0');
                const taxable = (row['Taxable'] || row['taxable'] || 'true').toLowerCase() === 'true';
                const tax = taxable ? price * TAX_RATE : 0;
                const exFactPrice = price + tax;
                const partId = doc(collection(db, 'parts')).id;

                const newPartData: Omit<Part, 'id'> = {
                    name: name,
                    partNumber: partNumber,
                    partCode: row['Part Code'] || row['PartCode'] || row['partCode'] || partNumber,
                    description: row['Description'] || name,
                    price: price,
                    stock: stock,
                    taxable: taxable,
                    tax: tax,
                    exFactPrice: exFactPrice,
                    brand: row['Brand'] || row['brand'] || '',
                    category: row['Category'] || row['category'] || '',
                    equipmentModel: row['Equipment Model'] || row['EquipmentModel'] || row['equipmentModel'] || '',
                    imageUrl: row['Image URL'] || row['ImageURL'] || row['imageUrl'] || "https://placehold.co/600x400",
                };

                const partRef = doc(db, "parts", partId);
                batch.set(partRef, newPartData);
                importedCount++;
             }
          });
          
          await batch.commit();

          toast({
            title: "Import Successful",
            description: `Successfully imported ${importedCount} parts. This does not create a Tax Invoice record.`,
          });
          fetchData();
        } catch (error) {
           console.error("Error importing CSV:", error);
           toast({
              variant: "destructive",
              title: "Import Failed",
              description: "Could not import parts from CSV. Please check the file format and console for errors.",
           });
        } finally {
            setIsSaving(false);
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
      },
      error: (error: any) => {
        toast({
          variant: "destructive",
          title: "Import Error",
          description: `Error parsing CSV file: ${error.message}`,
        });
      },
    });
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Inventory - Incoming Stock</h1>
        <div className="flex gap-2">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv"
                onChange={handleFileChange}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
                <Upload className="mr-2 h-4 w-4" /> Import Parts CSV
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={taxInvoices.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export Invoices CSV
            </Button>
            <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
                <Button>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Tax Invoice
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                <DialogTitle>Add New Tax Invoice</DialogTitle>
                <DialogDescription>
                    Record a new tax invoice from a supplier to add or update stock.
                </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} id="tax-invoice-form">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
                        <div>
                            <Label htmlFor="supplierName">Supplier Name</Label>
                            <Input id="supplierName" {...form.register("supplierName")} />
                            {form.formState.errors.supplierName && <p className="text-destructive text-xs">{form.formState.errors.supplierName.message}</p>}
                        </div>
                        <div>
                            <Label htmlFor="invoiceNumber">Supplier Invoice Number (Optional)</Label>
                            <Input id="invoiceNumber" {...form.register("invoiceNumber")} />
                        </div>
                    </div>
                    <div className="max-h-[40vh] overflow-y-auto pr-2">
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead className="w-[35%]">Part</TableHead>
                                    <TableHead>Part Number</TableHead>
                                    <TableHead>Cost Price</TableHead>
                                    <TableHead>Quantity</TableHead>
                                    <TableHead></TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {fields.map((field, index) => {
                                    const currentItem = form.watch(`items.${index}`);
                                    return (
                                        <TableRow key={field.id}>
                                            <TableCell>
                                                {currentItem.isNew ? (
                                                    <Input placeholder="New Part Name" {...form.register(`items.${index}.name`)} />
                                                ) : (
                                                    <Combobox
                                                        options={partOptions}
                                                        value={currentItem.partId}
                                                        onChange={(value) => handlePartSelection(index, value)}
                                                        placeholder="Select a part..."
                                                        searchPlaceholder="Search parts..."
                                                        emptyPlaceholder="No parts found."
                                                    />
                                                )}
                                            </TableCell>
                                            <TableCell>
                                                <Input placeholder="Part Number" {...form.register(`items.${index}.partNumber`)} disabled={!currentItem.isNew} />
                                            </TableCell>
                                            <TableCell>
                                                <Input type="number" step="0.01" {...form.register(`items.${index}.price`)} />
                                            </TableCell>
                                            <TableCell>
                                                <Input type="number" {...form.register(`items.${index}.quantity`)} />
                                            </TableCell>
                                            <TableCell>
                                                <Button variant="ghost" size="icon" onClick={() => remove(index)}>
                                                    <Trash2 className="h-4 w-4 text-destructive" />
                                                </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
                            </TableBody>
                        </Table>
                    </div>
                     <div className="flex justify-between items-center mt-4">
                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={addNewItem}
                            >
                            <PlusCircle className="mr-2 h-4 w-4" />
                            Add Item
                        </Button>
                        <div className="text-right font-semibold">
                            Total Invoice Amount: GH₵{totalAmount.toFixed(2)}
                        </div>
                    </div>
                </form>
                <DialogFooter className="mt-4">
                    <Button variant="outline" onClick={() => { setIsDialogOpen(false); form.reset(); }}>Cancel</Button>
                    <Button type="submit" form="tax-invoice-form" disabled={isSaving}>
                        {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Save Invoice & Update Stock
                    </Button>
                </DialogFooter>
            </DialogContent>
            </Dialog>
        </div>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Received Goods (Tax Invoices)</CardTitle>
          <CardDescription>
            A history of all stock received from suppliers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : taxInvoices.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice ID</TableHead>
                  <TableHead>Supplier</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {taxInvoices.map((invoice) => (
                  <TableRow key={invoice.id}>
                    <TableCell className="font-medium">{invoice.invoiceId}</TableCell>
                    <TableCell>{invoice.supplierName}</TableCell>
                    <TableCell>{invoice.date.toDate().toLocaleDateString()}</TableCell>
                    <TableCell className="text-right">
                      GH₵{invoice.totalAmount.toFixed(2)}
                    </TableCell>
                    <TableCell>
                       <Button variant="ghost" size="icon">
                            <Eye className="h-4 w-4" />
                       </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
             <div className="text-center py-10">
                <p className="text-muted-foreground">No tax invoices have been recorded yet.</p>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
