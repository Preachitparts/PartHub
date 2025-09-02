
"use client";

import { useEffect, useState } from "react";
import { collection, doc, getDocs, writeBatch } from "firebase/firestore";
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
import { Loader2, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import type { Part } from "@/types";
import { logActivity } from "@/lib/activity-log";

interface EditablePart extends Part {
  newPrice?: number;
}

export default function PriceManagementPage() {
  const [parts, setParts] = useState<EditablePart[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();

  const fetchInitialData = async () => {
    setLoading(true);
    try {
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
      let updatedPricesCount = 0;

      for (const part of parts) {
        const partRef = doc(db, "parts", part.id);
        
        const priceChanged = part.newPrice !== undefined && part.newPrice !== part.price;

        if (priceChanged) {
          const updates: Partial<Part> = {};
          updates.price = part.newPrice!;
          updates.previousPrice = part.price;
          
          batch.update(partRef, updates as any);
          
          logActivity(`Updated price for ${part.name} from GH₵${part.price.toFixed(2)} to GH₵${part.newPrice!.toFixed(2)}.`);
          updatedPricesCount++;
        }
      }

      await batch.commit();

      toast({
        title: "Success",
        description: `Changes saved successfully. ${updatedPricesCount} part price(s) were updated.`,
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
          <CardTitle>Part Prices</CardTitle>
          <CardDescription>
            Update the price for individual parts. Previous price is shown for reference.
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
                    <TableHead className="text-right">Current Price</TableHead>
                    <TableHead className="text-right">Previous Price</TableHead>
                    <TableHead className="w-[150px] text-right">New Price</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parts.map((part) => (
                    <TableRow key={part.id}>
                      <TableCell className="font-medium">{part.name}</TableCell>
                      <TableCell>{part.partNumber}</TableCell>
                       <TableCell className="text-right font-medium">
                        GH₵{part.price.toFixed(2)}
                      </TableCell>
                      <TableCell className="text-right text-muted-foreground">
                        {part.previousPrice ? `GH₵${part.previousPrice.toFixed(2)}` : `N/A`}
                      </TableCell>
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
