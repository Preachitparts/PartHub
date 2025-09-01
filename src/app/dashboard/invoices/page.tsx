
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { PlusCircle, Loader2, Eye, Pencil } from "lucide-react";
import Link from "next/link";
import { useToast } from "@/hooks/use-toast";
import type { Invoice } from "@/types";

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);
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
                                            <Button variant="ghost" size="icon" disabled>
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
        </div>
    )
}
