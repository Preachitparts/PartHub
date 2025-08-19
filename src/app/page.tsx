import { LoginForm } from "@/components/auth/login-form";
import { Car, Wrench, Package } from "lucide-react";

export default function LoginPage() {
  return (
    <div className="relative min-h-screen w-full bg-background">
      <div className="absolute inset-0 z-0 opacity-10">
        <div className="absolute left-[10%] top-[20%] animate-pulse">
            <Wrench className="h-24 w-24 text-primary" />
        </div>
        <div className="absolute right-[10%] top-[50%] animate-pulse delay-500">
            <Car className="h-32 w-32 text-primary" />
        </div>
        <div className="absolute bottom-[15%] left-[30%] animate-pulse delay-1000">
            <Package className="h-20 w-20 text-primary" />
        </div>
      </div>
      <div className="relative z-10 flex min-h-screen flex-col items-center justify-center p-4">
        <div className="text-center">
            <h1 className="mb-4 text-5xl font-bold tracking-tight text-primary">
            Parts Hub
            </h1>
            <p className="mb-8 text-lg text-muted-foreground">
            Your POS for Preach it Parts & Equipment
            </p>
        </div>
        <LoginForm />
      </div>
    </div>
  );
}
