
"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, writeBatch } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Part } from "@/types";

interface EditablePart extends Part {
  newPrice?: number;
}

export default function PriceManagementPage() {
  const [parts, setParts] = useState<EditablePart[]>([]);
  const [taxRate, setTaxRate] = useState(0.219); // Default tax rate
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const fetchInitialData = async () => {
    setLoading(true);
    try {
      // Fetch tax rate
      const taxDocRef = doc(db, "settings", "tax");
      const taxDoc = await getDoc(taxDocRef);
      if (taxDoc.exists()) {
        setTaxRate(taxDoc.data().rate);
      }

      // Fetch parts
      const partsCollection = collection(db, "parts");
      const partsSnapshot = await getDocs(partsCollection);
      const partsList = partsSnapshot.docs.map(
        (doc) => ({ ...doc.data(), id: doc.id } as EditablePart)
      );
      setParts(partsList);
    } catch (error) {
      console.error("Error fetching data:", error);
      toast({
        variant: "destructive",
        title: "Error",
        description: "Could not fetch pricing data.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handlePriceChange = (partId: string, newPriceValue: string) => {
    const newPrice = parseFloat(newPriceValue);
    setParts((prevParts) =>
      prevParts.map((part) =>
        part.id === partId ? { ...part, newPrice: isNaN(newPrice) ? undefined : newPrice } : part
      )
    );
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
      const batch = writeBatch(db);

      // Save the new tax rate
      const taxDocRef = doc(db, "settings", "tax");
      batch.set(taxDocRef, { rate: taxRate });

      const partsToUpdate = parts.filter(p => p.newPrice !== undefined && p.newPrice !== p.price);

      if (partsToUpdate.length === 0) {
        toast({ title: "No Changes", description: "Tax rate saved. No price changes to update." });
        await batch.commit();
        return;
      }
      
      partsToUpdate.forEach((part) => {
        if (part.newPrice !== undefined) {
          const partRef = doc(db, "parts", part.id);
          const newBasePrice = part.newPrice;
          const taxAmount = part.taxable ? newBasePrice * taxRate : 0;
          const exFactPrice = newBasePrice + taxAmount;
          
          batch.update(partRef, {
            price: newBasePrice,
            previousPrice: part.price, // Save the old price
            tax: taxAmount,
            exFactPrice: exFactPrice,
          });
        }
      });

      await batch.commit();

      toast({
        title: "Success",
        description: `Tax rate and ${partsToUpdate.length} part price(s) have been updated successfully.`,
      });
      fetchInitialData(); // Re-fetch to show updated data
    } catch (error) {
      console.error("Error saving changes:", error);
      toast({
        variant: "destructive",
        title: "Save Failed",
        description: "Could not save your changes. Please try again.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Price Management</h1>
        <Button onClick={handleSaveChanges} disabled={isSaving || loading}>
          {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
          Save Changes
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Global Tax Rate</CardTitle>
          <CardDescription>
            Set the tax rate that applies to all taxable parts. Enter the rate as a decimal (e.g., 0.219 for 21.9%).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs">
            <Label htmlFor="taxRate">Tax Rate</Label>
            <Input
              id="taxRate"
              type="number"
              step="0.001"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value))}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part Prices</CardTitle>
          <CardDescription>
            Update the base price for individual parts. The tax and final price will be recalculated automatically on save.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : (
            <div className="max-h-[60vh] overflow-y-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30%]">Part Name</TableHead>
                    <TableHead>Part Number</TableHead>
                    <TableHead className="text-right">Previous Price</TableHead>
                    <TableHead className="text-right">Current Base Price</TableHead>
                    <TableHead className="w-[150px] text-right">New Base Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((part) => (
                    <TableRow key={part.id}>
                      <TableCell className="font-medium">{part.name}</TableCell>
                      <TableCell>{part.partNumber}</TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {part.previousPrice ? `GH₵${part.previousPrice.toFixed(2)}` : 'N/A'}
                      </TableCell>
                      <TableCell className="text-right">GH₵{part.price.toFixed(2)}</TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={part.price.toFixed(2)}
                          value={part.newPrice ?? ''}
                          onChange={(e) => handlePriceChange(part.id, e.target.value)}
                          className="text-right"
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
