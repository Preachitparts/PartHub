
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, writeBatch, runTransaction, query, where, orderBy, getDoc, addDoc, serverTimestamp, setDoc } from "firebase/firestore";
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
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PlusCircle, Loader2, CreditCard, UserPlus } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Invoice } from "@/types";
import { logActivity } from "@/lib/activity-log";

const customerSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters."),
  phone: z.string().optional(),
  address: z.string().optional(),
});

const paymentSchema = z.object({
    amount: z.preprocess((a) => parseFloat(z.string().parse(a || "0")), z.number().positive("Payment amount must be positive.")),
    paymentDate: z.string().min(1, "Payment date is required."),
});

type CustomerFormValues = z.infer<typeof customerSchema>;
type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPaymentSaving, setIsPaymentSaving] = useState(false);
  const [isCustomerFormOpen, setIsCustomerFormOpen] = useState(false);
  const [isPaymentFormOpen, setIsPaymentFormOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const { toast } = useToast();
  
  const customerForm = useForm<CustomerFormValues>({
    resolver: zodResolver(customerSchema),
    defaultValues: { name: "", phone: "", address: "" },
  });

  const paymentForm = useForm<PaymentFormValues>({
      resolver: zodResolver(paymentSchema),
      defaultValues: { amount: 0, paymentDate: new Date().toISOString().split("T")[0] },
  });

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const customersCollection = collection(db, "customers");
      const customerSnapshot = await getDocs(query(customersCollection, orderBy("name")));
      const customersList = customerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));

      // Calculate balance for each customer
      const invoicesCollection = collection(db, "invoices");
      const allInvoicesSnapshot = await getDocs(invoicesCollection);
      const allInvoices = allInvoicesSnapshot.docs.map(doc => doc.data() as Invoice);

      const customersWithBalance = customersList.map(customer => {
        const customerInvoices = allInvoices.filter(inv => inv.customerId === customer.id);
        const balance = customerInvoices.reduce((acc, inv) => acc + (inv.balanceDue || 0), 0);
        return { ...customer, balance: balance };
      });
      
      setCustomers(customersWithBalance);

    } catch (error) {
       toast({
          variant: "destructive",
          title: "Error Fetching Data",
          description: "Could not fetch customers from Firestore. Check console for details.",
        });
        console.error("Error fetching data:", error);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  async function onCustomerSubmit(data: CustomerFormValues) {
    setIsSaving(true);
    try {
        const newCustomerRef = doc(collection(db, "customers"));
        const newCustomer: Omit<Customer, 'id' | 'balance'> = {
            name: data.name,
            phone: data.phone || "",
            address: data.address || "",
            createdAt: serverTimestamp()
        };
        await setDoc(newCustomerRef, newCustomer);

      toast({ title: "Customer Created", description: `Successfully created customer: ${data.name}.` });
      await logActivity(`Created new customer: ${data.name}`);
      setIsCustomerFormOpen(false);
      customerForm.reset();
      fetchCustomers(); // Refresh the list
    } catch (error: any) {
        toast({ variant: "destructive", title: "Operation Failed", description: error.message || "An unexpected error occurred." });
    } finally {
        setIsSaving(false);
    }
  }

  const handleOpenPaymentDialog = (customer: Customer) => {
    setSelectedCustomer(customer);
    paymentForm.reset({ amount: 0, paymentDate: new Date().toISOString().split("T")[0] });
    setIsPaymentFormOpen(true);
  };

  async function onPaymentSubmit(data: PaymentFormValues) {
      if (!selectedCustomer) return;

      setIsPaymentSaving(true);
      try {
        await runTransaction(db, async (transaction) => {
            let amountToDistribute = data.amount;

            const customerInvoicesQuery = query(
                collection(db, "invoices"),
                where("customerId", "==", selectedCustomer.id),
                where("balanceDue", ">", 0),
                orderBy("balanceDue", "asc"),
                orderBy("invoiceDate", "asc")
            );

            const unpaidInvoicesSnapshot = await getDocs(customerInvoicesQuery);

            for (const invoiceDoc of unpaidInvoicesSnapshot.docs) {
                if (amountToDistribute <= 0) break;
                
                const invoiceRef = doc(db, "invoices", invoiceDoc.id);
                const invoiceData = invoiceDoc.data() as Invoice;
                const balanceDue = invoiceData.balanceDue || 0;

                const paymentAmount = Math.min(amountToDistribute, balanceDue);
                
                const newPaidAmount = (invoiceData.paidAmount || 0) + paymentAmount;
                const newBalanceDue = balanceDue - paymentAmount;
                const newStatus = newBalanceDue <= 0 ? 'Paid' : invoiceData.status;

                transaction.update(invoiceRef, {
                    paidAmount: newPaidAmount,
                    balanceDue: newBalanceDue,
                    status: newStatus,
                });
                
                amountToDistribute -= paymentAmount;
            }

            if (amountToDistribute > 0) {
                // If there's still money left over, it's an overpayment or credit.
                // For now, we'll just log it. A future feature could be a customer credit system.
                console.log(`Overpayment of GHS ${amountToDistribute.toFixed(2)} for ${selectedCustomer.name}`);
                await logActivity(`Overpayment of GHS ${amountToDistribute.toFixed(2)} recorded for ${selectedCustomer.name}`);
            }
        });
        
        toast({ title: "Payment Recorded", description: `Payment of GHS ${data.amount.toFixed(2)} recorded for ${selectedCustomer.name}.` });
        await logActivity(`Recorded payment of GHS ${data.amount.toFixed(2)} for ${selectedCustomer.name}`);

        setIsPaymentFormOpen(false);
        fetchCustomers(); // Refresh balances

      } catch (error: any) {
        console.error("Payment failed:", error);
        toast({ variant: "destructive", title: "Payment Failed", description: error.message || "An unexpected error occurred." });
      } finally {
        setIsPaymentSaving(false);
      }
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Customers</h1>
        <Button onClick={() => setIsCustomerFormOpen(true)}>
            <UserPlus className="mr-2 h-4 w-4" /> Add New Customer
        </Button>
      </div>

      <Dialog open={isCustomerFormOpen} onOpenChange={setIsCustomerFormOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Add New Customer</DialogTitle>
                  <DialogDescription>Enter the details for the new customer.</DialogDescription>
              </DialogHeader>
              <form onSubmit={customerForm.handleSubmit(onCustomerSubmit)} id="customer-form" className="space-y-4 py-4">
                    <div>
                        <Label htmlFor="name">Customer Name</Label>
                        <Input id="name" {...customerForm.register("name")} />
                        {customerForm.formState.errors.name && <p className="text-destructive text-xs">{customerForm.formState.errors.name.message}</p>}
                    </div>
                     <div>
                        <Label htmlFor="phone">Phone Number (Optional)</Label>
                        <Input id="phone" {...customerForm.register("phone")} />
                    </div>
                     <div>
                        <Label htmlFor="address">Address (Optional)</Label>
                        <Input id="address" {...customerForm.register("address")} />
                    </div>
              </form>
              <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsCustomerFormOpen(false); customerForm.reset(); }}>Cancel</Button>
                  <Button type="submit" form="customer-form" disabled={isSaving}>
                      {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Save Customer
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>
      
      <Dialog open={isPaymentFormOpen} onOpenChange={setIsPaymentFormOpen}>
          <DialogContent>
              <DialogHeader>
                  <DialogTitle>Record Payment for {selectedCustomer?.name}</DialogTitle>
                  <DialogDescription>Enter the amount paid by the customer. The payment will be applied to their oldest outstanding invoices first.</DialogDescription>
              </DialogHeader>
              <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)} id="payment-form" className="space-y-4 py-4">
                    <div>
                        <Label htmlFor="amount">Payment Amount (GHS)</Label>
                        <Input id="amount" type="number" step="0.01" {...paymentForm.register("amount")} />
                        {paymentForm.formState.errors.amount && <p className="text-destructive text-xs">{paymentForm.formState.errors.amount.message}</p>}
                    </div>
                     <div>
                        <Label htmlFor="paymentDate">Payment Date</Label>
                        <Input id="paymentDate" type="date" {...paymentForm.register("paymentDate")} />
                         {paymentForm.formState.errors.paymentDate && <p className="text-destructive text-xs">{paymentForm.formState.errors.paymentDate.message}</p>}
                    </div>
              </form>
              <DialogFooter>
                  <Button variant="outline" onClick={() => { setIsPaymentFormOpen(false); paymentForm.reset(); }}>Cancel</Button>
                  <Button type="submit" form="payment-form" disabled={isPaymentSaving}>
                      {isPaymentSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      Record Payment
                  </Button>
              </DialogFooter>
          </DialogContent>
      </Dialog>


      <Card>
        <CardHeader>
          <CardTitle>Customer List</CardTitle>
          <CardDescription>
            A list of all your customers and their outstanding balances.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          ) : customers.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Address</TableHead>
                  <TableHead className="text-right">Balance Due</TableHead>
                  <TableHead className="text-center">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customers.map((customer) => (
                  <TableRow key={customer.id}>
                    <TableCell className="font-medium">{customer.name}</TableCell>
                    <TableCell>{customer.phone || "N/A"}</TableCell>
                    <TableCell>{customer.address || "N/A"}</TableCell>
                    <TableCell className={`text-right font-bold ${(customer.balance || 0) > 0 ? 'text-destructive' : ''}`}>
                      GHS {(customer.balance || 0).toFixed(2)}
                    </TableCell>
                    <TableCell className="text-center">
                       <Button variant="outline" size="sm" onClick={() => handleOpenPaymentDialog(customer)} disabled={(customer.balance || 0) <= 0}>
                            <CreditCard className="mr-2 h-4 w-4" />
                            Record Payment
                       </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
             <div className="text-center py-10">
                <p className="text-muted-foreground">No customers have been added yet.</p>
             </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
