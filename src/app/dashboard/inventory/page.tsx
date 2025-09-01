
"use client";

import { useEffect, useState, useRef } from "react";
import { collection, getDocs, setDoc, doc, writeBatch } from "firebase/firestore";
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
import { PlusCircle, Loader2, Upload, Download } from "lucide-react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import type { Part } from "@/types";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import Papa from "papaparse";


const TAX_RATE = 0.219; // 21.9%

const partSchema = z.object({
  name: z.string().min(1, "Part name is required."),
  partNumber: z.string().min(1, "Part number is required."),
  partCode: z.string().min(1, "Part code is required."),
  description: z.string().optional(),
  price: z.preprocess((a) => parseFloat(z.string().parse(a)), z.number().min(0, "Price must be a positive number.")),
  stock: z.preprocess((a) => parseInt(z.string().parse(a), 10), z.number().int().min(0, "Stock must be a positive integer.")),
  taxable: z.boolean().default(true),
  brand: z.string().optional(),
  category: z.string().optional(),
  equipmentModel: z.string().optional(),
  imageUrl: z.string().url("Must be a valid URL.").optional().or(z.literal('')),
});

type PartFormValues = z.infer<typeof partSchema>;

export default function InventoryPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const form = useForm<PartFormValues>({
    resolver: zodResolver(partSchema),
    defaultValues: {
      name: "",
      partNumber: "",
      partCode: "",
      description: "",
      price: 0,
      stock: 0,
      taxable: true,
      brand: "",
      category: "",
      equipmentModel: "",
      imageUrl: "",
    },
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

  async function onSubmit(data: PartFormValues) {
    setIsSaving(true);
    try {
      const tax = data.taxable ? data.price * TAX_RATE : 0;
      const exFactPrice = data.price + tax;
      const newPartId = (Date.now()).toString();

      const newPartData = {
        ...data,
        imageUrl: data.imageUrl || "https://placehold.co/600x400",
        tax,
        exFactPrice,
      };

      await setDoc(doc(db, "parts", newPartId), newPartData);
      
      toast({
        title: "Part Added",
        description: `${data.name} has been successfully added to the inventory.`,
      });
      
      form.reset();
      setIsDialogOpen(false);
      fetchParts(); // Refresh the list
    } catch (error) {
      console.error("Error saving part:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Could not save the new part. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  }

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
                <PlusCircle className="mr-2 h-4 w-4" /> Add New Part
                </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[600px]">
                <DialogHeader>
                <DialogTitle>Add New Part</DialogTitle>
                <DialogDescription>
                    Enter the details for the new product. Click save when you're done.
                </DialogDescription>
                </DialogHeader>
                <form onSubmit={form.handleSubmit(onSubmit)} id="add-part-form">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4 max-h-[60vh] overflow-y-auto px-1">
                    <div className="space-y-2">
                    <Label htmlFor="name">Part Name</Label>
                    <Input id="name" {...form.register("name")} />
                    {form.formState.errors.name && <p className="text-destructive text-xs">{form.formState.errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="partNumber">Part Number</Label>
                    <Input id="partNumber" {...form.register("partNumber")} />
                    {form.formState.errors.partNumber && <p className="text-destructive text-xs">{form.formState.errors.partNumber.message}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="partCode">Part Code</Label>
                    <Input id="partCode" {...form.register("partCode")} />
                    {form.formState.errors.partCode && <p className="text-destructive text-xs">{form.formState.errors.partCode.message}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="stock">Stock Quantity</Label>
                    <Input id="stock" type="number" {...form.register("stock")} />
                    {form.formState.errors.stock && <p className="text-destructive text-xs">{form.formState.errors.stock.message}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="price">Base Price (GH₵)</Label>
                    <Input id="price" type="number" step="0.01" {...form.register("price")} />
                    {form.formState.errors.price && <p className="text-destructive text-xs">{form.formState.errors.price.message}</p>}
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="brand">Brand</Label>
                    <Input id="brand" {...form.register("brand")} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="category">Category</Label>
                    <Input id="category" {...form.register("category")} />
                    </div>
                    <div className="space-y-2">
                    <Label htmlFor="equipmentModel">Equipment Model</Label>
                    <Input id="equipmentModel" {...form.register("equipmentModel")} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="description">Description</Label>
                    <Textarea id="description" {...form.register("description")} />
                    </div>
                    <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="imageUrl">Image URL</Label>
                    <Input id="imageUrl" placeholder="https://..." {...form.register("imageUrl")} />
                    {form.formState.errors.imageUrl && <p className="text-destructive text-xs">{form.formState.errors.imageUrl.message}</p>}
                    </div>
                    <div className="flex items-center space-x-2 md:col-span-2">
                        <Controller
                            control={form.control}
                            name="taxable"
                            render={({ field }) => (
                            <Switch
                                id="taxable"
                                checked={field.value}
                                onCheckedChange={field.onChange}
                                />
                            )}
                        />
                    <Label htmlFor="taxable">This item is taxable</Label>
                    </div>
                </div>
                </form>
                <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>Cancel</Button>
                <Button type="submit" form="add-part-form" disabled={isSaving}>
                    {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Save Part
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
