
"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDoc, getDocs, writeBatch, updateDoc } from "firebase/firestore";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Part } from "@/types";
import { logActivity } from "@/lib/activity-log";

interface EditablePart extends Part {
  newPrice?: number;
  newPricingType?: 'inclusive' | 'exclusive';
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
      const taxDocRef = doc(db, "internal", "seeding_flag");
      const taxDoc = await getDoc(taxDocRef);
      if (taxDoc.exists() && taxDoc.data().taxRate) {
        setTaxRate(taxDoc.data().taxRate);
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
  
  const handlePricingTypeChange = (partId: string, newPricingType: 'inclusive' | 'exclusive') => {
    setParts((prevParts) =>
      prevParts.map((part) =>
        part.id === partId ? { ...part, newPricingType: newPricingType } : part
      )
    );
  };

  const handleSaveChanges = async () => {
    setIsSaving(true);
    try {
        const batch = writeBatch(db);
        let updatedPricesCount = 0;

        // Save the new tax rate
        const taxDocRef = doc(db, "internal", "seeding_flag");
        await updateDoc(taxDocRef, { taxRate: taxRate });
        await logActivity(`Updated global tax rate to ${taxRate * 100}%.`);

        for (const part of parts) {
            const partRef = doc(db, "parts", part.id);
            let hasUpdate = false;

            const newPrice = part.newPrice;
            const newPricingType = part.newPricingType || part.pricingType;
            let currentPrice = part.price;
            let updates: Partial<Part> = {};

            if (newPrice !== undefined && newPrice !== part.price) {
                updates.price = newPrice;
                updates.previousPrice = part.price;
                currentPrice = newPrice;
                hasUpdate = true;
                updatedPricesCount++;
                logActivity(`Updated price for ${part.name} from GH₵${part.price.toFixed(2)} to GH₵${newPrice.toFixed(2)}.`);
            }

            if (newPricingType !== part.pricingType) {
                 updates.pricingType = newPricingType;
                 hasUpdate = true;
            }

            // Recalculate tax if price, pricing type, or global tax rate changed
            let basePrice = newPrice ?? part.price;
            let taxAmount = 0;
            let exFactPrice = 0;

            if (part.taxable) {
                if (newPricingType === 'inclusive') {
                    basePrice = (newPrice ?? part.price) / (1 + taxRate);
                    taxAmount = (newPrice ?? part.price) - basePrice;
                    exFactPrice = newPrice ?? part.price;
                } else { // exclusive
                    basePrice = newPrice ?? part.price;
                    taxAmount = basePrice * taxRate;
                    exFactPrice = basePrice + taxAmount;
                }
            } else {
                 basePrice = newPrice ?? part.price;
                 exFactPrice = basePrice;
            }
             
            updates.price = parseFloat(basePrice.toFixed(4));
            updates.tax = parseFloat(taxAmount.toFixed(4));
            updates.exFactPrice = parseFloat(exFactPrice.toFixed(4));
             
            batch.update(partRef, updates);
        }

      await batch.commit();

      toast({
        title: "Success",
        description: `Tax rate and ${updatedPricesCount} part price(s) have been updated successfully.`,
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
            Set the tax rate that applies to all taxable parts. Enter the rate as a decimal (e.g., 0.219 for 21.9%). This will recalculate prices for all items.
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
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              disabled={loading}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Part Prices</CardTitle>
          <CardDescription>
            Update the price for individual parts. The `price` in the database will be the **tax-exclusive** price.
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
                    <TableHead className="w-[200px]">Pricing Type</TableHead>
                    <TableHead className="w-[150px] text-right">New Price</TableHead>
                    <TableHead className="text-right">Ex-Fact. Price</TableHead>
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
                       <TableCell>
                         <RadioGroup
                            defaultValue={part.pricingType}
                            value={part.newPricingType || part.pricingType}
                            onValueChange={(value: 'inclusive' | 'exclusive') => handlePricingTypeChange(part.id, value)}
                            className="flex gap-4"
                          >
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="exclusive" id={`${part.id}-exclusive`} />
                                <Label htmlFor={`${part.id}-exclusive`}>Exclusive</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="inclusive" id={`${part.id}-inclusive`} />
                                <Label htmlFor={`${part.id}-inclusive`}>Inclusive</Label>
                            </div>
                         </RadioGroup>
                      </TableCell>
                      <TableCell className="text-right">
                        <Input
                          type="number"
                          step="0.01"
                          placeholder={
                            part.pricingType === 'inclusive' ? part.exFactPrice.toFixed(2) : part.price.toFixed(2)
                          }
                          value={part.newPrice ?? ''}
                          onChange={(e) => handlePriceChange(part.id, e.target.value)}
                          className="text-right"
                        />
                      </TableCell>
                       <TableCell className="text-right font-semibold">GH₵{part.exFactPrice.toFixed(2)}</TableCell>
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
