
"use client";

import { useEffect, useState } from "react";
import { collection, getDocs, doc, runTransaction, query, where, orderBy, serverTimestamp, setDoc } from "firebase/firestore";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, CreditCard } from "lucide-react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Invoice } from "@/types";
import { logActivity } from "@/lib/activity-log";
import { Combobox, ComboboxOption } from "@/components/ui/combobox";

const paymentSchema = z.object({
    customerId: z.string().min(1, "Please select a customer."),
    amount: z.preprocess((a) => parseFloat(z.string().parse(a || "0")), z.number().positive("Payment amount must be positive.")),
    paymentDate: z.string().min(1, "Payment date is required."),
});

type PaymentFormValues = z.infer<typeof paymentSchema>;

export default function PaymentsPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerOptions, setCustomerOptions] = useState<ComboboxOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const { toast } = useToast();
  
  const paymentForm = useForm<PaymentFormValues>({
      resolver: zodResolver(paymentSchema),
      defaultValues: { customerId: "", amount: 0, paymentDate: new Date().toISOString().split("T")[0] },
  });

  const fetchCustomers = async () => {
    setLoading(true);
    try {
      const customersCollection = collection(db, "customers");
      const customerSnapshot = await getDocs(query(customersCollection, orderBy("name")));
      const customersList = customerSnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Customer));
      setCustomers(customersList);
      setCustomerOptions(customersList.map(c => ({value: c.id, label: c.name})));
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


  async function onPaymentSubmit(data: PaymentFormValues) {
      const selectedCustomer = customers.find(c => c.id === data.customerId);
      if (!selectedCustomer) return;

      setIsSaving(true);
      try {
        await runTransaction(db, async (transaction) => {
            let amountToDistribute = data.amount;

            // Simpler query to avoid composite index requirement
            const customerInvoicesQuery = query(
                collection(db, "invoices"),
                where("customerId", "==", selectedCustomer.id),
                where("status", "in", ["Unpaid", "Overdue"])
            );

            const unpaidInvoicesSnapshot = await getDocs(customerInvoicesQuery);
            
            // Sort by date client-side
            const unpaidInvoices = unpaidInvoicesSnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() as Invoice}))
                .sort((a, b) => new Date(a.invoiceDate).getTime() - new Date(b.invoiceDate).getTime());


            for (const invoice of unpaidInvoices) {
                if (amountToDistribute <= 0) break;
                
                const invoiceRef = doc(db, "invoices", invoice.id);
                // No need to get the doc again, we have it
                // const invoiceData = invoiceDoc.data() as Invoice;
                const balanceDue = invoice.balanceDue || 0;

                const paymentAmount = Math.min(amountToDistribute, balanceDue);
                
                const newPaidAmount = (invoice.paidAmount || 0) + paymentAmount;
                const newBalanceDue = balanceDue - paymentAmount;
                const newStatus = newBalanceDue <= 0 ? 'Paid' : invoice.status;

                transaction.update(invoiceRef, {
                    paidAmount: newPaidAmount,
                    balanceDue: newBalanceDue,
                    status: newStatus,
                });
                
                amountToDistribute -= paymentAmount;
            }

            if (amountToDistribute > 0) {
                console.log(`Overpayment of GHS ${amountToDistribute.toFixed(2)} for ${selectedCustomer.name}`);
                await logActivity(`Overpayment of GHS ${amountToDistribute.toFixed(2)} recorded for ${selectedCustomer.name}`);
            }
        });
        
        toast({ title: "Payment Recorded", description: `Payment of GHS ${data.amount.toFixed(2)} recorded for ${selectedCustomer.name}.` });
        await logActivity(`Recorded payment of GHS ${data.amount.toFixed(2)} for ${selectedCustomer.name}`);

        paymentForm.reset({ customerId: "", amount: 0, paymentDate: new Date().toISOString().split("T")[0] });

      } catch (error: any) {
        console.error("Payment failed:", error);
        toast({ variant: "destructive", title: "Payment Failed", description: error.message || "An unexpected error occurred." });
      } finally {
        setIsSaving(false);
      }
  }


  return (
    <div className="flex flex-col gap-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold">Record Payments</h1>
      </div>

      <Card className="max-w-2xl mx-auto w-full">
        <CardHeader>
            <CardTitle>New Payment</CardTitle>
            <CardDescription>Select a customer and enter the amount paid. The payment will be applied to their oldest outstanding invoices first.</CardDescription>
        </CardHeader>
        <form onSubmit={paymentForm.handleSubmit(onPaymentSubmit)}>
        <CardContent className="space-y-4">
              <div>
                  <Label>Customer</Label>
                   <Combobox
                      options={customerOptions}
                      value={paymentForm.watch("customerId")}
                      onChange={(value) => paymentForm.setValue("customerId", value, { shouldValidate: true })}
                      placeholder="Select a customer..."
                      searchPlaceholder="Search customers..."
                      emptyPlaceholder="No customers found."
                    />
                  {paymentForm.formState.errors.customerId && <p className="text-destructive text-xs mt-1">{paymentForm.formState.errors.customerId.message}</p>}
              </div>
              <div>
                  <Label htmlFor="amount">Payment Amount (GHS)</Label>
                  <Input id="amount" type="number" step="0.01" {...paymentForm.register("amount")} />
                  {paymentForm.formState.errors.amount && <p className="text-destructive text-xs mt-1">{paymentForm.formState.errors.amount.message}</p>}
              </div>
                <div>
                  <Label htmlFor="paymentDate">Payment Date</Label>
                  <Input id="paymentDate" type="date" {...paymentForm.register("paymentDate")} />
                    {paymentForm.formState.errors.paymentDate && <p className="text-destructive text-xs mt-1">{paymentForm.formState.errors.paymentDate.message}</p>}
              </div>
        </CardContent>
        <CardFooter>
            <Button type="submit" disabled={isSaving || loading} className="w-full">
                {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                Record Payment
            </Button>
        </CardFooter>
        </form>
      </Card>
    </div>
  );
}
