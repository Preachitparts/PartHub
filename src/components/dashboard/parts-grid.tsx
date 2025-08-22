"use client";

import type { Part } from "@/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface PartsGridProps {
  parts: Part[];
}

export function PartsGrid({ parts }: PartsGridProps) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {parts.map((part) => (
        <Card key={part.id} className="flex flex-col overflow-hidden transition-all hover:shadow-lg">
          <CardHeader>
            <div className="relative h-40 w-full">
              <Image
                src={part.imageUrl}
                alt={part.name}
                fill
                className="object-cover rounded-t-lg"
                data-ai-hint="equipment part"
              />
            </div>
            <CardTitle className="pt-4 text-lg">{part.name}</CardTitle>
            <CardDescription>PN: {part.partNumber}</CardDescription>
          </CardHeader>
          <CardContent className="flex-grow">
            <p className="text-sm text-muted-foreground line-clamp-2">{part.description}</p>
            <div className="text-xs text-muted-foreground mt-2">
                <p>Base: ${part.price.toFixed(2)}</p>
                <p>Tax: ${part.tax.toFixed(2)} {part.taxable ? "" : "(Tax Exempt)"}</p>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <span className="text-xl font-bold text-primary">
              ${part.exFactPrice.toFixed(2)}
            </span>
            <Badge variant={part.stock > 0 ? "secondary" : "destructive"}>
              {part.stock > 0 ? `${part.stock} in stock` : "Out of stock"}
            </Badge>
          </CardFooter>
        </Card>
      ))}
    </div>
  );
}
