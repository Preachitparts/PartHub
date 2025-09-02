
"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { collection, getDocs, setDoc, doc, writeBatch, increment, Timestamp, query, orderBy, getDoc, updateDoc, runTransaction, deleteDoc } from "firebase/firestore";
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
} from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Loader2, Upload, Download, Trash2, Eye, Pencil, Save } from "lucide-react";
import { useForm, useFieldArray } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import type { Part, TaxInvoice, TaxInvoiceItem } from "@/types";
import Papa from "papaparse";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { logActivity } from "@/lib/activity-log";

const taxInvoiceItemSchema = z.object({
    partId: z.string().optional(),
    name: z.string().min(1, "Part name is required."),
    partNumber: z.string().min(1, "Part number is required."),
    price: z.preprocess((val) => Number(val), z.number().min(0, "Price must be a positive number.")),
    quantity: z.preprocess((val) => Number(val), z.number().int().min(1, "Quantity must be at least 1.")),
    isNew: z.boolean().default(false),
});

const taxInvoiceSchema = z.object({
    id: z.string().optional(), // To hold the ID when editing
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
  const [isFormDialogOpen, setIsFormDialogOpen] = useState(false);
  const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [invoiceToDelete, setInvoiceToDelete] = useState<TaxInvoice | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<TaxInvoice | null>(null);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const [partOptions, setPartOptions] = useState<ComboboxOption[]>([]);
  const [dialogMode, setDialogMode] = useState<'add' | 'edit'>('add');
  const [savingItemId, setSavingItemId] = useState<string | null>(null);


  const form = useForm<TaxInvoiceFormValues>({
    resolver: zodResolver(taxInvoiceSchema),
    defaultValues: {
      id: '',
      supplierName: "",
      invoiceNumber: "",
      items: [],
    },
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "items",
    keyName: "key"
  });

  const watchItems = form.watch("items");

  const totalAmount = useMemo(() => {
    return watchItems.reduce((total, item) => total + ((item.price || 0) * (item.quantity || 0)), 0);
  }, [watchItems]);

  const fetchData = async () => {
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
      options.unshift({ value: "new-part", label: "Create a new part..." });
      setPartOptions(options);

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
            quantity: 1,
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
            form.setValue(`items.${index}.price`, selectedPart.price, { shouldDirty: true });
        }
    }
  };

  const handleAddNewInvoice = () => {
    form.reset({
        id: '',
        supplierName: "",
        invoiceNumber: "",
        items: [],
    });
    setDialogMode('add');
    setIsFormDialogOpen(true);
  };

  const handleEditInvoice = (invoice: TaxInvoice) => {
    form.reset({
        id: invoice.id,
        supplierName: invoice.supplierName,
        invoiceNumber: invoice.supplierInvoiceNumber,
        items: invoice.items.map(item => ({
            partId: item.partId,
            name: item.name,
            partNumber: item.partNumber,
            price: item.price,
            quantity: item.quantity,
            isNew: !!item.isNew,
        }))
    });
    setDialogMode('edit');
    setIsFormDialogOpen(true);
  };


  async function onSubmit(data: TaxInvoiceFormValues) {
    setIsSaving(true);
    try {
      if (dialogMode === 'add') {
          await createNewInvoice(data);
          toast({ title: "Invoice Created", description: `Successfully created new tax invoice.` });
      } else {
          await updateExistingInvoice(data);
          toast({ title: "Invoice Updated", description: `Successfully updated supplier details.` });
      }
      setIsFormDialogOpen(false);
      await fetchData();
    } catch (error: any) {
        toast({ variant: "destructive", title: "Operation Failed", description: error.message || "An unexpected error occurred." });
        console.error("Error during form submission:", error);
    } finally {
        setIsSaving(false);
    }
  }

  async function createNewInvoice(data: TaxInvoiceFormValues) {
    const batch = writeBatch(db);
    
    const invoiceId = `SUP-${Date.now().toString().slice(-8)}`;
    const invoiceRef = doc(db, "taxInvoices", invoiceId);

    const invoiceItems: TaxInvoiceItem[] = [];
    
    for (const item of data.items) {
        let finalItem: TaxInvoiceItem = { ...item, isNew: false };

        if (item.isNew && !item.partId) {
            const newPartRef = doc(collection(db, 'parts'));
            const newPartData: Omit<Part, 'id'> = {
                name: item.name, partNumber: item.partNumber, partCode: item.partNumber, 
                description: '', price: item.price, stock: item.quantity,
                brand: '', category: '', equipmentModel: '', imageUrl: "https://placehold.co/600x400",
            };
            batch.set(newPartRef, newPartData);
            
            finalItem.partId = newPartRef.id;
        } else if (item.partId) {
            const partRef = doc(db, "parts", item.partId);
            batch.update(partRef, { stock: increment(item.quantity) });
        }

        invoiceItems.push(finalItem);
    }
    
    const finalTotalAmount = invoiceItems.reduce((total, item) => total + (item.price * item.quantity), 0);
  
    const newTaxInvoice: Omit<TaxInvoice, 'id'> = {
        invoiceId, supplierName: data.supplierName, supplierInvoiceNumber: data.invoiceNumber || '',
        date: Timestamp.now(), totalAmount: finalTotalAmount, items: invoiceItems,
    };

    batch.set(invoiceRef, newTaxInvoice);
    await batch.commit();
    await logActivity(`Created new tax invoice ${invoiceId} from ${data.supplierName}.`);
  }

  async function updateExistingInvoice(data: TaxInvoiceFormValues) {
    if (!data.id) throw new Error("Invoice ID is missing for update.");
    const invoiceRef = doc(db, "taxInvoices", data.id);
    
    const originalInvoiceDoc = await getDoc(invoiceRef);
    if (!originalInvoiceDoc.exists()) throw new Error("Original invoice not found.");
    const originalInvoice = originalInvoiceDoc.data() as TaxInvoice;
    
    await runTransaction(db, async (transaction) => {
        transaction.update(invoiceRef, {
            supplierName: data.supplierName,
            supplierInvoiceNumber: data.invoiceNumber || '',
        });

        const stockAdjustments = new Map<string, number>();

        originalInvoice.items.forEach(item => {
            if (item.partId) {
                stockAdjustments.set(item.partId, (stockAdjustments.get(item.partId) || 0) - item.quantity);
            }
        });

        const newItems: TaxInvoiceItem[] = [];
        for (const item of data.items) {
            let finalItem = { ...item };
            if (item.isNew && !item.partId) {
                const newPartRef = doc(collection(db, 'parts'));
                const newPartId = newPartRef.id;
                const newPartData: Omit<Part, 'id'> = {
                    name: item.name, partNumber: item.partNumber, partCode: item.partNumber,
                    description: '', price: item.price, stock: 0, 
                    brand: '', category: '', equipmentModel: '', imageUrl: "https://placehold.co/600x400",
                };
                transaction.set(newPartRef, newPartData);
                finalItem.partId = newPartId;
                finalItem.isNew = false;
            }

            if (finalItem.partId) {
                stockAdjustments.set(finalItem.partId, (stockAdjustments.get(finalItem.partId) || 0) + item.quantity);
            }
            newItems.push(finalItem);
        }

        for (const [partId, adjustment] of stockAdjustments.entries()) {
            const partRef = doc(db, "parts", partId);
            transaction.update(partRef, { stock: increment(adjustment) });
        }

        const newTotalAmount = newItems.reduce((total, item) => total + (item.price * item.quantity), 0);
        
        transaction.update(invoiceRef, {
            items: newItems,
            totalAmount: newTotalAmount,
            date: Timestamp.now()
        });
    });

    await logActivity(`Updated tax invoice from ${data.supplierName}.`);
  }

  const handleDeleteInvoice = async () => {
    if (!invoiceToDelete) return;
    setIsDeleting(true);

    try {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, "taxInvoices", invoiceToDelete.id);
            
            for (const item of invoiceToDelete.items) {
                if (item.partId) {
                    const partRef = doc(db, "parts", item.partId);
                    transaction.update(partRef, { stock: increment(-item.quantity) });
                }
            }

            transaction.delete(invoiceRef);
        });

        toast({ title: "Invoice Deleted", description: `Invoice ${invoiceToDelete.invoiceId} has been deleted.` });
        await logActivity(`Deleted tax invoice ${invoiceToDelete.invoiceId}.`);
        setInvoiceToDelete(null);
        fetchData();
    } catch (error: any) {
        console.error("Failed to delete invoice:", error);
        toast({ variant: "destructive", title: "Deletion Failed", description: error.message });
    } finally {
        setIsDeleting(false);
    }
  };

  const handleSaveItem = async (index: number) => {
    const itemToSave = form.getValues(`items.${index}`);
    const invoiceId = form.getValues('id');
    if (!invoiceId) {
        toast({ variant: "destructive", title: "Save Error", description: "Cannot save item without an invoice ID." });
        return;
    }
    
    setSavingItemId(itemToSave.partId || itemToSave.name);

    try {
        await runTransaction(db, async (transaction) => {
            const invoiceRef = doc(db, "taxInvoices", invoiceId);
            const invoiceDoc = await transaction.get(invoiceRef);
            if (!invoiceDoc.exists()) throw new Error("Invoice not found.");

            const invoiceData = invoiceDoc.data() as TaxInvoice;
            const originalItems = invoiceData.items;
            const originalItem = originalItems.find(it => it.partId === itemToSave.partId && !it.isNew);

            let stockAdjustment = 0;
            let finalItemData = { ...itemToSave };

            if (itemToSave.isNew && !itemToSave.partId) { 
                const newPartRef = doc(collection(db, 'parts'));
                const newPartId = newPartRef.id;

                const newPartData: Omit<Part, 'id'> = {
                    name: itemToSave.name, partNumber: itemToSave.partNumber, partCode: itemToSave.partNumber,
                    description: '', price: itemToSave.price, stock: itemToSave.quantity,
                    brand: '', category: '', equipmentModel: '', imageUrl: "https://placehold.co/600x400",
                };
                transaction.set(newPartRef, newPartData);
                
                finalItemData.partId = newPartId;
                finalItemData.isNew = false;
                stockAdjustment = itemToSave.quantity;
                await logActivity(`Created new part '${itemToSave.name}' via tax invoice edit.`);
            } else if (itemToSave.partId) {
                 const partRef = doc(db, "parts", itemToSave.partId);
                 const originalQty = originalItem ? originalItem.quantity : 0;
                 stockAdjustment = itemToSave.quantity - originalQty;
                 transaction.update(partRef, { stock: increment(stockAdjustment) });
                 await logActivity(`Adjusted stock for '${itemToSave.name}' by ${stockAdjustment} via tax invoice edit.`);
            }

            let updatedItems = [...originalItems];
            if (originalItem) {
                updatedItems = originalItems.map(item => item.partId === finalItemData.partId ? finalItemData : item);
            } else if (finalItemData.partId) {
                updatedItems.push(finalItemData);
            }

            const newTotalAmount = updatedItems.reduce((total, item) => total + (item.price * item.quantity), 0);

            transaction.update(invoiceRef, {
                items: updatedItems,
                totalAmount: newTotalAmount,
                date: Timestamp.now(),
            });

            if(itemToSave.isNew && finalItemData.partId) {
                update(index, finalItemData);
            }
        });

        toast({ title: "Item Saved", description: `${itemToSave.name} has been updated.` });
        await fetchData();

    } catch (error: any) {
        console.error("Failed to save item:", error);
        toast({ variant: "destructive", title: "Save Failed", description: error.message });
    } finally {
        setSavingItemId(null);
    }
  };

  const addNewItem = () => {
    append({ partId: "", name: "", partNumber: "", price: 0, quantity: 1, isNew: true });
  };

  const handleViewInvoice = (invoice: TaxInvoice) => {
    setSelectedInvoice(invoice);
    setIsViewDialogOpen(true);
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
          const importedData = results.data as any[];
          if (importedData.length === 0) {
            toast({ variant: "destructive", title: "Import Error", description: "CSV file is empty or invalid." });
            return;
          }

          const batch = writeBatch(db);
          const invoiceItems: TaxInvoiceItem[] = [];
          let totalInvoiceAmount = 0;
          
          for (const row of importedData) {
             const partNumber = row['Part Number'] || row['PartNumber'] || row['partNumber'];
             const name = row['Description'] || row['Name'] || row['name'];
             const quantity = parseInt(row['Quantity'] || row['Stock'] || row['stock'] || '0', 10);
             const price = parseFloat(row['Price'] || row['price'] || '0');
             
             if(partNumber && name && quantity > 0 && price >= 0) {
                const partRef = doc(collection(db, 'parts'));
                const partId = partRef.id;

                const newPartData: Omit<Part, 'id'> = {
                    name: name,
                    partNumber: partNumber,
                    partCode: row['Part Code'] || row['PartCode'] || row['partCode'] || partNumber,
                    description: row['Description'] || name,
                    price: price,
                    stock: quantity,
                    brand: row['Brand'] || row['brand'] || '',
                    category: row['Category'] || row['category'] || '',
                    equipmentModel: row['Equipment Model'] || row['EquipmentModel'] || row['equipmentModel'] || '',
                    imageUrl: row['Image URL'] || row['ImageURL'] || row['imageUrl'] || "https://placehold.co/600x400",
                };

                batch.set(partRef, newPartData);

                invoiceItems.push({
                    partId: partId,
                    name: name,
                    partNumber: partNumber,
                    price: price,
                    quantity: quantity,
                    isNew: true,
                });

                totalInvoiceAmount += price * quantity;
             }
          };
          
          if (invoiceItems.length > 0) {
            const invoiceId = `SUP-IMPORT-${Date.now().toString().slice(-6)}`;
            const newTaxInvoice: Omit<TaxInvoice, 'id'> = {
                invoiceId,
                supplierName: "CSV Import",
                supplierInvoiceNumber: file.name,
                date: Timestamp.now(),
                totalAmount: totalInvoiceAmount,
                items: invoiceItems,
            };
            const invoiceRef = doc(db, "taxInvoices", invoiceId);
            batch.set(invoiceRef, newTaxInvoice);
          } else {
             throw new Error("No valid rows found in CSV to import.");
          }

          await batch.commit();

          toast({
            title: "Import Successful",
            description: `Successfully imported ${invoiceItems.length} parts and created a new Tax Invoice.`,
          });
          await logActivity(`Imported ${invoiceItems.length} parts from ${file.name}.`);
          await fetchData();
        } catch (error: any) {
           console.error("Error importing CSV:", error);
           toast({
              variant: "destructive",
              title: "Import Failed",
              description: error.message || "Could not import parts from CSV. Please check the file format and console for errors.",
           });
        } finally {
            setIsSaving(false);
            if(fileInputRef.current) {
                fileInputRef.current.value = "";
            }
        }
      },
      error: (error: any) => {
        setIsSaving(false);
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
                {isSaving && fileInputRef.current?.files?.length ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
                Import Parts CSV
            </Button>
            <Button variant="outline" onClick={handleExport} disabled={taxInvoices.length === 0}>
                <Download className="mr-2 h-4 w-4" /> Export Invoices CSV
            </Button>
            <Button onClick={handleAddNewInvoice}>
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Tax Invoice
            </Button>
        </div>
      </div>

      <Dialog open={isFormDialogOpen} onOpenChange={setIsFormDialogOpen}>
          <DialogContent className="sm:max-w-4xl">
              <DialogHeader>
              <DialogTitle>{dialogMode === 'add' ? 'Add New Tax Invoice' : 'Edit Tax Invoice'}</DialogTitle>
              <DialogDescription>
                  {dialogMode === 'add' ? 'Record a new tax invoice from a supplier to add or update stock.' : 'Update the details of this tax invoice.'}
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
                                  <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                          </TableHeader>
                          <TableBody>
                              {fields.map((field, index) => {
                                  const currentItem = form.watch(`items.${index}`);
                                  const isItemSaving = savingItemId === (currentItem.partId || currentItem.name);
                                  return (
                                      <TableRow key={field.key}>
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
                                                      onOpenAutoFocus={(e) => e.preventDefault()}
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
                                          <TableCell className="text-right">
                                               {dialogMode === 'edit' && (
                                                <Button type="button" variant="ghost" size="icon" onClick={() => handleSaveItem(index)} disabled={isItemSaving}>
                                                    {isItemSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4 text-primary" />}
                                                </Button>
                                               )}
                                              <Button type="button" variant="ghost" size="icon" onClick={() => remove(index)}>
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
                  <Button variant="outline" onClick={() => { setIsFormDialogOpen(false); form.reset(); }}>Cancel</Button>
                  <Button type="submit" form="tax-invoice-form" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {dialogMode === 'add' ? 'Save Full Invoice' : 'Save All Changes'}
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      
      <AlertDialog>
        <AlertDialogContent>
            <AlertDialogHeader>
            <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
            <AlertDialogDescription>
                This action cannot be undone. This will permanently delete the tax invoice
                and reduce the stock quantities for all items on it.
            </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setInvoiceToDelete(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteInvoice} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Continue
            </AlertDialogAction>
            </AlertDialogFooter>
        </AlertDialogContent>

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
                    <TableHead className="text-center">Actions</TableHead>
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
                        <TableCell className="text-center">
                            <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(invoice)}>
                                <Eye className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" onClick={() => handleEditInvoice(invoice)}>
                                <Pencil className="h-4 w-4" />
                            </Button>
                            <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" onClick={() => setInvoiceToDelete(invoice)}>
                                    <Trash2 className="h-4 w-4 text-destructive" />
                                </Button>
                            </AlertDialogTrigger>
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
      </AlertDialog>

      <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Invoice Details</DialogTitle>
            <DialogDescription>
              Viewing details for invoice {selectedInvoice?.invoiceId}.
            </DialogDescription>
          </DialogHeader>
          {selectedInvoice && (
            <div className="grid gap-4 py-4">
                <div className="grid grid-cols-3 gap-4">
                    <div>
                        <Label className="font-semibold">Supplier Name</Label>
                        <p>{selectedInvoice.supplierName}</p>
                    </div>
                     <div>
                        <Label className="font-semibold">Supplier Invoice No.</Label>
                        <p>{selectedInvoice.supplierInvoiceNumber || 'N/A'}</p>
                    </div>
                     <div>
                        <Label className="font-semibold">Date</Label>
                        <p>{selectedInvoice.date.toDate().toLocaleDateString()}</p>
                    </div>
                </div>
                <div className="mt-4 max-h-[50vh] overflow-y-auto">
                     <Label className="font-semibold">Items</Label>
                     <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Product Name</TableHead>
                                <TableHead>Part Number</TableHead>
                                <TableHead className="text-right">Price</TableHead>
                                <TableHead className="text-right">Quantity</TableHead>
                                <TableHead className="text-right">Total</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {selectedInvoice.items.map((item, index) => {
                                const price = typeof item.price === 'number' ? item.price : 0;
                                const quantity = typeof item.quantity === 'number' ? item.quantity : 0;
                                return (
                                <TableRow key={index}>
                                    <TableCell>{item.name}</TableCell>
                                    <TableCell>{item.partNumber}</TableCell>
                                    <TableCell className="text-right">GH₵{price.toFixed(2)}</TableCell>
                                    <TableCell className="text-right">{quantity}</TableCell>
                                    <TableCell className="text-right">GH₵{(price * quantity).toFixed(2)}</TableCell>
                                </TableRow>
                            )})}
                        </TableBody>
                     </Table>
                </div>
                 <div className="flex justify-end mt-4">
                    <div className="w-full max-w-xs space-y-2">
                        <div className="flex justify-between font-bold text-lg">
                            <span>Total Invoice Amount</span>
                            <span>GH₵{selectedInvoice.totalAmount.toFixed(2)}</span>
                        </div>
                    </div>
                </div>
            </div>
          )}
          <DialogFooter>
            <DialogClose asChild>
                <Button variant="outline">Close</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}
