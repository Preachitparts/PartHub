
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { PlusCircle, Loader2, Eye, Pencil, Download } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import type { Invoice } from "@/types";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import jsPDF from 'jspdf';
import 'jspdf-autotable';

// Extend jsPDF with autoTable method
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}


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
                const invoicesList = querySnapshot.docs.map(doc => {
                    const data = doc.data();
                    return {
                        id: doc.id,
                        ...data,
                        // Ensure invoiceDate is a Date object for calculations
                        invoiceDateObject: new Date(data.invoiceDate),
                    } as Invoice & { invoiceDateObject: Date };
                });
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

    const handleDownloadPdf = (invoice: Invoice) => {
        const doc = new jsPDF() as jsPDFWithAutoTable;
        const pageHeight = doc.internal.pageSize.height || doc.internal.pageSize.getHeight();
        let yPos = 0;
        
        // Header
        doc.setFontSize(22);
        doc.setFont('helvetica', 'bold');
        doc.text("INVOICE", 14, 22);
        
        // Company Info
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text("Preach it Parts & Equipment", 140, 22);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.text("Call/WhatsApp: +233 24 885 7278 / +233 24 376 2748", 140, 28);
        doc.text("Loc: Tarkwa Tamso & Takoradi", 140, 33);
        doc.text("www.preachitpartsandequipment.com", 140, 38);

        // Customer Info
        yPos = 45;
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text("Bill To:", 14, yPos);
        
        yPos += 6;
        doc.setFont('helvetica', 'normal');
        doc.text(invoice.customerName, 14, yPos);
        
        // Handle multi-line address
        if (invoice.customerAddress) {
            yPos += 5;
            const addressLines = doc.splitTextToSize(invoice.customerAddress, 80); // 80 is max width
            doc.text(addressLines, 14, yPos);
            yPos += (addressLines.length * 4); // Adjust Y based on number of lines
        }

        if (invoice.customerPhone) {
            yPos += 5;
            doc.text(invoice.customerPhone, 14, yPos);
        }
        

        // Invoice Details
        doc.setFont('helvetica', 'bold');
        doc.text(`Invoice #:`, 140, 51);
        doc.text(`Date:`, 140, 56);
        doc.setFont('helvetica', 'normal');
        doc.text(`${invoice.invoiceNumber}`, 160, 51);
        doc.text(`${new Date(invoice.invoiceDate).toLocaleDateString()}`, 160, 56);
        

        // Table
        const tableColumn = ["Product Name", "Part Number", "Qty", "Unit Price", "Tax", "Total"];
        const tableRows: any[] = [];

        invoice.items.forEach(item => {
            const itemData = [
                item.partName,
                item.partNumber,
                item.quantity,
                `GHS ${item.unitPrice.toFixed(2)}`,
                `GHS ${item.tax.toFixed(2)}`,
                `GHS ${(item.exFactPrice * item.quantity).toFixed(2)}`
            ];
            tableRows.push(itemData);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: 75, // Start table lower to give space for address
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 9 },
        });

        // Totals
        const finalY = doc.autoTable.previous.finalY;
        doc.setFontSize(10);
        doc.text(`Subtotal: GHS ${invoice.subtotal.toFixed(2)}`, 140, finalY + 10);
        doc.text(`Tax: GHS ${invoice.tax.toFixed(2)}`, 140, finalY + 15);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Total: GHS ${invoice.total.toFixed(2)}`, 140, finalY + 22);
        doc.setFont('helvetica', 'normal');

        // Footer
        doc.setFontSize(8);
        doc.text("Thank you for your business!", 14, pageHeight - 10);

        doc.save(`Invoice-${invoice.invoiceNumber}.pdf`);
        toast({ title: "Download Started", description: "Your invoice PDF is being downloaded." });
    };

    const isEditable = (invoice: Invoice & { invoiceDateObject?: Date }) => {
        if (!invoice.invoiceDateObject) return false;
        const now = new Date();
        const invoiceDate = invoice.invoiceDateObject;
        const hoursDifference = (now.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60);
        return hoursDifference <= 72;
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
                    <CardDescription>View and manage all your past invoices. Invoices can no longer be edited after 72 hours.</CardDescription>
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
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((invoice) => {
                                    const canEdit = isEditable(invoice as Invoice & { invoiceDateObject: Date });
                                    return (
                                        <TableRow key={invoice.id}>
                                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                            <TableCell>{invoice.customerName}</TableCell>
                                            <TableCell>{new Date(invoice.invoiceDate).toLocaleDateString()}</TableCell>
                                            <TableCell className="text-right">GHS {invoice.total.toFixed(2)}</TableCell>
                                            <TableCell className="flex justify-center items-center">
                                                <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(invoice)}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <span tabIndex={0}>
                                                                <Button variant="ghost" size="icon" disabled>
                                                                    <Pencil className="h-4 w-4" />
                                                                </Button>
                                                            </span>
                                                        </TooltipTrigger>
                                                        { !canEdit &&
                                                            <TooltipContent>
                                                                <p>Editing is locked after 72 hours.</p>
                                                            </TooltipContent>
                                                        }
                                                    </Tooltip>
                                                </TooltipProvider>
                                                 <Button variant="ghost" size="icon" onClick={() => handleDownloadPdf(invoice)}>
                                                    <Download className="h-4 w-4" />
                                                 </Button>
                                            </TableCell>
                                        </TableRow>
                                    )
                                })}
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
                                            <TableCell className="text-right">GHS {item.unitPrice.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">GHS {item.tax.toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right">GHS {(item.exFactPrice * item.quantity).toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex justify-end mt-4">
                            <div className="w-full max-w-xs space-y-2">
                                <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span>GHS {selectedInvoice.subtotal.toFixed(2)}</span>
                                </div>
                                <div className="flex justify-between">
                                    <span>Tax</span>
                                    <span>GHS {selectedInvoice.tax.toFixed(2)}</span>
                                 </div>
                                <div className="flex justify-between font-bold text-lg">
                                    <span>Total</span>
                                    <span>GHS {selectedInvoice.total.toFixed(2)}</span>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                <DialogFooter>
                    <Button variant="secondary" onClick={() => selectedInvoice && handleDownloadPdf(selectedInvoice)}>
                        <Download className="mr-2 h-4 w-4" />
                        Download PDF
                    </Button>
                    <DialogClose asChild>
                        <Button variant="outline">Close</Button>
                    </DialogClose>
                </DialogFooter>
                </DialogContent>
            </Dialog>

        </div>
    )
}

    
