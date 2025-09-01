
"use client";

import { useEffect, useState, useRef } from "react";
import { collection, getDocs, setDoc, doc, writeBatch, updateDoc, increment } from "firebase/firestore";
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
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Loader2, Upload, Download, Trash2 } from "lucide-react";
import { useForm, useFieldArray, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import type { Part } from "@/types";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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

  const fetchParts = async () => {
    setLoading(true);
    try {
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
      // Add option to create a new part
      options.unshift({ value: "new-part", label: "Create a new part..." });
      setPartOptions(options);

    } catch (error) {
       toast({
          variant: "destructive",
          title: "Error Fetching Data",
          description: "Could not fetch parts from Firestore.",
        });
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchParts();
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
        }
    }
  };

  async function onSubmit(data: TaxInvoiceFormValues) {
    setIsSaving(true);
    const batch = writeBatch(db);
    try {
        for (const item of data.items) {
            if (item.isNew) {
                // Add a brand new part to the inventory
                const newPartId = (Date.now() + Math.random()).toString(36);
                const tax = item.price * TAX_RATE; // Assuming new parts are taxable
                const exFactPrice = item.price + tax;

                const newPartData: Omit<Part, 'id'> = {
                    name: item.name,
                    partNumber: item.partNumber,
                    partCode: item.partNumber, // Default part code
                    description: '', // Can be added later
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
                const partRef = doc(db, "parts", newPartId);
                batch.set(partRef, newPartData);
            } else if (item.partId) {
                // Update stock for an existing part
                const partRef = doc(db, "parts", item.partId);
                batch.update(partRef, {
                    stock: increment(item.quantity)
                });
            }
        }
      
      await batch.commit();
      
      toast({
        title: "Inventory Updated",
        description: `Successfully updated stock from invoice.`,
      });
      
      form.reset();
      setIsDialogOpen(false);
      fetchParts(); // Refresh the list
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
    const csvData = Papa.unparse(parts.map(p => ({
        ID: p.id,
        Name: p.name,
        PartNumber: p.partNumber,
        PartCode: p.partCode,
        Description: p.description,
        Stock: p.stock,
        Price: p.price,
        Tax: p.tax,
        ExFactoryPrice: p.exFactPrice,
        Taxable: p.taxable,
        Brand: p.brand,
        Category: p.category,
        EquipmentModel: p.equipmentModel,
        ImageURL: p.imageUrl,
    })));

    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.setAttribute('download', 'inventory.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({ title: "Export Successful", description: "Inventory data has been downloaded." });
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
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
                const partId = (Date.now() + index).toString();

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
            description: `Successfully imported ${importedCount} parts.`,
          });
          fetchParts();
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
        <h1 className="text-2xl font-semibold">Inventory</h1>
        <div className="flex gap-2">
            <input 
                type="file" 
                ref={fileInputRef} 
                className="hidden" 
                accept=".csv"
                onChange={handleFileChange}
            />
            <Button variant="outline" onClick={() => fileInputRef.current?.click()} disabled={isSaving}>
                <Upload className="mr-2 h-4 w-4" /> Import CSV
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={parts.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export to CSV
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
                                                        value={field.partId}
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
                                                <Input type="number" step="0.01" {...form.register(`items.${index}.price`)} disabled={!currentItem.isNew} />
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
                </form>
                <DialogFooter>
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
          <CardTitle>Product List</CardTitle>
          <CardDescription>
            View and manage all your products.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Product Name</TableHead>
                  <TableHead>Part Number</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-right">Ex. Factory Price</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {parts.map((part) => (
                  <TableRow key={part.id}>
                    <TableCell className="font-medium">{part.name}</TableCell>
                    <TableCell>{part.partNumber}</TableCell>
                    <TableCell className="text-right">{part.stock}</TableCell>
                    <TableCell className="text-right">
                      GH₵{part.exFactPrice.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      {/* Action buttons (like Edit, Delete) can go here */}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

    