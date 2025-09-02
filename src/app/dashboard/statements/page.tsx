
"use client";

import { useEffect, useState, useMemo } from "react";
import { collection, getDocs, query, where, orderBy, doc, getDoc, Timestamp } from "firebase/firestore";
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
import type { Invoice, Customer, Payment } from "@/types";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";
import { useToast } from "@/hooks/use-toast";
import jsPDF from 'jspdf';
import 'jspdf-autotable';
import Papa from "papaparse";

interface jsPDFWithAutoTable extends jsPDF {
  autoTable: (options: any) => jsPDF;
}

interface StatementTransaction {
    date: string;
    transaction: string;
    debit: number;
    credit: number;
    balance: number;
    timestamp: number;
}

export default function StatementsPage() {
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([]);
  const [allPayments, setAllPayments] = useState<Payment[]>([]);
  const [statementTransactions, setStatementTransactions] = useState<StatementTransaction[]>([]);
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
        const invoicesQuery = query(collection(db, "invoices"), orderBy("createdAt", "asc"));
        const invoicesSnapshot = await getDocs(invoicesQuery);
        const invoicesList = invoicesSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Invoice));
        setAllInvoices(invoicesList);
        
        const paymentsQuery = query(collection(db, "payments"), orderBy("paymentDate", "asc"));
        const paymentsSnapshot = await getDocs(paymentsQuery);
        const paymentsList = paymentsSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Payment));
        setAllPayments(paymentsList);

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
        setStatementTransactions([]);
        setSelectedCustomer(null);
        return;
    }
    setLoadingStatement(true);
    
    const customerDoc = await getDoc(doc(db, "customers", customerId));
    if (customerDoc.exists()) {
        setSelectedCustomer(customerDoc.data() as Customer);
    }

    const customerInvoices = allInvoices.filter(inv => inv.customerId === customerId);
    const customerPayments = allPayments.filter(p => p.customerId === customerId);

    let runningBalance = 0;
    const transactions: StatementTransaction[] = [];
    
    customerInvoices.forEach(invoice => {
        transactions.push({
            date: invoice.invoiceDate,
            transaction: `Invoice #${invoice.invoiceNumber}`,
            debit: invoice.total,
            credit: 0,
            balance: 0, // temp value
            timestamp: (invoice.createdAt as Timestamp)?.toDate().getTime() || new Date(invoice.invoiceDate).getTime()
        });
    });

    customerPayments.forEach(payment => {
        transactions.push({
            date: payment.paymentDate,
            transaction: `Payment Received`,
            debit: 0,
            credit: payment.amount,
            balance: 0, // temp value
            timestamp: new Date(payment.paymentDate).getTime()
        });
    });

    // Sort all transactions by date
    transactions.sort((a, b) => a.timestamp - b.timestamp);

    // Calculate running balance
    transactions.forEach(t => {
        runningBalance = runningBalance + t.debit - t.credit;
        t.balance = runningBalance;
    });

    setStatementTransactions(transactions);
    setLoadingStatement(false);
  };
  
  const totalBalanceDue = useMemo(() => {
    const lastTransaction = statementTransactions[statementTransactions.length - 1];
    return lastTransaction ? lastTransaction.balance : 0;
  }, [statementTransactions]);

  const handleDownloadCsv = () => {
    if (statementTransactions.length === 0 || !selectedCustomer) return;

    const data = statementTransactions.map(t => ({
      "Date": t.date,
      "Transaction": t.transaction,
      "Debit": t.debit.toFixed(2),
      "Credit": t.credit.toFixed(2),
      "Balance": t.balance.toFixed(2),
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
    if (statementTransactions.length === 0 || !selectedCustomer) return;
    const doc = new jsPDF() as jsPDFWithAutoTable;
    
    // Header
    doc.setFontSize(22);
    doc.setFont('helvetica', 'bold');
    doc.text("STATEMENT", 14, 22);
    
    // Company Info
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text("Preach it Parts & Equipment", 200, 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text("Call/WhatsApp: +233 24 885 7278 / +233 24 376 2748", 200, 28, { align: 'right' });
    doc.text("preachitenterprise81@yahoo.com", 200, 33, { align: 'right' });
    doc.text("preachitenterprise_mq@yahoo.com", 200, 38, { align: 'right' });
    doc.text("Loc: Tarkwa Tamso & Takoradi", 200, 43, { align: 'right' });
    doc.text("www.preachitpartsandequipment.com", 200, 48, { align: 'right' });

    // Customer Info
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text("Statement For:", 14, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(selectedCustomer.name, 14, 66);
     if (selectedCustomer.address) {
        doc.text(selectedCustomer.address, 14, 71);
    }

    doc.setFont('helvetica', 'bold');
    doc.text(`Date Issued:`, 140, 60);
    doc.setFont('helvetica', 'normal');
    doc.text(`${new Date().toLocaleDateString()}`, 165, 60);
    
    const tableColumn = ["Date", "Transaction", "Debit", "Credit", "Balance"];
    const tableRows: any[] = [];
    
    statementTransactions.forEach(t => {
      const row = [
        new Date(t.date).toLocaleDateString(),
        t.transaction,
        t.debit > 0 ? `GHS ${t.debit.toFixed(2)}` : '',
        t.credit > 0 ? `GHS ${t.credit.toFixed(2)}` : '',
        `GHS ${t.balance.toFixed(2)}`
      ];
      tableRows.push(row);
    });

    doc.autoTable({
        head: [tableColumn],
        body: tableRows,
        startY: 80,
        headStyles: { fillColor: [41, 128, 185] },
        styles: { fontSize: 9 },
        didParseCell: function (data) {
            if (data.column.dataKey === 2 || data.column.dataKey === 3 || data.column.dataKey === 4) {
                 data.cell.styles.halign = 'right';
            }
        }
    });

    const finalY = (doc as any).autoTable.previous.finalY;
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Balance Due:`, 200, finalY + 15, { align: 'right' });
    doc.text(`GHS ${totalBalanceDue.toFixed(2)}`, 200, finalY + 22, { align: 'right' });

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
                 <Button onClick={handleDownloadCsv} disabled={statementTransactions.length === 0}>
                    <File className="mr-2 h-4 w-4" /> Export CSV
                 </Button>
                 <Button onClick={handleDownloadPdf} disabled={statementTransactions.length === 0}>
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
             <CardDescription>
                A summary of all invoices and payments for this customer.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loadingStatement ? (
              <div className="flex justify-center items-center h-40">
                 <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
            ) : statementTransactions.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Transaction</TableHead>
                    <TableHead className="text-right">Debit</TableHead>
                    <TableHead className="text-right">Credit</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {statementTransactions.map((transaction, index) => (
                    <TableRow key={index}>
                      <TableCell>{new Date(transaction.date).toLocaleDateString()}</TableCell>
                      <TableCell className="font-medium">{transaction.transaction}</TableCell>
                      <TableCell className="text-right">{transaction.debit > 0 ? `GHS ${transaction.debit.toFixed(2)}` : '-'}</TableCell>
                      <TableCell className="text-right text-green-600">{transaction.credit > 0 ? `GHS ${transaction.credit.toFixed(2)}` : '-'}</TableCell>
                      <TableCell className="text-right font-bold">GHS {transaction.balance.toFixed(2)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center py-8 text-muted-foreground">No transactions found for this customer.</p>
            )}
          </CardContent>
           {statementTransactions.length > 0 && (
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

    