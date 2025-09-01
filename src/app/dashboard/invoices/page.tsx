
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PlusCircle } from "lucide-react";
import Link from "next/link";

export default function InvoicesPage() {
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
                    <p className="text-muted-foreground text-center py-8">
                        No invoices have been created yet.
                    </p>
                    {/* Invoice list will be rendered here */}
                </CardContent>
            </Card>
        </div>
    )
}
