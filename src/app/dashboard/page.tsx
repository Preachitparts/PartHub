import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";
import { PartsGrid } from "@/components/dashboard/parts-grid";
import { SmartFilterForm } from "@/components/dashboard/smart-filter-form";
import type { Part } from "@/types";

const mockParts: Part[] = [
  { id: "1", name: "Heavy-Duty Alternator", partNumber: "HD-ALT-001", description: "12V, 160A alternator for commercial trucks.", price: 299.99, stock: 15, imageUrl: "https://placehold.co/600x400", brand: "PowerMax", category: "Electrical", equipmentModel: "TruckMaster 5000" },
  { id: "2", name: "Engine Air Filter", partNumber: "EAF-002", description: "High-performance air filter for diesel engines.", price: 45.50, stock: 48, imageUrl: "https://placehold.co/600x400", brand: "CleanFlow", category: "Filters", equipmentModel: "EarthMover 300" },
  { id: "3", name: "Hydraulic Pump", partNumber: "HYD-PMP-003", description: "Gear pump for hydraulic systems, 25 GPM.", price: 850.00, stock: 8, imageUrl: "https://placehold.co/600x400", brand: "HydroGear", category: "Hydraulics", equipmentModel: "Excavator X10" },
  { id: "4", name: "Brake Pad Set", partNumber: "BRK-PAD-004", description: "Ceramic brake pads for heavy equipment.", price: 120.75, stock: 32, imageUrl: "https://placehold.co/600x400", brand: "StopWell", category: "Brakes", equipmentModel: "Loader Pro 900" },
  { id: "5", name: "Turbocharger", partNumber: "TRB-CHR-005", description: "High-efficiency turbocharger for increased horsepower.", price: 1250.00, stock: 5, imageUrl: "https://placehold.co/600x400", brand: "BoostUp", category: "Engine", equipmentModel: "Dozer D5" },
  { id: "6", name: "Fuel Injector", partNumber: "FUL-INJ-006", description: "Common rail fuel injector for modern diesel engines.", price: 350.00, stock: 25, imageUrl: "https://placehold.co/600x400", brand: "DieselPro", category: "Fuel System", equipmentModel: "TruckMaster 5000" },
];

export default function DashboardPage() {
  // In a real application, you would fetch parts from Firestore here.
  const parts = mockParts;
  
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

      <PartsGrid parts={parts} />
    </div>
  );
}
