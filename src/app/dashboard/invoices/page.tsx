
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { PlusCircle, Loader2, Eye, Pencil } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import type { Invoice } from "@/types";
import { Label } from "@/components/ui/label";

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const { toast } = useToast();

    useEffect(() => {
        const fetchInvoices = async () => {
            setLoading(true);
            try {
                const invoicesQuery = query(collection(db, "invoices"), orderBy("invoiceDate", "desc"));
                const querySnapshot = await getDocs(invoicesQuery);
                const invoicesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
                setInvoices(invoicesList);
            } catch (error) {
                console.error("Error fetching invoices: ", error);
                toast({
                    variant: "destructive",
                    title: "Error",
                    description: "Could not fetch invoices.",
                });
            } finally {
                setLoading(false);
            }
        };

        fetchInvoices();
    }, [toast]);

    const handleViewInvoice = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsViewDialogOpen(true);
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold">Invoices</h1>
                <Button asChild>
                    <Link href="/dashboard/invoices/new">
                        <PlusCircle className="mr-2 h-4 w-4" /> Create Invoice
                    </Link>
                </Button>
            </div>
            <Card>
                <CardHeader>
                    <CardTitle>Invoice History</CardTitle>
                    <CardDescription>View and manage all your past invoices.</CardDescription>
                </CardHeader>
                <CardContent>
                    {loading ? (
                        <div className="flex justify-center items-center h-64">
                            <Loader2 className="h-12 w-12 animate-spin text-primary" />
                        </div>
                    ) : invoices.length > 0 ? (
                        <Table>
                            <TableHeader>
                                <TableRow>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead className="text-right">Total Amount</TableHead>
                                    <TableHead>Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((invoice) => (
                                    <TableRow key={invoice.id}>
                                        <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                        <TableCell>{invoice.customerName}</TableCell>
                                        <TableCell>{new Date(invoice.invoiceDate).toLocaleDateString()}</TableCell>
                                        <TableCell className="text-right">GH₵{invoice.total.toFixed(2)}</TableCell>
                                        <TableCell>
                                            <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(invoice)}>
                                                <Eye className="h-4 w-4" />
                                            </Button>
                                            <Button variant="ghost" size="icon" disabled>
                                                <Pencil className="h-4 w-4" />
                                            </Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    ) : (
                        <p className="text-muted-foreground text-center py-8">
                            No invoices have been created yet.
                        </p>
                    )}
                </CardContent>
            </Card>

            <Dialog open={isViewDialogOpen} onOpenChange={setIsViewDialogOpen}>
                <DialogContent className="sm:max-w-4xl">
                <DialogHeader>
                    <DialogTitle>Invoice Details: {selectedInvoice?.invoiceNumber}</DialogTitle>
                    <DialogDescription>
                    Viewing details for invoice sent to {selectedInvoice?.customerName}.
                    </DialogDescription>
                </DialogHeader>
                {selectedInvoice && (
                    <div className="grid gap-4 py-4 max-h-[70vh] overflow-y-auto">
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                            <div>
                                <Label className="font-semibold">Customer Name</Label>
                                <p>{selectedInvoice.customerName}</p>
                            </div>
                            <div>
                                <Label className="font-semibold">Customer Phone</Label>
                                <p>{selectedInvoice.customerPhone || 'N/A'}</p>
                            </div>
                            <div>
                                <Label className="font-semibold">Invoice Date</Label>
                                <p>{new Date(selectedInvoice.invoiceDate).toLocaleDateString()}</p>
                            </div>
                            <div className="md:col-span-3">
                                <Label className="font-semibold">Customer Address</Label>
                                <p>{selectedInvoice.customerAddress || 'N/A'}</p>
                            </div>
                        </div>
                        <div className="mt-4">
                            <Label className="font-semibold">Items</Label>
                            <Table>
                                <TableHeader>
                                    <TableRow>
                                        <TableHead>Product Name</TableHead>
                                        <TableHead>Part Number</TableHead>
                                        <TableHead className="text-right">Unit Price</TableHead>
                                        <TableHead className="text-right">Tax</TableHead>
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedInvoice.items.map((item, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{item.partName}</TableCell>
                                            <TableCell>{item.partNumber}</TableCell>
                                            <TableCell className="text-right">GH₵{item.unitPrice.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">GH₵{item.tax.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right">GH₵{item.total.toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex justify-end mt-4">
                            <div className="w-full max-w-xs space-y-2">
                                <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span>GH₵{selectedInvoice.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tax</span>
                                    <span>GH₵{selectedInvoice.tax.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between font-bold text-lg">
                                    <span>Total</span>
                                    <span>GH₵{selectedInvoice.total.toFixed(2)}</span>
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
    )
}
