
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy, writeBatch, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { PlusCircle, Loader2, Eye, Pencil, Download, AlertCircle, Trash2 } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import type { Invoice, Part } from "@/types";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { Checkbox } from "@/components/ui/checkbox";
import { logActivity } from "@/lib/activity-log";


// Extend jsPDF with autoTable method
interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}


export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
    const [isDeleting, setIsDeleting] = useState(false);
    const [isViewDialogOpen, setIsViewDialogOpen] = useState(false);
    const [selectedInvoice, setSelectedInvoice] = useState<Invoice | null>(null);
    const [selectedInvoices, setSelectedInvoices] = useState<string[]>([]);
    const { toast } = useToast();

    const fetchInvoices = async () => {
        setLoading(true);
        try {
            const invoicesQuery = query(collection(db, "invoices"), orderBy("invoiceDate", "desc"));
            const querySnapshot = await getDocs(invoicesQuery);
            const invoicesList = querySnapshot.docs.map(doc => {
                const data = doc.data();
                const dueDate = new Date(data.dueDate);
                const today = new Date();
                today.setHours(0,0,0,0); // Compare dates only
                
                let status = data.status;
                if (status === 'Unpaid' && dueDate < today) {
                    status = 'Overdue';
                }

                return {
                    id: doc.id,
                    ...data,
                    status: status, // Use the derived status
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

    useEffect(() => {
        fetchInvoices();
    }, []);

    const handleViewInvoice = (invoice: Invoice) => {
        setSelectedInvoice(invoice);
        setIsViewDialogOpen(true);
    };

    const handleDeleteInvoices = async () => {
        if (selectedInvoices.length === 0) return;
        setIsDeleting(true);

        try {
            const batch = writeBatch(db);
            const partsToUpdate: { [partId: string]: number } = {};

            // First, read all necessary documents
            for (const invoiceId of selectedInvoices) {
                const invoiceRef = doc(db, "invoices", invoiceId);
                const invoiceDoc = await getDoc(invoiceRef);

                if (invoiceDoc.exists()) {
                    const invoiceData = invoiceDoc.data() as Invoice;
                    // Aggregate stock changes
                    invoiceData.items.forEach(item => {
                        partsToUpdate[item.partId] = (partsToUpdate[item.partId] || 0) + item.quantity;
                    });
                    // Mark invoice for deletion
                    batch.delete(invoiceRef);
                }
            }
            
            // Now, get all part documents that need updating
            const partIds = Object.keys(partsToUpdate);
            const partRefs = partIds.map(id => doc(db, "parts", id));
            const partDocs = await Promise.all(partRefs.map(ref => getDoc(ref)));

            partDocs.forEach((partDoc, index) => {
                if (partDoc.exists()) {
                    const partRef = partRefs[index];
                    const currentStock = (partDoc.data() as Part).stock;
                    const stockToAdd = partsToUpdate[partDoc.id];
                    batch.update(partRef, { stock: currentStock + stockToAdd });
                }
            });

            await batch.commit();

            toast({
                title: "Invoices Deleted",
                description: `${selectedInvoices.length} invoice(s) have been successfully deleted and stock has been restored.`,
            });
            await logActivity(`Deleted ${selectedInvoices.length} invoice(s).`);

            fetchInvoices(); // Refresh the data
            setSelectedInvoices([]); // Clear selection
            
        } catch (error) {
            console.error("Error deleting invoices: ", error);
            toast({
                variant: "destructive",
                title: "Deletion Failed",
                description: "Could not delete invoices. Please try again.",
            });
        } finally {
            setIsDeleting(false);
        }
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
        doc.text("preachitenterprise81@yahoo.com", 140, 33);
        doc.text("preachitenterprise_mq@yahoo.com", 140, 38);
        doc.text("Loc: Tarkwa Tamso & Takoradi", 140, 43);
        doc.text("www.preachitpartsandequipment.com", 140, 48);

        // Customer Info
        yPos = 55;
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
        doc.text(`Invoice #:`, 140, 61);
        doc.text(`Date:`, 140, 66);
        doc.text(`Due Date:`, 140, 71);
        doc.setFont('helvetica', 'normal');
        doc.text(`${invoice.invoiceNumber}`, 165, 61);
        doc.text(`${new Date(invoice.invoiceDate).toLocaleDateString()}`, 165, 66);
        doc.text(`${new Date(invoice.dueDate).toLocaleDateString()}`, 165, 71);
        

        // Table
        const tableColumn = ["Product Name", "Part Number", "Qty", "Unit Price", "Total"];
        const tableRows: any[] = [];

        invoice.items.forEach(item => {
            const itemData = [
                item.partName,
                item.partNumber,
                item.quantity,
                `GHS ${(item.unitPrice || 0).toFixed(2)}`,
                `GHS ${(item.total || 0).toFixed(2)}`
            ];
            tableRows.push(itemData);
        });

        doc.autoTable({
            head: [tableColumn],
            body: tableRows,
            startY: yPos + 10,
            headStyles: { fillColor: [41, 128, 185] },
            styles: { fontSize: 9 },
        });

        // Totals
        let finalY = (doc as any).autoTable.previous.finalY;
        if (finalY > pageHeight - 40) {
            doc.addPage();
            finalY = 20;
        }

        doc.setFontSize(10);
        doc.text(`Subtotal: GHS ${(invoice.subtotal || 0).toFixed(2)}`, 140, finalY + 15);
        doc.text(`Paid: GHS ${(invoice.paidAmount || 0).toFixed(2)}`, 140, finalY + 20);
        doc.setFontSize(12);
        doc.setFont('helvetica', 'bold');
        doc.text(`Balance Due: GHS ${(invoice.balanceDue || 0).toFixed(2)}`, 140, finalY + 27);
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

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedInvoices(invoices.map(inv => inv.id));
        } else {
            setSelectedInvoices([]);
        }
    };

    const handleSelectSingle = (invoiceId: string, checked: boolean) => {
        if (checked) {
            setSelectedInvoices(prev => [...prev, invoiceId]);
        } else {
            setSelectedInvoices(prev => prev.filter(id => id !== invoiceId));
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <div className="flex justify-between items-center">
                <h1 className="text-2xl font-semibold">Invoices</h1>
                <div className="flex items-center gap-2">
                    {selectedInvoices.length > 0 && (
                         <AlertDialog>
                            <AlertDialogTrigger asChild>
                                <Button variant="destructive" disabled={isDeleting}>
                                    {isDeleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                    Delete ({selectedInvoices.length})
                                </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                                <AlertDialogHeader>
                                    <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                                    <AlertDialogDescription>
                                        This action cannot be undone. This will permanently delete the selected invoice(s) and restore the stock quantities for all items on them.
                                    </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                                    <AlertDialogAction onClick={handleDeleteInvoices}>Continue</AlertDialogAction>
                                </AlertDialogFooter>
                            </AlertDialogContent>
                        </AlertDialog>
                    )}
                    <Button asChild>
                        <Link href="/dashboard/invoices/new">
                            <PlusCircle className="mr-2 h-4 w-4" /> Create Invoice
                        </Link>
                    </Button>
                </div>
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
                                    <TableHead className="w-[50px]">
                                        <Checkbox 
                                            checked={selectedInvoices.length > 0 && selectedInvoices.length === invoices.length}
                                            onCheckedChange={handleSelectAll}
                                            aria-label="Select all"
                                        />
                                    </TableHead>
                                    <TableHead>Invoice #</TableHead>
                                    <TableHead>Customer</TableHead>
                                    <TableHead>Date</TableHead>
                                    <TableHead>Due Date</TableHead>
                                    <TableHead>Status</TableHead>
                                    <TableHead className="text-right">Balance Due</TableHead>
                                    <TableHead className="text-center">Actions</TableHead>
                                </TableRow>
                            </TableHeader>
                            <TableBody>
                                {invoices.map((invoice) => {
                                    const canEdit = isEditable(invoice as Invoice & { invoiceDateObject: Date });
                                    return (
                                        <TableRow key={invoice.id} data-state={selectedInvoices.includes(invoice.id) && "selected"}>
                                            <TableCell>
                                                <Checkbox
                                                    checked={selectedInvoices.includes(invoice.id)}
                                                    onCheckedChange={(checked) => handleSelectSingle(invoice.id, !!checked)}
                                                    aria-label={`Select invoice ${invoice.invoiceNumber}`}
                                                />
                                            </TableCell>
                                            <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                                            <TableCell>{invoice.customerName}</TableCell>
                                            <TableCell>{new Date(invoice.invoiceDate).toLocaleDateString()}</TableCell>
                                            <TableCell>{new Date(invoice.dueDate).toLocaleDateString()}</TableCell>
                                            <TableCell>
                                                <Badge variant={
                                                    invoice.status === 'Paid' ? 'secondary' : 
                                                    invoice.status === 'Overdue' ? 'destructive' : 'default'
                                                } className={cn(invoice.status === 'Unpaid' && 'bg-amber-500 text-white')}>
                                                    {invoice.status}
                                                </Badge>
                                            </TableCell>
                                            <TableCell className="text-right font-medium">GHS {(invoice.balanceDue || 0).toFixed(2)}</TableCell>
                                            <TableCell className="flex justify-center items-center">
                                                <Button variant="ghost" size="icon" onClick={() => handleViewInvoice(invoice)}>
                                                    <Eye className="h-4 w-4" />
                                                </Button>
                                                <TooltipProvider>
                                                    <Tooltip>
                                                        <TooltipTrigger asChild>
                                                            <Button variant="ghost" size="icon" asChild>
                                                                 <Link 
                                                                    href={`/dashboard/invoices/edit/${invoice.id}`}
                                                                    className={!canEdit ? 'pointer-events-none opacity-50' : ''}
                                                                    aria-disabled={!canEdit}
                                                                    tabIndex={!canEdit ? -1 : undefined}
                                                                >
                                                                    <Pencil className="h-4 w-4" />
                                                                </Link>
                                                            </Button>
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
                         <div className="text-center py-10">
                            <AlertCircle className="mx-auto h-12 w-12 text-muted-foreground" />
                            <h3 className="mt-4 text-lg font-medium">No invoices found</h3>
                            <p className="mt-1 text-sm text-muted-foreground">Get started by creating a new invoice.</p>
                         </div>
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
                             <div>
                                <Label className="font-semibold">Due Date</Label>
                                <p>{new Date(selectedInvoice.dueDate).toLocaleDateString()}</p>
                            </div>
                             <div>
                                <Label className="font-semibold">Status</Label>
                                <div>
                                     <Badge variant={
                                        selectedInvoice.status === 'Paid' ? 'secondary' : 
                                        selectedInvoice.status === 'Overdue' ? 'destructive' : 'default'
                                    } className={cn(selectedInvoice.status === 'Unpaid' && 'bg-amber-500 text-white')}>
                                        {selectedInvoice.status}
                                    </Badge>
                                </div>
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
                                        <TableHead className="text-right">Quantity</TableHead>
                                        <TableHead className="text-right">Total</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {selectedInvoice.items.map((item, index) => (
                                        <TableRow key={index}>
                                            <TableCell>{item.partName}</TableCell>
                                            <TableCell>{item.partNumber}</TableCell>
                                            <TableCell className="text-right">GHS {(item.unitPrice || 0).toFixed(2)}</TableCell>
                                            <TableCell className="text-right">{item.quantity}</TableCell>
                                            <TableCell className="text-right">GHS {((item.total || 0)).toFixed(2)}</TableCell>
                                        </TableRow>
                                    ))}
                                </TableBody>
                            </Table>
                        </div>
                        <div className="flex justify-end mt-4">
                            <div className="w-full max-w-xs space-y-2">
                                  <div className="flex justify-between">
                                    <span>Subtotal</span>
                                    <span>GHS {(selectedInvoice.subtotal || 0).toFixed(2)}</span>
                                 </div>
                                  <div className="flex justify-between text-destructive">
                                    <span>Amount Paid</span>
                                    <span>- GHS {(selectedInvoice.paidAmount || 0).toFixed(2)}</span>
                                 </div>
                                <div className="flex justify-between font-bold text-lg border-t pt-2">
                                    <span>Balance Due</span>
                                    <span>GHS {(selectedInvoice.balanceDue || 0).toFixed(2)}</span>
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
    );
}

    