"use client";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Search, PlusCircle, Trash2 } from "lucide-react";

export default function POSPage() {
    // This will be expanded with state management for the cart, etc.
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
      {/* Left Side: Product Selection */}
      <div className="lg:col-span-2">
        <Card>
          <CardHeader>
            <CardTitle>Point of Sale</CardTitle>
            <CardDescription>Search for products and add them to the sale.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products by name or part number..."
                className="pl-9"
              />
            </div>
             {/* Search results will be displayed here */}
             <div className="mt-4 border rounded-lg h-96 overflow-auto">
                <p className="p-4 text-center text-muted-foreground">Search results will appear here</p>
             </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Side: Cart and Checkout */}
      <div>
        <Card>
          <CardHeader>
            <CardTitle>Current Sale</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-80 overflow-auto">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Qty</TableHead>
                            <TableHead className="text-right">Price</TableHead>
                            <TableHead className="w-[40px]"></TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {/* Cart items will be mapped here */}
                        <TableRow>
                            <TableCell colSpan={4} className="text-center text-muted-foreground">
                                Cart is empty
                            </TableCell>
                        </TableRow>
                    </TableBody>
                </Table>
            </div>
            <div className="mt-4 space-y-2 text-sm">
                <div className="flex justify-between">
                    <span>Subtotal</span>
                    <span>$0.00</span>
                </div>
                <div className="flex justify-between">
                    <span>Tax</span>
                    <span>$0.00</span>
                </div>
                <div className="flex justify-between font-bold text-base">
                    <span>Total</span>
                    <span>$0.00</span>
                </div>
            </div>
          </CardContent>
          <CardFooter>
            <Button className="w-full" size="lg">Complete Sale</Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
