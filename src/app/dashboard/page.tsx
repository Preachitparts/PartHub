"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, setDoc, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Input } from "@/components/ui/input";
import { Search, Loader2 } from "lucide-react";
import { PartsGrid } from "@/components/dashboard/parts-grid";
import { SmartFilterForm } from "@/components/dashboard/smart-filter-form";
import type { Part } from "@/types";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

const TAX_RATE = 0.219; // 21.9%

const mockParts: Omit<Part, 'id' | 'tax' | 'exFactPrice'>[] = [
  { name: "Heavy-Duty Alternator", partNumber: "HD-ALT-001", partCode: "P001", description: "12V, 160A alternator for commercial trucks.", price: 299.99, stock: 15, imageUrl: "https://placehold.co/600x400", brand: "PowerMax", category: "Electrical", equipmentModel: "TruckMaster 5000", taxable: true },
  { name: "Engine Air Filter", partNumber: "EAF-002", partCode: "P002", description: "High-performance air filter for diesel engines.", price: 45.50, stock: 48, imageUrl: "https://placehold.co/600x400", brand: "CleanFlow", category: "Filters", equipmentModel: "EarthMover 300", taxable: true },
  { name: "Hydraulic Pump", partNumber: "HYD-PMP-003", partCode: "P003", description: "Gear pump for hydraulic systems, 25 GPM.", price: 850.00, stock: 8, imageUrl: "https://placehold.co/600x400", brand: "HydroGear", category: "Hydraulics", equipmentModel: "Excavator X10", taxable: true },
  { name: "Brake Pad Set", partNumber: "BRK-PAD-004", partCode: "P004", description: "Ceramic brake pads for heavy equipment.", price: 120.75, stock: 32, imageUrl: "https://placehold.co/600x400", brand: "StopWell", category: "Brakes", equipmentModel: "Loader Pro 900", taxable: true },
  { name: "Turbocharger", partNumber: "TRB-CHR-005", partCode: "P005", description: "High-efficiency turbocharger for increased horsepower.", price: 1250.00, stock: 5, imageUrl: "https://placehold.co/600x400", brand: "BoostUp", category: "Engine", equipmentModel: "Dozer D5", taxable: false },
  { name: "Fuel Injector", partNumber: "FUL-INJ-006", partCode: "P006", description: "Common rail fuel injector for modern diesel engines.", price: 350.00, stock: 25, imageUrl: "https://placehold.co/600x400", brand: "DieselPro", category: "Fuel System", equipmentModel: "TruckMaster 5000", taxable: true },
];

const generatePartsWithTax = (parts: Omit<Part, 'id' | 'tax' | 'exFactPrice'>[]): Omit<Part, 'id'>[] => {
  return parts.map((part, index) => {
    const tax = part.taxable ? part.price * TAX_RATE : 0;
    const exFactPrice = part.price + tax;
    return {
      ...part,
      tax,
      exFactPrice,
    };
  });
};

export default function DashboardPage() {
  const [parts, setParts] = useState<Part[]>([]);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);
  const { toast } = useToast();

  const seedDatabase = async () => {
    setSeeding(true);
    try {
      const seedingFlagDoc = await getDoc(doc(db, "internal", "seeding_flag"));

      if (seedingFlagDoc.exists()) {
        toast({
          title: "Database Already Seeded",
          description: "The initial part data has already been loaded.",
        });
        fetchParts();
        return;
      }
      
      const partsToSeed = generatePartsWithTax(mockParts);

      for (let i = 0; i < partsToSeed.length; i++) {
        const part = partsToSeed[i];
        const partId = (i + 1).toString();
        await setDoc(doc(db, "parts", partId), part);
      }

      await setDoc(doc(db, "internal", "seeding_flag"), { seeded: true, taxRate: TAX_RATE });
      
      toast({
        title: "Database Seeded",
        description: "Successfully loaded initial part data into Firestore.",
      });
      fetchParts();
    } catch (error) {
      console.error("Error seeding database:", error);
      toast({
        variant: "destructive",
        title: "Seeding Failed",
        description: "Could not load initial data. See console for details.",
      });
    } finally {
      setSeeding(false);
    }
  };

  const fetchParts = async () => {
    setLoading(true);
    try {
      const partsCollection = collection(db, "parts");
      const partsSnapshot = await getDocs(partsCollection);
      if (partsSnapshot.empty) {
        console.log("No parts found in Firestore. The database may need to be seeded.");
        setParts([]);
      } else {
        const partsList = partsSnapshot.docs.map(
          (doc) => ({ ...doc.data(), id: doc.id } as Part)
        );
        setParts(partsList);
      }
    } catch (error) {
      console.error("Error fetching parts:", error);
      if ((error as any).code === 'permission-denied') {
        toast({
          variant: "destructive",
          title: "Firestore Permission Denied",
          description: "Please check your Firestore security rules in the Firebase console.",
        });
      } else {
         toast({
          variant: "destructive",
          title: "Error Fetching Data",
          description: "Could not fetch parts from Firestore. See console for details.",
        });
      }
      setParts([]); // Clear parts on error
    } finally {
      setLoading(false);
    }
  };
  
  useEffect(() => {
    fetchParts();
  }, []);

  return (
    <div className="flex flex-col gap-6">
      <SmartFilterForm />

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by keyword, part number, or equipment model..."
          className="pl-9"
        />
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      ) : parts.length > 0 ? (
        <PartsGrid parts={parts} />
      ) : (
        <Card className="text-center p-8">
            <h3 className="text-xl font-semibold mb-2">No Parts Found</h3>
            <p className="text-muted-foreground mb-4">Your parts catalog is empty. You can seed the database with some sample data.</p>
            <Button onClick={seedDatabase} disabled={seeding}>
                {seeding && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {seeding ? 'Seeding...' : 'Seed Database'}
            </Button>
            <p className="text-xs text-muted-foreground mt-4">Note: You may need to configure Firestore Security Rules to allow writes.</p>
        </Card>
      )}
    </div>
  );
}
