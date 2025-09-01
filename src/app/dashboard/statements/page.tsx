
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, where, orderBy, doc, getDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter
} from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Loader2, Download, Users, FileText, File } from "lucide-react";
import type { Invoice, Customer } from "@/types";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Papa from "papaparse";

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

export default function StatementsPage() {
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [customerInvoices, setCustomerInvoices] = useState<Invoice[]>([]);
  const [customerOptions, setCustomerOptions] = useState<ComboboxOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatement, setLoadingStatement] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      try {
        const invoicesQuery = query(collection(db, "invoices"), orderBy("invoiceDate", "desc"));
        const querySnapshot = await getDocs(invoicesQuery);
        const invoicesList = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setAllInvoices(invoicesList);

        const customersQuery = query(collection(db, "customers"), orderBy("name"));
        const customersSnapshot = await getDocs(customersQuery);
        const customersList = customersSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));

        setCustomerOptions(
          customersList.map(cust => ({ value: cust.id, label: cust.name }))
        );
      } catch (error) {
        console.error("Error fetching initial data: ", error);
        toast({
          variant: "destructive",
          title: "Error",
          description: "Could not fetch initial data.",
        });
      } finally {
        setLoading(false);
      }
    };
    fetchInitialData();
  }, [toast]);

  const handleCustomerChange = async (customerId: string) => {
    setSelectedCustomerId(customerId);
    if (!customerId) {
        setCustomerInvoices([]);
        setSelectedCustomer(null);
        return;
    }
    setLoadingStatement(true);
    
    const customerDoc = await getDoc(doc(db, "customers", customerId));
    if (customerDoc.exists()) {
        setSelectedCustomer(customerDoc.data() as Customer);
    }

    const filteredInvoices = allInvoices
      .filter(inv => inv.customerId === customerId)
      .sort((a, b) => new Date(b.invoiceDate).getTime() - new Date(a.invoiceDate).getTime());

    const updatedInvoices = filteredInvoices.map(inv => {
        const dueDate = new Date(inv.dueDate);
        const today = new Date();
        today.setHours(0,0,0,0);
        let status = inv.status;
        if (status === 'Unpaid' && dueDate < today) {
            status = 'Overdue';
        }
        return {...inv, status};
    });

    setCustomerInvoices(updatedInvoices);
    setLoadingStatement(false);
  };
  
  const totalBalanceDue = useMemo(() => {
    return customerInvoices.reduce((acc, inv) => acc + inv.balanceDue, 0);
  }, [customerInvoices]);

  const handleDownloadCsv = () => {
    if (customerInvoices.length === 0 || !selectedCustomer) return;

    const data = customerInvoices.map(inv => ({
      "Invoice #": inv.invoiceNumber,
      "Invoice Date": inv.invoiceDate,
      "Due Date": inv.dueDate,
      "Total": inv.total,
      "Paid Amount": inv.paidAmount,
      "Balance Due": inv.balanceDue,
      "Status": inv.status
    }));

    const csv = Papa.unparse(data);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    if (link.download !== undefined) {
      const url = URL.createObjectURL(blob);
      link.setAttribute("href", url);
      link.setAttribute("download", `statement_${selectedCustomer.name.replace(/\s+/g, '_')}.csv`);
      link.style.visibility = 'hidden';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleDownloadPdf = () => {
    if (customerInvoices.length === 0 || !selectedCustomer) return;
    const doc = new jsPDF() as jsPDFWithAutoTable;
    
    doc.setFontSize(18);
    doc.text(`Statement for ${selectedCustomer.name}`, 14, 22);
    
    doc.setFontSize(11);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 14, 30);
    
    const tableColumn = ["Invoice #", "Invoice Date", "Due Date", "Total", "Paid", "Balance Due", "Status"];
    const tableRows: any[] = [];
    
    customerInvoices.forEach(inv => {
      const row = [
        inv.invoiceNumber,
        inv.invoiceDate,
        inv.dueDate,
        `GHS ${inv.total.toFixed(2)}`,
        `GHS ${inv.paidAmount.toFixed(2)}`,
        `GHS ${inv.balanceDue.toFixed(2)}`,
        inv.status
      ];
      tableRows.push(row);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 40
    });

    const finalY = (doc as any).autoTable.previous.finalY;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Balance Due: GHS ${totalBalanceDue.toFixed(2)}`, 200, finalY + 15, { align: 'right' });

    doc.save(`statement_${selectedCustomer.name.replace(/\s+/g, '_')}.pdf`);
  };


  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold">Customer Statements</h1>
      <Card>
        <CardHeader>
          <CardTitle>Generate Statement</CardTitle>
          <CardDescription>
            Select a customer to view their transaction history and outstanding balance.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Loader2 className="h-8 w-8 animate-spin" />
          ) : (
            <div className="flex flex-col md:flex-row gap-4 md:items-center">
              <div className="w-full md:w-64">
                <Combobox
                  options={customerOptions}
                  value={selectedCustomerId}
                  onChange={handleCustomerChange}
                  placeholder="Select a customer..."
                  searchPlaceholder="Search customers..."
                  emptyPlaceholder="No customers found."
                />
              </div>
              <div className="flex gap-2">
                 <Button onClick={handleDownloadCsv} disabled={customerInvoices.length === 0}>
                    <File className="mr-2 h-4 w-4" /> Export CSV
                 </Button>
                 <Button onClick={handleDownloadPdf} disabled={customerInvoices.length === 0}>
                    <FileText className="mr-2 h-4 w-4" /> Export PDF
                 </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {selectedCustomerId && (
        <Card>
          <CardHeader>
            <CardTitle>Statement for {selectedCustomer?.name}</CardTitle>
          </CardHeader>
          <CardContent>
            {loadingStatement ? (
              <div className="flex justify-center items-center h-40">
                 <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : customerInvoices.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Invoice #</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Due Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">Paid</TableHead>
                    <TableHead className="text-right">Balance Due</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {customerInvoices.map((invoice) => (
                    <TableRow key={invoice.id}>
                      <TableCell className="font-medium">{invoice.invoiceNumber}</TableCell>
                      <TableCell>{invoice.invoiceDate}</TableCell>
                      <TableCell>{invoice.dueDate}</TableCell>
                      <TableCell>
                         <Badge variant={
                            invoice.status === 'Paid' ? 'secondary' : 
                            invoice.status === 'Overdue' ? 'destructive' : 'default'
                        } className={cn(invoice.status === 'Unpaid' && 'bg-amber-500 text-white')}>
                            {invoice.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">GHS {invoice.total.toFixed(2)}</TableCell>
                      <TableCell className="text-right">GHS {invoice.paidAmount.toFixed(2)}</TableCell>
                      <TableCell className="text-right font-bold">GHS {invoice.balanceDue.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-8 text-muted-foreground">No invoices found for this customer.</p>
            )}
          </CardContent>
           {customerInvoices.length > 0 && (
            <CardFooter className="flex justify-end">
                <div className="text-right">
                    <p className="text-muted-foreground">Total Outstanding Balance</p>
                    <p className="text-2xl font-bold text-primary">GHS {totalBalanceDue.toFixed(2)}</p>
                </div>
            </CardFooter>
           )}
        </Card>
      )}
      
       {!selectedCustomerId && (
         <div className="text-center py-16 text-muted-foreground">
            <Users className="mx-auto h-12 w-12" />
            <p className="mt-4 text-lg">Please select a customer to view their statement.</p>
         </div>
       )}

    </div>
  );
}
