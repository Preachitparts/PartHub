"use client";

import { useFormState, useFormStatus } from "react-dom";
import { smartFilterAction } from "@/app/actions";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wand2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useEffect } from "react";

const initialState = {
  message: "",
};

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending}>
      <Wand2 className="mr-2 h-4 w-4" />
      {pending ? "Filtering..." : "Apply Smart Filter"}
    </Button>
  );
}

export function SmartFilterForm() {
  const [state, formAction] = useFormState(smartFilterAction, initialState);
  const { toast } = useToast();

  useEffect(() => {
    if(state?.message) {
        toast({
            title: "Smart Filter",
            description: state.message,
        })
    }
  }, [state, toast])

  return (
    <Card className="bg-card/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
            <Wand2 className="text-primary"/>
            Smart Filter
        </CardTitle>
        <CardDescription>
          Use natural language to filter the equipment list. Try something like "Show me all filters for EarthMover models, but exclude CleanFlow brand."
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form action={formAction} className="flex flex-col gap-4">
          <Textarea
            name="query"
            placeholder="Enter your filter query here..."
            className="bg-background"
          />
          <div className="flex justify-end">
            <SubmitButton />
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
